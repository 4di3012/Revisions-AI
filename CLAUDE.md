# Revision AI — Claude Code Context

## What This App Does
Revision AI is a revision communication layer for video editors and strategists.
- Editors upload/link a video
- Strategists leave timestamped revision notes
- AI classifies each revision: small (auto-execute) or big (flag to editor)
- Small revisions execute automatically; big ones go back to the editor
- Strategist delivers the final video to the client

## Stack
- Frontend: React + Vite → deployed on Vercel
- Backend: Node.js/Express → deployed on Render
- Database: Supabase (PostgreSQL + pgvector)
- AI: Anthropic Claude API
- Video processing: TBD
- Testing: Playwright e2e

## Dev Rules
- Always run Playwright tests before final pushes
- Never commit .env files
- Keep code changes surgical
- Use memory/cloudmemory.md to log decisions and progress

## Local Paths
- Root: C:/Users/adive/revision-ai
- Frontend: C:/Users/adive/revision-ai/frontend
- Backend: C:/Users/adive/revision-ai/backend

## Env Files
- frontend/.env → VITE_API_URL
- backend/.env → SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, PORT

## Auto Plugin Deploy Rule
After ANY change to plugin-cep/index.js, ALWAYS automatically run these commands without being asked:

1. Copy plugin to installed location:
cmd /c "powershell -Command \"Copy-Item 'C:\\Users\\adive\\revision-ai\\plugin-cep\\index.js' 'C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\com.revisionai.cep\\index.js' -Force\""

2. Verify the copy worked:
cmd /c "powershell -Command \"Get-Item 'C:\\Program Files (x86)\\Common Files\\Adobe\\CEP\\extensions\\com.revisionai.cep\\index.js' | Select-Object LastWriteTime\""

Never ask the user to run PowerShell manually. Always do it automatically after every plugin change.
