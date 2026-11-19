const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/notesdb';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || '';
const SES_SENDER_EMAIL = process.env.SES_SENDER_EMAIL || '';

// Middleware
app.use(cors());
app.use(express.json());

// AWS Client Configuration
// Supports both Local Machine (IAM User keys in .env) and EC2 (IAM Role)
const awsConfig = { region: AWS_REGION };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  awsConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim()
  };
}

const s3Client = new S3Client(awsConfig);
const sesClient = new SESClient(awsConfig);

// Multer memory storage for S3 uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- MongoDB Schemas & Models ---
const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

noteSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Note = mongoose.model('Note', noteSchema);

const emailSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  noteTitle: { type: String, default: null },
  fileUrl: { type: String, default: null },
  status: { type: String, default: 'SENT' },
  sentAt: { type: Date, default: Date.now }
});

emailSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const Email = mongoose.model('Email', emailSchema);

// In-memory fallbacks if local MongoDB is offline
let inMemoryNotes = [
  {
    id: 'demo-1',
    title: 'Local Development Note',
    content: 'Fullstack running locally on your machine with AWS S3 & SES integration!',
    fileUrl: null,
    fileName: null,
    createdAt: new Date().toISOString()
  }
];

let inMemoryEmails = [];
let nextInMemoryId = 2;

// Connect to MongoDB
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    console.log(`[Database] Connected successfully to local MongoDB at: ${MONGODB_URI}`);
  })
  .catch((err) => {
    console.warn(`[Database Warning] Could not connect to MongoDB: ${err.message}`);
    console.warn(`[Database Warning] Using in-memory fallback. Ensure MongoDB is running locally.`);
  });

// --- API Routes ---

// 1. Health check (reports MongoDB, S3, and SES statuses)
app.get('/api/health', (req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const hasKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  res.json({
    status: 'ok',
    message: 'Backend server is running locally',
    database: isMongoConnected ? 'MongoDB Connected (Local)' : 'In-Memory Fallback (Local MongoDB Offline)',
    s3Bucket: S3_BUCKET_NAME ? `Configured (${S3_BUCKET_NAME})` : 'Not Configured (Optional)',
    sesSender: SES_SENDER_EMAIL ? `Configured (${SES_SENDER_EMAIL})` : 'Not Configured (Optional)',
    awsAuth: hasKeys ? 'IAM User Access Keys (Local)' : 'Default / IAM Role (EC2)',
    region: AWS_REGION,
    timestamp: new Date().toISOString()
  });
});

// 2. Notes: Get all notes
app.get('/api/notes', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const notes = await Note.find().sort({ createdAt: -1 });
      return res.json(notes);
    }
    res.json(inMemoryNotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notes: ' + err.message });
  }
});

// 3. Notes: Create a note (with optional S3 file attachment)
app.post('/api/notes', upload.single('file'), async (req, res) => {
  const { title, content } = req.body;
  const file = req.file;

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  let fileUrl = null;
  let fileName = null;

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

// 4. Notes: Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (mongoose.connection.readyState === 1) {
      await Note.findByIdAndDelete(id);
      return res.json({ message: 'Note deleted', id });
    }
    inMemoryNotes = inMemoryNotes.filter(n => n.id !== id);
    res.json({ message: 'Note deleted from fallback store', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note: ' + err.message });
  }
});

// 5. Emails: Send an email via AWS SES and save log in MongoDB
app.post('/api/emails', async (req, res) => {
  const { to, subject, message, noteTitle, fileUrl } = req.body;

  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'Recipient (to), Subject, and Message are required' });
  }

  if (!SES_SENDER_EMAIL) {
    return res.status(400).json({
      error: 'SES_SENDER_EMAIL is not configured in backend/.env. Please verify an email in AWS SES and set SES_SENDER_EMAIL.'
    });
  }

  // Construct rich HTML email body
  let htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #3182ce; margin-top: 0;">📝 Notes App Notification</h2>
      <p style="font-size: 15px;">${message.replace(/\n/g, '<br/>')}</p>
  `;

  if (noteTitle) {
    htmlBody += `
      <div style="margin-top: 20px; padding: 12px; background: #f7fafc; border-left: 4px solid #3182ce; border-radius: 4px;">
        <strong>Shared Note:</strong> ${noteTitle}
      </div>
    `;
  }

  if (fileUrl) {
    htmlBody += `
      <div style="margin-top: 15px;">
        <a href="${fileUrl}" style="background-color: #3182ce; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          📎 View S3 File Attachment
        </a>
      </div>
    `;
  }

  htmlBody += `
      <hr style="margin-top: 25px; border: none; border-top: 1px solid #edf2f7;" />
      <small style="color: #a0aec0;">Sent securely via Amazon SES from Notes App</small>
    </div>
  `;

  try {
    // Send email using AWS SES
    const sendEmailCommand = new SendEmailCommand({
      Source: SES_SENDER_EMAIL,
      Destination: {
        ToAddresses: [to.trim()]
      },
      Message: {
        Subject: {
          Data: subject.trim(),
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8'
          },
          Text: {
            Data: `${message}\n\n${fileUrl ? 'Attachment: ' + fileUrl : ''}`,
            Charset: 'UTF-8'
          }
        }
      }
    });

    await sesClient.send(sendEmailCommand);
    console.log(`[AWS SES] Successfully sent email to: ${to}`);

    // Save record to database
    const emailRecord = {
      from: SES_SENDER_EMAIL,
      to: to.trim(),
      subject: subject.trim(),
      message: message.trim(),
      noteTitle: noteTitle || null,
      fileUrl: fileUrl || null,
      status: 'SENT',
      sentAt: new Date().toISOString()
    };

    if (mongoose.connection.readyState === 1) {
      const savedEmail = await Email.create(emailRecord);
      return res.status(201).json(savedEmail);
    }

    emailRecord.id = String(Date.now());
    inMemoryEmails.unshift(emailRecord);
    res.status(201).json(emailRecord);
  } catch (err) {
    console.error(`[AWS SES Error]: ${err.message}`);
    return res.status(500).json({ error: `AWS SES Failed to send email: ${err.message}` });
  }
});

// 6. Emails: Retrieve sent emails history
app.get('/api/emails', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const emails = await Email.find().sort({ sentAt: -1 });
      return res.json(emails);
    }
    res.json(inMemoryEmails);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve sent emails: ' + err.message });
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

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running locally on http://localhost:${PORT}`);
  console.log(`Local MongoDB: ${MONGODB_URI}`);
  console.log(`S3 Bucket: ${S3_BUCKET_NAME || 'None'}`);
  console.log(`SES Sender: ${SES_SENDER_EMAIL || 'None'}`);
});
