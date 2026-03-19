import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', 'video/mp4')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed with status ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  })
}

export default function UploadPage() {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
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
    setUploading(true)
    setProgress(0)

    try {
      const { data: { presignedUrl, publicUrl } } = await axios.get(
        `${API}/projects/presigned-url?filename=${encodeURIComponent(file.name)}`
      )

      await uploadWithProgress(presignedUrl, file, setProgress)

      await axios.post(`${API}/projects`, { title, videoUrl: publicUrl })

      navigate('/qa')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed. Please try again.')
      setUploading(false)
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
              disabled={uploading}
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
                disabled={uploading}
                onChange={e => applyFile(e.target.files[0])}
              />
              <span className="drop-zone-icon">🎬</span>
              <span className="drop-zone-label">
                {dragging ? 'Drop it here' : 'Drop MP4 here or click to browse'}
              </span>
              {file && <div className="drop-zone-filename">✓ {file.name}</div>}
            </div>
          </div>

          {uploading && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                color: 'var(--text-muted)',
                marginBottom: 6,
              }}>
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--surface2)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                  borderRadius: 3,
                  transition: 'width 0.2s ease',
                }} />
              </div>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}

          {file && (
            <button
              type="submit"
              disabled={uploading}
              className="btn btn-primary btn-full"
              style={{ marginTop: 8 }}
            >
              {uploading ? (
                <>
                  <span className="spinner" />
                  Uploading…
                </>
              ) : (
                'Submit to QA'
              )}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
