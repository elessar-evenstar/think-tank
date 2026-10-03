/* ThinkTank: controls/bubbles.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.randomBetween = function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  };

  T.updateBubbles = function updateBubbles(now, dt) {
    if (T.state.mode === "lab" || T.state.signalChecking || T.tankIntroductionOpen) return;
    dt *= T.controlBlend(now);
    var opacities = [];
    var maxOpacity = 0;
    for (var fountain = 0; fountain < T.state.bubbles.fountains.length; fountain += 1) {
      var fountainState = T.state.bubbles.fountains[fountain];
      var targetOpacity = now < fountainState.visibleUntil ? 1 : 0;
      if (targetOpacity > fountainState.opacity) {
        fountainState.opacity = Math.min(1,
          fountainState.opacity + dt * 1000 / T.BUBBLE_CONFIG.fadeInMs);
      } else {
        fountainState.opacity = Math.max(0,
          fountainState.opacity - dt * 1000 / fountainState.fadeOutMs);
      }
      opacities.push(fountainState.opacity);
      maxOpacity = Math.max(maxOpacity, fountainState.opacity);
    }
    T.state.bubbles.opacity = maxOpacity;

    if (typeof T.setBubbleOpacities === "function") {
      T.setBubbleOpacities(opacities);
    }
  };

  T.respondToBlink = function(now, shouldStartBubbles) {
      // Keep detection active in Lab, without changing fountain state or emitters.
      if (T.state.mode === "lab" || T.state.signalChecking || T.tankIntroductionOpen) {
        return;
      }
      T.state.bubbles.visibleUntil = 0;
      for (var fountain = 0; fountain < T.state.bubbles.fountains.length; fountain += 1) {
        var fountainState = T.state.bubbles.fountains[fountain];
        fountainState.visibleUntil = now + T.randomBetween(
          T.BUBBLE_CONFIG.minVisibleMs,
          T.BUBBLE_CONFIG.maxVisibleMs
        );
        fountainState.fadeOutMs = T.randomBetween(
          T.BUBBLE_CONFIG.minFadeOutMs,
          T.BUBBLE_CONFIG.maxFadeOutMs
        );
        T.state.bubbles.visibleUntil = Math.max(
          T.state.bubbles.visibleUntil,
          fountainState.visibleUntil
        );
      }
      if (shouldStartBubbles && typeof T.triggerAllBubbleFountains === "function") {
        T.triggerAllBubbleFountains();
      }
  };
})(window.ThinkTank);
