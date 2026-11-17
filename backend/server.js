require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 5000;
const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'Notes';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DynamoDB Document Client
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// In-memory fallback if DynamoDB is unavailable or running locally without AWS credentials
let inMemoryNotes = [
  {
    id: 'demo-1',
    title: 'Welcome Note',
    content: 'Welcome to your Notes App! Requests flow: Frontend -> Backend -> Database.',
    createdAt: new Date().toISOString()
  }
];

let useDynamoDB = process.env.USE_IN_MEMORY !== 'true';

// Helper: Fetch all notes from DynamoDB or in-memory
async function getAllNotes() {
  if (!useDynamoDB) return inMemoryNotes;
  try {
    const command = new ScanCommand({ TableName: TABLE_NAME });
    const response = await docClient.send(command);
    // Sort notes descending by createdAt
    return (response.Items || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  } catch (err) {
    console.warn(`[DynamoDB Scan Warning]: ${err.message}. Falling back to in-memory store.`);
    return inMemoryNotes;
  }
}

// Helper: Save note to DynamoDB or in-memory
async function saveNote(note) {
  if (!useDynamoDB) {
    inMemoryNotes.unshift(note);
    return note;
  }
  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: note
    });
    await docClient.send(command);
    return note;
  } catch (err) {
    console.warn(`[DynamoDB Put Warning]: ${err.message}. Saving to in-memory fallback.`);
    inMemoryNotes.unshift(note);
    return note;
  }
}

// Helper: Delete note
async function removeNote(id) {
  if (!useDynamoDB) {
    inMemoryNotes = inMemoryNotes.filter(n => n.id !== id);
    return true;
  }
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id }
    });
    await docClient.send(command);
    return true;
  } catch (err) {
    console.warn(`[DynamoDB Delete Warning]: ${err.message}. Deleting from in-memory fallback.`);
    inMemoryNotes = inMemoryNotes.filter(n => n.id !== id);
    return true;
  }
}

// --- API Routes ---

// 1. Health check (Reports DB status & AWS Region)
app.get('/api/health', async (req, res) => {
  let dbStatus = 'In-Memory (Offline/Fallback)';
  try {
    if (useDynamoDB) {
      await docClient.send(new ScanCommand({ TableName: TABLE_NAME, Limit: 1 }));
      dbStatus = `DynamoDB Connected (${TABLE_NAME} in ${REGION})`;
    }
  } catch (err) {
    dbStatus = `DynamoDB Unreachable (${err.name || 'Check IAM/Table'}). Using Fallback.`;
  }

  res.json({
    status: 'ok',
    message: 'Backend server is running',
    database: dbStatus,
    region: REGION,
    timestamp: new Date().toISOString()
  });
});

// 2. Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await getAllNotes();
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notes: ' + err.message });
  }
});

// 3. Create a note
app.post('/api/notes', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  const newNote = {
    id: uuidv4(),
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const saved = await saveNote(newNote);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note: ' + err.message });
  }
});

// 4. Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await removeNote(id);
    res.json({ message: 'Note deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note: ' + err.message });
  }
});

// Serve frontend static build if it exists (for single-server preview)
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Target Database: DynamoDB (Table: ${TABLE_NAME}, Region: ${REGION})`);
});
