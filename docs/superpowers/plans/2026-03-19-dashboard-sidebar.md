# Project Dashboard + Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent sidebar to every page and a `/projects` dashboard that parses project titles into a 3-level expandable Brand → Type → Cut hierarchy.

**Architecture:** A `Layout` component wraps all routes inside `BrowserRouter`, rendering a fixed 220px sidebar alongside a `margin-left: 220px` main content area. `parseTitle.js` is a pure utility with no side effects. `ProjectsDashboard` fetches `GET /projects` and builds a tree in-memory using `buildTree`. Expand/collapse is pure React state — no external libraries.

**Tech Stack:** React + Vite, react-router-dom v7 (`NavLink`, `useNavigate`), axios, Express/Supabase backend

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/utils/parseTitle.js` | Pure title → `{ brand, cut, type }` parser |
| Create | `frontend/src/components/Layout.jsx` | Fixed sidebar + main content shell |
| Create | `frontend/src/pages/ProjectsDashboard.jsx` | `/projects` expandable tree page |
| Modify | `backend/index.js` | Add `GET /projects` before `GET /projects/:id` (route order matters) |
| Modify | `frontend/src/App.jsx` | Wrap routes in `<Layout>`, add `/projects` route |
| Modify | `frontend/src/globals.css` | Append sidebar + dashboard styles |

---

## Task 1: Backend — Add GET /projects

**Files:**
- Modify: `backend/index.js` (insert before line 115, the `/health` route)

- [ ] **Step 1: Add the route**

  In `backend/index.js`, insert this block immediately **before** the `app.get('/projects/:id', ...)` line (currently line 73). It MUST come before the parameterized route — Express matches routes in order, and `GET /projects/:id` would otherwise capture `GET /projects` with `:id = "projects"` and return a 404.

  ```js
  // GET /projects — return all projects ordered by created_at descending
  app.get('/projects', async (req, res) => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  })
  ```

- [ ] **Step 2: Smoke-test**

  Start the backend and curl:
  ```bash
  node backend/index.js &
  curl -s http://localhost:3001/projects
  ```
  Expected: `[]` (empty array) or a JSON array of project objects. Not a 404 or 500.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/index.js
  git commit -m "feat: add GET /projects route"
  ```

---

## Task 2: Utility — parseTitle.js

