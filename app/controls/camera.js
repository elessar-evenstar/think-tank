/* ThinkTank: controls/camera.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.updateCamera = function updateCamera(now, dt, outputBlend) {
    var settings = T.aquariumSettings();
    if (T.state.targetFieldOfView === null) {
      T.state.targetFieldOfView = T.getAquariumFieldOfView();
    }
    if (T.state.targetRadius === null) {
      T.state.targetRadius = T.getAquariumTargetRadius();
    }

    if (T.state.connected && Math.abs(T.state.smoothedYawDps) > T.HEAD_TURN_CONFIG.deadZoneDps) {
      var turnStrength = Math.min(
        (Math.abs(T.state.smoothedYawDps) - T.HEAD_TURN_CONFIG.deadZoneDps) /
          (T.HEAD_TURN_CONFIG.fullSpeedDps - T.HEAD_TURN_CONFIG.deadZoneDps),
        1
      );
      var direction = T.state.smoothedYawDps < 0 ? -1 : 1;
      T.state.headTurn = direction < 0 ? "left" : "right";
      // Corrected left is negative yaw: widen FOV for left, narrow it for right.
      T.state.targetFieldOfView -= direction * turnStrength *
        T.HEAD_TURN_CONFIG.fovChangePerSecond * dt * outputBlend;
      T.state.targetFieldOfView = Math.max(
        T.HEAD_TURN_CONFIG.minFieldOfView,
        Math.min(T.HEAD_TURN_CONFIG.maxFieldOfView, T.state.targetFieldOfView)
      );
    } else {
      T.state.headTurn = "still";
    }

    if (T.state.connected && T.state.headPitch.motion !== "still") {
      var pitchStrength = Math.min(
        (Math.abs(T.state.headPitch.velocityDps) - T.HEAD_PITCH_CONFIG.movementThresholdDps) /
          (T.HEAD_PITCH_CONFIG.fullSpeedDps - T.HEAD_PITCH_CONFIG.movementThresholdDps),
        1
      );
      var pitchDirection = T.state.headPitch.motion === "up" ? 1 : -1;
      T.state.targetRadius += pitchDirection * pitchStrength *
        T.HEAD_PITCH_CONFIG.radiusChangePerSecond * dt * outputBlend;
      T.state.targetRadius = Math.max(
        T.HEAD_PITCH_CONFIG.minTargetRadius,
        Math.min(T.HEAD_PITCH_CONFIG.maxTargetRadius, T.state.targetRadius)
      );
    }

    if (settings && settings.globals && Number.isFinite(settings.globals.fieldOfView)) {
      settings.globals.fieldOfView += (T.state.targetFieldOfView - settings.globals.fieldOfView) *
        T.HEAD_TURN_CONFIG.fovSmoothAmount * outputBlend;

      if (Number.isFinite(settings.globals.targetRadius)) {
        settings.globals.targetRadius += (T.state.targetRadius - settings.globals.targetRadius) *
          T.HEAD_PITCH_CONFIG.radiusSmoothAmount * outputBlend;
      }

      // Keep the displayed stats frozen in Lab while sensor processing continues.
      if (T.state.connected && T.state.mode === "explore") {
        T.updateStats(now);
      }
    }

  };

})(window.ThinkTank);
