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
