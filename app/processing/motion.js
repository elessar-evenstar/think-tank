/* ThinkTank: processing/motion.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.detectHeadPitch = function detectHeadPitch(now) {
    var ax = T.state.accelerometer[0];
    var ay = T.state.accelerometer[1];
    var az = T.state.accelerometer[2];
    if (![ax, ay, az].every(Number.isFinite)) return;

    var magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    if (magnitude < 0.000001) return;

    var rawPitchDeg = T.HEAD_PITCH_CONFIG.pitchSign *
      Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);
    var pitch = T.state.headPitch;

    if (!pitch.initialized) {
      pitch.pitchDeg = rawPitchDeg;
      pitch.neutralPitchDeg = rawPitchDeg;
      pitch.relativePitchDeg = 0;
      pitch.velocityDps = 0;
      pitch.motion = "still";
      pitch.lastUpdatedAt = now;
      pitch.initialized = true;
      return;
    }

    var smoothedPitch = pitch.pitchDeg +
      (rawPitchDeg - pitch.pitchDeg) * T.HEAD_PITCH_CONFIG.pitchSmoothAmount;
    var dt = Math.max(0.016, (now - pitch.lastUpdatedAt) / 1000);
    var rawVelocityDps = (smoothedPitch - pitch.pitchDeg) / dt;
    pitch.velocityDps += (rawVelocityDps - pitch.velocityDps) *
      T.HEAD_PITCH_CONFIG.velocitySmoothAmount;

    if (Math.abs(pitch.velocityDps) <= T.HEAD_PITCH_CONFIG.neutralUpdateVelocityDps) {
      pitch.neutralPitchDeg += (smoothedPitch - pitch.neutralPitchDeg) *
        T.HEAD_PITCH_CONFIG.neutralSmoothAmount;
    }

    pitch.pitchDeg = smoothedPitch;
    pitch.relativePitchDeg = smoothedPitch - pitch.neutralPitchDeg;
    pitch.motion = "still";
    if (pitch.velocityDps >= T.HEAD_PITCH_CONFIG.movementThresholdDps) {
      pitch.motion = "up";
    } else if (pitch.velocityDps <= -T.HEAD_PITCH_CONFIG.movementThresholdDps) {
      pitch.motion = "down";
    }
    pitch.lastUpdatedAt = now;
  };

})(window.ThinkTank);
