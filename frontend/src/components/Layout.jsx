import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function Layout({ children }) {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    function fetchPending() {
      axios.get(`${API}/projects?status=pending`)
        .then(({ data }) => setPendingCount(data.length))
        .catch(() => {})
    }
    fetchPending()
    const id = setInterval(fetchPending, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">Revision AI</div>
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}
          >
            Home
          </NavLink>
          <NavLink
            to="/revisions"
            className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}
          >
            Revisions
            {pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </NavLink>
          <NavLink
            to="/projects"
            className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}
          >
            Projects
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
