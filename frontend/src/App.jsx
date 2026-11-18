import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [databaseStatus, setDatabaseStatus] = useState('Checking...');
  const [s3Status, setS3Status] = useState('Checking...');
  const [error, setError] = useState('');

  // Fetch initial notes and check backend, database & S3 health
  useEffect(() => {
    fetchBackendHealth();
    fetchNotes();
  }, []);

  const fetchBackendHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setBackendStatus('Connected');
        setDatabaseStatus(data.database || 'Connected');
        setS3Status(data.s3Bucket || 'Active');
      } else {
        setBackendStatus('Error');
        setDatabaseStatus('Unavailable');
        setS3Status('Unavailable');
      }
    } catch {
      setBackendStatus('Disconnected');
      setDatabaseStatus('Disconnected');
      setS3Status('Disconnected');
    }
  };

  const fetchNotes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notes`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      setNotes(data);
    } catch (err) {
      setError(`Cannot connect to Backend API at [${API_BASE}]. Verify that Backend EC2 is running and Nginx is proxying /api/.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      if (file) {
        formData.append('file', file);
      }

      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create note');
      }

      const newNote = await res.json();
      setNotes([newNote, ...notes]);
      setTitle('');
      setContent('');
      setFile(null);
      const fileInput = document.getElementById('file');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      alert('Error creating note: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(notes.filter((note) => (note.id || note._id) !== id));
    } catch (err) {
      alert('Error deleting note: ' + err.message);
    }
  };

  const isImageFile = (url) => {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>📝 Notes App (AWS Cloud Architecture)</h1>
        <p className="subtitle">Frontend (EC2) ➔ Backend (EC2) ➔ AWS DynamoDB (NoSQL) + AWS S3 (Files)</p>

        <div className="status-container">
          <div className="status-badge">
            Backend API:{' '}
            <span className={`status-indicator ${backendStatus.toLowerCase().replace(/[^a-z]/g, '')}`}>
              {backendStatus}
            </span>
          </div>

          <div className="status-badge">
            Database Tier:{' '}
            <span className={`status-indicator ${databaseStatus.includes('Connected') ? 'connected' : databaseStatus.includes('Checking') ? 'checking' : 'warning'}`}>
              {databaseStatus}
            </span>
          </div>

          <div className="status-badge">
            S3 Storage:{' '}
            <span className={`status-indicator ${s3Status.includes('Configured') ? 'connected' : s3Status.includes('Checking') ? 'checking' : 'warning'}`}>
              {s3Status}
            </span>
          </div>
        </div>

        <div className="api-endpoint-tag">
          API Target: <code>{API_BASE}</code>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Note Creation Form with S3 File Upload */}
      <section className="card form-card">
        <h2>Add a New Note with File Attachment</h2>
        <form onSubmit={handleAddNote}>
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              placeholder="e.g., AWS Cloud Architecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="content">Content</label>
            <textarea
              id="content"
              rows="3"
              placeholder="Write your note description here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            ></textarea>
          </div>

          {/* S3 File Upload Field */}
          <div className="form-group">
            <label htmlFor="file">
              📎 Attach File or Image <span className="label-hint">(Uploaded to AWS S3 & URL saved in DynamoDB)</span>
            </label>
            <input
              id="file"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
            {file && (
              <p className="file-selected-text">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Uploading to S3 & Saving...' : '+ Add Note'}
          </button>
        </form>
      </section>

      {/* Notes List */}
      <section className="notes-section">
        <h2>All Notes ({notes.length})</h2>
        {loading ? (
          <p className="empty-state">Loading notes from DynamoDB...</p>
        ) : notes.length === 0 ? (
          <p className="empty-state">No notes found in DynamoDB. Create your first note with a file above!</p>
        ) : (
          <div className="notes-grid">
            {notes.map((note) => {
              const noteId = note.id || note._id;
              return (
                <div key={noteId} className="card note-card">
                  <div className="note-header">
                    <h3>{note.title}</h3>
                    <button
                      className="btn btn-danger-icon"
                      onClick={() => handleDeleteNote(noteId)}
                      title="Delete Note"
                    >
                      ×
                    </button>
                  </div>
                  <p className="note-content">{note.content}</p>

                  {/* S3 Attachment Display */}
                  {note.fileUrl && (
                    <div className="attachment-box">
                      {isImageFile(note.fileUrl) ? (
                        <div className="image-container">
                          <img
                            src={note.fileUrl}
                            alt={note.fileName || 'S3 Attachment'}
                            className="attachment-img"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <a
                        href={note.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-link"
                      >
                        📂 {note.fileName || 'View Attachment'} ↗
                      </a>
                    </div>
                  )}

                  <div className="note-footer">
                    <small>{new Date(note.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
