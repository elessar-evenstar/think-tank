/* ThinkTank: state.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.state = {
    mode: "explore",
    connected: false,
    connecting: false,
    device: null,
    controlCharacteristic: null,
    battery: null,
    accelerometer: [null, null, null],
    gyroscope: [null, null, null],
    eeg: [[], [], [], [], []],
    blink: {
      count: 0,
      score: 0,
      aboveThreshold: false,
      lastDetectedAt: 0,
      mode: "idle"
    },
    bubbles: {
      opacity: 0,
      visibleUntil: 0,
      fountains: []
    },
    headTurn: "still",
    smoothedYawDps: 0,
    headPitch: {
      initialized: false,
      pitchDeg: 0,
      neutralPitchDeg: 0,
      relativePitchDeg: 0,
      velocityDps: 0,
      motion: "still",
      lastUpdatedAt: 0
    },
    focus: {
      index: null,
      thetaPower: 0,
      alphaPower: 0,
      betaPower: 0,
      ratio: 0,
      signalQuality: "waiting",
      level: "collecting",
      lastComputedAt: 0,
      lastCheckedAt: 0,
      lastMotionAt: 0
    },
    targetFieldOfView: null,
    targetRadius: null,
    baseFishSpeed: null,
    targetFishSpeed: null,
    baseFishTailSpeed: null,
    targetFishTailSpeed: null,
    lastFrameTime: 0,
    animationFrameId: 0
  };

  T.introductionSlideIndex = 0;

  T.eegPackets = [[], [], [], [], []];

  T.lastEngagementPacketAt = 0;

  T.lastBlinkPacketAt = 0;

  T.statsGoodSince = 0;

  T.tankIntroductionOpen = false;

  T.controlResumeAt = 0;

  T.lastFishSpeedUpdateAt = 0;

})(window.ThinkTank);
