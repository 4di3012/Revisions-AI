var csInterface = new CSInterface()

var API = 'https://revision-ai-backend-a4sx.onrender.com'

var sendBtn = document.getElementById('sendBtn')
var statusEl = document.getElementById('status')

function setStatus(message, type) {
  statusEl.textContent = message
  statusEl.className = 'status' + (type ? ' ' + type : '')
}

sendBtn.addEventListener('click', function () {
  sendBtn.disabled = true
  setStatus('Getting active sequence…')

  csInterface.evalScript('app.project.name', function (result) {
    if (!result || result === 'undefined' || result === '') {
      setStatus('No active project found. Open a project in Premiere first.', 'error')
      sendBtn.disabled = false
      return
    }

    var projectName = result
    setStatus('Sending "' + projectName + '" to QA…')

    fetch(API + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: projectName, status: 'pending_qa' }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data } }) })
      .then(function (r) {
        if (!r.ok) {
          setStatus('Error: ' + (r.data.error || 'Unknown error'), 'error')
        } else {
          setStatus('Sent to QA: ' + (r.data.project_name || r.data.title), 'success')
        }
        sendBtn.disabled = false
      })
      .catch(function (err) {
        setStatus('Network error: ' + err.message, 'error')
        sendBtn.disabled = false
      })
  })
})
