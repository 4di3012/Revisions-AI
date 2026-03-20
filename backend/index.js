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

function classificationPrompt(note, timestamp_seconds) {
  return `You are a video editing revision classifier for a professional ad production workflow.

When given a revision note and timestamp, you must:
1. Classify it as "auto" (can be executed programmatically in Adobe Premiere via ExtendScript) or "human" (requires editor judgment)
2. Output a structured JSON action for auto edits

AUTO actions and their JSON shapes:

Caption/text change:
{"action":"caption_text_change","timecode":"00:00:11:00","track":"V5","find":"most","replace":"all"}

Clip swap (strategist will include LucidLink path in the note):
{"action":"clip_swap","timecode":"00:00:23:00","track":"V1","new_file_path":"//lucidlink/path/to/clip.mp4","in_point":0,"out_point":5}

Color code change (hex color provided in note):
{"action":"lumetri_color","timecode":"00:00:15:00","property":"color","value":"#FF2D55"}

Saturation change:
{"action":"lumetri_color","timecode":"00:00:15:00","property":"saturation","value":120}

Temperature change:
{"action":"lumetri_color","timecode":"00:00:15:00","property":"temperature","value":25}

Add overlay:
{"action":"add_overlay","timecode":"00:00:10:00","duration_seconds":3,"file_path":"//lucidlink/overlays/file.png","track":"V2"}

Reposition/resize:
{"action":"basic_motion","timecode":"00:00:08:00","property":"scale","value":110}

Cut section:
{"action":"cut_section","timecode_start":"00:00:20:00","timecode_end":"00:00:23:00"}

HUMAN action (anything requiring creative judgment, font changes, speed ramps, transitions, audio mixing):
{"action":"human","timecode":"00:00:30:00","reason":"brief explanation why editor must handle this"}

EDITING CONTEXT:
- Caption text changes (grammar, spelling, word swaps) = AUTO
- Color code changes with a hex value = AUTO
- Saturation/temperature with a numeric value = AUTO
- Clip swaps where a LucidLink path is provided = AUTO
- Overlay additions where a file path is provided = AUTO
- Reposition/resize with a clear direction = AUTO
- Speed ramps, transitions, creative reframing, font style changes, audio mixing = HUMAN
- Anything vague or requiring judgment = HUMAN

The revision note is: '${note}'
The timestamp is: ${timestamp_seconds} seconds

Respond ONLY with this JSON, no other text:
{
  "category": "auto",
  "action_type": "caption_text_change",
  "action_json": { }
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

// POST /projects/:id/upload — upload MP4 to R2, update video_url
app.post('/projects/:id/upload', upload.single('video'), async (req, res) => {
  const { id } = req.params
  console.log('R2 endpoint:', `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
  if (!req.file) return res.status(400).json({ error: 'video file is required' })

  const key = `${id}/${Date.now()}.mp4`

  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'video/mp4',
    }))
  } catch (uploadError) {
    console.error('R2 upload failed:')
    console.error('  code:     ', uploadError.code)
    console.error('  message:  ', uploadError.message)
    console.error('  $metadata:', uploadError.$metadata)
    console.error('  cause:    ', uploadError.cause)
    await supabase.from('projects').delete().eq('id', id)
    return res.status(500).json({ error: uploadError.message })
  }

  const videoUrl = `${process.env.R2_PUBLIC_URL}/${key}`

  const { data, error } = await supabase
    .from('projects')
    .update({ video_url: videoUrl })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
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

// POST /projects/:id/revisions — classify with Claude, then save
app.post('/projects/:id/revisions', async (req, res) => {
  const { id } = req.params
  const { timestamp_seconds, note } = req.body

  if (timestamp_seconds === undefined || !note) {
    return res.status(400).json({ error: 'timestamp_seconds and note are required' })
  }

  let category = null
  let action_type = null
  let action_json = null
  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: classificationPrompt(note, timestamp_seconds),
      }],
    })
    const raw = msg.content[0].text.trim()
    const parsed = JSON.parse(raw)
    if (parsed.category === 'auto' || parsed.category === 'human') {
      category = parsed.category
      action_type = parsed.action_type || null
      action_json = parsed.action_json || null
    }
  } catch (e) {
    console.error('Claude classification failed:', e.message)
  }

  const { data, error } = await supabase
    .from('revisions')
    .insert({ project_id: id, timestamp_seconds, note, category, action_type, action_json, status: 'pending' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'revision-ai-backend' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`revision-ai-backend running on port ${PORT}`)
})
