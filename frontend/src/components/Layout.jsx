import { NavLink } from 'react-router-dom'

export default function Layout({ children }) {
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
            to="/projects"
            className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}
          >
            Projects
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
