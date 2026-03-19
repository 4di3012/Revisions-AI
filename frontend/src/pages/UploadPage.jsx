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
