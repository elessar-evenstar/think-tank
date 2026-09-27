/* Short, local-only recordings. Lab never writes to aquarium control settings. */
(function() {
  "use strict";
  var steps = ["Stay still", "Clench your jaw, then relax", "Turn slightly left, then return", "Turn slightly right, then return",
    "Look slightly up, then return", "Look slightly down, then return"];
  var stage = 0, phase = "intro", active = false, frame = 0, startAt = 0;
  var recording = null, saved = [], latest = [0, 0, 0, 0], latestMotion = 0;
  var duration = 4000;
  var blinkGuidance = "Blink before the countdown ends, then try to avoid blinking if comfortable. Keep your face relaxed except for the requested action. Blink whenever you need to; you can record again.";
  var example = null;
  var liveReference = null;
  function el(id) { return document.getElementById(id); }
  function stop() { cancelAnimationFrame(frame); recording = null; }
  function ready(now) {
    return latest.every(function(time) { return time > 0 && now - time < 500; }) &&
      latestMotion > 0 && now - latestMotion < 500;
  }
  function screen(title, description) {
    el("artifactTitle").textContent = title;
    el("artifactDescription").textContent = description;
    el("artifactStatus").textContent = "";
    el("artifactNote").textContent = "";
    el("artifactGraphs").hidden = true;
    el("artifactLive").hidden = true;
    el("artifactGuide").hidden = true;
    el("artifactTechnical").hidden = true;
    el("artifactTechnical").open = false;
    el("artifactRetry").hidden = true;
    el("artifactNext").hidden = false;
    el("artifactNext").textContent = "Next";
  }
  function introduction() {
    phase = "intro";
    screen("Lab 2: Artifact Explorer", "See how jaw clenching and head movements can change the signals recorded by your Muse. First, record four seconds while sitting still. This is your baseline: a starting point for comparison. Then try a brief, gentle jaw clench and four gentle head movements, recording four seconds for each action. Compare each recording with that same baseline.");
    el("artifactNote").textContent = "Signals appear live while recording, and you can review them afterward. You do not need to watch while turning your head. The aquarium controls stay frozen in Lab. You can return to Explore at any time. Recordings stay in this page's memory and are not uploaded.";
  }
  function guide() {
    phase = "guide";
    screen("How to Read the Graphs", "The still baseline appears on the left, and the recording during an action appears on the right. On narrow screens, the baseline is above the action recording. Compare the matching rows to see what changed.");
    el("artifactGraphs").hidden = false;
    el("artifactMovementFigure").hidden = false;
    el("artifactMovementLabel").textContent = "During movement (example)";
    el("artifactStatus").textContent = "Illustrative example, not recorded Muse data";
    el("artifactNote").textContent = "These made-up waves demonstrate the display, not an expected response. Your recordings may look different.";
    el("artifactGuide").hidden = false;
    el("artifactTechnical").hidden = false;
    // Synthetic examples stay separate from saved Muse recordings and scoring.
    example = [false, true].map(function(moving) {
      var data = { eeg: [[], [], [], []], motion: [], blinks: moving ? [2600] : [] };
      for (var i = 0; i <= duration / 10; i++) {
        var time = i * 10;
        var bump = Math.exp(-Math.pow((time - 2600) / 250, 2));
        data.eeg.forEach(function(samples, channel) {
          var value = 55 * Math.sin(i * 0.6 + channel) + 25 * Math.sin(i * 0.21);
          if (moving) value += 260 * bump * Math.sin(i * 0.12 + channel) - 210 * bump;
          samples.push({ time: time, value: value });
        });
        data.motion.push({ time: time, value: moving ? 100 * bump : 2 });
      }
      return data;
    });
    draw();
  }
  function instructions() {
    stop(); phase = "instructions";
    screen("Recording " + (stage + 1) + " of " + steps.length + ": " + steps[stage],
      stage === 0 ? "Sit comfortably and stay still for four seconds. Keep a relaxed gaze on the centered prompt rather than following the waves. This baseline is a comparison recording, not a guarantee of noise-free EEG." :
      stage === 1 ? "After the countdown, gently clench your jaw once for about one second, then relax for the rest of the four-second recording. Do not clench hard or hold it. Skip this action if it is uncomfortable. You can watch the live signals without moving your head." :
      "After the countdown, make one small, comfortable movement and return to center. You have four seconds. Do not strain to watch from the corner of your eye; review the saved graph afterward.");
    el("artifactNote").textContent = blinkGuidance;
    el("artifactNext").textContent = "Start Recording";
  }
  function fail(message) {
    stop(); phase = "error";
    screen("Recording interrupted", message + " This attempt was not saved. Wait for continuous signals, then try again.");
    el("artifactNext").textContent = "Try Again";
  }
  function start() {
    if (!ready(performance.now())) { fail("All four EEG channels and motion data are needed."); return; }
    phase = "countdown"; startAt = performance.now() + 3000;
    el("artifactNext").hidden = true;
    el("artifactRetry").hidden = true;
    el("artifactGraphs").hidden = true;
    frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!active) return;
    var muse = window.museAquarium;
    if (!muse || !muse.state.connected || muse.state.mode !== "lab") { stop(); active = false; return; }
    if (!ready(now)) { fail("A signal stopped arriving."); return; }
    if (phase === "countdown") {
      el("artifactStatus").textContent = "Get ready: " + Math.max(1, Math.ceil((startAt - now) / 1000));
      if (now >= startAt) {
        // Start from the actual rendered cue, never an overdue countdown time.
        startAt = now;
        recording = { eeg: [[], [], [], []], sequence: [], motion: [], blinks: [] };
        // Freeze the display reference so live waves never recenter as data arrives.
        liveReference = stage ? saved[0] : { eeg: muse.state.eeg.slice(0, 4).map(function(samples) {
          return samples.map(function(value) { return { value: value }; });
        }) };
        el("artifactNote").textContent = "Try not to blink if comfortable. Keep your face relaxed except for the requested action; blink whenever you need to.";
        el("artifactDescription").textContent = stage === 0 ? "Keep a relaxed gaze on the prompt." :
          stage === 1 ? "Clench gently once for about one second, then relax. Stop if uncomfortable." :
          "Make one comfortable movement and return to center. There is no need to watch the screen.";
        el("artifactLive").hidden = false;
        phase = "recording";
      }
    }
    if (phase === "recording") {
      el("artifactStatus").textContent = steps[stage] + " (" + Math.max(0, Math.ceil((duration - now + startAt) / 1000)) + "s)";
      draw();
      if (now - startAt >= duration) {
        // Require the same proportion of expected 256 Hz samples at any duration.
        var minimumSamples = Math.floor(duration / 1000 * 256 * 0.86);
        if (recording.eeg.some(function(samples) { return samples.length < minimumSamples; }) || recording.motion.length < 10) {
          fail("Not enough continuous data was recorded."); return;
        }
        saved[stage] = recording; recording = null;
        review(); return;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function review() {
    phase = "review";
    screen(stage === 0 ? "Baseline recorded" : steps[stage] + ": review",
      stage === 0 ? "This is your starting point for comparing the upcoming actions." :
      "Compare this action with your still baseline. What changes do you notice in the matching rows?");
    el("artifactGraphs").hidden = false;
    el("artifactMovementFigure").hidden = stage === 0;
    el("artifactMovementLabel").textContent = steps[stage];
    el("artifactStatus").textContent = stage === 0 ? "Baseline detections: " + saved[0].blinks.length :
      "Detections during action: " + saved[stage].blinks.length + " | Baseline: " + saved[0].blinks.length;
    el("artifactTechnical").hidden = false;
    el("artifactRetry").hidden = false;
    el("artifactRetry").textContent = "Record Again";
    el("artifactNext").textContent = stage === steps.length - 1 ? "Finish" : "Next";
    draw();
  }
  function plot(id, data, baselineData) {
    var canvas = el(id), ctx = canvas.getContext("2d"), width = Math.max(1, canvas.clientWidth);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(200 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, 200);
    var colors = ["#8dd3ff", "#a5efb3", "#ffe49b", "#ff9fb3", "#ffffff"];
    var labels = ["TP9", "AF7", "AF8", "TP10", "Motion"];
    function x(time) { return 49 + time / duration * (width - 55); }
    for (var row = 0; row < 5; row++) {
      var center = 19 + row * 35;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath(); ctx.moveTo(49, center); ctx.lineTo(width - 6, center); ctx.stroke();
      ctx.fillStyle = colors[row]; ctx.font = "11px sans-serif"; ctx.fillText(labels[row], 2, center + 4);
      var samples = row < 4 ? data.eeg[row] : data.motion;
      var baseline = row < 4 ? baselineData.eeg[row] : [];
      var mean = baseline.length ? baseline.reduce(function(sum, point) { return sum + point.value; }, 0) / baseline.length : 0;
      ctx.strokeStyle = colors[row]; ctx.lineWidth = 1; ctx.beginPath();
      samples.forEach(function(point, i) {
        var displacement = row < 4 ? (point.value - mean) / 600 * 14 : point.value / 150 * 14;
        var y = center - Math.max(-14, Math.min(14, displacement));
        if (!i) ctx.moveTo(x(point.time), y); else ctx.lineTo(x(point.time), y);
      });
      ctx.stroke();
    }
    ctx.strokeStyle = "#ff5353"; ctx.setLineDash([3, 3]);
    data.blinks.forEach(function(time) { ctx.beginPath(); ctx.moveTo(x(time), 3); ctx.lineTo(x(time), 175); ctx.stroke(); });
    ctx.setLineDash([]); ctx.fillStyle = "white";
    ctx.fillText("0s", 49, 192); ctx.fillText(duration / 1000 + "s", width - 19, 192);
  }
  function draw() {
    if (!active) return;
    if (phase === "recording" && recording) {
      plot("artifactLiveCanvas", recording, liveReference);
    } else if (phase === "guide") {
      plot("artifactBaseline", example[0], example[0]);
      plot("artifactMovement", example[1], example[0]);
    } else if (phase === "review") {
      plot("artifactBaseline", saved[0], saved[0]);
      if (stage) plot("artifactMovement", saved[stage], saved[0]);
    }
  }
  document.addEventListener("museeeg", function(event) {
    var packet = event.detail, channel = packet.channel;
    if (channel > 3) return;
    latest[channel] = packet.time;
    if (!recording) return;
    // Counters detect missing packets instead of silently joining signal gaps.
    var previous = recording.sequence[channel];
    if (previous !== undefined && (packet.sequence - previous + 65536) % 65536 !== 1) {
      fail("An EEG packet was lost."); return;
    }
    recording.sequence[channel] = packet.sequence;
    packet.samples.forEach(function(value, i) {
      var time = packet.time - startAt - (packet.samples.length - 1 - i) * 1000 / 256;
      if (time >= 0 && time <= duration) recording.eeg[channel].push({ time: time, value: value });
    });
  });
  document.addEventListener("musemotion", function(event) {
    latestMotion = event.detail.time;
    var time = latestMotion - startAt;
    if (recording && time >= 0 && time <= duration) {
      var values = event.detail.values;
      recording.motion.push({ time: time, value: Math.sqrt(values.reduce(function(sum, value) { return sum + value * value; }, 0)) });
    }
  });
  document.addEventListener("museblink", function(event) {
    var time = event.detail.time - startAt;
    if (recording && time >= 0 && time <= duration) recording.blinks.push(time);
  });
  document.addEventListener("musemodechange", function() { stop(); active = false; });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden && active && (phase === "recording" || phase === "countdown")) fail("The page was hidden.");
  });
  window.addEventListener("resize", draw);
  document.addEventListener("DOMContentLoaded", function() {
    el("labArtifactOption").addEventListener("click", function() {
      stop(); active = true; stage = 0; saved = []; phase = "intro";
      window.bciLab.show("artifactView");
      introduction();
    });
    el("artifactBack").addEventListener("click", function() {
      // Cancel an unfinished recording before navigating; never resume its timer.
      stop();
      if (phase === "intro") {
        active = false;
        window.bciLab.show("labMenu");
      } else if (phase === "guide") introduction();
      else if (phase === "instructions") {
        if (stage === 0) guide();
        else { stage--; review(); }
      } else if (phase === "done") review();
      else instructions();
    });
    el("artifactRetry").addEventListener("click", instructions);
    el("artifactNext").addEventListener("click", function() {
      if (phase === "intro") guide();
      else if (phase === "guide" || phase === "error") instructions();
      else if (phase === "instructions") start();
      else if (phase === "review") {
        if (stage < steps.length - 1) { stage++; instructions(); }
        else {
          phase = "done";
          screen("Artifact Explorer complete", "You compared a still baseline with a jaw-clench recording and four head-movement recordings. Changes can include muscle, eye, and movement artifacts; not every change comes from the requested action alone. A blink detection during an action is not necessarily a false detection.");
          el("artifactStatus").textContent = steps.length + " recordings reviewed";
          el("artifactNext").textContent = "Run Again";
        }
      } else if (phase === "done") { stage = 0; saved = []; instructions(); }
    });
  });
})();
