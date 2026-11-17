import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [databaseStatus, setDatabaseStatus] = useState('Checking...');
  const [error, setError] = useState('');

  // Fetch initial notes and check backend & database health
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
      } else {
        setBackendStatus('Error');
        setDatabaseStatus('Unavailable');
      }
    } catch {
      setBackendStatus('Disconnected');
      setDatabaseStatus('Disconnected');
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
      setError(`Cannot connect to Backend API at [${API_BASE}]. Verify that Backend EC2 is running and its Security Group allows traffic from Frontend.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!res.ok) throw new Error('Failed to add note');
      const newNote = await res.json();
      setNotes([newNote, ...notes]);
      setTitle('');
      setContent('');
    } catch (err) {
      alert('Error creating note: ' + err.message);
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

  return (
    <div className="container">
      <header className="header">
        <h1>📝 Notes App (3-Tier EC2 Architecture)</h1>
        <p className="subtitle">Frontend (EC2) ➔ Backend (EC2) ➔ Database (EC2 MongoDB)</p>

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

      {/* Note Creation Form */}
      <section className="card form-card">
        <h2>Add a New Note</h2>
        <form onSubmit={handleAddNote}>
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              placeholder="e.g., EC2 MongoDB Configuration"
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
              placeholder="Write your note content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            ></textarea>
          </div>
          <button type="submit" className="btn btn-primary">
            + Add Note
          </button>
        </form>
      </section>

      {/* Notes List */}
      <section className="notes-section">
        <h2>All Notes ({notes.length})</h2>
        {loading ? (
          <p className="empty-state">Loading notes from MongoDB EC2...</p>
        ) : notes.length === 0 ? (
          <p className="empty-state">No notes found in MongoDB. Create your first note above!</p>
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
