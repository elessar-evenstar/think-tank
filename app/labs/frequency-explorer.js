/* Observe accepted EEG features only; never write to aquarium controls. */
(function() {
  "use strict";
  var page = 0, active = false, frame = 0, shown = null, updatedAt = 0;
  var spectrumMax = 1, bandMax = 1;
  var colors = ["#8dd3ff", "#a5efb3", "#ffe49b"];
  var names = ["Theta", "Alpha", "Beta"];
  function el(id) { return document.getElementById(id); }
  function stop() { cancelAnimationFrame(frame); window.frequencyLabActive = false; }
  function show() {
    stop();
    el("frequencyCanvas").hidden = page === 0 || page === 3;
    el("frequencyBars").hidden = page !== 2;
    el("frequencyDetails").hidden = page !== 2;
    el("frequencyDetails").open = false;
    el("frequencyStatus").textContent = "";
    el("frequencyNext").textContent = page === 3 ? "Try the Exercises" : "Next";
    if (page === 0) {
      el("frequencyTitle").textContent = "Lab 3: Frequency Explorer";
      el("frequencyDescription").textContent = "Your Muse recording contains electrical fluctuations at many frequencies. This activity shows how ThinkTank separates those frequencies into bands and uses their relative power to calculate its experimental engagement estimate.";
      el("frequencyNote").textContent = "You will start with an example of slow and fast waves before looking at live recordings from AF7 and AF8 on your forehead. For the live recording, sit comfortably with your eyes open and your face relaxed; your signals will continue updating while the aquarium controls are paused.";
    } else if (page === 1) {
      el("frequencyTitle").textContent = "From Waves to Frequencies";
      el("frequencyDescription").textContent = "Frequency is how often a wave repeats each second, measured in hertz (Hz). The examples below show a slower wave and a faster wave over the same one second.";
      el("frequencyStatus").textContent = "Illustrative waves, not recorded Muse data";
      el("frequencyNote").textContent = "On the next screen, frequency runs from left to right. Taller peaks indicate more power at that frequency. Shaded rectangles mark the frequency bands: blue for theta (4-7 Hz), green for alpha (8-12 Hz), and yellow for beta (13-30 Hz). The bars below total the power within each band. These names describe frequency ranges, not separate thoughts or emotions.";
      draw();
    } else if (page === 2) {
      el("frequencyTitle").textContent = "Live Frequency Spectrum";
      el("frequencyDescription").textContent = "This graph combines the power calculated separately from AF7 and AF8. The shaded rectangles mark theta (blue, 4-7 Hz), alpha (green, 8-12 Hz), and beta (yellow, 13-30 Hz). They show frequency ranges; their height does not represent power.";
      el("frequencyNote").textContent = "Waiting for an accepted EEG window. Values are relative power units, not percentages.";
      shown = null; updatedAt = 0;
      names.forEach(function(name) { el("frequency" + name).value = 0; el("frequency" + name + "Value").textContent = "--"; });
      window.frequencyLabActive = true;
      draw();
      tick();
    } else {
      el("frequencyTitle").textContent = "How This Connects to the Aquarium";
      el("frequencyDescription").textContent = "ThinkTank combines these band powers using beta / (alpha + theta). Lab shows the resulting smoothed EEG engagement estimate from 0 to 100. Tank uses it to control the fish and displays their applied speed from 0 (slowest) to 100 (fastest).";
      el("frequencyNote").textContent = "The estimate is an experimental control signal rather than a measured percentage of engagement. Eye movements, muscle activity, and headset movement can influence it, so ThinkTank checks each analysis window before accepting an update. If a window is rejected, the spectrum holds its last accepted result.";
    }
  }
  function draw() {
    var canvas = el("frequencyCanvas"), ctx = canvas.getContext("2d");
    var width = Math.max(1, canvas.clientWidth), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(200 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, 200);
    ctx.font = "12px sans-serif";
    if (page === 1) {
      [4, 12].forEach(function(hz, row) {
        var center = 55 + row * 80;
        ctx.fillStyle = colors[row]; ctx.fillText(hz + " Hz", 8, center - 25);
        ctx.strokeStyle = colors[row]; ctx.beginPath();
        for (var i = 0; i <= 400; i++) {
          var x = 50 + i / 400 * (width - 60), y = center - Math.sin(i / 400 * hz * 2 * Math.PI) * 20;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.fillStyle = "white"; ctx.fillText("0 seconds", 8, 190); ctx.fillText("1 second", width - 62, 190);
      return;
    }
    function x(hz) { return 42 + hz / 30 * (width - 52); }
    [[4, 7], [8, 12], [13, 30]].forEach(function(band, i) {
      ctx.globalAlpha = 0.15; ctx.fillStyle = colors[i];
      ctx.fillRect(x(band[0]), 22, x(band[1]) - x(band[0]), 140); ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.fillText(names[i], (x(band[0]) + x(band[1])) / 2, 20, Math.max(1, x(band[1]) - x(band[0]) + 8));
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "white";
    ctx.fillText("Power" + (shown ? " (max " + spectrumMax.toFixed(1) + ")" : ""), 8, 176);
    [0, 10, 20, 30].forEach(function(hz) { ctx.fillText(hz + " Hz", Math.min(width - 36, x(hz)), 190); });
    ctx.strokeStyle = "white"; ctx.beginPath(); ctx.moveTo(42, 22); ctx.lineTo(42, 162); ctx.lineTo(width - 10, 162); ctx.stroke();
    if (!shown) return;
    ctx.strokeStyle = "#8dd3ff"; ctx.beginPath();
    shown.spectrum.forEach(function(bin, i) {
      var y = 162 - Math.min(1, bin.power / spectrumMax) * 140;
      if (!i) ctx.moveTo(x(bin.hz), y); else ctx.lineTo(x(bin.hz), y);
    });
    ctx.stroke();
  }
  function tick() {
    if (!active || page !== 2) return;
    var muse = window.museAquarium, focus = muse.state.focus;
    var reason = !muse.state.connected ? "disconnected" : focus.signalQuality !== "good" ? focus.signalQuality :
      Date.now() - updatedAt > 1500 ? "waiting for fresh EEG" : "";
    el("frequencyStatus").textContent = reason ? (shown ? "Holding last valid result: " : "Waiting: ") + reason : "Live - accepted EEG window";
    frame = requestAnimationFrame(tick);
  }
  document.addEventListener("musefrequency", function(event) {
    if (!active || page !== 2 || !window.frequencyLabActive) return;
    var data = event.detail;
    if (!shown) {
      spectrumMax = Math.max(1, Math.max.apply(null, data.spectrum.map(function(bin) { return bin.power; })) * 2);
      bandMax = Math.max(1, Math.max.apply(null, data.bands) * 2);
      shown = { spectrum: data.spectrum.map(function(bin) { return { hz: bin.hz, power: bin.power }; }), bands: data.bands.slice() };
    } else {
      data.spectrum.forEach(function(bin, i) { shown.spectrum[i].power += (bin.power - shown.spectrum[i].power) * 0.3; });
      data.bands.forEach(function(value, i) { shown.bands[i] += (value - shown.bands[i]) * 0.3; });
    }
    updatedAt = data.at;
    names.forEach(function(name, i) {
      el("frequency" + name).max = bandMax; el("frequency" + name).value = Math.min(bandMax, shown.bands[i]);
      el("frequency" + name + "Value").textContent = shown.bands[i].toFixed(1);
    });
    var clipped = shown.bands.some(function(value) { return value > bandMax; }) || shown.spectrum.some(function(bin) { return bin.power > spectrumMax; });
    el("frequencyNote").textContent = "Relative power units, not percentages. Scale fixed from the first accepted window; bar maximum: " + bandMax.toFixed(1) + "." +
      (clipped ? " Some values exceed the display range and are clipped." : "");
    draw();
  });
  document.addEventListener("musemodechange", function() { stop(); active = false; });
  window.addEventListener("resize", function() { if (active && (page === 1 || page === 2)) draw(); });
  document.addEventListener("DOMContentLoaded", function() {
    el("labFrequencyOption").addEventListener("click", function() { active = true; page = 0; window.bciLab.show("frequencyView"); show(); });
    el("frequencyBack").addEventListener("click", function() {
      if (page > 0) { page--; show(); } else { stop(); active = false; window.bciLab.show("labMenu"); }
    });
    el("frequencyNext").addEventListener("click", function() {
      if (page < 3) { page++; show(); } else {
        stop(); active = false;
        window.frequencyExercise.start(function() { active = true; page = 3; window.bciLab.show("frequencyView"); show(); });
      }
    });
  });
})();
