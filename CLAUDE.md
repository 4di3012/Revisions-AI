# Revision AI — Claude Code Context

## What This App Does
Revision AI is a revision communication layer for video editors and strategists.
- Editors upload/link a video
- Strategists leave timestamped revision notes
- AI classifies each revision: small (auto-execute) or big (flag to editor)
- Small revisions execute automatically; big ones go back to the editor
- Strategist delivers the final video to the client

## Stack
- Frontend: React + Vite → deployed on Vercel (port 5173 locally)
- Backend: Node.js/Express → deployed on Render (port 3001 locally)
- Database: Supabase (PostgreSQL + pgvector)
- Storage: Cloudflare R2
- AI: Anthropic Claude API
- CEP Plugin: Adobe Premiere Pro panel (plugin-cep/)
- Testing: Playwright e2e

## Key Files
- `backend/index.js` — Express API server
- `plugin-cep/index.js` — Adobe CEP panel (HTML/JS, runs inside Premiere)
- `frontend/src/` — React frontend

## Local Paths
- Root: C:/Users/adive/revision-ai
- Frontend: C:/Users/adive/revision-ai/frontend
- Backend: C:/Users/adive/revision-ai/backend
- Plugin source: C:/Users/adive/revision-ai/plugin-cep/index.js
- Plugin installed: C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.revisionai.cep\

## Env Files
- frontend/.env → VITE_API_URL
- backend/.env → SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, PORT

## Dev Rules
- Always run Playwright tests before final pushes
- Never commit .env files
- Keep code changes surgical — never rewrite working code
- Use memory/cloudmemory.md to log decisions and progress
- CEP plugin networking MUST use XMLHttpRequest, not fetch (fetch is not available in CEP panels)

## Plugin Deploy Rule
After any change to plugin-cep/index.js, the user must manually run the PowerShell copy as admin:

```powershell
Copy-Item 'C:\Users\adive\revision-ai\plugin-cep\index.js' 'C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.revisionai.cep\index.js' -Force
```

Claude cannot run this automatically (requires admin elevation). Remind the user to run it after any plugin change.

## Auto Plugin Deploy Rule
After ANY change to plugin-cep/index.js, ALWAYS automatically run these commands without being asked:

1. Copy plugin to installed location:
cmd /c "powershell -Command \"Copy-Item 'C:\\Users\\adive\\revision-ai\\plugin-cep\\index.js' 'C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\com.revisionai.cep\\index.js' -Force\""

2. Verify the copy worked:
cmd /c "powershell -Command \"Get-Item 'C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\com.revisionai.cep\\index.js' | Select-Object LastWriteTime\""

Never ask the user to run PowerShell manually. Always do it automatically after every plugin change.
