/* ThinkTank: controls/animation.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.updateFishSpeed = function updateFishSpeed() {
    var settings = T.aquariumSettings();
    var now = Date.now();
    var elapsed = T.lastFishSpeedUpdateAt ? Math.max(0, Math.min((now - T.lastFishSpeedUpdateAt) / 1000, 0.1)) : 1 / 60;
    T.lastFishSpeedUpdateAt = now;
    if (T.state.mode === "lab" || T.state.signalChecking || T.tankIntroductionOpen) return;
    if (!settings || !settings.globals || !Number.isFinite(settings.globals.speed)) return;
    if (T.state.baseFishSpeed === null) T.state.baseFishSpeed = settings.globals.speed;
    if (T.state.targetFishSpeed === null) T.state.targetFishSpeed = settings.globals.speed;
    if (settings.fish && T.state.baseFishTailSpeed === null) {
      T.state.baseFishTailSpeed = T.getAquariumFishTailSpeed();
    }
    if (settings.fish && T.state.targetFishTailSpeed === null) {
      T.state.targetFishTailSpeed = T.getAquariumFishTailSpeed();
    }

    var recentEstimate = T.state.connected && T.state.focus.lastComputedAt > 0 &&
      now - T.state.focus.lastComputedAt <= T.FISH_SPEED_CONFIG.holdMs;
    if (recentEstimate) {
      var focusFraction = T.clamp(T.state.focus.index / 100, 0, 1);
      var multiplier = T.lerp(
        T.FISH_SPEED_CONFIG.minMultiplier,
        T.FISH_SPEED_CONFIG.maxMultiplier,
        focusFraction
      );
      T.state.targetFishSpeed = T.state.baseFishSpeed * multiplier;
      if (T.state.baseFishTailSpeed !== null) {
        T.state.targetFishTailSpeed = T.state.baseFishTailSpeed * multiplier;
      }
    } else {
      // A missing estimate is not low engagement. Return only visual controls to baseline.
      T.state.targetFishSpeed = T.state.baseFishSpeed;
      T.state.targetFishTailSpeed = T.state.baseFishTailSpeed;
    }
    var smooth = recentEstimate ? T.FISH_SPEED_CONFIG.smoothAmount :
      1 - Math.exp(-elapsed / T.FISH_SPEED_CONFIG.baselineReturnSeconds);
    settings.globals.speed += (T.state.targetFishSpeed - settings.globals.speed) *
      smooth * T.controlBlend(now);
    if (settings.fish && Number.isFinite(settings.fish.fishTailSpeed) &&
        T.state.targetFishTailSpeed !== null) {
      settings.fish.fishTailSpeed += (T.state.targetFishTailSpeed - settings.fish.fishTailSpeed) *
        smooth * T.controlBlend(now);
    }
  };

})(window.ThinkTank);
