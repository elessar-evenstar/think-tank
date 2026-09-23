/* Prompted blink trials use a monotonic clock and the existing Muse detector. */
(function() {
  "use strict";
  var session = null;
  var frame = 0;
  var intervalMs = 2600;
  var responseMs = 1600;
  // Fixed +/-600 microvolt display range around the window mean, shared by both
  // channels. Large blinks no longer change the size of ordinary EEG fluctuations.
  var graphAmplitude = 600;

  function element(id) { return document.getElementById(id); }
  function show(view) {
    ["labMenu", "labIntro", "labRunning", "labResults"].forEach(function(id) {
      element(id).hidden = id !== view;
    });
  }
  function counts() {
    var detected = session.trials.filter(function(trial) { return trial.detected; }).length;
    var missed = session.trials.filter(function(trial) { return trial.closed && !trial.detected; }).length;
    return { detected: detected, missed: missed, unexpected: session.unexpected };
  }
  function renderCounts() {
    var result = counts();
    element("labDetected").textContent = result.detected;
    element("labMissed").textContent = result.missed;
    element("labUnexpected").textContent = result.unexpected;
  }
  function finish(message) {
    if (!session || !session.running) return;
    session.running = false;
    cancelAnimationFrame(frame);
    element("blinkCue").classList.remove("pulse", "detected");
    var result = counts();
    element("labResultStatus").textContent = message;
    element("labResultCounts").textContent = "Detected: " + result.detected +
      ". Not detected: " + result.missed + ". Unexpected: " + result.unexpected +
      ". Completed trials: " + session.trials.filter(function(t) { return t.closed; }).length + " of 10.";
    show("labResults");
  }
  function start() {
    var muse = window.museAquarium;
    if (!muse || !muse.state.connected || muse.state.mode !== "lab") return;
    cancelAnimationFrame(frame);
    session = { running: true, trials: [], unexpected: 0, detectedUntil: 0, nextAt: performance.now() + 2000 };
    show("labRunning");
    element("labProgress").textContent = "Get ready";
    element("blinkCue").classList.remove("pulse", "detected");
    renderCounts();
    frame = requestAnimationFrame(tick);
  }
  function drawEEG() {
    var canvas = element("labEEG");
    var ctx = canvas.getContext("2d");
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(1, canvas.clientWidth);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(124 * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(124 * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, 124);
    [0, 3].forEach(function(channel, row) {
      var samples = window.museAquarium.state.eeg[channel].slice(-512);
      var center = 31 + row * 62;
      var mean = samples.length ? samples.reduce(function(sum, x) { return sum + x; }, 0) / samples.length : 0;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath(); ctx.moveTo(40, center); ctx.lineTo(width - 4, center); ctx.stroke();
      ctx.fillStyle = row ? "#ff9fb3" : "#8dd3ff";
      ctx.font = "12px sans-serif";
      ctx.fillText(row ? "TP10" : "TP9", 2, center + 4);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.beginPath();
      samples.forEach(function(value, i) {
        var x = 40 + (512 - samples.length + i) / 511 * Math.max(1, width - 44);
        // Keep out-of-range artifacts inside their own row without rescaling.
        var displacement = Math.max(-25, Math.min(25, (value - mean) / graphAmplitude * 25));
        var y = center - displacement;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }
  function tick(now) {
    if (!session || !session.running) return;
    if (now >= session.detectedUntil) element("blinkCue").classList.remove("detected");
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab") {
      finish("Session ended early.");
      return;
    }
    // Interrupt rather than label missing signal as a missed physical blink.
    if (!muse.isBlinkReady()) {
      finish("Session interrupted: TP9/TP10 data is unavailable. Wait for a continuous signal and run again.");
      return;
    }
    var trial = session.trials[session.trials.length - 1];
    if (trial && now > trial.at + responseMs) trial.closed = true;
    renderCounts();
    if (session.trials.length === 10 && trial.closed) {
      finish("All 10 prompted trials are complete.");
      return;
    }
    if (now >= session.nextAt && session.trials.length < 10) {
      session.trials.push({ at: now, detected: false, closed: false });
      // Schedule from the actual cue time; never rush missed cues after a delay.
      session.nextAt = now + intervalMs;
      element("blinkCue").classList.remove("pulse");
      void element("blinkCue").offsetWidth;
      element("blinkCue").classList.add("pulse");
      element("labProgress").textContent = "Prompt " + session.trials.length + " of 10";
    }
    drawEEG();
    frame = requestAnimationFrame(tick);
  }
  document.addEventListener("museblink", function(event) {
    if (!session || !session.running) return;
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab" || !muse.isBlinkReady()) return;
    var trial = session.trials[session.trials.length - 1];
    var time = event.detail.time;
    // Red is feedback from a real detector event, separate from the timed prompt.
    session.detectedUntil = time + 650;
    element("blinkCue").classList.add("detected");
    if (trial && time >= trial.at && time <= trial.at + responseMs && !trial.detected) {
      trial.detected = true;
    } else {
      session.unexpected += 1;
    }
    renderCounts();
  });
  document.addEventListener("musemodechange", function(event) {
    finish("Session ended early.");
    if (event.detail === "lab") show("labMenu");
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) finish("Session interrupted because the page was hidden. Run again when ready.");
  });
  document.addEventListener("DOMContentLoaded", function() {
    element("labBlinkOption").addEventListener("click", function() { show("labIntro"); });
    element("labReturnMenu").addEventListener("click", function() { show("labMenu"); });
    element("labBack").addEventListener("click", function() { show("labMenu"); });
    element("labNext").addEventListener("click", start);
    element("labAgain").addEventListener("click", start);
  });
})();
