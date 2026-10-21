/* Record accepted engagement updates; rejected windows remain gaps, not low scores. */
(function() {
  "use strict";
  var active = false, phase = "intro", stage = 0, frame = 0, began = 0;
  var samples = [], results = [], returnToGuide, audioContext;
  var durationMs = 15000;
  function el(id) { return document.getElementById(id); }
  function stop() { cancelAnimationFrame(frame); window.frequencyLabActive = false; }
  function tone() {
    if (!audioContext || audioContext.state !== "running") return;
    var oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.start(); oscillator.stop(audioContext.currentTime + 0.5);
  }
  function intro() {
    stop(); phase = "intro";
    el("exerciseStatus").classList.remove("countdown");
    el("exerciseTitle").textContent = stage ? "Exercise 2: Quiet Rest" : "Exercise 1: Focused Attention";
    el("exerciseDescription").textContent = stage ?
      "During this fifteen-second recording, keep your eyes open and let your attention wander. The number will still be visible, but you do not need to follow it or try to change it. Let your face relax and blink whenever you need to." :
      "During this fifteen-second recording, watch the number and try to increase it by maintaining your attention on it. Keep your eyes open and your face relaxed, and blink whenever you need to. The estimate may rise, fall, or stay similar; there is no target you need to reach.";
    el("exerciseSummary").textContent = "Explore how the EEG estimate changes during these two activities. Either recording may be higher, lower, or similar. The 0-100 scale is experimental, not percent focus. Start begins a three-second countdown; on-screen cues and optional tones mark the recording.";
    el("exerciseScore").textContent = ""; el("exerciseStatus").textContent = "";
    el("exerciseScale").hidden = true; el("exerciseLegend").hidden = true;
    el("exerciseCanvas").hidden = true; el("exerciseAgain").hidden = true;
    el("exerciseNext").hidden = false; el("exerciseNext").textContent = "Start";
  }
  async function begin() {
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab") return;
    // Audio is unlocked by the Start click; eyes stay open and visual cues always work.
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && Audio) audioContext = new Audio();
      if (audioContext) await audioContext.resume();
    } catch (error) { /* The on-screen countdown works without audio. */ }
    if (!active || phase !== "intro") return;
    tone();
    phase = "countdown"; began = performance.now() + 3000; samples = [];
    el("exerciseStatus").classList.add("countdown");
    el("exerciseNext").hidden = true;
    el("exerciseSummary").textContent = stage ? "Keep your eyes open and let your attention wander. You do not need to follow or change the number." : "Keep your eyes open and your face relaxed. Watch the number and try to increase it through steady attention.";
    window.frequencyLabActive = true;
    frame = requestAnimationFrame(tick);
  }
  function finish(message) {
    stop(); tone(); phase = "result";
    el("exerciseStatus").classList.remove("countdown");
    results[stage] = samples.slice();
    el("exerciseStatus").textContent = message;
    el("exerciseScore").textContent = "";
    el("exerciseScale").hidden = false;
    el("exerciseCanvas").hidden = false;
    el("exerciseAgain").hidden = false; el("exerciseNext").hidden = false;
    el("exerciseNext").textContent = stage ? "Finish" : "Next";
    var summary = samples.length >= 2 ? "First accepted estimate: " + samples[0].value.toFixed(0) +
      ". Last: " + samples[samples.length - 1].value.toFixed(0) + ". Change: " +
      (Math.round(samples[samples.length - 1].value) - Math.round(samples[0].value)) + " points." : "Not enough accepted updates to describe a change. You can run this exercise again.";
    el("exerciseSummary").textContent = summary + " " + samples.length + " accepted updates. Gaps are periods without accepted estimates, not zero engagement. " +
      (stage ? "Compare how the EEG index changed during each activity. The solid blue line records the focused-attention instruction; the dashed green line records the quiet-rest instruction. Both start at zero seconds for comparison, although the exercises happened separately. Either recording may be higher, lower, or similar. These are prompted activities, not independently measured attention states." : "The solid blue line records the focused-attention instruction. Left to right shows elapsed time; height shows the smoothed 0-100 estimate, not percent focus. Next, try quiet rest with the same display.");
    draw();
  }
  function tick(now) {
    if (!active || (phase !== "countdown" && phase !== "recording")) return;
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab") { finish("Interrupted."); return; }
    if (phase === "countdown") {
      el("exerciseStatus").textContent = "Get ready: " + Math.max(1, Math.ceil((began - now) / 1000));
      if (now >= began) {
        began = now; phase = "recording"; tone(); el("exerciseCanvas").hidden = false;
        el("exerciseScale").hidden = false;
        el("exerciseStatus").classList.remove("countdown");
      }
    }
    if (phase === "recording") {
      if (now - began >= durationMs) { finish("Fifteen seconds complete." + (stage ? " Compare your recordings below." : " You can relax your attention now.")); return; }
      var focus = muse.state.focus;
      var valid = focus.signalQuality === "good" && Number.isFinite(focus.index) && Date.now() - focus.lastComputedAt < 1500;
      el("exerciseScore").textContent = valid ? focus.index.toFixed(0) : "--";
      el("exerciseStatus").textContent = Math.ceil((durationMs - now + began) / 1000) + " seconds remaining" +
        (valid ? "" : " | Waiting for valid EEG; no estimate recorded");
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function draw() {
    var canvas = el("exerciseCanvas"), ctx = canvas.getContext("2d"), width = Math.max(1, canvas.clientWidth), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(180 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, 180);
    ctx.font = "12px sans-serif"; ctx.fillStyle = "white";
    // Fixed whole-number ticks keep both activities directly comparable; no auto-zoom.
    [0, 20, 40, 60, 80, 100].forEach(function(value) {
      var y = 150 - value * 1.3;
      ctx.fillText(String(value), 2, y + 4);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(width - 10, y); ctx.stroke();
    });
    ctx.fillText("0s", 32, 175); ctx.fillText(durationMs / 1000 + "s", width - 30, 175);
    var traces = stage && phase === "result" ? [results[0] || [], samples] : [samples];
    el("exerciseLegend").hidden = false;
    el("exerciseFocusLegend").hidden = !!stage && phase !== "result";
    el("exerciseRestLegend").hidden = !stage;
    canvas.setAttribute("aria-label", (stage && phase === "result" ?
      "Focused-attention and quiet-rest instruction recordings" : stage ?
      "Quiet-rest instruction recording" : "Focused-attention instruction recording") +
      "; elapsed time from 0 to 15 seconds; experimental EEG engagement estimate from 0 to 100. Gaps mean no accepted estimate.");
    traces.forEach(function(trace, index) {
      var restTrace = stage && (traces.length === 1 || index === 1);
      ctx.strokeStyle = restTrace ? "#a5efb3" : "#8dd3ff";
      ctx.setLineDash(restTrace ? [6, 4] : []);
      ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach(function(point, i) {
        var x = 32 + point.time / durationMs * (width - 42), y = 150 - point.value * 1.3;
        if (!i || point.time - trace[i - 1].time > 1000) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x - 1, y - 1, 2, 2);
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  document.addEventListener("musefrequency", function() {
    if (!active || phase !== "recording") return;
    var time = performance.now() - began, focus = window.museAquarium.state.focus;
    if (time >= 0 && time <= durationMs && focus.signalQuality === "good" && Number.isFinite(focus.index)) {
      samples.push({ time: time, value: focus.index });
    }
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden && active && (phase === "recording" || phase === "countdown")) finish("Interrupted: page hidden.");
  });
  document.addEventListener("musemodechange", function() { if (active && (phase === "recording" || phase === "countdown")) tone(); stop(); active = false; });
  window.addEventListener("resize", function() { if (active && (phase === "recording" || phase === "result")) draw(); });
  window.frequencyExercise = { start: function(back) {
    active = true; stage = 0; results = []; returnToGuide = back;
    window.bciLab.show("frequencyExercise"); intro();
  } };
  document.addEventListener("DOMContentLoaded", function() {
    el("exerciseBack").addEventListener("click", function() {
      if (phase !== "intro") { if (phase !== "result") tone(); intro(); }
      else if (stage) { stage = 0; samples = results[0] || []; finish("Focused attention results"); }
      else { stop(); active = false; returnToGuide(); }
    });
    el("exerciseAgain").addEventListener("click", intro);
    el("exerciseNext").addEventListener("click", function() {
      if (phase === "intro") return begin();
      if (phase === "result" && !stage) { stage = 1; intro(); }
      else if (phase === "result") { stop(); active = false; window.bciLab.show("labMenu"); }
    });
  });
})();
