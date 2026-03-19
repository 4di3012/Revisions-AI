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

function classificationPrompt(note) {
  return `You are a video revision classifier for a media buying agency. A strategist has left the following revision note on a video ad: '${note}'.

Classify this revision as either 'small' or 'big'.

Small = anything that can be precisely described and executed without creative judgment:
- Color changes (change X to color Y)
- Text/caption edits (fix spelling, change word, add punctuation)
- Frame cuts and trims (remove X seconds at timestamp Y)
- Number or value changes
- Font or size changes
- Remove or add a specific element

Big = anything requiring creative judgment, new assets, or re-recording:
- Replace a clip with different footage
- Re-record voiceover
- Change entire scenes
- Structural changes to the video flow
- Anything requiring new files not already in the project

Respond with ONLY one word: small or big.`
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
      origin === 'http://localhost:5173' ||
      origin.endsWith('.vercel.app') ||
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
  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: classificationPrompt(note),
      }],
    })
    const result = msg.content[0].text.trim().toLowerCase()
    if (result === 'small' || result === 'big') category = result
  } catch (e) {
    console.error('Claude classification failed:', e.message)
  }

  const { data, error } = await supabase
    .from('revisions')
    .insert({ project_id: id, timestamp_seconds, note, category })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'revision-ai-backend' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`revision-ai-backend running on port ${PORT}`)
})
