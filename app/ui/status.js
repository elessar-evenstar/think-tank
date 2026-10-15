(function(T) {
  "use strict";

  T.setStatus = function setStatus(message) {
    var status = document.getElementById("museStatus");
    if (status) status.textContent = message;
  };

  T.updateStats = function updateStats(now) {
    var hasEstimate = T.state.focus.lastComputedAt > 0 && Number.isFinite(T.state.focus.index);
    var speedLevel = T.getFishSpeedLevel();
    var hasSpeed = Number.isFinite(speedLevel);
    var battery = Number.isFinite(T.state.battery) ? T.clamp(T.state.battery, 0, 100) : null;
    var values = {
      statFishSpeed: hasSpeed ? speedLevel.toFixed(0) : "--",
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
    eye.setAttribute("aria-label", blink ? "Blink detected; bubbles triggered" : "Blink to create bubbles; detector idle");
    // Color follows applied fish speed; gray means the EEG control input is unavailable.
    var held = !T.state.connected || !hasEstimate || quality !== "good" || stale;
    document.getElementById("fishSpeedIndicator").classList.toggle("held", held);
    document.getElementById("fishSpeedFill").style.width = (hasSpeed ? speedLevel : 0) + "%";
    var colorFraction = hasSpeed ? speedLevel / 100 : 0;
    var colorStops = [[65, 175, 255], [220, 125, 255], [255, 95, 110]];
    var segment = colorFraction < 0.5 ? 0 : 1;
    var mix = colorFraction < 0.5 ? colorFraction * 2 : (colorFraction - 0.5) * 2;
    var barColor = colorStops[segment].map(function(value, i) {
      return Math.round(value + (colorStops[segment + 1][i] - value) * mix);
    });
    document.getElementById("fishSpeedFill").style.backgroundColor = "rgb(" + barColor.join(",") + ")";
    var meter = document.getElementById("fishSpeedTrack");
    if (hasSpeed) meter.setAttribute("aria-valuenow", speedLevel.toFixed(0));
    else meter.removeAttribute("aria-valuenow");
    meter.setAttribute("aria-valuetext", hasSpeed ? "Fish speed " + speedLevel.toFixed(0) +
      " on a scale from 0, slowest, to 100, fastest" + (held ? "; clean EEG unavailable" : "") : "Waiting for aquarium speed");
    document.getElementById("batteryFill").style.width = (battery === null ? 0 : battery) + "%";
    document.getElementById("batteryIndicator").classList.toggle("unknown", battery === null);
    document.getElementById("batteryIndicator").classList.toggle("low", battery !== null && battery <= 20);
    document.getElementById("statBattery").setAttribute("aria-label", battery === null ? "Battery level unknown" : "Battery " + battery.toFixed(0) + " percent");
    if (!hasEstimate) {
      T.statsGoodSince = 0;
      T.setStatus("Collecting EEG");
    } else if (stale) {
      T.statsGoodSince = 0;
      T.setStatus("EEG unavailable; fish speed returning to normal");
    } else if (quality !== "good") {
      T.statsGoodSince = 0;
      T.setStatus("EEG " + quality + "; holding the last control input");
    } else {
      if (!T.statsGoodSince) T.statsGoodSince = now;
      T.setStatus(now - T.statsGoodSince >= 1000 ? "EEG engagement estimate controlling fish speed" : "EEG signal settling");
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