**Files:**
- Create: `frontend/src/utils/parseTitle.js`

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p frontend/src/utils
  ```

- [ ] **Step 2: Create `frontend/src/utils/parseTitle.js`**

  ```js
  /**
   * Parses a project title into brand, cut, and type.
   *
   * Pattern: "<brand> <cut> <type words...>"
   *   where cut matches /^c\d+$/i  (e.g. c1, C3, c12)
   *
   * Examples:
   *   "mmh c1 custom"        → { brand: "MMH",   cut: "C1", type: "Custom" }
   *   "pat c3 three reasons" → { brand: "PAT",   cut: "C3", type: "Three Reasons" }
   *   "mmh c1"               → { brand: "MMH",   cut: "C1", type: "Uncategorized" }
   *   "anything weird"       → { brand: "Other", cut: "anything weird", type: "Uncategorized" }
   */
  export function parseTitle(title) {
    const words = title.trim().split(/\s+/)
    const cutIndex = words.findIndex(w => /^c\d+$/i.test(w))

    if (cutIndex !== -1) {
      const brand = words[0].toUpperCase()
      const cut = words[cutIndex].toUpperCase()
      const rest = words.slice(cutIndex + 1)
      const type = rest.length > 0
        ? rest.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : 'Uncategorized'
      return { brand, cut, type }
    }

    return { brand: 'Other', cut: title, type: 'Uncategorized' }
  }
  ```

- [ ] **Step 3: Verify parsing manually**

  In the browser console or a quick node script, confirm:
  ```js
  parseTitle("mmh c1 custom")        // { brand: "MMH",   cut: "C1", type: "Custom" }
  parseTitle("pat c3 three reasons") // { brand: "PAT",   cut: "C3", type: "Three Reasons" }
  parseTitle("mmh c1")               // { brand: "MMH",   cut: "C1", type: "Uncategorized" }
  parseTitle("anything weird")       // { brand: "Other", cut: "anything weird", type: "Uncategorized" }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/utils/parseTitle.js
  git commit -m "feat: add parseTitle utility"
  ```

---

## Task 3: Sidebar styles — append to globals.css

**Files:**
- Modify: `frontend/src/globals.css` (append to end of file)

- [ ] **Step 1: Append sidebar and layout styles to `frontend/src/globals.css`**

  Add the following at the very end of the file:

  ```css
  /* ── App Shell / Sidebar ──────────────────────────────── */
  .app-shell {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 220px;
    min-height: 100vh;
    background: #0d0d14;
    border-right: 1px solid var(--border);
    position: fixed;
    top: 0;
    left: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    padding: 28px 0 0;
  }

  .sidebar-logo {
    font-family: 'Syne', sans-serif;
    font-size: 16px;
    font-weight: 800;
    color: var(--text);
    padding: 0 20px 28px;
    border-bottom: 1px solid var(--border);
    letter-spacing: -0.01em;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    padding: 16px 12px;
    gap: 4px;
  }

  .nav-link {
    display: block;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.15s, background 0.15s;
  }

  .nav-link:hover {
    color: var(--text);
    background: var(--surface2);
  }

  .nav-link-active {
    color: var(--text) !important;
    background: var(--surface2);
    border-left: 2px solid var(--accent);
    padding-left: 10px;
  }

  .main-content {
    margin-left: 220px;
    flex: 1;
    min-height: 100vh;
  }

  /* ── Dashboard ────────────────────────────────────────── */
  .dashboard-body {
    max-width: 860px;
    margin: 0 auto;
    padding: 40px 24px 64px;
  }

  .dashboard-heading {
    font-size: 28px;
    margin-bottom: 28px;
  }

  .brand-folder {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 10px;
    overflow: hidden;
  }

  .folder-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
  }

  .folder-row:hover {
    background: var(--surface2);
  }

  .chevron {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .chevron-open {
    transform: rotate(90deg);
  }

  .folder-name {
    font-family: 'Syne', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    flex: 1;
  }

  .count-badge {
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 20px;
    border: 1px solid var(--border);
  }

  .folder-children {
    overflow: hidden;
    max-height: 0;
    transition: max-height 0.25s ease;
  }

  .folder-children-open {
    max-height: 2000px;
  }

  .type-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 20px 11px 36px;
    cursor: pointer;
    user-select: none;
    border-top: 1px solid var(--border);
    transition: background 0.15s;
  }

  .type-row:hover {
    background: var(--surface2);
  }

  .type-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    flex: 1;
  }

  .cut-row {
    display: flex;
    align-items: center;
    padding: 9px 20px 9px 52px;
    cursor: pointer;
    border-top: 1px solid var(--border);
    transition: background 0.15s, color 0.15s;
    color: var(--text-muted);
    font-size: 14px;
  }

  .cut-row:hover {
    background: var(--surface2);
    color: var(--accent);
  }

  .dashboard-empty {
    text-align: center;
    padding: 64px 0;
    color: var(--text-muted);
    font-size: 14px;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/globals.css
  git commit -m "feat: add sidebar and dashboard CSS"
  ```

---

## Task 4: Layout component

**Files:**
- Create: `frontend/src/components/Layout.jsx`

- [ ] **Step 1: Create the components directory**

  ```bash
  mkdir -p frontend/src/components
  ```

- [ ] **Step 2: Create `frontend/src/components/Layout.jsx`**

  ```jsx
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
  ```

  Note: `end` prop on the Home `NavLink` ensures it only matches exactly `/`, not every route.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/Layout.jsx
  git commit -m "feat: add Layout component with sidebar"
  ```

---

## Task 5: ProjectsDashboard page

**Files:**
- Create: `frontend/src/pages/ProjectsDashboard.jsx`

- [ ] **Step 1: Create `frontend/src/pages/ProjectsDashboard.jsx`**

  ```jsx
  import { useEffect, useState } from 'react'
  import { useNavigate } from 'react-router-dom'
  import axios from 'axios'
  import { parseTitle } from '../utils/parseTitle'

  const API = import.meta.env.VITE_API_URL

  function buildTree(projects) {
    const tree = {}
    for (const project of projects) {
      const { brand, type, cut } = parseTitle(project.title)
      if (!tree[brand]) tree[brand] = {}
      if (!tree[brand][type]) tree[brand][type] = []
      tree[brand][type].push({ cut, id: project.id })
    }
    return tree
  }

  function Chevron({ open }) {
    return (
      <svg
        className={`chevron${open ? ' chevron-open' : ''}`}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="5,3 11,8 5,13" />
      </svg>
    )
  }

  export default function ProjectsDashboard() {
    const [projects, setProjects] = useState([])
    const [openBrands, setOpenBrands] = useState(new Set())
    const [openTypes, setOpenTypes] = useState(new Set())
    const navigate = useNavigate()

    useEffect(() => {
      axios.get(`${API}/projects`).then(({ data }) => setProjects(data))
    }, [])

    function toggleBrand(brand) {
      setOpenBrands(prev => {
        const next = new Set(prev)
        next.has(brand) ? next.delete(brand) : next.add(brand)
        return next
      })
    }

    function toggleType(key) {
      setOpenTypes(prev => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
    }

    const tree = buildTree(projects)
    const brands = Object.keys(tree).sort()

    return (
      <div className="page dashboard-body">
        <h1 className="dashboard-heading">Projects</h1>

        {brands.length === 0 ? (
          <p className="dashboard-empty">
            No projects yet. Upload your first video to get started.
          </p>
        ) : (
          brands.map(brand => {
            const types = tree[brand]
            const totalCuts = Object.values(types).reduce((sum, cuts) => sum + cuts.length, 0)
            const brandOpen = openBrands.has(brand)

            return (
              <div key={brand} className="brand-folder">
                <div className="folder-row" onClick={() => toggleBrand(brand)}>
                  <Chevron open={brandOpen} />
                  <span className="folder-name">{brand}</span>
                  <span className="count-badge">{totalCuts}</span>
                </div>

                <div className={`folder-children${brandOpen ? ' folder-children-open' : ''}`}>
                  {Object.keys(types).sort().map(type => {
                    const typeKey = `${brand}__${type}`
                    const typeOpen = openTypes.has(typeKey)
                    const cuts = types[type]

                    return (
                      <div key={type}>
                        <div className="type-row" onClick={() => toggleType(typeKey)}>
                          <Chevron open={typeOpen} />
                          <span className="type-name">{type}</span>
                        </div>

                        <div className={`folder-children${typeOpen ? ' folder-children-open' : ''}`}>
                          {cuts.map(({ cut, id }) => (
                            <div
                              key={id}
                              className="cut-row"
                              onClick={() => navigate(`/review/${id}`)}
                            >
                              {cut}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/pages/ProjectsDashboard.jsx
  git commit -m "feat: add ProjectsDashboard page"
  ```

---

## Task 6: Wire up App.jsx

**Files:**
- Modify: `frontend/src/App.jsx` (full replacement)

- [ ] **Step 1: Replace the entire contents of `frontend/src/App.jsx`**

  ```jsx
  import { BrowserRouter, Routes, Route } from 'react-router-dom'
  import Layout from './components/Layout'
  import UploadPage from './pages/UploadPage'
  import ReviewPage from './pages/ReviewPage'
  import ProjectsDashboard from './pages/ProjectsDashboard'

  export default function App() {
    return (
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/review/:id" element={<ReviewPage />} />
            <Route path="/projects" element={<ProjectsDashboard />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    )
  }
  ```

- [ ] **Step 2: Verify build passes**

  ```bash
  cd frontend && npm run build 2>&1
  ```

  Expected: `✓ built in Xms` with no errors. If errors appear, fix before committing.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/App.jsx
  git commit -m "feat: wrap routes in Layout, add /projects route"
  ```

---

## Task 7: Verify end-to-end

- [ ] **Step 1: Kill any running processes and start fresh**

  ```bash
  npm run dev &
  sleep 5
  ```

  Expected console output:
  - `[1] revision-ai-backend running on port 3001`
  - `[0] VITE v8.x.x  ready in Xms — Local: http://localhost:5173/`

- [ ] **Step 2: Verify sidebar appears on UploadPage**

  Open `http://localhost:5173/`. Confirm:
  - Sidebar is visible on the left with "Revision AI" wordmark
  - "Home" link is active (blue left bar)
  - "Projects" link is visible and not active
  - Upload form renders correctly in the right content area

- [ ] **Step 3: Verify sidebar appears on ReviewPage**

  Navigate to any `/review/:id` URL. Confirm sidebar is still visible.

- [ ] **Step 4: Verify /projects route and dashboard**

  Click "Projects" in the sidebar. Confirm:
  - URL changes to `/http://localhost:5173/projects`
  - "Projects" nav link becomes active
  - Page shows "Projects" heading
  - If no projects: shows "No projects yet. Upload your first video to get started."
  - If projects exist: shows brand folders with count badges
  - Click a brand folder → expands to show types
  - Click a type → expands to show cuts
  - Click a cut → navigates to `/review/:id`

- [ ] **Step 5: Final commit and push**

  ```bash
  git add .
  git commit -m "feat: project dashboard and sidebar navigation — complete"
  git push origin main
  ```
