var csInterface = new CSInterface()

var API = 'https://revision-ai-backend-a4sx.onrender.com'

var currentProjectId = null

var sendBtn      = document.getElementById('sendBtn')
var applyBtn     = document.getElementById('applyBtn')
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

var INFO_SCRIPT = 'app.project.path + "|" + app.project.activeSequence.name'

sendBtn.addEventListener('click', function () {
  sendBtn.disabled = true
  setProgress(-1)
  setStatus('Getting project info…')

  // Step 1: get project path and sequence name
  csInterface.evalScript(INFO_SCRIPT, function (result) {
    if (!result || result === 'undefined' || result.indexOf('|') === -1) {
      setStatus('No active project/sequence. Open a sequence in Premiere first.', 'error')
      sendBtn.disabled = false
      return
    }

    var parts = result.split('|')
    var projectPath = parts[0]
    var projectName = parts[1]

    setStatus('Launching AME export…')

    // Step 2: launch AME CLI via Node.js child_process
    var exec = require('child_process').exec
    var fs = require('fs')
    var path = require('path')

    var projectDir = path.dirname(projectPath)
    var outputPath = path.join(projectDir, projectName + '.mp4')
    var presetPath = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\MediaIO\\systempresets\\4E49434B_48323634\\Facebook 1080p HD.epr'
    var amePath = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe'
    var writeFileSync = fs.writeFileSync

    var encodeCmd = '"' + amePath + '" -encode "' + projectPath + '" "' + projectName + '" "' + outputPath + '" "' + presetPath + '"'

    writeFileSync('C:\\Users\\adive\\ame-debug.txt', 'encodeCmd: ' + encodeCmd + '\noutputPath: ' + outputPath + '\n')

    setStatus('Launching AME…')

    // Launch AME in background first
    exec('"C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe"')

    // Wait 15 seconds for AME to fully load, then send encode command
    setTimeout(function () {
      setStatus('Exporting… please wait')

      exec(encodeCmd, function (error, stdout, stderr) {
        writeFileSync('C:\\Users\\adive\\ame-result.txt',
          'error: ' + (error ? error.message : 'none') + '\nstdout: ' + stdout + '\nstderr: ' + stderr
        )

        // Wait 30s from when the encode command fires, then upload
        setTimeout(function () {
        setStatus('Reading exported file…')

        fs.readFile(outputPath, function (readErr, data) {
          if (readErr) {
            setStatus('File read error: ' + readErr.message, 'error')
            sendBtn.disabled = false
            return
          }

          setStatus('Creating project record…')

          // Create project first to get the ID
          var postXhr = new XMLHttpRequest()
          postXhr.open('POST', API + '/api/projects')
          postXhr.setRequestHeader('Content-Type', 'application/json')
          postXhr.onload = function () {
            var projectData
            try { projectData = JSON.parse(postXhr.responseText) } catch (e) {
              setStatus('Error parsing project response', 'error')
              sendBtn.disabled = false
              return
            }
            if (postXhr.status < 200 || postXhr.status >= 300) {
              setStatus('Error creating project: ' + (projectData.error || postXhr.status), 'error')
              sendBtn.disabled = false
              return
            }

            var projectId = projectData.id
            currentProjectId = projectId
            applyBtn.disabled = false
            setStatus('Uploading video…')

            var blob = new Blob([data], { type: 'video/mp4' })
            var formData = new FormData()
            formData.append('video', blob, projectName + '.mp4')

            var uploadXhr = new XMLHttpRequest()
            uploadXhr.open('POST', API + '/projects/' + projectId + '/upload')
            uploadXhr.onload = function () {
              if (uploadXhr.status >= 200 && uploadXhr.status < 300) {
                setStatus('Sent to QA: ' + projectName, 'success')
                exec('taskkill /F /IM "Adobe Media Encoder.exe"')
              } else {
                setStatus('Upload error: ' + uploadXhr.status + ' ' + uploadXhr.responseText, 'error')
              }
              sendBtn.disabled = false
            }
            uploadXhr.onerror = function () {
              setStatus('Network error during upload', 'error')
              sendBtn.disabled = false
            }
            uploadXhr.send(formData)
          }
          postXhr.onerror = function () {
            setStatus('Network error creating project', 'error')
            sendBtn.disabled = false
          }
          postXhr.send(JSON.stringify({ project_name: projectName, status: 'pending_qa' }))
        })
        }, 30000)
      })
    }, 15000)
  })
})

