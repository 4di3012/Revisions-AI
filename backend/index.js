require('dotenv').config()

const express = require('express')
const cors = require('cors')

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'revision-ai-backend' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`revision-ai-backend running on port ${PORT}`)
})
