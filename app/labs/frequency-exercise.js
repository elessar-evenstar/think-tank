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
    el("exerciseTitle").textContent = stage ? "Exercise 2: Relaxed Rest" : "Exercise 1: Focused Attention";
    el("exerciseDescription").textContent = stage ?
      "Sit comfortably and let your attention wander, without trying to change the number. You can keep a soft, unfocused gaze or close your eyes, whichever feels more natural. Start plays a sound check. After a three-second countdown, the next tone begins fifteen seconds of rest; the final tone ends the exercise. A tone also sounds if interrupted." :
      "For fifteen seconds, keep your attention on the displayed engagement estimate. You can try to bring it up through steady attention, without tensing your jaw or face. There is no target to reach and no guaranteed increase. Blink naturally when needed.";
    el("exerciseSummary").textContent = "This is an estimate, not an exact measurement. Relaxed rest does not guarantee a lower estimate. Changes can reflect eye state, artifacts, and the estimate's smoothing. Make sure you can hear the cues before choosing to close your eyes.";
    el("exerciseScore").textContent = ""; el("exerciseStatus").textContent = "";
    el("exerciseCanvas").hidden = true; el("exerciseAgain").hidden = true;
    el("exerciseNext").hidden = false; el("exerciseNext").textContent = "Start";
  }
  async function begin() {
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab") return;
    // Audio is unlocked by this button click, before the visitor closes their eyes.
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && Audio) audioContext = new Audio();
      if (audioContext) await audioContext.resume();
    } catch (error) { /* The on-screen message below handles unavailable audio. */ }
    if (!active || phase !== "intro") return;
    if (stage && (!audioContext || audioContext.state !== "running")) {
      el("exerciseStatus").textContent = "Audio is unavailable. Enable sound before starting the rest exercise."; return;
    }
    tone();
    phase = "countdown"; began = performance.now() + 3000; samples = [];
    el("exerciseStatus").classList.add("countdown");
    el("exerciseNext").hidden = true;
    el("exerciseSummary").textContent = stage ? "Sound check: keep your eyes open until the next tone. If you cannot hear the sound, press Back." : "Keep your face relaxed. The estimate may rise, fall, or stay similar.";
    window.frequencyLabActive = true;
    frame = requestAnimationFrame(tick);
  }
  function finish(message) {
    stop(); tone(); phase = "result";
    el("exerciseStatus").classList.remove("countdown");
    results[stage] = samples.slice();
    el("exerciseStatus").textContent = message;
    el("exerciseScore").textContent = "";
    el("exerciseCanvas").hidden = false;
    el("exerciseAgain").hidden = false; el("exerciseNext").hidden = false;
    el("exerciseNext").textContent = stage ? "Finish" : "Next";
    var summary = samples.length >= 2 ? "First accepted estimate: " + samples[0].value.toFixed(0) +
      ". Last: " + samples[samples.length - 1].value.toFixed(0) + ". Change: " +
      (samples[samples.length - 1].value - samples[0].value).toFixed(1) + " points." : "Not enough accepted updates to describe a change. You can run this exercise again.";
    el("exerciseSummary").textContent = summary + " " + samples.length + " accepted updates. Gaps are periods without accepted estimates, not zero engagement. " +
      (stage ? "The blue line is your saved engagement estimate during focused attention; the green line is your estimate during relaxed rest. Both start at zero seconds for comparison, although the exercises happened separately. Left to right shows elapsed time; height shows the smoothed 0-100 estimate, not percent focus. Neither condition guarantees a higher or lower line." : "The blue line shows how your engagement estimate changed during focused attention. Left to right shows elapsed time; height shows the smoothed 0-100 estimate, not percent focus.");
    draw();
  }
  function tick(now) {
    if (!active || (phase !== "countdown" && phase !== "recording")) return;
    var muse = window.museAquarium;
    if (!muse.state.connected || muse.state.mode !== "lab") { finish("Interrupted." + (stage ? " If your eyes are closed, open them when ready." : "")); return; }
    if (phase === "countdown") {
      el("exerciseStatus").textContent = "Get ready: " + Math.max(1, Math.ceil((began - now) / 1000));
      if (now >= began) {
        began = now; phase = "recording"; tone(); el("exerciseCanvas").hidden = false;
        el("exerciseStatus").classList.remove("countdown");
      }
    }
    if (phase === "recording") {
      if (now - began >= durationMs) { finish("Fifteen seconds complete." + (stage ? " If your eyes are closed, open them when ready." : " You can relax your attention now.")); return; }
      var focus = muse.state.focus;
      var valid = focus.signalQuality === "good" && Date.now() - focus.lastComputedAt < 1500;
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
    [0, 50, 100].forEach(function(value) { ctx.fillText(String(value), 2, 154 - value * 1.3); });
    ctx.fillText("0s", 32, 175); ctx.fillText(durationMs / 1000 + "s", width - 30, 175);
    var traces = stage && phase === "result" ? [results[0] || [], samples] : [samples];
    traces.forEach(function(trace, index) {
      ctx.strokeStyle = traces.length === 2 && index === 0 ? "#8dd3ff" : stage ? "#a5efb3" : "#8dd3ff";
      ctx.beginPath();
      trace.forEach(function(point, i) {
        var x = 32 + point.time / durationMs * (width - 42), y = 150 - point.value * 1.3;
        if (!i || point.time - trace[i - 1].time > 1000) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x - 1, y - 1, 2, 2);
      });
      ctx.stroke();
    });
  }
  document.addEventListener("musefrequency", function() {
    if (!active || phase !== "recording") return;
    var time = performance.now() - began, focus = window.museAquarium.state.focus;
    if (time >= 0 && time <= durationMs && focus.signalQuality === "good" && Number.isFinite(focus.index)) {
      samples.push({ time: time, value: focus.index });
    }
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden && active && (phase === "recording" || phase === "countdown")) finish("Interrupted: page hidden." + (stage ? " If your eyes are closed, open them when ready." : ""));
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