function buildExecuteScript(actionJson) {
  var jsonStr = JSON.stringify(actionJson)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
  return [
    '(function() {',
    '  try {',
    '    var action = JSON.parse("' + jsonStr + '");',
    '    var seq = app.project.activeSequence;',
    '    if (!seq) return "ERROR: no active sequence";',
    '    function tcToSec(tc) {',
    '      var p = tc.split(":"); var fps = 30;',
    '      return parseInt(p[0])*3600 + parseInt(p[1])*60 + parseInt(p[2]) + parseInt(p[3])/fps;',
    '    }',
    '    function tidx(name) { return parseInt(name.replace(/[^0-9]/g,"")) - 1; }',
    '    function clipAt(ti, sec) {',
    '      var tr = seq.videoTracks[ti]; if (!tr) return null;',
    '      for (var i=0;i<tr.clips.numItems;i++) {',
    '        var c=tr.clips[i]; if (c.start.seconds<=sec && c.end.seconds>sec) return c;',
    '      } return null;',
    '    }',
    '    var a = action.action;',
    '    if (a === "caption_text_change") {',
    '      var sec=tcToSec(action.timecode); var clip=clipAt(tidx(action.track),sec);',
    '      if (!clip) return "ERROR: no clip at "+action.timecode+" on "+action.track;',
    '      var mgc=clip.getMGTComponent();',
    '      if (!mgc) return "ERROR: no graphics component";',
    '      var param=mgc.properties.getParamForDisplayName("Edit Text");',
    '      if (!param) return "ERROR: no Edit Text param";',
    '      param.setValue(param.getValue().split(action.find).join(action.replace));',
    '      return "OK";',
    '    }',
    '    if (a === "lumetri_color") {',
    '      var sec=tcToSec(action.timecode); var clip=clipAt(tidx(action.track||"V1"),sec);',
    '      if (!clip) return "ERROR: no clip at "+action.timecode;',
    '      var lum=clip.components.getFirstComponentWithMatchName("ADBE Lumetri Color");',
    '      if (!lum) return "ERROR: no Lumetri Color effect";',
    '      var nm={saturation:"Saturation",temperature:"Temperature",color:"Color"};',
    '      var p=lum.properties.getParamForDisplayName(nm[action.property]);',
    '      if (!p) return "ERROR: param not found";',
    '      p.setValue(action.value,true); return "OK";',
    '    }',
    '    if (a === "basic_motion") {',
    '      var sec=tcToSec(action.timecode); var clip=clipAt(tidx(action.track||"V1"),sec);',
    '      if (!clip) return "ERROR: no clip at "+action.timecode;',
    '      var mot=clip.components.getFirstComponentWithMatchName("ADBE Motion");',
    '      if (!mot) return "ERROR: no motion effect";',
    '      var nm={scale:"Scale",position:"Position"};',
    '      var p=mot.properties.getParamForDisplayName(nm[action.property]);',
    '      if (!p) return "ERROR: param not found";',
    '      p.setValue(action.value,true); return "OK";',
    '    }',
    '    if (a === "cut_section") {',
    '      var s=tcToSec(action.timecode_start); var e=tcToSec(action.timecode_end);',
    '      var qeSeq=qe.project.getActiveSequence();',
    '      qeSeq.razor(s*254016000000); qeSeq.razor(e*254016000000);',
    '      for (var t=0;t<seq.videoTracks.numTracks;t++) {',
    '        var tr=seq.videoTracks[t];',
    '        for (var ci=tr.clips.numItems-1;ci>=0;ci--) {',
    '          var cl=tr.clips[ci];',
    '          if (cl.start.seconds>=s && cl.end.seconds<=e) cl.remove(false,true);',
    '        }',
    '      } return "OK";',
    '    }',
    '    if (a === "clip_swap") {',
    '      var sec=tcToSec(action.timecode); var clip=clipAt(tidx(action.track||"V1"),sec);',
    '      if (!clip) return "ERROR: no clip at "+action.timecode;',
    '      var items=app.project.importFiles([action.new_file_path],true,app.project.rootItem,false);',
    '      if (!items||!items.numItems) return "ERROR: import failed";',
    '      clip.replaceWithSequence(items[0],false); return "OK";',
    '    }',
    '    if (a === "add_overlay") {',
    '      var sec=tcToSec(action.timecode); var ti=tidx(action.track||"V2");',
    '      var items=app.project.importFiles([action.file_path],true,app.project.rootItem,false);',
    '      if (!items||!items.numItems) return "ERROR: import failed";',
    '      var t=new Time(); t.seconds=sec;',
    '      seq.videoTracks[ti].insertClip(items[0],t); return "OK";',
    '    }',
    '    return "SKIP: human edit";',
    '  } catch(e) { return "ERROR: "+e.message; }',
    '})()',
  ].join('\n')
}

applyBtn.addEventListener('click', function () {
  if (!currentProjectId) {
    setStatus('No project exported yet. Export first.', 'error')
    return
  }

  applyBtn.disabled = true
  setStatus('Fetching auto edits…')

  var fetchXhr = new XMLHttpRequest()
  fetchXhr.open('GET', API + '/projects/' + currentProjectId + '/auto-edits')
  fetchXhr.onload = function () {
    var editsData
    try { editsData = JSON.parse(fetchXhr.responseText) } catch (e) {
      setStatus('Error parsing edits response', 'error')
      applyBtn.disabled = false
      return
    }

    var edits = editsData.edits || []
    if (edits.length === 0) {
      setStatus('No pending auto edits.', 'success')
      applyBtn.disabled = false
      return
    }

    setStatus('Applying ' + edits.length + ' edit' + (edits.length > 1 ? 's' : '') + '…')
    var idx = 0

    function applyNext() {
      if (idx >= edits.length) {
        setStatus('All edits applied. Exporting…')
        applyBtn.disabled = false
        sendBtn.click()
        return
      }

      var edit = edits[idx]
      setStatus('Edit ' + (idx + 1) + ' of ' + edits.length + '…')

      var script = buildExecuteScript(edit.action_json)
      csInterface.evalScript(script, function (result) {
        var newStatus = (result && result.indexOf('ERROR') === -1) ? 'applied' : 'failed'

        var patchXhr = new XMLHttpRequest()
        patchXhr.open('PATCH', API + '/revisions/' + edit.id + '/status')
        patchXhr.setRequestHeader('Content-Type', 'application/json')
        patchXhr.onload = function () { idx++; applyNext() }
        patchXhr.onerror = function () { idx++; applyNext() }
        patchXhr.send(JSON.stringify({ status: newStatus }))
      })
    }

    applyNext()
  }
  fetchXhr.onerror = function () {
    setStatus('Network error fetching edits', 'error')
    applyBtn.disabled = false
  }
  fetchXhr.send()
})
