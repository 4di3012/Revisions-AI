import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function QADashboard() {
  const [projects, setProjects] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const navigate = useNavigate()

  const fetchQueue = useCallback(() => {
    axios.get(`${API}/api/projects`)
      .then(({ data }) => {
        const pending = data
          .filter(p => p.status === 'pending_qa')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        setProjects(pending)
        setLastUpdated(new Date())
      })
      .catch(err => console.error('QADashboard fetch error:', err))
  }, [])

  useEffect(() => {
    fetchQueue()
    const id = setInterval(fetchQueue, 5000)
    return () => clearInterval(id)
  }, [fetchQueue])

  return (
    <div className="page dashboard-body">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 className="dashboard-heading" style={{ marginBottom: 0 }}>QA Needed</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={fetchQueue}>
            Refresh
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="dashboard-empty">No projects waiting for QA.</p>
      ) : (
        <div className="queue-list">
          {projects.map(project => (
            <div key={project.id} className="queue-row">
              <span className="queue-title">{project.title}</span>
              <span className="queue-date">{formatDate(project.created_at)}</span>
              <button
                className="btn btn-primary queue-btn"
                onClick={() => navigate(`/review/${project.id}`)}
              >
                Review
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
