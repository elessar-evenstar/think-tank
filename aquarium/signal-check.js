/* Heuristic usability screening, not calibrated contact-quality measurement. */
(function() {
  "use strict";
  var active = false, frame = 0, started = 0, stableSince = null, done;
  var history = [[], [], [], []];
  function el(id) { return document.getElementById(id); }
  function reset() {
    history = [[], [], [], []]; stableSince = null; started = performance.now();
    el("signalContinue").disabled = true;
    el("signalSkip").hidden = true; el("signalWarning").hidden = true;
  }
  function quality(packets, now) {
    if (!packets.length || now - packets[packets.length - 1].time > 500) return "No data";
    if (packets.length < 43 || packets[packets.length - 1].time - packets[0].time < 2000) return "Checking";
    var values = [];
    packets.forEach(function(packet) { values = values.concat(packet.samples); });
    // Match the engagement algorithm's raw-amplitude limit, including DC offsets.
    // Check every channel independently: a clean neighbor cannot hide a noisy one.
    var limit = window.museAquarium.focusConfig.artifactAbsThreshold;
    if (values.some(function(value) { return !Number.isFinite(value) || Math.abs(value) > limit; })) return "Needs adjustment";
    var mean = values.reduce(function(sum, value) { return sum + value; }, 0) / values.length;
    var energy = 0;
    values.forEach(function(value) {
      var centered = value - mean;
      energy += centered * centered;
    });
    if (Math.sqrt(energy / values.length) < window.museAquarium.focusConfig.minSignalRms) return "Needs adjustment";
    return "Signal looks usable";
  }
  function tick(now) {
    if (!active) return;
    if (!window.museAquarium.state.connected) { cancel(); return; }
    var allGood = true;
    history.forEach(function(packets, channel) {
      while (packets.length && now - packets[0].time > 2200) packets.shift();
      var result = quality(packets, now), good = result === "Signal looks usable";
      el("signal" + channel).textContent = result;
      el("signal" + channel).setAttribute("data-quality", good ? "good" : "warn");
      if (!good) allGood = false;
    });
    var gyro = window.museAquarium.state.gyroscope || [0, 0, 0];
    var moving = gyro.some(function(value) { return Math.abs(value) > 25; });
    var focus = window.museAquarium.state.focus;
    var accepted = focus.signalQuality === "good" && focus.lastComputedAt > 0 && Date.now() - focus.lastComputedAt < 1500;
    if (!allGood || moving || !accepted) stableSince = null;
    else if (stableSince === null) stableSince = now;
    var ready = stableSince !== null && now - stableSince >= 3000;
    el("signalContinue").disabled = !ready;
    el("signalProgress").textContent = moving ? "Keep your head still briefly while we check the signal." :
      ready ? "All four signals look usable. Continue when you are ready." :
      allGood && !accepted ? "Waiting for the engagement algorithm to accept a fresh EEG window. Brief blinks or movement may delay this." :
      allGood ? "Signals look usable. Checking that they stay steady..." : "Waiting for all four channels to settle. A blink may briefly delay the check; adjust the fit if a warning persists.";
    if (now - started >= 30000) { el("signalSkip").hidden = false; el("signalWarning").hidden = false; }
    frame = requestAnimationFrame(tick);
  }
  function cancel() { active = false; cancelAnimationFrame(frame); el("signalCheck").hidden = true; }
  function proceed() {
    if (!active || !window.museAquarium.state.connected) return;
    cancel(); done(); el("exploreModeButton").focus();
  }
  document.addEventListener("museeeg", function(event) {
    if (!active || event.detail.channel > 3) return;
    var packet = event.detail, packets = history[packet.channel], last = packets[packets.length - 1];
    // Require continuous packets after a gap instead of treating missing data as clean.
    if (last && ((packet.sequence - last.sequence + 65536) % 65536 !== 1 || packet.time - last.time > 500)) {
      packets.length = 0; stableSince = null;
    }
    packets.push({ sequence: packet.sequence, time: packet.time, samples: packet.samples.slice() });
    if (packets.length > 64) packets.shift();
  });
  document.addEventListener("visibilitychange", function() { if (active && document.hidden) reset(); });
  window.museSignalCheck = {
    start: function(callback) {
      cancel(); done = callback; active = true; reset(); el("signalCheck").hidden = false;
      el("signalRetry").focus(); frame = requestAnimationFrame(tick);
    },
    cancel: cancel
  };
  document.addEventListener("DOMContentLoaded", function() {
    el("signalRetry").addEventListener("click", reset);
    el("signalContinue").addEventListener("click", function() {
      // Recheck on click so a newly arrived noisy packet cannot slip through.
      if (!active) return;
      cancelAnimationFrame(frame); tick(performance.now());
      if (!el("signalContinue").disabled) proceed();
    });
    el("signalSkip").addEventListener("click", function() { if (!el("signalSkip").hidden) proceed(); });
    el("signalCheck").addEventListener("keydown", function(event) {
      if (event.key !== "Tab") return;
      var controls = Array.from(el("signalCheck").querySelectorAll("summary, button:not([disabled])")).filter(function(node) { return !node.hidden; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
})();
