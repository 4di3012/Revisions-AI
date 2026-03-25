require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const supabase = require('./lib/supabase')
const r2 = require('./lib/r2')
const claude = require('./lib/claude')

const upload = multer({ storage: multer.memoryStorage() })

function secondsToTimecode(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:00`
}

function classificationPrompt(note, timecode) {
  return `You are a video editing revision classifier. Classify the revision note as auto or human based on these rules:

AUTO (can be executed programmatically in Premiere via ExtendScript):
- Grammar/spelling/word changes → action_type: caption_text_change
- Color code changes with hex value → action_type: lumetri_color
- Saturation/temperature with numeric value → action_type: lumetri_color
- Clip swaps with a LucidLink file path → action_type: clip_swap
- Overlay additions with a file path → action_type: add_overlay
- Reposition/resize with clear numeric value → action_type: basic_motion
- Cut/trim with clear timecodes → action_type: cut_section

HUMAN (requires editor judgment):
- Speed ramps, transitions, font style changes, audio mixing, anything vague

Revision note: "${note}"
Timecode: ${timecode}

Respond ONLY with valid JSON, no other text:
{
  "category": "auto",
  "action_type": "caption_text_change",
  "action_json": {
    "action": "caption_text_change",
    "timecode": "${timecode}",
    "find": "word_to_find",
    "replace": "replacement_word"
  }
}`
}

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  'https://revisions-ai.vercel.app',
  'https://revisions-b59gxk8id-adiveluswamy-3830s-projects.vercel.app',
  'https://revisions-i3x5qapfu-adiveluswamy-3830s-projects.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    console.log('Request origin:', origin)
    if (
      !origin ||
      origin === 'null' ||
      origin.startsWith('file://') ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost') ||
      origin === process.env.FRONTEND_URL
    ) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}))

app.use(express.json())

// GET /projects/presigned-url?filename=xxx — generate presigned PUT URL for R2
app.get('/projects/presigned-url', async (req, res) => {
  const { filename } = req.query
  if (!filename) return res.status(400).json({ error: 'filename is required' })

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: filename,
    ContentType: 'video/mp4',
  })

  try {
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 900 })
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`
    res.json({ presignedUrl, publicUrl })
  } catch (err) {
    console.error('Presign failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /projects — create a new project
app.post('/projects', async (req, res) => {
  const { title, videoUrl } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const insertData = { title }
  if (videoUrl) insertData.video_url = videoUrl

  const { data, error } = await supabase
    .from('projects')
    .insert(insertData)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// POST /projects/:id/upload — upload MP4 to R2, append to versions array, update video_url
app.post('/projects/:id/upload', upload.single('video'), async (req, res) => {
  const { id } = req.params
  if (!id) return res.status(400).json({ error: 'project id is required' })
  if (!req.file) return res.status(400).json({ error: 'video file is required' })

  // Parse optional revision_ids from multipart form field
  let revisionIds = []
  if (req.body.revision_ids) {
    try { revisionIds = JSON.parse(req.body.revision_ids) } catch (_) {}
  }

  const key = `${id}/${Date.now()}.mp4`

  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'video/mp4',
    }))
  } catch (uploadError) {
    console.error('R2 upload failed:', uploadError.message)
    return res.status(500).json({ error: uploadError.message })
  }

  const videoUrl = `${process.env.R2_PUBLIC_URL}/${key}`

  // Fetch current versions array — use maybeSingle so missing row returns null instead of throwing
  const { data: existing, error: fetchError } = await supabase
    .from('projects')
    .select('versions')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return res.status(500).json({ error: fetchError.message })
  if (!existing) return res.status(404).json({ error: `Project ${id} not found` })

  const versions = Array.isArray(existing.versions) ? existing.versions : []
  const newVersion = {
    version_number: versions.length + 1,
    url: videoUrl,
    uploaded_at: new Date().toISOString(),
    edits_applied: revisionIds,
  }

  // Update and return the row — no .single() here; we already confirmed exactly one row exists
  const { data: rows, error } = await supabase
    .from('projects')
    .update({ video_url: videoUrl, versions: [...versions, newVersion] })
    .eq('id', id)
    .select()

  if (error) return res.status(500).json({ error: error.message })
  if (!rows || rows.length === 0) return res.status(404).json({ error: 'Project not found after update' })
  res.json(rows[0])
})

