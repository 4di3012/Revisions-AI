require('dotenv').config({ path: require('path').join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const supabase = require('./lib/supabase')

const upload = multer({ storage: multer.memoryStorage() })

const app = express()

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}))

app.use(express.json())

// POST /projects — create a new project
app.post('/projects', async (req, res) => {
  const { title } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const { data, error } = await supabase
    .from('projects')
    .insert({ title })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// POST /projects/:id/upload — upload MP4 to Supabase Storage, update video_url
app.post('/projects/:id/upload', upload.single('video'), async (req, res) => {
  const { id } = req.params
  if (!req.file) return res.status(400).json({ error: 'video file is required' })

  const filePath = `${id}/${Date.now()}.mp4`

  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(filePath, req.file.buffer, {
      contentType: 'video/mp4',
      upsert: false,
    })

  if (uploadError) return res.status(500).json({ error: uploadError.message })

  const videoUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/videos/${filePath}`

  const { data, error } = await supabase
    .from('projects')
    .update({ video_url: videoUrl })
    .eq('id', id)
    .select()
    .single()

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

// POST /projects/:id/revisions — add a timestamped revision note
app.post('/projects/:id/revisions', async (req, res) => {
  const { id } = req.params
  const { timestamp_seconds, note } = req.body

  if (timestamp_seconds === undefined || !note) {
    return res.status(400).json({ error: 'timestamp_seconds and note are required' })
  }

  const { data, error } = await supabase
    .from('revisions')
    .insert({ project_id: id, timestamp_seconds, note })
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
