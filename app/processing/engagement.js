/* ThinkTank: processing/engagement.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.focusLevelFromIndex = function focusLevelFromIndex(index) {
    if (index >= 67) return "high";
    if (index >= 40) return "medium";
    return "low";
  };

  T.detectFocus = function detectFocus(now) {
    // Engagement uses its own threshold, separate from sensitive camera controls.
    // Remember faster motion between spectral checks until its window clears.
    if (Math.abs(T.state.smoothedYawDps || 0) > T.FOCUS_CONFIG.motionThresholdDps ||
        Math.abs(T.state.headPitch.velocityDps || 0) > T.FOCUS_CONFIG.motionThresholdDps) {
      T.state.focus.lastMotionAt = now;
    }
    if (now - T.state.focus.lastCheckedAt < T.FOCUS_CONFIG.computeIntervalMs) return;
    T.state.focus.lastCheckedAt = now;

    var aligned = T.getAlignedEEG(1, 2, T.FOCUS_CONFIG.windowPoints, now);
    if (aligned.reason) {
      T.state.focus.signalQuality = "paused: " + aligned.reason;
      return;
    }
    // A repeated window must not keep nudging the smoothed estimate.
    if (aligned.at <= T.lastEngagementPacketAt) return;
    T.lastEngagementPacketAt = aligned.at;
    var af7Window = aligned.first;
    var af8Window = aligned.second;

    // Reject the entire analysis window. Keep the last valid score and powers
    // untouched so artifacts never become an artificial drop in engagement.
    var windowMs = 1000 * T.FOCUS_CONFIG.windowPoints / T.FOCUS_CONFIG.sampleRate;
    var invalidSamples = af7Window.concat(af8Window).some(function(value) {
      return !Number.isFinite(value) || Math.abs(value) > T.FOCUS_CONFIG.artifactAbsThreshold;
    });
    var recentBlink = T.state.blink.lastDetectedAt > 0 &&
      now - T.state.blink.lastDetectedAt <= windowMs;
    var recentMotion = T.state.focus.lastMotionAt > 0 &&
      now - T.state.focus.lastMotionAt <= windowMs;
    if (invalidSamples || recentBlink || recentMotion) {
      T.state.focus.signalQuality = recentBlink ? "paused: blink" :
        (recentMotion ? "paused: movement" : "paused: noisy signal");
      return;
    }

    // Check each frontal channel before combining them. A healthy channel must
    // not hide a flat neighbor, including a constant nonzero sensor offset.
    var centeredChannels = [T.removeMean(af7Window), T.removeMean(af8Window)];
    for (var input = 0; input < centeredChannels.length; input++) {
      var energy = centeredChannels[input].reduce(function(sum, value) { return sum + value * value; }, 0);
      if (Math.sqrt(energy / centeredChannels[input].length) < T.FOCUS_CONFIG.minSignalRms) {
        T.state.focus.signalQuality = "paused: near-flat " + (input === 0 ? "AF7" : "AF8");
        return;
      }
    }
    // Calculate power before combining channels so opposite-phase waves cannot cancel.
    var channels = centeredChannels.map(T.applyHannWindow);
    var thetaPower = 0;
    var alphaPower = 0;
    var betaPower = 0;
    for (var channel = 0; channel < channels.length; channel += 1) {
      thetaPower += T.estimateBandPower(
        channels[channel], T.FOCUS_CONFIG.sampleRate,
        T.FOCUS_CONFIG.thetaBand[0], T.FOCUS_CONFIG.thetaBand[1]
      );
      alphaPower += T.estimateBandPower(
        channels[channel], T.FOCUS_CONFIG.sampleRate,
        T.FOCUS_CONFIG.alphaBand[0], T.FOCUS_CONFIG.alphaBand[1]
      );
      betaPower += T.estimateBandPower(
        channels[channel], T.FOCUS_CONFIG.sampleRate,
        T.FOCUS_CONFIG.betaBand[0], T.FOCUS_CONFIG.betaBand[1]
      );
    }
    thetaPower /= channels.length;
    alphaPower /= channels.length;
    betaPower /= channels.length;

    var denominator = alphaPower + thetaPower + 0.000001;
    var ratio = betaPower / denominator;
    var ratioClamped = T.clamp(ratio, 0.2, 2.6);
    var rawIndex = 100 * (ratioClamped - 0.2) / (2.6 - 0.2);

    rawIndex = T.clamp(rawIndex, 0, 100);

    if (!T.state.focus.lastComputedAt || !Number.isFinite(T.state.focus.index)) {
      // The first accepted window is a measurement, not a blend with a made-up 50.
      T.state.focus.index = rawIndex;
    } else {
      // Do not count a rejected-data gap as time spent observing a new value.
      var elapsedMs = Math.min(Math.max(0, now - T.state.focus.lastComputedAt), T.FOCUS_CONFIG.computeIntervalMs);
      var smoothing = 1 - Math.exp(-elapsedMs / (T.FOCUS_CONFIG.smoothingSeconds * 1000));
      T.state.focus.index = T.lerp(T.state.focus.index, rawIndex, smoothing);
    }
    // Expose the unsmoothed control score to distinguish saturation from smoothing.
    T.state.focus.rawIndex = rawIndex;
    T.state.focus.thetaPower = thetaPower;
    T.state.focus.alphaPower = alphaPower;
    T.state.focus.betaPower = betaPower;
    T.state.focus.ratio = ratio;
    T.state.focus.signalQuality = "good";
    T.state.focus.level = T.focusLevelFromIndex(T.state.focus.index);
    T.state.focus.lastComputedAt = now;
    // Frequency Lab observes the same accepted windows without changing controls.
    if (T.state.mode === "lab" && window.frequencyLabActive) {
      var spectrum = [];
      for (var bin = 1; bin <= Math.floor(30 * channels[0].length / T.FOCUS_CONFIG.sampleRate); bin++) {
        var hz = bin * T.FOCUS_CONFIG.sampleRate / channels[0].length;
        var binPower = 0;
        channels.forEach(function(samples) {
          binPower += T.estimateBandPower(samples, T.FOCUS_CONFIG.sampleRate, hz, hz) / channels.length;
        });
        spectrum.push({ hz: hz, power: binPower });
      }
      document.dispatchEvent(new CustomEvent("musefrequency", { detail: {
        spectrum: spectrum, bands: [thetaPower, alphaPower, betaPower], at: now
      } }));
    }
  };

})(window.ThinkTank);
