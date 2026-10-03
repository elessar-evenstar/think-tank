/* The upstream renderer only knows this small, optional extension interface. */
(function(T) {
  "use strict";
  var resolveStarted;
  // Resolves false on failure so all startup consumers can stop cleanly.
  T.rendererStarted = new Promise(function(resolve) { resolveStarted = resolve; });
  window.thinkTankAquarium = {
    setupBubbles: T.setupBubbleFountains,
    start: async function(startRenderer) {
      var status = document.getElementById('startupStatus');
      status.textContent = 'Loading aquarium…';
      try {
        await T.loadShaders();
        startRenderer();
        if (!window.gl) throw new Error('WebGL could not be initialized');
        T.aquariumReady = true;
        status.textContent = '';
        resolveStarted(true);
      } catch (error) {
        console.error('ThinkTank startup failed:', error);
        status.textContent = 'Could not start the aquarium. Serve the project root over HTTP and reload. ' + error.message;
        resolveStarted(false);
      }
    },
    afterStart: function(callback) {
      T.rendererStarted.then(function(ok) { if (ok) callback(); });
    }
  };
})(window.ThinkTank);
