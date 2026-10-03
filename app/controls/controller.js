/* ThinkTank: controls/controller.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.controlBlend = function controlBlend(now) {
    if (T.state.mode === "lab" || T.state.signalChecking || T.tankIntroductionOpen) return 0;
    if (!T.controlResumeAt) return 1;
    // Ease live control back in over 1.5 seconds after leaving Lab.
    var progress = T.clamp((now - T.controlResumeAt) / 1500, 0, 1);
    return progress * progress * (3 - 2 * progress);
  };

  T.updateFieldOfView = function updateFieldOfView(time) {
    var dt = T.state.lastFrameTime ? Math.min((time - T.state.lastFrameTime) / 1000, 0.1) : 0;
    T.state.lastFrameTime = time;
    var now = Date.now();
    var outputBlend = T.controlBlend(now);

    if (T.state.connected) T.detectBlink(now);
    if (T.state.connected) T.detectHeadPitch(now);
    if (T.state.connected) T.detectFocus(now);
    T.updateBubbles(now, dt);

    T.updateCamera(now, dt, outputBlend);
    T.updateFishSpeed();
    T.state.animationFrameId = requestAnimationFrame(T.updateFieldOfView);
  };
})(window.ThinkTank);
