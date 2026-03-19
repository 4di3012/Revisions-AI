import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function UploadPage() {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function applyFile(f) {
    if (!f) return
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'video/mp4') applyFile(dropped)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title || !file) return setError('Title and video file are required.')
    setError('')
    setLoading(true)

    try {
      const { data: project } = await axios.post(`${API}/projects`, { title })

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
    <div className="upload-wrap page">
      <div className="card upload-card">
        <h1 className="upload-wordmark">Revision AI</h1>
        <p className="upload-tagline">The smarter revision loop.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Project Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={loading}
              placeholder="e.g. Q2 Campaign — Cut 3"
            />
          </div>

          <div className="form-group">
            <label>Video File</label>
            <div
              className={`drop-zone${dragging ? ' dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="video/mp4"
                disabled={loading}
                onChange={e => applyFile(e.target.files[0])}
              />
              <span className="drop-zone-icon">🎬</span>
              <span className="drop-zone-label">
                {dragging ? 'Drop it here' : 'Drop MP4 here or click to browse'}
              </span>
              {file && <div className="drop-zone-filename">✓ {file.name}</div>}
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-full"
            style={{ marginTop: 8 }}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Uploading…
              </>
            ) : (
              'Create Project'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
