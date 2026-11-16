# Simple React + Node.js Project (In-Memory / No DB)

A simple, lightweight full-stack **Notes App** built with **React** (frontend) and **Node.js Express** (backend). No external database is required; all data is managed in-memory on the backend server.

---

## 📁 Project Structure

```text
note-app-ec2/
├── backend/
│   ├── package.json
│   └── server.js          # Express server with REST API & in-memory notes store
├── frontend/
│   ├── package.json
│   ├── vite.config.js     # Vite configuration
│   ├── index.html
│   └── src/
│       ├── App.jsx        # Main React component
│       ├── App.css        # Clean, modern styles
│       └── main.jsx       # React DOM entrypoint
├── package.json           # Root package with convenient run scripts
└── README.md
```

---

## 🚀 Quick Start

### 1. Run Both Frontend and Backend Concurrently (Recommended)
From the root directory:
```bash
npm run dev
```
This runs:
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Frontend App**: [http://localhost:3000](http://localhost:3000)

---

### 2. Run Independently (Optional)

#### Run the Backend:
```bash
cd backend
npm start
```
*Backend runs on `http://localhost:5000`*

#### Run the Frontend:
```bash
cd frontend
npm run dev
```
*Frontend runs on `http://localhost:3000`*

---

## 📡 Backend API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check endpoint |
| `GET` | `/api/notes` | Get list of all notes |
| `POST` | `/api/notes` | Create a new note (`{ title, content }`) |
| `DELETE` | `/api/notes/:id` | Delete a note by its ID |

---

## ✨ Features
- **Zero Database Setup**: Notes are stored in an in-memory array on the Express server.
- **Real-Time CRUD**: Create, read, and delete notes from the UI with instant updates.
- **Backend Health Indicator**: The UI displays real-time connection status (`Connected`, `Checking...`, `Disconnected`).
- **Clean & Responsive UI**: Responsive design with feedback states (loading, errors, empty states).
