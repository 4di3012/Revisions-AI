# Design: Project Dashboard + Sidebar Navigation

**Date:** 2026-03-19
**Status:** Approved

---

## What We're Building

A persistent sidebar wrapping the entire app, and a `/projects` dashboard that auto-organizes all projects into a 3-level expandable hierarchy (Brand → Type → Cut) parsed from project titles. Purely additive — no existing routes, backend logic, or ReviewPage behavior is modified.

---

## New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/Layout.jsx` | Sidebar + main content wrapper, renders on every route |
| `frontend/src/pages/ProjectsDashboard.jsx` | `/projects` page with expandable 3-level tree |
| `frontend/src/utils/parseTitle.js` | Pure function: title string → `{ brand, cut, type }` |

## Modified Files

| File | Change |
|------|--------|
| `backend/index.js` | Add `GET /projects` returning all projects ordered `created_at desc` |
| `frontend/src/App.jsx` | Wrap routes in `<Layout>`, add `/projects → ProjectsDashboard` |
| `frontend/src/globals.css` | Append sidebar + dashboard styles only |

---

## Backend

### GET /projects
```js
app.get('/projects', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})
```

---

## Title Parsing (`parseTitle.js`)

```
"mmh c1 custom"        → { brand: "MMH",   cut: "C1", type: "Custom"        }
"pat c3 three reasons" → { brand: "PAT",   cut: "C3", type: "Three Reasons" }
"anything weird"       → { brand: "Other", cut: "anything weird", type: "Uncategorized" }
```

**Algorithm:**
1. Split title by spaces
2. `word[0]` → brand (uppercased)
3. Find first word matching `/^c\d+$/i` → cut (uppercased)
4. All words after cut index → join, title-case each → type
5. If no cut word found → `{ brand: "Other", cut: title, type: "Uncategorized" }`

---

## Layout Component

- Fixed 220px sidebar, `#0d0d14` background, full viewport height
- Main content: `margin-left: 220px`, full remaining width
- Sidebar contents: "Revision AI" wordmark at top, nav links (Home `/`, Projects `/projects`)
- Active link highlighted with accent color
- Uses `useLocation()` to detect active route

---

## ProjectsDashboard

- Fetches `GET /projects` on mount
- Parses each project title with `parseTitle.js`
- Groups into: `{ [brand]: { [type]: [{ cut, id }] } }`
- Renders expandable tree using React state (`Set` of open keys)
- Expand/collapse via CSS `max-height` transition
- Chevron SVG rotates 90° when open (CSS transform transition)
- Brand row shows count badge
- Click on cut → `navigate('/review/:id')`

**Empty state:** "No projects yet. Upload your first video to get started."

---

## Styling (appended to globals.css)

```
Sidebar:         #0d0d14, 220px fixed, border-right 1px solid var(--border)
Nav link:        DM Sans, 14px, muted by default, white + left blue bar when active
Brand folder:    var(--surface) card, bold Syne text, count badge
Type level:      indent 16px, DM Sans medium
Cut level:       indent 32px, DM Sans regular, accent color on hover
Chevron:         rotate(0deg) → rotate(90deg), 0.2s ease
Expand panel:    max-height 0 → max-height 500px, overflow hidden, 0.25s ease
```

---

## Out of Scope
- Sidebar collapse/mobile responsive
- Search or filter
- Renaming or deleting projects
- Pagination on GET /projects
