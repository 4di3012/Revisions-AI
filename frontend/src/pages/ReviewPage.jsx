import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function VersionHistory({ versions, revisions }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (!versions || versions.length <= 1) return null

  const latest = versions[versions.length - 1]
  const selected = versions[selectedIdx]

  function editsForVersion(v) {
    if (!v.edits_applied || v.edits_applied.length === 0) return []
    return revisions.filter(r => v.edits_applied.includes(r.id))
  }

  function EditList({ v }) {
    const edits = editsForVersion(v)
    if (edits.length === 0) return (
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0' }}>Original upload — no auto edits.</p>
    )
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {edits.map(r => (
          <div key={r.id} className="revision-card">
            <span className="revision-timestamp">{formatTime(r.timestamp_seconds)}</span>
            <span className="revision-note">{r.note}</span>
          </div>
        ))}
      </div>
    )
  }

  const colLabel = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginBottom: 8,
  }

  return (
    <div style={{ marginTop: 32, marginBottom: 8 }}>
      <h2 className="revisions-heading" style={{ marginBottom: 16 }}>Version History</h2>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

        {/* Left: version selector + player */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={colLabel}>Compare</div>
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(Number(e.target.value))}
              style={{
                background: 'var(--surface2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {versions.map((v, i) => (
                <option key={i} value={i}>V{v.version_number}</option>
              ))}
            </select>
          </div>
          <video
            key={selected.url}
            src={selected.url}
            controls
            style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }}
          />
          <div style={{ ...colLabel, marginTop: 10 }}>Edits in V{selected.version_number}</div>
          <EditList v={selected} />
        </div>

        {/* Right: latest */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={colLabel}>Latest</div>
            <span style={{
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
            }}>V{latest.version_number}</span>
          </div>
          <video
            src={latest.url}
            controls
            style={{ width: '100%', borderRadius: 8, background: '#000', display: 'block' }}
          />
          <div style={{ ...colLabel, marginTop: 10 }}>Edits in V{latest.version_number}</div>
          <EditList v={latest} />
        </div>

      </div>
    </div>
  )
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
  const [deletingId, setDeletingId] = useState(null)

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

  async function handleDeleteRevision(revisionId) {
    setDeletingId(revisionId)
    try {
      await axios.delete(`${API}/revisions/${revisionId}`)
      setRevisions(prev => prev.filter(r => r.id !== revisionId))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete revision.')
    } finally {
      setDeletingId(null)
    }
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

  const autoEdits = revisions.filter(r => r.category === 'auto')
  const applyTimeoutRef = useRef(null)

  async function handleApplyEdits() {
    setApplyingEdits(true)
    setApplyMsg('Auto Edits Applying…')

    // Safety timeout — reset after 60s no matter what
    applyTimeoutRef.current = setTimeout(() => {
      setApplyingEdits(false)
      setApplyMsg('Timed out — click to retry')
    }, 60000)

    try {
      await axios.post(`${API}/projects/${id}/apply-edits`)
      // Stay in applying state — plugin will complete and new version will appear
      // User can see status via applyMsg; button resets on timeout or error only
    } catch (err) {
      clearTimeout(applyTimeoutRef.current)
      setApplyMsg('Error: ' + (err.response?.data?.error || err.message))
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

        <VersionHistory versions={project.versions} revisions={revisions} />

        <button
          className="btn btn-primary"
          onClick={handleAddNote}
          style={{ marginBottom: 12 }}
        >
          + Add Revision Note
        </button>

        {autoEdits.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              className="btn btn-primary"
              onClick={handleApplyEdits}
              disabled={applyingEdits}
              style={{
                background: applyingEdits
                  ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
                marginBottom: applyMsg ? 8 : 0,
              }}
            >
              {applyingEdits
                ? <><span className="spinner" /> Auto Edits Applying…</>
                : 'Apply Auto Edits'}
            </button>
            {applyMsg && (
              <p style={{ fontSize: 13, color: applyMsg.startsWith('Error') || applyMsg.startsWith('Timed') ? '#f87171' : '#4ade80', margin: 0 }}>
                {applyMsg}
              </p>
            )}
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
                <button
                  onClick={() => handleDeleteRevision(r.id)}
                  disabled={deletingId === r.id}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: deletingId === r.id ? 'var(--text-muted)' : '#f87171',
                    cursor: deletingId === r.id ? 'default' : 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  title="Delete revision"
                >
                  {deletingId === r.id ? '…' : '×'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
