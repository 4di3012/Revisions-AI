const { app } = require('ppro')

const API = 'https://revision-ai-backend-a4sx.onrender.com'

const sendBtn = document.getElementById('sendBtn')
const statusEl = document.getElementById('status')

function setStatus(message, type = '') {
  statusEl.textContent = message
  statusEl.className = 'status' + (type ? ' ' + type : '')
}

sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true
  setStatus('Getting active sequence…')

  let sequenceName
  try {
    const sequence = app.project.activeSequence
    if (!sequence) {
      setStatus('No active sequence found. Open a sequence in Premiere first.', 'error')
      sendBtn.disabled = false
      return
    }
    sequenceName = sequence.name
  } catch (err) {
    setStatus('Could not read sequence: ' + err.message, 'error')
    sendBtn.disabled = false
    return
  }

  setStatus('Sending "' + sequenceName + '" to QA…')

  try {
    const res = await fetch(API + '/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: sequenceName }),
    })

    const data = await res.json()

    if (!res.ok) {
      setStatus('Error: ' + (data.error || res.statusText), 'error')
    } else {
      setStatus('Sent to QA: ' + data.title, 'success')
    }
  } catch (err) {
    setStatus('Network error: ' + err.message, 'error')
  }

  sendBtn.disabled = false
})
