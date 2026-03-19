var csInterface = new CSInterface()

var API = 'https://revision-ai-backend-a4sx.onrender.com'

var sendBtn      = document.getElementById('sendBtn')
var statusEl     = document.getElementById('status')
var progressWrap = document.getElementById('progressWrap')
var progressBar  = document.getElementById('progressBar')
var progressText = document.getElementById('progressText')

function setStatus(message, type) {
  statusEl.textContent = message
  statusEl.className = 'status' + (type ? ' ' + type : '')
}

function setProgress(pct) {
  if (pct < 0) {
    progressWrap.style.display = 'none'
    return
  }
  progressWrap.style.display = 'block'
  progressBar.style.width = pct + '%'
  progressText.textContent = pct + '%'
}

function base64ToBlob(base64, contentType) {
  var binary = atob(base64)
  var bytes = new Uint8Array(binary.length)
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: contentType || 'video/mp4' })
}

function uploadBlob(presignedUrl, blob, onProgress) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', 'video/mp4')
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error('Upload failed: ' + xhr.status))
    }
    xhr.onerror = function () { reject(new Error('Network error during upload')) }
    xhr.send(blob)
  })
}

var EXPORT_SCRIPT = [
  'var seq = app.project.activeSequence;',
  'if (!seq) { "NO_SEQUENCE"; }',
  'else {',
  '  var outputPath = Folder.temp.absoluteURI + "/revision-ai-export.mp4";',
  '  app.encoder.launchEncoder();',
  '  app.encoder.encodeSequence(',
  '    seq,',
  '    outputPath,',
  '    "C:/Program Files/Adobe/Adobe Media Encoder 2024/MediaIO/systempresets/58444341_4d584658/Match Source - Adaptive High Bitrate.epr",',
  '    RemoveFromQueue.NO,',
  '    true',
  '  );',
  '  outputPath;',
  '}'
].join('\n')

sendBtn.addEventListener('click', function () {
  sendBtn.disabled = true
  setProgress(-1)
  setStatus('Getting project name…')

  // Step 1: get project name
  csInterface.evalScript('app.project.name', function (projectName) {
    if (!projectName || projectName === 'undefined' || projectName === '') {
      setStatus('No active project. Open a project in Premiere first.', 'error')
      sendBtn.disabled = false
      return
    }

    setStatus('Starting export via AME…')

    // Step 2: kick off AME export
    csInterface.evalScript(EXPORT_SCRIPT, function (result) {
      if (!result || result === 'undefined' || result === 'NO_SEQUENCE') {
        setStatus('No active sequence. Open a sequence in Premiere first.', 'error')
        sendBtn.disabled = false
        return
      }

      var outputPath = result.trim()
      setStatus('Exporting sequence…')

      // Step 3: poll for file completion (every 2s, up to 5 min)
      var attempts = 0
      var maxAttempts = 150
      var pollId = setInterval(function () {
        attempts++
        var stat = window.cep.fs.stat(outputPath)
        if (stat.err === 0 && stat.data && stat.data.filesize > 0) {
          clearInterval(pollId)
          readAndUpload(outputPath, projectName)
        } else if (attempts >= maxAttempts) {
          clearInterval(pollId)
          setStatus('Export timed out. Check Adobe Media Encoder.', 'error')
          sendBtn.disabled = false
        }
      }, 2000)
    })
  })
})

function readAndUpload(outputPath, projectName) {
  setStatus('Reading exported file…')

  // Step 4: read file as base64
  var readResult = window.cep.fs.readFile(outputPath, cep.encoding.Base64)
  if (readResult.err !== 0) {
    setStatus('Could not read exported file (err ' + readResult.err + ')', 'error')
    sendBtn.disabled = false
    return
  }

  setStatus('Getting upload URL…')

  // Step 5: get presigned URL
  var urlXhr = new XMLHttpRequest()
  urlXhr.open('GET', API + '/api/upload-url?filename=revision-ai-export.mp4&filetype=video%2Fmp4')
  urlXhr.onload = function () {
    var urlData
    try { urlData = JSON.parse(urlXhr.responseText) } catch (e) {
      setStatus('Could not parse upload URL response', 'error')
      sendBtn.disabled = false
      return
    }
    if (urlXhr.status !== 200) {
      setStatus('Upload URL error: ' + (urlData.error || urlXhr.status), 'error')
      sendBtn.disabled = false
      return
    }

    setStatus('Uploading… 0%')
    setProgress(0)

    // Step 6: upload to R2
    var blob = base64ToBlob(readResult.data, 'video/mp4')
    uploadBlob(urlData.presignedUrl, blob, function (pct) {
      setStatus('Uploading… ' + pct + '%')
      setProgress(pct)
    }).then(function () {
      setProgress(-1)
      setStatus('Saving project…')

      // Step 7: POST /api/projects
      var postXhr = new XMLHttpRequest()
      postXhr.open('POST', API + '/api/projects')
      postXhr.setRequestHeader('Content-Type', 'application/json')
      postXhr.onload = function () {
        try {
          var data = JSON.parse(postXhr.responseText)
          if (postXhr.status >= 200 && postXhr.status < 300) {
            setStatus('Sent to QA: ' + (data.title || projectName), 'success')
          } else {
            setStatus('Error: ' + (data.error || 'Unknown'), 'error')
          }
        } catch (e) {
          setStatus('Error parsing project response', 'error')
        }
        sendBtn.disabled = false
      }
      postXhr.onerror = function () {
        setStatus('Network error saving project', 'error')
        sendBtn.disabled = false
      }
      postXhr.send(JSON.stringify({
        project_name: projectName,
        status: 'pending_qa',
        video_url: urlData.publicUrl
      }))
    }).catch(function (err) {
      setProgress(-1)
      setStatus('Upload failed: ' + err.message, 'error')
      sendBtn.disabled = false
    })
  }
  urlXhr.onerror = function () {
    setStatus('Network error getting upload URL', 'error')
    sendBtn.disabled = false
  }
  urlXhr.send()
}
