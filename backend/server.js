const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory data store (no database)
let notes = [
  {
    id: 1,
    title: 'Welcome Note',
    content: 'Welcome to your simple React + Node.js Note App! Data is stored in-memory in the backend.',
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    title: 'Features',
    content: 'You can create new notes and delete existing ones in real time.',
    createdAt: new Date().toISOString()
  }
];

let nextId = 3;

// Routes
// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running smoothly' });
});

// 2. Get all notes
app.get('/api/notes', (req, res) => {
  res.json(notes);
});

// 3. Create a new note
app.post('/api/notes', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  const newNote = {
    id: nextId++,
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  notes.unshift(newNote); // prepend to show newest first
  res.status(201).json(newNote);
});

// 4. Delete a note by id
app.delete('/api/notes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const initialLength = notes.length;
  notes = notes.filter(note => note.id !== id);

  if (notes.length === initialLength) {
    return res.status(404).json({ error: 'Note not found' });
  }

  res.json({ message: 'Note deleted successfully', id });
});

// Serve frontend static build if it exists (for single-server/EC2 deployment)
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
});
