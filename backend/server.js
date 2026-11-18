require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 5000;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'Notes';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AWS Clients (credentials automatically provided by EC2 IAM Role)
const ddbClient = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: AWS_REGION });

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// In-memory fallback if DynamoDB is offline or table is not created yet
let inMemoryNotes = [
  {
    id: 'demo-1',
    title: 'Welcome to Cloud Notes App',
    content: 'Full cloud-native stack: React (EC2) ➔ Express (EC2) ➔ AWS DynamoDB + AWS S3!',
    fileUrl: null,
    fileName: null,
    createdAt: new Date().toISOString()
  }
];

// Helper: Check DynamoDB connection
async function checkDynamoDB() {
  try {
    await docClient.send(new ScanCommand({ TableName: DYNAMODB_TABLE_NAME, Limit: 1 }));
    return true;
  } catch (err) {
    return false;
  }
}

// --- API Routes ---

// 1. Health Check (returns DynamoDB & S3 status)
app.get('/api/health', async (req, res) => {
  const isDdbConnected = await checkDynamoDB();
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    database: isDdbConnected
      ? `DynamoDB Connected (${DYNAMODB_TABLE_NAME})`
      : `DynamoDB Table Not Ready (${DYNAMODB_TABLE_NAME}) - Using Fallback`,
    s3Bucket: S3_BUCKET_NAME ? `Configured (${S3_BUCKET_NAME})` : 'Not Configured (Optional)',
    region: AWS_REGION,
    timestamp: new Date().toISOString()
  });
});

// 2. Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    const command = new ScanCommand({ TableName: DYNAMODB_TABLE_NAME });
    const response = await docClient.send(command);
    const notes = (response.Items || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    res.json(notes);
  } catch (err) {
    console.warn(`[DynamoDB Scan Warning]: ${err.message}. Serving in-memory fallback.`);
    res.json(inMemoryNotes);
  }
});

// 3. Create a note (with optional S3 file attachment)
app.post('/api/notes', upload.single('file'), async (req, res) => {
  const { title, content } = req.body;
  const file = req.file;

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  let fileUrl = null;
  let fileName = null;

  // Handle S3 file upload if present
  if (file) {
    if (!S3_BUCKET_NAME) {
      return res.status(400).json({
        error: 'S3_BUCKET_NAME is not configured in backend/.env'
      });
    }

    try {
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const s3Key = `uploads/${Date.now()}-${sanitizedName}`;

      const uploadCommand = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype
      });

      await s3Client.send(uploadCommand);
      fileUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
      fileName = file.originalname;
      console.log(`[S3 Upload] Successfully uploaded ${fileName} to ${fileUrl}`);
    } catch (s3Err) {
      console.error(`[S3 Error] Upload failed: ${s3Err.message}`);
      return res.status(500).json({ error: `Failed to upload file to S3: ${s3Err.message}` });
    }
  }

  const newNote = {
    id: uuidv4(),
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  if (fileUrl) newNote.fileUrl = fileUrl;
  if (fileName) newNote.fileName = fileName;

  try {
    const putCommand = new PutCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Item: newNote
    });
    await docClient.send(putCommand);
    console.log(`[DynamoDB] Saved note ${newNote.id} to table ${DYNAMODB_TABLE_NAME}`);
    res.status(201).json(newNote);
  } catch (err) {
    console.warn(`[DynamoDB Put Warning]: ${err.message}. Saving to fallback store.`);
    inMemoryNotes.unshift(newNote);
    res.status(201).json(newNote);
  }
});

// 4. Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleteCommand = new DeleteCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: { id }
    });
    await docClient.send(deleteCommand);
    console.log(`[DynamoDB] Deleted note ${id} from table ${DYNAMODB_TABLE_NAME}`);
    res.json({ message: 'Note deleted from DynamoDB', id });
  } catch (err) {
    console.warn(`[DynamoDB Delete Warning]: ${err.message}. Deleting from fallback store.`);
    inMemoryNotes = inMemoryNotes.filter(n => n.id !== id);
    res.json({ message: 'Note deleted from fallback store', id });
  }
});

// Serve frontend static build if it exists
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`AWS Region: ${AWS_REGION}`);
  console.log(`DynamoDB Table: ${DYNAMODB_TABLE_NAME}`);
  console.log(`S3 Bucket: ${S3_BUCKET_NAME || 'None (Uploads disabled)'}`);
});
