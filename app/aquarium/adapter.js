/* ThinkTank: aquarium/adapter.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.getAquariumFieldOfView = function getAquariumFieldOfView() {
    if (window.g && g.globals && Number.isFinite(g.globals.fieldOfView)) {
      return g.globals.fieldOfView;
    }
    return 85;
  };

  T.getAquariumTargetRadius = function getAquariumTargetRadius() {
    if (window.g && g.globals && Number.isFinite(g.globals.targetRadius)) {
      return g.globals.targetRadius;
    }
    return 88;
  };

  T.getAquariumFishSpeed = function getAquariumFishSpeed() {
    if (window.g && g.globals && Number.isFinite(g.globals.speed)) {
      return g.globals.speed;
    }
    return 1;
  };

  T.getAquariumFishTailSpeed = function getAquariumFishTailSpeed() {
    if (window.g && g.fish && Number.isFinite(g.fish.fishTailSpeed)) {
      return g.fish.fishTailSpeed;
    }
    return 1;
  };

  T.aquariumSettings = function() { return window.g; };
})(window.ThinkTank);