// GET /projects — return all projects; optional ?status= filter
app.get('/projects', async (req, res) => {
  const { status } = req.query
  let query = supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /projects/pending-edits — return all auto revisions with status='queued'
app.get('/projects/pending-edits', async (req, res) => {
  const { data, error } = await supabase
    .from('revisions')
    .select('*')
    .eq('status', 'queued')
    .eq('category', 'auto')
  console.log('pending-edits result:', JSON.stringify(data), error)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ edits: data })
})

// GET /projects/:id — return project with its revisions ordered by timestamp
app.get('/projects/:id', async (req, res) => {
  const { id } = req.params

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (projectError) return res.status(404).json({ error: 'Project not found' })

  const { data: revisions, error: revisionsError } = await supabase
    .from('revisions')
    .select('*')
    .eq('project_id', id)
    .order('timestamp_seconds', { ascending: true })

  if (revisionsError) return res.status(500).json({ error: revisionsError.message })

  res.json({ ...project, revisions })
})

// GET /projects/:id/revisions — return revisions for a project; optional ?category= filter
app.get('/projects/:id/revisions', async (req, res) => {
  const { id } = req.params
  const { category } = req.query
  let query = supabase
    .from('revisions')
    .select('*')
    .eq('project_id', id)
    .order('timestamp_seconds', { ascending: true })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json({ revisions: data })
})

