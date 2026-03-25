var csInterface = new CSInterface()

var API = 'https://revision-ai-backend-a4sx.onrender.com'

var currentProjectId = localStorage.getItem('revisionai_project_id') || null
var currentProjectName = localStorage.getItem('revisionai_project_name') || null
var pendingRevisionIds = [] // revision IDs applied before current export

var sendBtn        = document.getElementById('sendBtn')
var statusEl       = document.getElementById('status')
var progressWrap   = document.getElementById('progressWrap')
var progressBar    = document.getElementById('progressBar')
var progressText   = document.getElementById('progressText')
var projectNameEl  = document.getElementById('projectName')
var revisionsList  = document.getElementById('revisionsList')

function setStatus(message, type) {
  statusEl.textContent = message
  statusEl.className = 'status' + (type ? ' ' + type : '')
}

function setProjectContext(id, name) {
  currentProjectId = id
  currentProjectName = name
  localStorage.setItem('revisionai_project_id', id)
  localStorage.setItem('revisionai_project_name', name)
  if (projectNameEl) projectNameEl.textContent = name || ''
}

function clearProjectContext() {
  currentProjectId = null
  currentProjectName = null
  localStorage.removeItem('revisionai_project_id')
  localStorage.removeItem('revisionai_project_name')
  if (projectNameEl) projectNameEl.textContent = ''
  renderRevisions([])
}

function formatTc(seconds) {
  var m = Math.floor(seconds / 60)
  var s = Math.floor(seconds % 60)
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
}

function renderRevisions(revisions) {
  if (!revisionsList) return
  if (!revisions || revisions.length === 0) {
    revisionsList.innerHTML = '<div class="revisions-empty">No manual revisions yet.</div>'
    return
  }
  revisionsList.innerHTML = revisions.map(function (r) {
    return '<div class="revision-item">' +
      '<span class="revision-tc">' + formatTc(r.timestamp_seconds) + '</span>' +
      '<span class="revision-note">' + r.note + '</span>' +
      '</div>'
  }).join('')
}

function loadHumanRevisions() {
  if (!currentProjectId) return
  var xhr = new XMLHttpRequest()
  xhr.open('GET', API + '/projects/' + currentProjectId + '/revisions?category=human')
  xhr.onload = function () {
    try {
      var data = JSON.parse(xhr.responseText)
      renderRevisions(data.revisions || [])
    } catch (e) { /* silent */ }
  }
  xhr.onerror = function () { /* silent */ }
  xhr.send()
}

