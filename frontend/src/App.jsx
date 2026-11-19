import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [activeTab, setActiveTab] = useState('notes'); // 'notes' or 'emails'

  // Notes state
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [submittingNote, setSubmittingNote] = useState(false);

  // Email state
  const [emails, setEmails] = useState([]);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailNoteTitle, setEmailNoteTitle] = useState('');
  const [emailFileUrl, setEmailFileUrl] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Health and Loading states
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [databaseStatus, setDatabaseStatus] = useState('Checking...');
  const [s3Status, setS3Status] = useState('Checking...');
  const [sesStatus, setSesStatus] = useState('Checking...');
  const [authStatus, setAuthStatus] = useState('Checking...');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHealth();
    fetchNotes();
    fetchEmails();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setBackendStatus('Connected');
        setDatabaseStatus(data.database || 'Connected');
        setS3Status(data.s3Bucket || 'Active');
        setSesStatus(data.sesSender || 'Active');
        setAuthStatus(data.awsAuth || 'Configured');
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
    try {
      const res = await fetch(`${API_BASE}/notes`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      setNotes(data);
    } catch (err) {
      setError(`Cannot connect to Backend API at [${API_BASE}]. Make sure your local Node.js server is running.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmails = async () => {
    try {
      const res = await fetch(`${API_BASE}/emails`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
      }
    } catch (err) {
      console.warn('Could not fetch emails:', err.message);
    }
  };

  // Add Note Handler
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmittingNote(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('content', content.trim());
      if (file) formData.append('file', file);

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
      setSubmittingNote(false);
    }
  };

  // Delete Note Handler
  const handleDeleteNote = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(notes.filter((note) => (note.id || note._id) !== id));
    } catch (err) {
      alert('Error deleting note: ' + err.message);
    }
  };

  // Share Note via Email Shortcut
  const handleShareNoteViaEmail = (note) => {
    setEmailTo('');
    setEmailSubject(`Shared Note: ${note.title}`);
    setEmailMessage(note.content);
    setEmailNoteTitle(note.title);
    setEmailFileUrl(note.fileUrl || '');
    setActiveTab('emails');
  };

  // Send Email Handler
  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailTo.trim() || !emailSubject.trim() || !emailMessage.trim()) return;

    setSendingEmail(true);
    try {
      const res = await fetch(`${API_BASE}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
          noteTitle: emailNoteTitle || null,
          fileUrl: emailFileUrl || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      alert(`✅ Email sent successfully to ${emailTo}!`);
      setEmails([data, ...emails]);
      setEmailTo('');
      setEmailSubject('');
      setEmailMessage('');
      setEmailNoteTitle('');
      setEmailFileUrl('');
    } catch (err) {
      alert('Error sending email: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const isImageFile = (url) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);

  return (
    <div className="container">
      <header className="header">
        <h1>📝 Fullstack Cloud Suite (Local Machine)</h1>
        <p className="subtitle">React (Local) ➔ Express (Local) ➔ MongoDB (Local) + AWS S3 & SES</p>

        {/* Real-time Health Badges */}
        <div className="status-container">
          <div className="status-badge">
            Backend API:{' '}
            <span className={`status-indicator ${backendStatus.toLowerCase().replace(/[^a-z]/g, '')}`}>
              {backendStatus}
            </span>
          </div>

          <div className="status-badge">
            Database:{' '}
            <span className={`status-indicator ${databaseStatus.includes('Connected') ? 'connected' : 'warning'}`}>
              {databaseStatus}
            </span>
          </div>

          <div className="status-badge">
            AWS S3:{' '}
            <span className={`status-indicator ${s3Status.includes('Configured') ? 'connected' : 'warning'}`}>
              {s3Status}
            </span>
          </div>

          <div className="status-badge">
            AWS SES Email:{' '}
            <span className={`status-indicator ${sesStatus.includes('Configured') ? 'connected' : 'warning'}`}>
              {sesStatus}
            </span>
          </div>
        </div>

        <div className="api-endpoint-tag">
          Auth Mode: <strong>{authStatus}</strong> | API Target: <code>{API_BASE}</code>
        </div>

        {/* Tab Navigation */}
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            📝 Notes & S3 Files ({notes.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'emails' ? 'active' : ''}`}
            onClick={() => setActiveTab('emails')}
          >
            ✉️ AWS SES Email Hub ({emails.length})
          </button>
        </div>
      </header>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* --- TAB 1: NOTES & FILES --- */}
      {activeTab === 'notes' && (
        <>
          <section className="card form-card">
            <h2>Add Note with File Attachment</h2>
            <form onSubmit={handleAddNote}>
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  id="title"
                  type="text"
                  placeholder="e.g., Cloud Architecture Design"
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

              <div className="form-group">
                <label htmlFor="file">
                  📎 Attach File / Image <span className="label-hint">(Stored in AWS S3)</span>
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

              <button type="submit" className="btn btn-primary" disabled={submittingNote}>
                {submittingNote ? 'Uploading to S3 & Saving...' : '+ Add Note'}
              </button>
            </form>
          </section>

          <section className="notes-section">
            <h2>All Notes ({notes.length})</h2>
            {loading ? (
              <p className="empty-state">Loading notes...</p>
            ) : notes.length === 0 ? (
              <p className="empty-state">No notes found. Create your first note above!</p>
            ) : (
              <div className="notes-grid">
                {notes.map((note) => {
                  const noteId = note.id || note._id;
                  return (
                    <div key={noteId} className="card note-card">
                      <div className="note-header">
                        <h3>{note.title}</h3>
                        <div className="note-actions">
                          <button
                            className="btn btn-share"
                            onClick={() => handleShareNoteViaEmail(note)}
                            title="Share via Email"
                          >
                            ✉️ Share
                          </button>
                          <button
                            className="btn btn-danger-icon"
                            onClick={() => handleDeleteNote(noteId)}
                            title="Delete Note"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      <p className="note-content">{note.content}</p>

                      {note.fileUrl && (
                        <div className="attachment-box">
                          {isImageFile(note.fileUrl) && (
                            <div className="image-container">
                              <img
                                src={note.fileUrl}
                                alt={note.fileName || 'S3 Attachment'}
                                className="attachment-img"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <a
                            href={note.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="attachment-link"
                          >
                            📂 {note.fileName || 'View S3 Attachment'} ↗
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
        </>
      )}

      {/* --- TAB 2: EMAILS (SES DISPATCHER & SENT HISTORY) --- */}
      {activeTab === 'emails' && (
        <>
          <section className="card form-card">
            <h2>✉️ Send an Email via Amazon SES</h2>
            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label htmlFor="emailTo">Recipient Email (To:)</label>
                <input
                  id="emailTo"
                  type="email"
                  placeholder="recipient@gmail.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  required
                />
                <span className="label-hint">
                  *In SES Sandbox mode, recipient must also be verified in AWS SES.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="emailSubject">Subject</label>
                <input
                  id="emailSubject"
                  type="text"
                  placeholder="e.g., Project Update from Notes App"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="emailMessage">Message Content</label>
                <textarea
                  id="emailMessage"
                  rows="4"
                  placeholder="Type your email message here..."
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  required
                ></textarea>
              </div>

              {emailNoteTitle && (
                <div className="shared-note-tag">
                  📎 Included Note: <strong>{emailNoteTitle}</strong>
                  {emailFileUrl && ' (with S3 file attachment)'}
                  <button
                    type="button"
                    className="btn-clear-tag"
                    onClick={() => {
                      setEmailNoteTitle('');
                      setEmailFileUrl('');
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={sendingEmail}>
                {sendingEmail ? 'Sending via Amazon SES...' : '🚀 Send Email via AWS SES'}
              </button>
            </form>
          </section>

          {/* Sent Emails History */}
          <section className="notes-section">
            <h2>📬 Sent Emails History ({emails.length})</h2>
            <p className="section-desc">All emails sent by anyone are recorded in MongoDB and displayed here in real time.</p>
            {emails.length === 0 ? (
              <p className="empty-state">No emails sent yet. Send your first email above!</p>
            ) : (
              <div className="notes-grid">
                {emails.map((email) => {
                  const emailId = email.id || email._id;
                  return (
                    <div key={emailId} className="card email-card">
                      <div className="email-header">
                        <div>
                          <span className="badge-sent">SENT via SES</span>
                          <h3 className="email-title">{email.subject}</h3>
                        </div>
                        <small className="email-date">
                          {new Date(email.sentAt).toLocaleString()}
                        </small>
                      </div>

                      <div className="email-meta">
                        <p><strong>To:</strong> {email.to}</p>
                        <p><strong>From:</strong> {email.from}</p>
                        {email.noteTitle && (
                          <p><strong>Attached Note:</strong> {email.noteTitle}</p>
                        )}
                      </div>

                      <div className="email-body">
                        <p>{email.message}</p>
                      </div>

                      {email.fileUrl && (
                        <div className="attachment-box">
                          <a
                            href={email.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="attachment-link"
                          >
                            📎 S3 File Attachment Link ↗
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;
