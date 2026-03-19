# Video Upload + Timestamped Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the end-to-end flow: create a project, upload an MP4, and leave timestamped revision notes on it.

**Architecture:** Supabase holds the data (projects + revisions tables) and video files (public storage bucket). The Express backend exposes 4 REST routes using multer memoryStorage to stream uploads directly to Supabase without touching disk. The React frontend is two pages wired with react-router-dom.

**Tech Stack:** Node.js/Express, multer, @supabase/supabase-js, React + Vite, react-router-dom, axios

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/index.js` | Add 4 routes + multer middleware |
| Create | `frontend/src/pages/UploadPage.jsx` | Project creation + video upload form |
| Create | `frontend/src/pages/ReviewPage.jsx` | Video player + revision note UI |
| Modify | `frontend/src/App.jsx` | Add BrowserRouter + two routes (full replacement) |

---

## Task 1: Supabase — Create Storage Bucket and Tables

**Files:** No code files — run SQL in Supabase dashboard.

- [ ] **Step 1: Create the `videos` storage bucket**

  In the Supabase dashboard → Storage → New Bucket:
  - Name: `videos`
  - Public: ✅ (toggle on)
  - Click Create

- [ ] **Step 2: Create the `projects` table**

  In Supabase dashboard → SQL Editor → New Query. Run:

  ```sql
  create table projects (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    video_url text,
    created_at timestamptz default now()
  );
  ```

- [ ] **Step 3: Create the `revisions` table**

  ```sql
  create table revisions (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references projects(id) on delete cascade,
    timestamp_seconds numeric not null,
    note text not null,
    category text,
    created_at timestamptz default now()
  );
  ```

- [ ] **Step 4: Verify**

  In Table Editor, confirm both tables appear with the correct columns.

---

## Task 2: Backend — Install multer and add project routes

**Files:**
- Modify: `backend/index.js`

- [ ] **Step 1: Install multer**

  ```bash
  cd backend
  npm install multer
  ```

- [ ] **Step 2: Add `require` declarations to the top of `backend/index.js`**

  After the existing `require('dotenv').config()`, `require('express')`, and `require('cors')` lines at the top of the file, add these two lines:

  ```js
  const multer = require('multer')
  const supabase = require('./lib/supabase')
  ```

  Then add the multer instance after the existing `require` lines (before `const app = express()`):

  ```js
  const upload = multer({ storage: multer.memoryStorage() })
  ```

- [ ] **Step 3: Add POST /projects**

  After `app.use(express.json())` and before the `/health` route, add:

  ```js
  // POST /projects — create a new project
  app.post('/projects', async (req, res) => {
    const { title } = req.body
    if (!title) return res.status(400).json({ error: 'title is required' })

    const { data, error } = await supabase
      .from('projects')
      .insert({ title })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  })
  ```

- [ ] **Step 4: Add POST /projects/:id/upload**

  ```js
  // POST /projects/:id/upload — upload MP4 to Supabase Storage, update video_url
  app.post('/projects/:id/upload', upload.single('video'), async (req, res) => {
    const { id } = req.params
    if (!req.file) return res.status(400).json({ error: 'video file is required' })

    const filePath = `${id}/${Date.now()}.mp4`

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filePath, req.file.buffer, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) return res.status(500).json({ error: uploadError.message })

    const videoUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/videos/${filePath}`

    const { data, error } = await supabase
      .from('projects')
      .update({ video_url: videoUrl })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })
  ```

- [ ] **Step 5: Add GET /projects/:id**

  ```js
  // GET /projects/:id — return project with its revisions ordered by timestamp
  app.get('/projects/:id', async (req, res) => {
    const { id } = req.params

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (projectError) return res.status(404).json({ error: 'Project not found' })

    const { data: revisions, error: revisionsError } = await supabase
      .from('revisions')
      .select('*')
      .eq('project_id', id)
      .order('timestamp_seconds', { ascending: true })

    if (revisionsError) return res.status(500).json({ error: revisionsError.message })

    res.json({ ...project, revisions })
  })
  ```

- [ ] **Step 6: Add POST /projects/:id/revisions**

  ```js
  // POST /projects/:id/revisions — add a timestamped revision note
  app.post('/projects/:id/revisions', async (req, res) => {
    const { id } = req.params
    const { timestamp_seconds, note } = req.body

    if (timestamp_seconds === undefined || !note) {
      return res.status(400).json({ error: 'timestamp_seconds and note are required' })
    }

    const { data, error } = await supabase
      .from('revisions')
      .insert({ project_id: id, timestamp_seconds, note })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  })
  ```

- [ ] **Step 7: Smoke-test POST /projects**

  Start the backend:
  ```bash
  node index.js
  ```

  In another terminal:
  ```bash
  curl -X POST http://localhost:3001/projects \
    -H "Content-Type: application/json" \
    -d '{"title":"Test Project"}'
  ```

  Expected: 201 response with a project object including `id` and `title`. **Copy the `id` for the next step.**

- [ ] **Step 8: Smoke-test POST /projects/:id/upload**

  Replace `<PROJECT_ID>` with the id from the previous step. You need any `.mp4` file in your current directory (rename any video to `test.mp4`):

  ```bash
  curl -X POST http://localhost:3001/projects/<PROJECT_ID>/upload \
    -F "video=@test.mp4"
  ```

  Expected: 200 response with the project object now including a non-null `video_url` like `https://opqczzjvidruvinydgdh.supabase.co/storage/v1/object/public/videos/<PROJECT_ID>/...mp4`.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/
  git commit -m "feat: add project and revision backend routes"
  ```

---

## Task 3: Frontend — Create UploadPage

**Files:**
- Create: `frontend/src/pages/UploadPage.jsx`

- [ ] **Step 1: Create the `pages/` directory**

  ```bash
  mkdir -p frontend/src/pages
  ```

- [ ] **Step 2: Create `frontend/src/pages/UploadPage.jsx`**

  ```jsx
  import { useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import axios from 'axios'

  const API = import.meta.env.VITE_API_URL

  export default function UploadPage() {
    const [title, setTitle] = useState('')
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    async function handleSubmit(e) {
      e.preventDefault()
      if (!title || !file) return setError('Title and video file are required.')
      setError('')
      setLoading(true)

      try {
        // 1. Create project
        const { data: project } = await axios.post(`${API}/projects`, { title })

        // 2. Upload video
        const formData = new FormData()
        formData.append('video', file)
        await axios.post(`${API}/projects/${project.id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        navigate(`/review/${project.id}`)
      } catch (err) {
        setError(err.response?.data?.error || 'Upload failed. Please try again.')
        setLoading(false)
      }
    }

    return (
      <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 16px' }}>
        <h1>Revision AI</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label>Project Title</label><br />
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={loading}
              style={{ width: '100%', padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>Video File (MP4)</label><br />
            <input
              type="file"
              accept="video/mp4"
              onChange={e => setFile(e.target.files[0])}
              disabled={loading}
              style={{ marginTop: 4 }}
            />
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '8px 24px' }}>
            {loading ? 'Uploading…' : 'Create Project & Upload Video'}
          </button>
        </form>
      </div>
    )
  }
  ```

- [ ] **Step 3: Verify** — confirm file exists at `frontend/src/pages/UploadPage.jsx`.

---

## Task 4: Frontend — Create ReviewPage

**Files:**
- Create: `frontend/src/pages/ReviewPage.jsx`

- [ ] **Step 1: Create `frontend/src/pages/ReviewPage.jsx`**

  ```jsx
  import { useEffect, useRef, useState } from 'react'
  import { useParams } from 'react-router-dom'
  import axios from 'axios'

  const API = import.meta.env.VITE_API_URL

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  export default function ReviewPage() {
    const { id } = useParams()
    const videoRef = useRef(null)
    const [project, setProject] = useState(null)
    const [revisions, setRevisions] = useState([])
    const [showForm, setShowForm] = useState(false)
    const [capturedTime, setCapturedTime] = useState(0)
    const [note, setNote] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
      axios.get(`${API}/projects/${id}`).then(({ data }) => {
        setProject(data)
        setRevisions(data.revisions || [])
      })
    }, [id])

    function handleAddNote() {
      const currentTime = videoRef.current?.currentTime || 0
      setCapturedTime(currentTime)
      setNote('')
      setError('')
      setShowForm(true)
    }

    async function handleSubmitNote(e) {
      e.preventDefault()
      if (!note) return
      setSubmitting(true)
      setError('')

      try {
        const { data: revision } = await axios.post(`${API}/projects/${id}/revisions`, {
          timestamp_seconds: capturedTime,
          note,
        })

        setRevisions(prev =>
          [...prev, revision].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
        )
        setNote('')
        setShowForm(false)
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to save note. Please try again.')
      } finally {
        setSubmitting(false)
      }
    }

    if (!project) return <p style={{ padding: 32 }}>Loading…</p>

    return (
      <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
        <h1>{project.title}</h1>

        <video
          ref={videoRef}
          src={project.video_url}
          controls
          style={{ width: '100%', background: '#000', marginBottom: 16 }}
        />

        <button onClick={handleAddNote} style={{ padding: '8px 20px', marginBottom: 24 }}>
          Add Revision Note
        </button>

        {showForm && (
          <form onSubmit={handleSubmitNote} style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 8px' }}>
              Note at <strong>{formatTime(capturedTime)}</strong>
            </p>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 8 }}
              placeholder="Describe the revision…"
              disabled={submitting}
            />
            <br />
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <button type="submit" disabled={submitting} style={{ marginTop: 8, padding: '6px 18px' }}>
              {submitting ? 'Saving…' : 'Save Note'}
            </button>
          </form>
        )}

        <h2>Revision Notes</h2>
        {revisions.length === 0 ? (
          <p>No revision notes yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {revisions.map(r => (
              <li key={r.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                <strong>{formatTime(r.timestamp_seconds)}</strong> — {r.note}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify** — confirm file exists at `frontend/src/pages/ReviewPage.jsx`.

---

## Task 5: Frontend — Wire up routing in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx` (full replacement — discard existing content)

- [ ] **Step 1: Replace the entire contents of `App.jsx`**

  ```jsx
  import { BrowserRouter, Routes, Route } from 'react-router-dom'
  import UploadPage from './pages/UploadPage'
  import ReviewPage from './pages/ReviewPage'

  export default function App() {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
        </Routes>
      </BrowserRouter>
    )
  }
  ```

- [ ] **Step 2: Commit everything so far**

  ```bash
  git add frontend/src/
  git commit -m "feat: add UploadPage, ReviewPage, and routing"
  ```

---

## Task 6: Verify both services start cleanly

- [ ] **Step 1: Start the backend**

  ```bash
  cd backend
  node index.js
  ```

  Expected output: `revision-ai-backend running on port 3001`

- [ ] **Step 2: Start the frontend (new terminal)**

  ```bash
  cd frontend
  npm run dev
  ```

  Expected output: Vite dev server running on `http://localhost:5173`

- [ ] **Step 3: Manual smoke test in browser**

  1. Open `http://localhost:5173`
  2. Enter a project title and select an MP4 file
  3. Click "Create Project & Upload Video"
  4. Confirm redirect to `/review/:id`
  5. Confirm video plays
  6. Pause video at any timestamp, click "Add Revision Note", type a note, save
  7. Confirm note appears in the list below with correct `MM:SS` timestamp

- [ ] **Step 4: Final commit and push**

  ```bash
  git add .
  git commit -m "feat: video upload and timestamped revisions — core loop complete"
  git push origin main
  ```