// POST /projects/:id/revisions — insert row, classify with Claude, update row, return full result
app.post('/projects/:id/revisions', async (req, res) => {
  const { id } = req.params
  const { timestamp_seconds, note } = req.body

  if (timestamp_seconds === undefined || !note) {
    return res.status(400).json({ error: 'timestamp_seconds and note are required' })
  }

  // Step 1: insert immediately so the note is saved even if Claude fails
  const { data: inserted, error: insertError } = await supabase
    .from('revisions')
    .insert({ project_id: id, timestamp_seconds, note, status: 'pending' })
    .select()
    .single()

  if (insertError) return res.status(500).json({ error: insertError.message })

  // Step 2: classify with Claude
  const timecode = secondsToTimecode(timestamp_seconds)
  let category = null
  let action_type = null
  let action_json = null

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: classificationPrompt(note, timecode) }],
    })
    const raw = msg.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(raw)
    if (parsed.category === 'auto' || parsed.category === 'human') {
      category = parsed.category
      action_type = parsed.action_type || null
      action_json = parsed.action_json || null
    }
  } catch (e) {
    console.error('Claude classification failed:', e.message)
  }

  // Step 3: update row with classification results
  const { data, error } = await supabase
    .from('revisions')
    .update({ category, action_type, action_json })
    .eq('id', inserted.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// POST /projects/:id/apply-edits — reset ALL auto revisions to queued for plugin execution
app.post('/projects/:id/apply-edits', async (req, res) => {
  const { id } = req.params
  console.log('apply-edits called for project:', id)

  const { data: edits, error: fetchError } = await supabase
    .from('revisions')
    .select('id, timestamp_seconds, note, action_type, action_json, project_id')
    .eq('project_id', id)
    .eq('category', 'auto')
    .order('timestamp_seconds', { ascending: true })

  if (fetchError) return res.status(500).json({ error: fetchError.message })
  if (edits.length === 0) return res.json({ edits: [] })

  const { data: updateData, error: updateError } = await supabase
    .from('revisions')
    .update({ status: 'queued' })
    .eq('project_id', id)
    .eq('category', 'auto')
    .select()

  console.log('update result:', JSON.stringify(updateData), updateError)
  if (updateError) return res.status(500).json({ error: updateError.message, detail: updateError })
  res.json({ edits })
})

// GET /api/upload-url?filename=xxx&filetype=yyy — presigned PUT URL for CEP plugin uploads
app.get('/api/upload-url', async (req, res) => {
  const { filename, filetype } = req.query
  if (!filename) return res.status(400).json({ error: 'filename is required' })

  const key = `uploads/${Date.now()}-${filename}`
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: filetype || 'video/mp4',
  })

  try {
    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 900 })
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`
    res.json({ presignedUrl, publicUrl })
  } catch (err) {
    console.error('Upload URL generation failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/projects — return all projects ordered by created_at desc
app.get('/api/projects', async (req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/projects — CEP plugin entry point
app.post('/api/projects', async (req, res) => {
  console.log('POST /api/projects hit', req.body)
  const { project_name, status, video_url } = req.body
  if (!project_name) return res.status(400).json({ error: 'project_name is required' })

  const insertData = { title: project_name, status: status || 'pending_qa' }
  if (video_url) insertData.video_url = video_url

  try {
    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single()

    console.log('POST /api/projects supabase result:', { data, error })
    if (error) return res.status(500).json({ error: error.message })
    res.status(201).json(data)
  } catch (err) {
    console.error('POST /api/projects error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /projects/:id/auto-edits — return pending auto revisions
app.get('/projects/:id/auto-edits', async (req, res) => {
  const { id } = req.params
  const { data, error } = await supabase
    .from('revisions')
    .select('id, timestamp_seconds, note, action_type, action_json')
    .eq('project_id', id)
    .eq('category', 'auto')
    .eq('status', 'pending')
    .order('timestamp_seconds', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ edits: data })
})

// PATCH /revisions/:id/status — update revision status after plugin execution
app.patch('/revisions/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  if (!status) return res.status(400).json({ error: 'status is required' })
  const { data, error } = await supabase
    .from('revisions')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /revisions/:id — remove a revision
app.delete('/revisions/:id', async (req, res) => {
  const { id } = req.params
  const { error } = await supabase.from('revisions').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// POST /admin/migrate-versions — run once to add versions column to projects
app.post('/admin/migrate-versions', async (req, res) => {
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS versions jsonb DEFAULT '[]'")
    res.json({ ok: true, message: 'versions column added' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    await client.end()
  }
})

// POST /admin/migrate — run once to add action_type, action_json, status columns
// Requires DATABASE_URL in .env (Supabase: Settings → Database → Connection string → URI)
app.post('/admin/migrate', async (req, res) => {
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    await client.query('ALTER TABLE revisions ADD COLUMN IF NOT EXISTS action_type text')
    await client.query('ALTER TABLE revisions ADD COLUMN IF NOT EXISTS action_json jsonb')
    await client.query("ALTER TABLE revisions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'")
    res.json({ ok: true, message: 'Migration complete' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    await client.end()
  }
})

// POST /apply-caption-edit — patch caption text directly in a .prproj file
app.post('/apply-caption-edit', async (req, res) => {
  const { projectPath, find, replace } = req.body
  if (!projectPath || !find || replace === undefined) {
    return res.status(400).json({ error: 'projectPath, find, and replace are required' })
  }

  const zlib = require('zlib')
  const fs = require('fs')

  try {
    const raw = fs.readFileSync(projectPath)

    await new Promise((resolve, reject) => {
      zlib.gunzip(raw, (err, decompressed) => {
        if (err) { reject(err); return }
        let xml = decompressed.toString('utf8')

        const findBufExact = Buffer.from(find, 'utf8')
        const findBufWithNull = Buffer.concat([findBufExact, Buffer.alloc(1)])
        const replaceBuf = Buffer.from(replace, 'utf8')
        let searchFrom = 0
        let patched = false

        while (!patched) {
          const nameIdx = xml.indexOf('<Name>Source Text</Name>', searchFrom)
          if (nameIdx === -1) break

          const arbStart = xml.lastIndexOf('<ArbVideoComponentParam', nameIdx)
          const arbEnd = xml.indexOf('</ArbVideoComponentParam>', arbStart)
          const blobTagIdx = xml.indexOf('<StartKeyframeValue', arbStart)
          if (blobTagIdx === -1 || blobTagIdx > arbEnd) { searchFrom = nameIdx + 1; continue }

          const blobContentStart = xml.indexOf('>', blobTagIdx) + 1
          const blobContentEnd = xml.indexOf('</StartKeyframeValue>', blobContentStart)
          if (blobContentEnd === -1) { searchFrom = nameIdx + 1; continue }

          const blob = xml.substring(blobContentStart, blobContentEnd).trim()
          const decoded = Buffer.from(blob, 'base64')

          // Search buffer directly — toString('utf8') on binary data corrupts byte offsets
          // Try with trailing null byte first (zero-padding left by previous patches)
          let textOffset = decoded.indexOf(findBufWithNull)
          if (textOffset === -1) textOffset = decoded.indexOf(findBufExact)
          if (textOffset === -1) { searchFrom = nameIdx + 1; continue }

          // Read the actual allocated length from the 4-byte LE field immediately before the text
          const fullTextLen = decoded.readUInt32LE(textOffset - 4)
          if (replaceBuf.length > fullTextLen) {
            reject(new Error(`Replacement "${replace}" (${replaceBuf.length}B) exceeds original space (${fullTextLen}B)`)); return
          }
          decoded.fill(0, textOffset, textOffset + fullTextLen)
          replaceBuf.copy(decoded, textOffset)
          decoded.writeUInt32LE(replaceBuf.length, textOffset - 4)

          // Splice patched blob back into XML
          const newBlob = decoded.toString('base64')
          xml = xml.substring(0, blobContentStart) + '\n\t\t' + newBlob + '\n\t\t' + xml.substring(blobContentEnd)

          // Update InstanceName label
          const instanceBefore = '<InstanceName>' + find + '</InstanceName>'
          const instanceAfter  = '<InstanceName>' + replace + '</InstanceName>'
          if (xml.includes(instanceBefore)) xml = xml.replace(instanceBefore, instanceAfter)

          patched = true
        }

        if (!patched) { reject(new Error(`Text "${find}" not found in any Source Text blob`)); return }

        fs.copyFileSync(projectPath, projectPath + '.backup')

        zlib.gzip(Buffer.from(xml, 'utf8'), (err2, compressed) => {
          if (err2) { reject(err2); return }
          fs.writeFileSync(projectPath, compressed)
          resolve()
        })
      })
    })

    console.log(`apply-caption-edit: "${find}" → "${replace}" in ${projectPath}`)
    res.json({ success: true })
  } catch (err) {
    console.error('apply-caption-edit error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /export-video — launch AME CLI against a prproj file
// Accepts { projectPath }; responds immediately and runs AME in background
// Uses AME ExtendScript API (--console es.processFile) to export a specific
// sequence by name without triggering any "Choose Items to Import" dialog.
app.post('/export-video', (req, res) => {
  const { projectPath } = req.body
  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath is required' })
  }

  const { exec } = require('child_process')
  const fs = require('fs')
  const os = require('os')
  const path = require('path')

  const amePath      = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe'
  const presetPath   = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\MediaIO\\systempresets\\4E49434B_48323634\\Facebook 1080p HD.epr'
  const sequenceName = 'CL_HATO_C28_CUSTOM_1_9x16'
  const outputFolder = path.dirname(projectPath)

  // Build a temp JSX that calls AME's exportSequence() API with the target sequence.
  // This is the only supported way to target a named sequence without a dialog.
  const jsxContent = `
var exporter = app.getExporter();
if (exporter) {
  var result = exporter.exportSequence(
    ${JSON.stringify(projectPath)},
    ${JSON.stringify(outputFolder)},
    ${JSON.stringify(presetPath)},
    false,
    false,
    0,
    0,
    ${JSON.stringify(sequenceName)}
  );
  $.writeln("exportSequence result: " + result);
} else {
  $.writeln("exportSequence error: could not get exporter");
}
`

  const jsxPath  = path.join(os.tmpdir(), 'ame_export_' + Date.now() + '.jsx')
  fs.writeFileSync(jsxPath, jsxContent)

  const encodeCmd = '"' + amePath + '" --console es.processFile "' + jsxPath + '"'

  console.log('export-video: running AME:', encodeCmd)
  res.json({ success: true })

  exec(encodeCmd, (err, stdout, stderr) => {
    fs.unlink(jsxPath, () => {})
    if (err) console.error('export-video: AME error:', err.message)
    else console.log('export-video: AME done', stdout, stderr)
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'revision-ai-backend' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`revision-ai-backend running on port ${PORT}`)
})
