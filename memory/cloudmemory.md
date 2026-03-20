# Revision AI — Cloud Memory Log

## Project Start
- Scaffolded full project structure
- Stack: React+Vite / Node+Express / Supabase / Anthropic / Playwright
- Video processing approach: TBD
- Auth and Stripe: deferred (same pattern as Script It)
\n## Commit: 9582667 — scaffold: initialize revision-ai project — 2026-03-18 23:36:40 -0500
\n## Commit: 55a4fda — scaffold: initialize revision-ai project — 2026-03-18 23:47:23 -0500
\n## Commit: bffaec1 — docs: add video upload + revisions design spec — 2026-03-18 23:53:59 -0500
\n## Commit: c9ca89e — docs: add video upload + revisions implementation plan — 2026-03-18 23:57:30 -0500
\n## Commit: 19ac782 — feat: add project and revision backend routes — 2026-03-19 00:01:12 -0500
\n## Commit: 2976bd9 — feat: add UploadPage, ReviewPage, and routing — 2026-03-19 00:01:52 -0500
\n## Commit: 3d457c1 — feat: add root dev script with concurrently — 2026-03-19 00:06:53 -0500
\n## Commit: 2742848 — feat: dark theme redesign — DM Sans/Syne, electric blue accent, card layout — 2026-03-19 00:11:07 -0500
\n## Commit: 70084e1 — docs: add dashboard + sidebar design spec — 2026-03-19 00:23:18 -0500
\n## Commit: d3f4148 — docs: add dashboard + sidebar implementation plan — 2026-03-19 00:28:31 -0500
\n## Commit: 3abc28c — feat: add dashboard + sidebar navigation — 2026-03-19 00:36:14 -0500
\n## Commit: e561c68 — feat: AI classification, QA dashboard, R2 upload, folder hierarchy — 2026-03-19 02:58:06 -0500
\n## Commit: 350d905 — chore: add engines field to backend package.json for Render deploy — 2026-03-19 14:13:09 -0500
\n## Commit: b759e36 — chore: open CORS temporarily for upload debugging — 2026-03-19 14:18:41 -0500
\n## Commit: 5c6c54b — fix: lock down CORS to known Vercel + localhost origins — 2026-03-19 14:19:39 -0500
\n## Commit: e8ef73b — debug: log request origin in CORS handler — 2026-03-19 14:25:41 -0500
\n## Commit: 3669bcb — fix: add new Vercel preview URL to CORS allowedOrigins — 2026-03-19 14:30:10 -0500
\n## Commit: b10b26e — fix: allow all .vercel.app origins via endsWith check — 2026-03-19 14:32:09 -0500
\n## Commit: 11e4e1d — fix: add vercel.json SPA rewrite for client-side routing — 2026-03-19 14:35:50 -0500
\n## Commit: 44b21ae — feat: presigned URL upload flow with progress bar — 2026-03-19 14:50:49 -0500
\n## Commit: 48c50de — feat: scaffold Adobe UXP plugin for Premiere Pro — 2026-03-19 15:11:42 -0500
\n## Commit: 47cd7aa — fix: allow null origin in CORS for CEP plugin (local file protocol) — 2026-03-19 16:06:39 -0500
\n## Commit: b021d12 — fix: allow null origin for CEP plugin CORS — 2026-03-19 16:07:47 -0500
\n## Commit: d976cd7 — fix: allow file:// origin in CORS for CEP panel — 2026-03-19 16:14:18 -0500
\n## Commit: 1d33922 — feat: add POST /api/projects route for CEP plugin with debug logging — 2026-03-19 16:20:06 -0500
\n## Commit: 866c88e — feat: add /qa route, QA dashboard, and GET /api/projects endpoint — 2026-03-19 16:25:58 -0500
\n## Commit: 22d3b1e — fix: wire sidebar QA Needed link to /qa, fix badge count, add debug logging — 2026-03-19 16:28:18 -0500
\n## Commit: 4821d78 — fix: save video_url in POST /api/projects, graceful fallback in ReviewPage — 2026-03-19 16:55:07 -0500
\n## Commit: 3e202f2 — feat: CEP full export+upload flow — 2026-03-19 17:00:36 -0500

