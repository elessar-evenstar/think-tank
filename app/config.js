/* ThinkTank: config.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.BLINK_CONFIG = {
    recentPoints: 14,
    baselinePoints: 96,
    minCommonDip: 70,
    minScore: 2.8,
    maxDisagreementRatio: 0.95,
    minChannelDip: 35,
    tpHardBlinkValue: -400,
    cooldownMs: 520,
    releaseCommonDip: 28,
    releaseScore: 1.2
  };

  T.BUBBLE_CONFIG = {
    fountainCount: 5,
    fadeInMs: 700,
    minVisibleMs: 1800,
    maxVisibleMs: 4200,
    minFadeOutMs: 900,
    maxFadeOutMs: 2400
  };

  T.HEAD_TURN_CONFIG = {
    // Muse yaw is the Z gyroscope axis. Change turnSign to -1 if left and
    // right are reversed for the way your headband is worn.
    yawAxis: 2,
    turnSign: -1,
    deadZoneDps: 12,
    fullSpeedDps: 90,
    fovChangePerSecond: 28,
    minFieldOfView: 45,
    maxFieldOfView: 120,
    gyroSmoothAmount: 0.2,
    fovSmoothAmount: 0.08
  };

  T.HEAD_PITCH_CONFIG = {
    // Gravity-based head pitch estimate.
    // Change pitchSign to -1 if up and down feel reversed.
    pitchSign: 1,
    pitchSmoothAmount: 0.55,
    velocitySmoothAmount: 0.2,
    neutralSmoothAmount: 0.025,
    movementThresholdDps: 4,
    neutralUpdateVelocityDps: 2,
    fullSpeedDps: 35,
    radiusChangePerSecond: 85,
    minTargetRadius: 35,
    maxTargetRadius: 155,
    radiusSmoothAmount: 0.08
  };

  // Experimental engagement feature: beta power compared with
  // alpha + theta power on the AF7 and AF8 front EEG channels.

  T.FOCUS_CONFIG = {
    sampleRate: 256,
    windowPoints: 512,
    computeIntervalMs: 600,
    // With continuous valid EEG: about 63% of a change in 3s, 95% in 9s.
    smoothingSeconds: 3,
    thetaBand: [4, 7],
    alphaBand: [8, 12],
    betaBand: [13, 30],
    artifactAbsThreshold: 220,
    // Same near-flat threshold as startup screening, in microvolts after centering.
    minSignalRms: 0.5,
    // Allow gentle camera movements; reserve motion rejection for faster turns.
    motionThresholdDps: 45
  };

  T.FISH_SPEED_CONFIG = {
    holdMs: 3000,
    baselineReturnSeconds: 1.5,
    // Restore a broad response, with a lower peak than the original 2.5x speed.
    minMultiplier: 0.45,
    maxMultiplier: 2.1,
    smoothAmount: 0.1
  };

  T.EEG_DISPLAY_CONFIG = {
    channelNames: ["TP9", "AF7", "AF8", "TP10"],
    channelColors: ["#8dd3ff", "#a7f3d0", "#ffd27a", "#ff9fb3"],
    pointCount: 180,
    width: 640,
    height: 280,
    labelWidth: 44,
    rowHeight: 70
  };

  // Muse sends 12 samples per packet; counters wrap after 65535.
  T.EEG_STREAM_CONFIG = { staleMs: 500, samplesPerPacket: 12, maxPackets: 48 };

})(window.ThinkTank);
