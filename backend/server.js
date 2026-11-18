require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notesdb';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize S3 Client (IAM Role on EC2 handles credentials automatically)
const s3Client = new S3Client({ region: AWS_REGION });

// Multer memory storage (holds file in memory buffer before streaming to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// In-memory fallback array for local dev or if MongoDB is temporarily offline
let inMemoryNotes = [
  {
    id: 'demo-1',
    title: 'Welcome to Notes App',
    content: 'This app is running on a 3-tier EC2 architecture with AWS S3 file attachments!',
    fileUrl: null,
    fileName: null,
    createdAt: new Date().toISOString()
  }
];

let nextInMemoryId = 2;

// --- MongoDB Configuration ---
let isMongoConnected = false;

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Clean up JSON output (convert _id to id)
noteSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Note = mongoose.model('Note', noteSchema);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 3000
})
  .then(() => {
    isMongoConnected = true;
    console.log(`[Database] Connected successfully to MongoDB at: ${MONGODB_URI}`);
  })
  .catch((err) => {
    isMongoConnected = false;
    console.warn(`[Database Warning] Could not connect to MongoDB: ${err.message}`);
    console.warn(`[Database Warning] Using in-memory fallback.`);
  });

mongoose.connection.on('connected', () => { isMongoConnected = true; });
mongoose.connection.on('disconnected', () => { isMongoConnected = false; });
mongoose.connection.on('error', () => { isMongoConnected = false; });

// --- API Routes ---

// 1. Health Check (returns Database & S3 status)
app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    database: connected ? 'MongoDB Connected (EC2)' : 'In-Memory Fallback (MongoDB Disconnected)',
    s3Bucket: S3_BUCKET_NAME ? `Configured (${S3_BUCKET_NAME})` : 'Not Configured (Optional)',
    region: AWS_REGION,
    timestamp: new Date().toISOString()
  });
});

// 2. Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const notes = await Note.find().sort({ createdAt: -1 });
      return res.json(notes);
    }
    // Fallback
    res.json(inMemoryNotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notes: ' + err.message });
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

  // Handle S3 file upload if file is present
  if (file) {
    if (!S3_BUCKET_NAME) {
      return res.status(400).json({
        error: 'S3_BUCKET_NAME is not configured on the backend server. Please add S3_BUCKET_NAME in backend/.env'
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

  try {
    if (mongoose.connection.readyState === 1) {
      const newNote = await Note.create({
        title: title.trim(),
        content: content.trim(),
        fileUrl,
        fileName
      });
      return res.status(201).json(newNote);
    }

    // Fallback
    const fallbackNote = {
      id: String(nextInMemoryId++),
      title: title.trim(),
      content: content.trim(),
      fileUrl,
      fileName,
      createdAt: new Date().toISOString()
    };
    inMemoryNotes.unshift(fallbackNote);
    res.status(201).json(fallbackNote);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save note: ' + err.message });
  }
});

// 4. Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (mongoose.connection.readyState === 1) {
      await Note.findByIdAndDelete(id);
      return res.json({ message: 'Note deleted from MongoDB', id });
    }

    // Fallback
    inMemoryNotes = inMemoryNotes.filter(n => n.id !== id);
    res.json({ message: 'Note deleted from fallback store', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note: ' + err.message });
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
  console.log(`Configured MongoDB URI: ${MONGODB_URI}`);
  console.log(`Configured S3 Bucket: ${S3_BUCKET_NAME || 'None (Uploads disabled)'}`);
});
