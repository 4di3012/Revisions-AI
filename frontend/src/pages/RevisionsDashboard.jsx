import { useEffect, useState } from 'react'
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

export default function RevisionsDashboard() {
  const [projects, setProjects] = useState([])
  const navigate = useNavigate()

  function fetchQueue() {
    axios.get(`${API}/projects?status=pending`)
      .then(({ data }) => setProjects([...data].sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      )))
      .catch(() => {})
  }

  useEffect(() => {
    fetchQueue()
    const id = setInterval(fetchQueue, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="page dashboard-body">
      <h1 className="dashboard-heading">QA Needed</h1>

      {projects.length === 0 ? (
        <p className="dashboard-empty">
          No projects in the queue. Waiting for the editor to upload.
        </p>
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
