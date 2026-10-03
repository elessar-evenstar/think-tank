/* ThinkTank: ui/status.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.setStatus = function setStatus(message) {
    var status = document.getElementById("museStatus");
    if (status) status.textContent = message;
  };

  T.updateStats = function updateStats(now) {
    var hasEstimate = T.state.focus.lastComputedAt > 0 && Number.isFinite(T.state.focus.index);
    var battery = Number.isFinite(T.state.battery) ? T.clamp(T.state.battery, 0, 100) : null;
    var values = {
      statEngagement: hasEstimate ? T.state.focus.index.toFixed(0) : "--",
      statBattery: battery !== null ? battery.toFixed(0) + "%" : "--"
    };
    Object.keys(values).forEach(function(id) {
      var node = document.getElementById(id);
      if (node && node.textContent !== values[id]) node.textContent = values[id];
    });
    // Delay only the visual recovery message, never the underlying calculations.
    var quality = T.state.focus.signalQuality;
    var stale = T.state.focus.lastComputedAt > 0 && now - T.state.focus.lastComputedAt > T.FISH_SPEED_CONFIG.holdMs;
    // Indicators are visual feedback only; the detector and control mappings are unchanged.
    var blink = T.state.blink.lastDetectedAt > 0 && now - T.state.blink.lastDetectedAt < 650;
    var eye = document.getElementById("blinkIndicator");
    eye.classList.toggle("detected", blink);
    eye.setAttribute("aria-label", blink ? "Blink detected" : "Blink detector idle");
    var held = hasEstimate && (quality !== "good" || stale);
    document.getElementById("engagementIndicator").classList.toggle("held", held);
    document.getElementById("engagementFill").style.width = (hasEstimate ? T.clamp(T.state.focus.index, 0, 100) : 0) + "%";
    // Blend blue through intermediate colors to red; held results retain a muted hue.
    var colorFraction = hasEstimate ? T.clamp(T.state.focus.index / 100, 0, 1) : 0;
    var colorStops = [[65, 175, 255], [220, 125, 255], [255, 95, 110]];
    var segment = colorFraction < 0.5 ? 0 : 1;
    var mix = colorFraction < 0.5 ? colorFraction * 2 : (colorFraction - 0.5) * 2;
    var barColor = colorStops[segment].map(function(value, i) {
      return Math.round(value + (colorStops[segment + 1][i] - value) * mix);
    });
    document.getElementById("engagementFill").style.backgroundColor = "rgb(" + barColor.join(",") + ")";
    var meter = document.getElementById("engagementTrack");
    if (hasEstimate) meter.setAttribute("aria-valuenow", String(T.clamp(T.state.focus.index, 0, 100)));
    else meter.removeAttribute("aria-valuenow");
    meter.setAttribute("aria-valuetext", hasEstimate ? T.state.focus.index.toFixed(0) + (held ? ", held estimate" : ", engagement estimate") : "Collecting EEG");
    document.getElementById("batteryFill").style.width = (battery === null ? 0 : battery) + "%";
    document.getElementById("batteryIndicator").classList.toggle("unknown", battery === null);
    document.getElementById("batteryIndicator").classList.toggle("low", battery !== null && battery <= 20);
    document.getElementById("statBattery").setAttribute("aria-label", battery === null ? "Battery level unknown" : "Battery " + battery.toFixed(0) + " percent");
    if (!T.state.focus.lastComputedAt) {
      T.statsGoodSince = 0;
      T.setStatus("Collecting EEG");
    } else if (stale) {
      T.statsGoodSince = 0;
      T.setStatus("Engagement held: signal unavailable; speed returning to baseline");
    } else if (quality !== "good") {
      T.statsGoodSince = 0;
      T.setStatus("Engagement " + quality + (T.state.focus.lastComputedAt ? " (estimate held)" : ""));
    } else {
      if (!T.statsGoodSince) T.statsGoodSince = now;
      T.setStatus(now - T.statsGoodSince >= 1000 ? "Engagement updating" : "Engagement signal settling");
    }
  };

  T.setMuseStatsVisible = function setMuseStatsVisible(visible) {
    var stats = document.getElementById("museStats");
    if (!stats) return;
    stats.style.display = visible ? "block" : "none";
  };

  T.setButtonState = function setButtonState(label, disabled) {
    var button = document.getElementById("connectMuseButton");
    if (!button) return;
    button.textContent = label;
    button.disabled = disabled;
  };

})(window.ThinkTank);
