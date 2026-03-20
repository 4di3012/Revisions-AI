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
    '    if (!seq) { alert("ERROR: no active sequence"); return "ERROR: no active sequence"; }',
    '',
    '    var TOL = 5.0;',
    '    var log = [];',
    '',
    '    function tcToSec(tc) {',
    '      if (!tc) return 0;',
    '      var p = tc.split(":"); var fps = 30;',
    '      return parseInt(p[0])*3600 + parseInt(p[1])*60 + parseInt(p[2]) + parseInt(p[3]||0)/fps;',
    '    }',
    '',
    '    var targetSec = (action.timecode_seconds !== undefined) ? action.timecode_seconds : tcToSec(action.timecode);',
    '    log.push("=== ACTION: " + action.action + " ===");',
    '    log.push("Timecode: " + action.timecode + " => " + targetSec.toFixed(3) + "s  tol=" + TOL + "s");',
    '    log.push("Video tracks: " + seq.videoTracks.numTracks + "  Audio tracks: " + seq.audioTracks.numTracks);',
    '',
    '    // Collect all clips within tolerance of target timecode — only log matched ones',
    '    var matched = [];',
    '    for (var ti=0; ti<seq.videoTracks.numTracks; ti++) {',
    '      var tr = seq.videoTracks[ti];',
    '      for (var ci=0; ci<tr.clips.numItems; ci++) {',
    '        var cl = tr.clips[ci];',
    '        var cs = cl.start.seconds; var ce = cl.end.seconds;',
    '        var hit = (cs <= targetSec + TOL) && (ce >= targetSec - TOL);',
    '        if (hit) {',
    '          log.push("MATCH [V" + (ti+1) + " clip" + ci + "] " + cl.name + "  " + cs.toFixed(2) + "s-" + ce.toFixed(2) + "s");',
    '          $.writeln("MATCH [V" + (ti+1) + " clip" + ci + "] " + cl.name + " " + cs.toFixed(2) + "-" + ce.toFixed(2) + "s");',
    '          matched.push({ clip: cl, ti: ti });',
    '        }',
    '      }',
    '    }',
    '    log.push("Clips matching timecode: " + matched.length);',
    '',
    '    var result = "SKIP: no handler";',
    '    var a = action.action;',
    '',
    '    // ── lumetri_color ────────────────────────────────────────────────',
    '    if (a === "lumetri_color") {',
    '      var lumetriDone = false;',
    '      for (var mi=0; mi<matched.length && !lumetriDone; mi++) {',
    '        var cl = matched[mi].clip;',
    '        log.push("Inspecting clip for lumetri: " + cl.name);',
    '        var efx = cl.components;',
    '        log.push("  Effects/components: " + efx.numItems);',
    '        for (var ei=0; ei<efx.numItems; ei++) {',
    '          var eff = efx[ei];',
    '          log.push("  [" + ei + "] " + eff.displayName + " matchName=" + (eff.matchName||"?"));',
    '          $.writeln("  Effect[" + ei + "] " + eff.displayName + " matchName=" + (eff.matchName||"?"));',
    '          var isLumetri = (eff.displayName.toLowerCase().indexOf("lumetri") !== -1) ||',
    '                          (eff.matchName === "ADBE Lumetri Color");',
    '          if (isLumetri) {',
    '            log.push("  >>> Found Lumetri Color effect");',
    '            for (var lpi=0; lpi<eff.properties.numItems; lpi++) {',
    '              var lp = eff.properties[lpi];',
    '              var lv = ""; try { lv = String(lp.getValue()); } catch(lpe) { lv = "[err]"; }',
    '              log.push("    LumetriProp[" + lpi + "] " + lp.displayName + " = " + lv);',
    '              $.writeln("    LumetriProp[" + lpi + "] " + lp.displayName + " = " + lv);',
    '            }',
    '            // Try to set by displayName matching property name',
    '            var target = null;',
    '            for (var lpi2=0; lpi2<eff.properties.numItems; lpi2++) {',
    '              var lp2 = eff.properties[lpi2];',
    '              if (lp2.displayName.toLowerCase() === action.property.toLowerCase()) {',
    '                target = lp2; break;',
    '              }',
    '            }',
    '            if (!target) {',
    '              // fallback: map common names',
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
    '              log.push("  >>> SET " + target.displayName + " = " + action.value);',
    '              lumetriDone = true;',
    '            } else {',
    '              log.push("  >>> property [" + action.property + "] NOT found in Lumetri");',
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
    '        log.push("Inspecting clip for motion: " + cl.name);',
    '        var efx2 = cl.components;',
    '        for (var ei2=0; ei2<efx2.numItems; ei2++) {',
    '          var eff2 = efx2[ei2];',
    '          log.push("  [" + ei2 + "] " + eff2.displayName + " matchName=" + (eff2.matchName||"?"));',
    '          var isMotion = (eff2.matchName === "ADBE Motion") ||',
    '                         (eff2.displayName.toLowerCase() === "motion");',
    '          if (isMotion) {',
    '            log.push("  >>> Found Motion effect");',
    '            for (var mop=0; mop<eff2.properties.numItems; mop++) {',
    '              var mp2 = eff2.properties[mop];',
    '              var mv2 = ""; try { mv2 = String(mp2.getValue()); } catch(mpe2) { mv2 = "[err]"; }',
    '              log.push("    MotionProp[" + mop + "] " + mp2.displayName + " = " + mv2);',
    '              $.writeln("    MotionProp[" + mop + "] " + mp2.displayName + " = " + mv2);',
    '            }',
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
    '              log.push("  >>> SET " + motTarget.displayName + " = " + action.value);',
    '              motionDone = true;',
    '            } else {',
    '              log.push("  >>> motion property [" + action.property + "] NOT found");',
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
    '        log.push("Clip for swap: " + cl.name);',
    '        var pi3 = cl.projectItem;',
    '        if (pi3) {',
    '          var curPath = ""; try { curPath = pi3.getMediaPath(); } catch(gmp) { curPath = "[err:" + gmp.message + "]"; }',
    '          log.push("  Current media path: " + curPath);',
    '          $.writeln("  clip_swap current path: " + curPath);',
    '          try {',
    '            pi3.changeMediaPath(action.new_file_path, true);',
    '            log.push("  >>> changeMediaPath to: " + action.new_file_path);',
    '            swapDone = true;',
    '          } catch(cmp) {',
    '            log.push("  changeMediaPath error: " + cmp.message);',
    '            // fallback: import + replaceWithSequence',
    '            try {',
    '              var imported = app.project.importFiles([action.new_file_path], true, app.project.rootItem, false);',
    '              if (imported && imported.numItems > 0) {',
    '                cl.replaceWithSequence(imported[0], false);',
    '                log.push("  >>> replaceWithSequence fallback OK");',
    '                swapDone = true;',
    '              } else { log.push("  import returned no items"); }',
    '            } catch(rwse) { log.push("  replaceWithSequence error: " + rwse.message); }',
    '          }',
    '        } else { log.push("  no projectItem on clip"); }',
    '      }',
    '      result = swapDone ? "OK" : "ERROR: clip_swap failed";',
    '    }',
    '',
    '    // ── add_overlay ──────────────────────────────────────────────────',
    '    if (a === "add_overlay") {',
    '      try {',
    '        log.push("add_overlay file: " + action.file_path);',
    '        var imported2 = app.project.importFiles([action.file_path], true, app.project.rootItem, false);',
    '        if (!imported2 || imported2.numItems === 0) {',
    '          result = "ERROR: import failed for " + action.file_path;',
    '        } else {',
    '          log.push("  imported item: " + imported2[0].name);',
    '          // Find first empty track above V1, or use highest track',
    '          var overlayTi = seq.videoTracks.numTracks - 1;',
    '          for (var oti=1; oti<seq.videoTracks.numTracks; oti++) {',
    '            if (seq.videoTracks[oti].clips.numItems === 0) { overlayTi = oti; break; }',
    '          }',
    '          log.push("  inserting on track V" + (overlayTi+1) + " at " + targetSec + "s");',
    '          var insertTime = new Time();',
    '          insertTime.seconds = targetSec;',
    '          seq.videoTracks[overlayTi].insertClip(imported2[0], insertTime);',
    '          log.push("  >>> overlay inserted");',
    '          result = "OK";',
    '        }',
    '      } catch(aoe) { result = "ERROR: add_overlay: " + aoe.message; log.push(result); }',
    '    }',
    '',
    '    // ── cut_section ──────────────────────────────────────────────────',
    '    if (a === "cut_section") {',
    '      try {',
    '        var cutStart = tcToSec(action.timecode_start);',
    '        var cutEnd   = tcToSec(action.timecode_end);',
    '        log.push("cut_section: " + cutStart.toFixed(2) + "s to " + cutEnd.toFixed(2) + "s");',
    '        // razor via qe API',
    '        var qeSeq = qe.project.getActiveSequence();',
    '        var TICKS = 254016000000;',
    '        qeSeq.razor(cutStart * TICKS);',
    '        qeSeq.razor(cutEnd * TICKS);',
    '        log.push("  razored at start and end");',
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
    '        log.push("  removed " + removed + " clips");',
    '        result = removed > 0 ? "OK" : "ERROR: no clips removed in range";',
    '      } catch(cse) { result = "ERROR: cut_section: " + cse.message; log.push(result); }',
    '    }',
    '',
    '    log.push("RESULT: " + result);',
    '    alert(log.join("\\n"));',
    '    $.writeln("RESULT: " + result);',
    '    return result;',
    '  } catch(e) {',
    '    var msg = "EXCEPTION: " + e.message + (e.line ? " line " + e.line : "");',
    '    alert(msg);',
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

    pollActive = true
    setStatus('Applying edits…')

    var idx = 0
    var appliedIds = []

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
        pendingRevisionIds = appliedIds.slice()

        // Get current project info then run the export directly
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
        var xhr = new XMLHttpRequest()
        xhr.open('PATCH', API + '/revisions/' + id + '/status')
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.onload = function () { idx++; executeNext() }
        xhr.onerror = function () { idx++; executeNext() }
        xhr.send(JSON.stringify({ status: 'failed' }))
      }

      if (edit.action_json && edit.action_json.action === 'caption_text_change') {
        var aj = edit.action_json
        // timecode_seconds may not be in action_json — fall back to revision timestamp
        var tcSec = (aj.timecode_seconds !== undefined) ? aj.timecode_seconds : edit.timestamp_seconds
        var script = 'var result = "none"; try { var seq = app.project.activeSequence; var targetSec = ' + tcSec + '; var findText = ' + JSON.stringify(aj.find) + '; var replaceText = ' + JSON.stringify(aj.replace) + '; for (var t = 0; t < seq.videoTracks.numTracks; t++) { var track = seq.videoTracks[t]; for (var c = 0; c < track.clips.numItems; c++) { var clip = track.clips[c]; if (clip.start.seconds <= targetSec + 5 && clip.end.seconds >= targetSec - 5) { for (var i = 0; i < clip.components.numItems; i++) { var comp = clip.components[i]; for (var p = 0; p < comp.properties.numItems; p++) { var prop = comp.properties[p]; if (prop.displayName === "Source Text") { try { var td = prop.getValue(); var txt = td.text; alert("BEFORE: [" + td.text + "]"); if (txt.toLowerCase().indexOf(findText.toLowerCase()) !== -1) { td.text = txt.replace(new RegExp(findText, "gi"), replaceText); prop.setValue(td); alert("AFTER: [" + td.text + "]"); result = "success"; } } catch(e) {} } } } } } } } catch(err) { result = "error: " + err.toString(); } result;'
        csInterface.evalScript(script, function (result) {
          if (result === 'success') {
            markRevisionApplied(edit.id)
          } else {
            markRevisionFailed(edit.id)
          }
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
