/* ThinkTank: ui/eeg-display.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.setEEGPanelVisible = function setEEGPanelVisible(visible) {
    var panel = document.getElementById("eegLivePanel");
    if (!panel) return;
    panel.style.display = visible ? "block" : "none";
  };

  T.setEEGPanelExpanded = function setEEGPanelExpanded(expanded) {
    var panel = document.getElementById("eegLivePanel");
    var toggle = document.getElementById("eegToggleButton");
    var icon = document.getElementById("eegToggleIcon");
    if (!panel || !toggle || !icon) return;

    panel.classList.toggle("expanded", expanded);
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    icon.textContent = expanded ? "\u25B2" : "\u25BC";
  };

  T.updateEEGDisplay = function updateEEGDisplay() {
    var canvas = document.getElementById("eegGraph");
    if (!canvas) return;

    var context = canvas.getContext("2d");
    if (!context) return;

    var plotLeft = T.EEG_DISPLAY_CONFIG.labelWidth;
    var plotRight = T.EEG_DISPLAY_CONFIG.width - 4;
    var plotWidth = plotRight - plotLeft;
    context.clearRect(0, 0, T.EEG_DISPLAY_CONFIG.width, T.EEG_DISPLAY_CONFIG.height);

    for (var channel = 0; channel < T.EEG_DISPLAY_CONFIG.channelNames.length; channel += 1) {
      var centerY = T.EEG_DISPLAY_CONFIG.rowHeight * channel + T.EEG_DISPLAY_CONFIG.rowHeight / 2;
      var series = T.state.eeg[channel] || [];
      var pointCount = Math.min(T.EEG_DISPLAY_CONFIG.pointCount, series.length);
      var start = series.length - pointCount;
      var sum = 0;
      var validPoints = 0;

      for (var point = start; point < series.length; point += 1) {
        if (Number.isFinite(series[point])) {
          sum += series[point];
          validPoints += 1;
        }
      }

      var mean = validPoints ? sum / validPoints : 0;
      var maximumDeviation = 0;
      for (var deviationPoint = start; deviationPoint < series.length; deviationPoint += 1) {
        if (Number.isFinite(series[deviationPoint])) {
          maximumDeviation = Math.max(
            maximumDeviation,
            Math.abs(series[deviationPoint] - mean)
          );
        }
      }

      // Each row scales to its recent signal range so small EEG changes remain visible.
      var amplitude = Math.max(20, maximumDeviation * 1.1);
      var halfRowHeight = T.EEG_DISPLAY_CONFIG.rowHeight * 0.42;
      var scale = halfRowHeight / amplitude;

      context.strokeStyle = "rgba(255,255,255,0.16)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(plotLeft, centerY);
      context.lineTo(plotRight, centerY);
      context.stroke();

      context.fillStyle = T.EEG_DISPLAY_CONFIG.channelColors[channel];
      context.font = "10px sans-serif";
      context.fillText(T.EEG_DISPLAY_CONFIG.channelNames[channel], 2, centerY + 3);

      if (pointCount < 2) continue;

      var hasPoint = false;
      context.strokeStyle = T.EEG_DISPLAY_CONFIG.channelColors[channel];
      context.lineWidth = 1.4;
      context.beginPath();
      for (var sample = 0; sample < pointCount; sample += 1) {
        var value = series[start + sample];
        if (!Number.isFinite(value)) {
          hasPoint = false;
          continue;
        }

        var x = plotLeft + (sample / (pointCount - 1)) * plotWidth;
        var y = centerY - T.clamp((value - mean) * scale, -halfRowHeight, halfRowHeight);
        if (!hasPoint) {
          context.moveTo(x, y);
          hasPoint = true;
        } else {
          context.lineTo(x, y);
        }
      }
      if (hasPoint) context.stroke();
    }
  };

})(window.ThinkTank);
