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
  const [applyingEdits, setApplyingEdits] = useState(false)
  const [applyMsg, setApplyMsg] = useState('')

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

  const pendingAutoEdits = revisions.filter(r => r.category === 'auto' && r.status === 'pending')

  async function handleApplyEdits() {
    setApplyingEdits(true)
    setApplyMsg('Sending to Premiere…')
    try {
      await axios.post(`${API}/projects/${id}/apply-edits`)
      setApplyMsg('Edits applied! New export incoming…')
      setRevisions(prev => prev.map(r =>
        r.category === 'auto' && r.status === 'pending' ? { ...r, status: 'queued' } : r
      ))
    } catch (err) {
      setApplyMsg('Error: ' + (err.response?.data?.error || err.message))
    } finally {
      setApplyingEdits(false)
    }
  }

  if (!project) {
    return <div className="loading-screen">Loading project…</div>
  }

  return (
    <div className="page">
      <div className="topbar">
        <span className="topbar-title">{project.title}</span>
        <span className="topbar-logo">Revision AI</span>
      </div>

      <div className="review-body">
        <div className="video-wrap">
          {project.video_url ? (
            <video ref={videoRef} src={project.video_url} controls />
          ) : (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No video uploaded yet.
            </div>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleAddNote}
          style={{ marginBottom: 12 }}
        >
          + Add Revision Note
        </button>

        {pendingAutoEdits.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              className="btn btn-primary"
              onClick={handleApplyEdits}
              disabled={applyingEdits}
              style={{ background: 'linear-gradient(135deg,#10b981,#059669)', marginBottom: applyMsg ? 8 : 0 }}
            >
              {applyingEdits ? 'Sending to Premiere…' : `Apply ${pendingAutoEdits.length} Auto Edit${pendingAutoEdits.length > 1 ? 's' : ''}`}
            </button>
            {applyMsg && <p style={{ fontSize: 13, color: applyMsg.startsWith('Error') ? '#f87171' : '#4ade80', margin: 0 }}>{applyMsg}</p>}
          </div>
        )}

        {showForm && (
          <div className="note-panel">
            <div className="timestamp-badge">
              ⏱ {formatTime(capturedTime)}
            </div>
            <form onSubmit={handleSubmitNote}>
              <textarea
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Describe the revision…"
                disabled={submitting}
                autoFocus
              />
              {error && <p className="error-msg">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? (
                  <>
                    <span className="spinner" />
                    Saving…
                  </>
                ) : (
                  'Save Note'
                )}
              </button>
            </form>
          </div>
        )}

        <div className="revisions-section">
          <h2 className="revisions-heading">Revision Notes</h2>

          {revisions.length === 0 ? (
            <p className="empty-state">
              No revisions yet. Watch the video and add your first note.
            </p>
          ) : (
            revisions.map(r => (
              <div key={r.id} className="revision-card">
                <span className="revision-timestamp">{formatTime(r.timestamp_seconds)}</span>
                <span className="revision-note">{r.note}</span>
                <span className={`revision-badge revision-badge-${r.category ?? 'pending'}`}>
                  {r.category === 'auto' ? 'Auto' : r.category === 'human' ? 'Needs Editor' : 'Unclassified'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