// On load: validate stored project ID still exists in the backend
if (currentProjectId) {
  var validateXhr = new XMLHttpRequest()
  validateXhr.open('GET', API + '/projects/' + currentProjectId)
  validateXhr.onload = function () {
    if (validateXhr.status === 404) {
      clearProjectContext()
    } else if (validateXhr.status >= 200 && validateXhr.status < 300) {
      if (projectNameEl && currentProjectName) projectNameEl.textContent = currentProjectName
      loadHumanRevisions()
    }
  }
  validateXhr.onerror = function () { /* network error — leave context as-is */ }
  validateXhr.send()
} else {
  if (projectNameEl && currentProjectName) projectNameEl.textContent = currentProjectName
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

// Bring Premiere Pro window back into focus
function focusPremiere(exec) {
  exec('powershell -command "(New-Object -ComObject Shell.Application).Windows() | Where-Object {$_.Name -like \'*Premiere*\'} | ForEach-Object { $_.Visible = $true }"')
  exec('powershell -command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate(\'Adobe Premiere Pro\')"')
}

var INFO_SCRIPT = 'app.project.path + "|" + app.project.activeSequence.name'

// Core export + upload flow — called by both Send to QA and auto-edits poll completion
function runExportAndUpload(projectPath, projectName) {
  sendBtn.disabled = true
  setProgress(-1)

  var exec = require('child_process').exec
  var fs = require('fs')
  var path = require('path')

  var projectDir = path.dirname(projectPath)
  var outputPath = path.join(projectDir, projectName + '.mp4')
  var presetPath = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\MediaIO\\systempresets\\4E49434B_48323634\\Facebook 1080p HD.epr'
  var amePath = 'C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe'

  var encodeCmd = '"' + amePath + '" -encode "' + projectPath + '" "' + projectName + '" "' + outputPath + '" "' + presetPath + '"'

  fs.writeFileSync('C:\\Users\\adive\\ame-debug.txt', 'encodeCmd: ' + encodeCmd + '\noutputPath: ' + outputPath + '\n')

  setStatus('Launching AME…')
  exec('"' + amePath + '"')

  // Wait 15s for AME to fully load, then send encode command
  setTimeout(function () {
    setStatus('Exporting… do not close Premiere')

    exec(encodeCmd, function (error, stdout, stderr) {
      fs.writeFileSync('C:\\Users\\adive\\ame-result.txt',
        'error: ' + (error ? error.message : 'none') + '\nstdout: ' + stdout + '\nstderr: ' + stderr
      )

      // Switch back to Premiere immediately after encode command fires
      focusPremiere(exec)

      // Wait 30s for AME to finish encoding, then read and upload
      setTimeout(function () {
        setStatus('Reading exported file…')

        fs.readFile(outputPath, function (readErr, data) {
          if (readErr) {
            setStatus('File read error: ' + readErr.message, 'error')
            sendBtn.disabled = false
            return
          }

          function createProjectThenUpload() {
            setStatus('Creating project record…')
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
              setProjectContext(projectData.id, projectName)
              doUpload(projectData.id, [])
            }
            postXhr.onerror = function () {
              setStatus('Network error creating project', 'error')
              sendBtn.disabled = false
            }
            postXhr.send(JSON.stringify({ project_name: projectName, status: 'pending_qa' }))
          }

          function doUpload(projectId, revisionIds) {
            setStatus('Uploading video…')
            var blob = new Blob([data], { type: 'video/mp4' })
            var formData = new FormData()
            formData.append('video', blob, projectName + '.mp4')
            if (revisionIds && revisionIds.length > 0) {
              formData.append('revision_ids', JSON.stringify(revisionIds))
            }

            var uploadXhr = new XMLHttpRequest()
            uploadXhr.open('POST', API + '/projects/' + projectId + '/upload')
            uploadXhr.onload = function () {
              if (uploadXhr.status >= 200 && uploadXhr.status < 300) {
                setStatus('Upload complete — check dashboard', 'success')
                exec('taskkill /F /IM "Adobe Media Encoder.exe"')
                // Refocus Premiere after AME closes
                setTimeout(function () { focusPremiere(exec) }, 1500)
                pendingRevisionIds = []
                loadHumanRevisions()
              } else if (uploadXhr.status === 404) {
                // Project no longer exists — clear stale localStorage and retry as new project
                setStatus('Stale project ID — creating new project…')
                clearProjectContext()
                createProjectThenUpload()
                return
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

          // If we already have a project (re-export after auto edits), upload to it directly
          if (currentProjectId) {
            doUpload(currentProjectId, pendingRevisionIds)
            return
          }

          // First-time upload: create a new project record first
          createProjectThenUpload()
        })
      }, 30000)
    })
  }, 15000)
}

sendBtn.addEventListener('click', function () {
  sendBtn.disabled = true
  setProgress(-1)
  setStatus('Getting project info…')

  csInterface.evalScript(INFO_SCRIPT, function (result) {
    if (!result || result === 'undefined' || result.indexOf('|') === -1) {
      setStatus('No active project/sequence. Open a sequence in Premiere first.', 'error')
      sendBtn.disabled = false
      return
    }
    var parts = result.split('|')
    runExportAndUpload(parts[0], parts[1])
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
    '',
    '    var TOL = 5.0;',
    '',
    '    function tcToSec(tc) {',
    '      if (!tc) return 0;',
    '      var p = tc.split(":"); var fps = 30;',
    '      return parseInt(p[0])*3600 + parseInt(p[1])*60 + parseInt(p[2]) + parseInt(p[3]||0)/fps;',
    '    }',
    '',
    '    var targetSec = (action.timecode_seconds !== undefined) ? action.timecode_seconds : tcToSec(action.timecode);',
    '',
    '    // Collect all clips within tolerance of target timecode',
    '    var matched = [];',
    '    for (var ti=0; ti<seq.videoTracks.numTracks; ti++) {',
    '      var tr = seq.videoTracks[ti];',
    '      for (var ci=0; ci<tr.clips.numItems; ci++) {',
    '        var cl = tr.clips[ci];',
    '        var cs = cl.start.seconds; var ce = cl.end.seconds;',
    '        if ((cs <= targetSec + TOL) && (ce >= targetSec - TOL)) {',
    '          matched.push({ clip: cl, ti: ti });',
    '        }',
    '      }',
    '    }',
    '',
    '    var result = "SKIP: no handler";',
    '    var a = action.action;',
    '',
    '    // ── lumetri_color ────────────────────────────────────────────────',
    '    if (a === "lumetri_color") {',
    '      var lumetriDone = false;',
    '      for (var mi=0; mi<matched.length && !lumetriDone; mi++) {',
    '        var cl = matched[mi].clip;',
    '        var efx = cl.components;',
    '        for (var ei=0; ei<efx.numItems; ei++) {',
    '          var eff = efx[ei];',
    '          var isLumetri = (eff.displayName.toLowerCase().indexOf("lumetri") !== -1) ||',
    '                          (eff.matchName === "ADBE Lumetri Color");',
    '          if (isLumetri) {',
    '            var target = null;',
    '            for (var lpi2=0; lpi2<eff.properties.numItems; lpi2++) {',
    '              var lp2 = eff.properties[lpi2];',
    '              if (lp2.displayName.toLowerCase() === action.property.toLowerCase()) {',
    '                target = lp2; break;',
    '              }',
    '            }',
    '            if (!target) {',
    '              var nm = { saturation: "Saturation", temperature: "Temperature", tint: "Tint",',
    '                         exposure: "Exposure", contrast: "Contrast", highlights: "Highlights",',
    '                         shadows: "Shadows", whites: "Whites", blacks: "Blacks" };',
    '              var mapped = nm[action.property.toLowerCase()];',
    '              if (mapped) {',
    '                for (var lpi3=0; lpi3<eff.properties.numItems; lpi3++) {',
    '                  if (eff.properties[lpi3].displayName === mapped) { target = eff.properties[lpi3]; break; }',
    '                }',
    '              }',
    '            }',
    '            if (target) {',
    '              target.setValue(action.value, true);',
    '              lumetriDone = true;',
    '            }',
    '          }',
    '        }',
    '      }',
    '      result = lumetriDone ? "OK" : "ERROR: lumetri property [" + action.property + "] not found";',
    '    }',
    '',
    '    // ── basic_motion ─────────────────────────────────────────────────',
    '    if (a === "basic_motion") {',
    '      var motionDone = false;',
    '      for (var mi=0; mi<matched.length && !motionDone; mi++) {',
    '        var cl = matched[mi].clip;',
    '        var efx2 = cl.components;',
    '        for (var ei2=0; ei2<efx2.numItems; ei2++) {',
    '          var eff2 = efx2[ei2];',
    '          var isMotion = (eff2.matchName === "ADBE Motion") ||',
    '                         (eff2.displayName.toLowerCase() === "motion");',
    '          if (isMotion) {',
    '            var motTarget = null;',
    '            for (var mop2=0; mop2<eff2.properties.numItems; mop2++) {',
    '              var mp3 = eff2.properties[mop2];',
    '              if (mp3.displayName.toLowerCase() === action.property.toLowerCase()) {',
    '                motTarget = mp3; break;',
    '              }',
    '            }',
    '            if (!motTarget) {',
    '              var motNm = { scale: "Scale", position: "Position", rotation: "Rotation",',
    '                            "anchor point": "Anchor Point", opacity: "Opacity" };',
    '              var motMapped = motNm[action.property.toLowerCase()];',
    '              if (motMapped) {',
    '                for (var mop3=0; mop3<eff2.properties.numItems; mop3++) {',
    '                  if (eff2.properties[mop3].displayName === motMapped) { motTarget = eff2.properties[mop3]; break; }',
    '                }',
    '              }',
    '            }',
    '            if (motTarget) {',
    '              motTarget.setValue(action.value, true);',
    '              motionDone = true;',
    '            }',
    '          }',
    '        }',
    '      }',
    '      result = motionDone ? "OK" : "ERROR: motion property [" + action.property + "] not found";',
    '    }',
    '',
    '    // ── clip_swap ────────────────────────────────────────────────────',
    '    if (a === "clip_swap") {',
    '      var swapDone = false;',
    '      for (var mi=0; mi<matched.length && !swapDone; mi++) {',
    '        var cl = matched[mi].clip;',
    '        var pi3 = cl.projectItem;',
    '        if (pi3) {',
    '          try {',
    '            pi3.changeMediaPath(action.new_file_path, true);',
    '            swapDone = true;',
    '          } catch(cmp) {',
    '            try {',
    '              var imported = app.project.importFiles([action.new_file_path], true, app.project.rootItem, false);',
    '              if (imported && imported.numItems > 0) {',
    '                cl.replaceWithSequence(imported[0], false);',
    '                swapDone = true;',
    '              }',
    '            } catch(rwse) {}',
    '          }',
    '        }',
    '      }',
    '      result = swapDone ? "OK" : "ERROR: clip_swap failed";',
    '    }',
    '',
    '    // ── add_overlay ──────────────────────────────────────────────────',
    '    if (a === "add_overlay") {',
    '      try {',
    '        var imported2 = app.project.importFiles([action.file_path], true, app.project.rootItem, false);',
    '        if (!imported2 || imported2.numItems === 0) {',
    '          result = "ERROR: import failed for " + action.file_path;',
    '        } else {',
    '          var overlayTi = seq.videoTracks.numTracks - 1;',
    '          for (var oti=1; oti<seq.videoTracks.numTracks; oti++) {',
    '            if (seq.videoTracks[oti].clips.numItems === 0) { overlayTi = oti; break; }',
    '          }',
    '          var insertTime = new Time();',
    '          insertTime.seconds = targetSec;',
    '          seq.videoTracks[overlayTi].insertClip(imported2[0], insertTime);',
    '          result = "OK";',
    '        }',
    '      } catch(aoe) { result = "ERROR: add_overlay: " + aoe.message; }',
    '    }',
    '',
    '    // ── cut_section ──────────────────────────────────────────────────',
    '    if (a === "cut_section") {',
    '      try {',
    '        var cutStart = tcToSec(action.timecode_start);',
    '        var cutEnd   = tcToSec(action.timecode_end);',
    '        var qeSeq = qe.project.getActiveSequence();',
    '        var TICKS = 254016000000;',
    '        qeSeq.razor(cutStart * TICKS);',
    '        qeSeq.razor(cutEnd * TICKS);',
    '        var removed = 0;',
    '        for (var t2=0; t2<seq.videoTracks.numTracks; t2++) {',
    '          var tr2 = seq.videoTracks[t2];',
    '          for (var ci2=tr2.clips.numItems-1; ci2>=0; ci2--) {',
    '            var cl2 = tr2.clips[ci2];',
    '            if (cl2.start.seconds >= cutStart - 0.1 && cl2.end.seconds <= cutEnd + 0.1) {',
    '              cl2.remove(false, true);',
    '              removed++;',
    '            }',
    '          }',
    '        }',
    '        result = removed > 0 ? "OK" : "ERROR: no clips removed in range";',
    '      } catch(cse) { result = "ERROR: cut_section: " + cse.message; }',
    '    }',
    '',
    '    return result;',
    '  } catch(e) {',
    '    return "ERROR: " + e.message;',
    '  }',
    '})()',
  ].join('\n')
}

// Poll backend every 5s for queued edits triggered from the dashboard
var pollActive = false

function pollPendingEdits() {
  if (pollActive) return

  var xhr = new XMLHttpRequest()
  xhr.open('GET', API + '/projects/pending-edits')
  xhr.onload = function () {
    var data
    try { data = JSON.parse(xhr.responseText) } catch (e) { return }

    var edits = data.edits || []
    if (edits.length === 0) return

    // Normalize action_json — Supabase may return it as a string in some cases
    for (var n = 0; n < edits.length; n++) {
      if (typeof edits[n].action_json === 'string') {
        try { edits[n].action_json = JSON.parse(edits[n].action_json) } catch (e) {}
      }
    }

    pollActive = true
    setStatus('Applying edits…')

    var idx = 0
    var appliedIds = []
    var anyFailed = false

    function markApplying(i) {
      if (i >= edits.length) { executeNext(); return }
      var xhr2 = new XMLHttpRequest()
      xhr2.open('PATCH', API + '/revisions/' + edits[i].id + '/status')
      xhr2.setRequestHeader('Content-Type', 'application/json')
      xhr2.onload = function () { markApplying(i + 1) }
      xhr2.onerror = function () { markApplying(i + 1) }
      xhr2.send(JSON.stringify({ status: 'applying' }))
    }

    function executeNext() {
      if (idx >= edits.length) {
        pollActive = false
        loadHumanRevisions()

        if (anyFailed) {
          setStatus('One or more edits failed — export blocked. Fix and retry.', 'error')
          sendBtn.disabled = false
          return
        }

        pendingRevisionIds = appliedIds.slice()
        setStatus('Edits applied — starting export…')
        csInterface.evalScript(INFO_SCRIPT, function (result) {
          if (!result || result === 'undefined' || result.indexOf('|') === -1) {
            setStatus('Edits applied but no active sequence found for export', 'error')
            return
          }
          var parts = result.split('|')
          runExportAndUpload(parts[0], parts[1])
        })
        return
      }

      var edit = edits[idx]
      setStatus('Applying edit ' + (idx + 1) + ' of ' + edits.length + '…')

      function markRevisionApplied(id) {
        appliedIds.push(id)
        var xhr = new XMLHttpRequest()
        xhr.open('PATCH', API + '/revisions/' + id + '/status')
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.onload = function () { idx++; executeNext() }
        xhr.onerror = function () { idx++; executeNext() }
        xhr.send(JSON.stringify({ status: 'applied' }))
      }

      function markRevisionFailed(id) {
        anyFailed = true
        var xhr = new XMLHttpRequest()
        xhr.open('PATCH', API + '/revisions/' + id + '/status')
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.onload = function () { idx++; executeNext() }
        xhr.onerror = function () { idx++; executeNext() }
        xhr.send(JSON.stringify({ status: 'failed' }))
      }

      if (edit.action_json && edit.action_json.action === 'caption_text_change') {
        var aj = edit.action_json
        var editId = edit.id
        setStatus('Patching caption in prproj…')

        csInterface.evalScript(INFO_SCRIPT, function (infoResult) {
          var infoParts = infoResult ? infoResult.split('|') : []
          var projectPath = infoParts[0] || ''
          var sequenceName = infoParts[1] || ''
          if (!projectPath || projectPath === 'undefined') {
            markRevisionFailed(editId)
            return
          }

          var patchXhr = new XMLHttpRequest()
          patchXhr.open('POST', 'http://localhost:3001/apply-caption-edit')
          patchXhr.setRequestHeader('Content-Type', 'application/json')
          patchXhr.onload = function () {
            var result
            try { result = JSON.parse(patchXhr.responseText) } catch (e) { result = {} }
            if (patchXhr.status >= 200 && patchXhr.status < 300 && result.success) {
              // Inline the status PATCH so we can reload the project only AFTER Supabase confirms.
              // Calling markRevisionApplied() then setTimeout(reload, 500) races: Render round-trip
              // is often >500ms, so the reload was killing the panel context before onload fired.
              appliedIds.push(editId)
              var statusXhr = new XMLHttpRequest()
              statusXhr.open('PATCH', API + '/revisions/' + editId + '/status')
              statusXhr.setRequestHeader('Content-Type', 'application/json')
              statusXhr.onload = function () {
                idx++
                if (idx >= edits.length && !anyFailed) {
                  pendingRevisionIds = appliedIds.slice()
                  setStatus('Edits applied — starting export…')
                  var exportXhr = new XMLHttpRequest()
                  exportXhr.open('POST', 'http://localhost:3001/export-video')
                  exportXhr.setRequestHeader('Content-Type', 'application/json')
                  exportXhr.onload = function () {
                    var exportResult
                    try { exportResult = JSON.parse(exportXhr.responseText) } catch (e) { exportResult = {} }
                    if (exportXhr.status >= 200 && exportXhr.status < 300 && exportResult.success) {
                      setStatus('Export started — rendering in background…', 'success')
                    } else {
                      var msg = 'export-video failed\nstatus: ' + exportXhr.status + '\nresponse: ' + exportXhr.responseText
                      console.error(msg)
                      alert(msg)
                    }
                  }
                  exportXhr.onerror = function () {
                    console.error('export-video XHR error — backend unreachable')
                    setStatus('Export trigger failed — check backend', 'error')
                  }
                  exportXhr.send(JSON.stringify({ projectPath: projectPath }))
                } else {
                  executeNext()
                }
              }
              statusXhr.onerror = function () { idx++; executeNext() }
              statusXhr.send(JSON.stringify({ status: 'applied' }))
            } else {
              var msg = 'apply-caption-edit failed\nstatus: ' + patchXhr.status + '\nresponse: ' + patchXhr.responseText
              console.error(msg)
              alert(msg)
              markRevisionFailed(editId)
            }
          }
          patchXhr.onerror = function () {
            var msg = 'apply-caption-edit XHR error — backend unreachable\nstatus: ' + patchXhr.status + '\nresponse: ' + patchXhr.responseText
            console.error(msg)
            alert(msg)
            markRevisionFailed(editId)
          }
          patchXhr.ontimeout = function () {
            var msg = 'apply-caption-edit XHR timeout (10s)\nstatus: ' + patchXhr.status + '\nresponse: ' + patchXhr.responseText
            console.error(msg)
            alert(msg)
            markRevisionFailed(editId)
          }
          patchXhr.timeout = 10000
          patchXhr.send(JSON.stringify({ projectPath: projectPath, find: aj.find, replace: aj.replace }))
        })
        return
      }

      // All other action types
      var script = buildExecuteScript(edit.action_json)
      csInterface.evalScript(script, function (result) {
        var newStatus = (result && result.indexOf('ERROR') === -1) ? 'applied' : 'failed'
        if (newStatus === 'applied') appliedIds.push(edit.id)
        var patchXhr = new XMLHttpRequest()
        patchXhr.open('PATCH', API + '/revisions/' + edit.id + '/status')
        patchXhr.setRequestHeader('Content-Type', 'application/json')
        patchXhr.onload = function () { idx++; executeNext() }
        patchXhr.onerror = function () { idx++; executeNext() }
        patchXhr.send(JSON.stringify({ status: newStatus }))
      })
    }

    markApplying(0)
  }
  xhr.onerror = function () { /* silent */ }
  xhr.send()
}

setInterval(pollPendingEdits, 5000)
