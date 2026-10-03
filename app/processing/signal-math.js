/* ThinkTank: processing/signal-math.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.meanFromEnd = function meanFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var total = 0;
    var samples = 0;
    for (var i = start; i < end; i += 1) {
      if (!Number.isFinite(series[i])) continue;
      total += series[i];
      samples += 1;
    }
    return samples ? total / samples : 0;
  };

  T.minFromEnd = function minFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    var min = Infinity;
    for (var i = start; i < end; i += 1) {
      if (Number.isFinite(series[i]) && series[i] < min) min = series[i];
    }
    return min === Infinity ? 0 : min;
  };

  T.stdFromEnd = function stdFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var mean = T.meanFromEnd(series, count, offset);
    var total = 0;
    var samples = 0;
    for (var i = start; i < end; i += 1) {
      if (!Number.isFinite(series[i])) continue;
      total += (series[i] - mean) * (series[i] - mean);
      samples += 1;
    }
    return samples ? Math.sqrt(total / samples) : 0;
  };

  T.windowFromEnd = function windowFromEnd(series, count, offset) {
    var end = Math.max(0, series.length - (offset || 0));
    var start = Math.max(0, end - count);
    var window = [];
    for (var i = start; i < end; i += 1) {
      if (Number.isFinite(series[i])) window.push(series[i]);
    }
    return window;
  };

  T.combineWindows = function combineWindows(windows) {
    var minLength = Infinity;
    for (var windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
      minLength = Math.min(minLength, windows[windowIndex].length);
    }
    if (!Number.isFinite(minLength) || minLength <= 0) return [];

    var combined = new Array(minLength);
    for (var i = 0; i < minLength; i += 1) {
      var total = 0;
      var samples = 0;
      for (var w = 0; w < windows.length; w += 1) {
        var source = windows[w];
        var value = source[source.length - minLength + i];
        if (!Number.isFinite(value)) continue;
        total += value;
        samples += 1;
      }
      combined[i] = samples ? total / samples : 0;
    }
    return combined;
  };

  T.removeMean = function removeMean(series) {
    if (!series.length) return [];
    var total = 0;
    for (var i = 0; i < series.length; i += 1) total += series[i];
    var mean = total / series.length;
    var centered = [];
    for (var j = 0; j < series.length; j += 1) centered.push(series[j] - mean);
    return centered;
  };

  T.applyHannWindow = function applyHannWindow(series) {
    var n = series.length;
    if (n <= 1) return series.slice();
    var windowed = [];
    for (var i = 0; i < n; i += 1) {
      var weight = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      windowed.push(series[i] * weight);
    }
    return windowed;
  };

  T.estimateBandPower = function estimateBandPower(series, sampleRate, lowHz, highHz) {
    var n = series.length;
    if (!n) return 0;
    var power = 0;
    var minK = Math.max(1, Math.ceil((lowHz * n) / sampleRate));
    var maxK = Math.max(minK, Math.floor((highHz * n) / sampleRate));

    for (var k = minK; k <= maxK; k += 1) {
      var re = 0;
      var im = 0;
      for (var i = 0; i < n; i += 1) {
        var angle = (2 * Math.PI * k * i) / n;
        re += series[i] * Math.cos(angle);
        im -= series[i] * Math.sin(angle);
      }
      power += (re * re + im * im) / (n * n);
    }
    return power;
  };

  T.maxAbsFromEnd = function maxAbsFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var found = false;
    var maxAbs = 0;
    for (var i = start; i < end; i += 1) {
      var value = series[i];
      if (!Number.isFinite(value)) continue;
      maxAbs = Math.max(maxAbs, Math.abs(value));
      found = true;
    }
    return found ? maxAbs : 0;
  };

  T.clamp = function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  };

  T.lerp = function lerp(a, b, alpha) {
    return a + (b - a) * alpha;
  };

})(window.ThinkTank);