## CEP Plugin — AME Export + Upload (2026-03-19)

### What works
- Node.js enabled in CEP via `--enable-nodejs` flag in manifest.xml `<CEFCommandLine>`
- AME CLI export: `exec('"Adobe Media Encoder.exe" -encode "projectPath" "seqName" "outputPath" "presetPath"')`
- AME ignores the output path argument — file lands at `path.dirname(projectPath) + seqName + ".mp4"`
- Preset confirmed working: `4E49434B_48323634/Facebook 1080p HD.epr`
- Full flow: Send to QA → AME export (exec) → 30s wait → fs.readFile → POST /api/projects → POST /projects/:id/upload → R2 → dashboard video appears

### Key lessons
- `form-data` npm package does NOT work in CEP Node.js context — use browser `FormData` + `XMLHttpRequest` instead
- Upload endpoint is `POST /projects/:id/upload` (not `/api/projects/:id/upload-video`)
- Two-step upload: first POST `/api/projects` to get projectId, then POST `/projects/:id/upload` with multipart form
- CEP manifest host version must be `[25.0,99.9]` to cover Premiere 2026 (v26)
- `require('child_process')` and `require('fs')` work once `--enable-nodejs` is in manifest
- Premiere must be fully restarted (not just panel reload) after manifest changes
\n## Commit: 65f8981 — feat: structured AI classification, auto-edit execution pipeline, Apply Auto Edits button — 2026-03-19 21:06:16 -0500
\n## Commit: 23bb83f — feat: add /admin/migrate endpoint via pg for revisions table DDL — 2026-03-19 21:13:15 -0500
\n## Commit: 299f24c — feat: dashboard Apply Auto Edits button, backend queue endpoints, plugin polling — 2026-03-19 21:16:57 -0500
\n## Commit: c16365e — fix: insert revision first, then classify and update — returns full classification in response — 2026-03-19 21:24:30 -0500
\n## Commit: 15873dd — feat: human revisions panel, project name display, localStorage persistence — 2026-03-19 21:33:07 -0500
\n## Commit: 940caa2 — feat: Essential Graphics caption fix, versioned uploads, version comparison UI — 2026-03-19 21:45:24 -0500
\n## Commit: 7f8ecfb — feat: version history side-by-side comparison on review page — 2026-03-19 21:51:32 -0500
\n## Commit: 89f9447 — fix: prevent single() coercion error in upload endpoint — 2026-03-19 21:56:21 -0500
\n## Commit: 4d6dfc4 — feat: stale project ID recovery in CEP plugin — 2026-03-19 22:02:43 -0500
\n## Commit: b409ce9 — feat: refactor export flow, Premiere refocus, fix auto-edits export trigger — 2026-03-19 22:13:06 -0500
\n## Commit: 70722f5 — feat: full diagnostic ExtendScript for all action types — 2026-03-19 22:23:09 -0500
\n## Commit: 4dc902d — fix: caption_text_change diagnostics — matched clips only, deeper property inspection — 2026-03-19 22:31:11 -0500
\n## Commit: 7e37875 — feat: ExtendScript debug log to file + pre-export alert gate — 2026-03-19 22:38:18 -0500
\n## Commit: e0e306e — fix: caption_text_change TextDocument — use .toString() and textDoc.text — 2026-03-19 22:47:22 -0500
\n## Commit: efeab6f — fix: caption_text_change direct evalScript with TextDocument fix — 2026-03-20 00:16:13 -0500
\n## Commit: 1c555fd — fix: remove dangling quote left by caption_text_change block deletion — 2026-03-20 00:18:11 -0500
