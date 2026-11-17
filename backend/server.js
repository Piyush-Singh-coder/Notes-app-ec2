require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notesdb';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory fallback array for local dev or if MongoDB is temporarily offline
let inMemoryNotes = [
  {
    id: 'demo-1',
    title: 'Welcome to Notes App',
    content: 'This app is running on a 3-tier EC2 architecture (Frontend EC2 ➔ Backend EC2 ➔ Database EC2)!',
    createdAt: new Date().toISOString()
  }
];

let nextInMemoryId = 2;

// --- MongoDB Configuration ---
let isMongoConnected = false;

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
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
    console.warn(`[Database Warning] Using in-memory fallback. Ensure MongoDB EC2 is running and security group allows port 27017.`);
  });

mongoose.connection.on('connected', () => { isMongoConnected = true; });
mongoose.connection.on('disconnected', () => { isMongoConnected = false; });
mongoose.connection.on('error', () => { isMongoConnected = false; });

// --- API Routes ---

// 1. Health Check
app.get('/api/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    message: 'Backend server is running',
    database: connected ? 'MongoDB Connected (EC2)' : 'In-Memory Fallback (MongoDB Disconnected)',
    dbUri: MONGODB_URI.replace(/\/\/.*@/, '//***@'), // hide passwords if any
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

// 3. Create a note
app.post('/api/notes', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    if (mongoose.connection.readyState === 1) {
      const newNote = await Note.create({
        title: title.trim(),
        content: content.trim()
      });
      return res.status(201).json(newNote);
    }

    // Fallback
    const fallbackNote = {
      id: String(nextInMemoryId++),
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString()
    };
    inMemoryNotes.unshift(fallbackNote);
    res.status(201).json(fallbackNote);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note: ' + err.message });
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
});
