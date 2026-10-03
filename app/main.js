/* ThinkTank: main.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  document.addEventListener("DOMContentLoaded", async function() {
    if (!await T.rendererStarted) return;
    document.getElementById("connectMuseButton").disabled = false;
    T.setMode("explore");
    document.getElementById("exploreModeButton").addEventListener("click", function() {
      T.setMode("explore");
    });
    document.getElementById("labModeButton").addEventListener("click", function() {
      T.setMode("lab");
    });
    T.showStartPanel("start");
    T.setStartScreenVisible(true);
    T.setMuseStatsVisible(false);
    var button = document.getElementById("connectMuseButton");
    if (button) button.addEventListener("click", T.connect);
    var controlsButton = document.getElementById("controlsButton");
    if (controlsButton) {
      controlsButton.addEventListener("click", function() {
        T.showStartPanel("controls");
      });
    }
    var eegToggleButton = document.getElementById("eegToggleButton");
    if (eegToggleButton) {
      eegToggleButton.addEventListener("click", function() {
        T.setEEGPanelExpanded(eegToggleButton.getAttribute("aria-expanded") !== "true");
      });
    }
    var backButton = document.getElementById("backButton");
    if (backButton) {
      backButton.addEventListener("click", function() {
        T.showStartPanel("start");
      });
    }
    var introductionButton = document.getElementById("introductionButton");
    if (introductionButton) {
      introductionButton.addEventListener("click", function() {
        T.showStartPanel("introduction");
        T.showIntroductionSlide(0);
      });
    }
    var introductionBackButton = document.getElementById("introductionBackButton");
    document.getElementById("tankIntroductionButton").addEventListener("click", T.openTankIntroduction);
    if (introductionBackButton) {
      introductionBackButton.addEventListener("click", function() {
        T.closeIntroduction();
      });
    }
    var introductionPreviousButton = document.getElementById("introductionPreviousButton");
    if (introductionPreviousButton) {
      introductionPreviousButton.addEventListener("click", function() {
        T.showIntroductionSlide(T.introductionSlideIndex - 1);
      });
    }
    var introductionNextButton = document.getElementById("introductionNextButton");
    if (introductionNextButton) {
      introductionNextButton.addEventListener("click", function() {
        var slides = document.querySelectorAll("#introductionPanel .introductionSlide");
        if (T.introductionSlideIndex >= slides.length - 1) {
          T.closeIntroduction();
        } else {
          T.showIntroductionSlide(T.introductionSlideIndex + 1);
        }
      });
    }
    T.showIntroductionSlide(0);
    for (var fountain = 0; fountain < T.BUBBLE_CONFIG.fountainCount; fountain += 1) {
      T.state.bubbles.fountains.push({
        opacity: 0,
        visibleUntil: 0,
        fadeOutMs: T.BUBBLE_CONFIG.minFadeOutMs
      });
    }
    T.state.animationFrameId = requestAnimationFrame(T.updateFieldOfView);
  });

  // Keep sensor and control state inspectable from the browser console.

  window.museAquarium = {
    isBlinkReady: function() {
      return T.state.connected && !T.getAlignedEEG(0, 3,
        T.BLINK_CONFIG.baselinePoints + T.BLINK_CONFIG.recentPoints + 2, Date.now()).reason;
    },
    state: T.state,
    config: T.HEAD_TURN_CONFIG,
    headPitchConfig: T.HEAD_PITCH_CONFIG,
    focusConfig: T.FOCUS_CONFIG,
    fishSpeedConfig: T.FISH_SPEED_CONFIG,
    blinkConfig: T.BLINK_CONFIG,
    bubbleConfig: T.BUBBLE_CONFIG,
    connect: T.connect
  };

})(window.ThinkTank);
