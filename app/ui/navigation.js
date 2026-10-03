/* ThinkTank: ui/navigation.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.openTankIntroduction = function openTankIntroduction() {
    T.openTankPanel("introduction", "tankIntroductionButton", "introductionBackButton");
  };

  T.openTankPanel = function openTankPanel(panelName, shortcutId, backId) {
    if (!T.state.connected || T.state.signalChecking || T.state.mode !== "explore") return;
    // Track panel navigation and hide overlapping UI, without pausing Muse controls.
    T.tankIntroductionOpen = true;
    T.tankPanelShortcut = shortcutId;
    document.body.classList.add("tankIntroductionOpen");
    document.getElementById("exploreModeButton").disabled = true;
    document.getElementById("labModeButton").disabled = true;
    document.getElementById("introductionBackButton").textContent = "Back to Tank";
    document.getElementById("backButton").textContent = "Back to Tank";
    T.showStartPanel(panelName); T.showIntroductionSlide(0); T.setStartScreenVisible(true);
    if (panelName === "eeg") T.updateEEGDisplay();
    document.getElementById(backId).focus();
  };

  T.closeIntroduction = function closeIntroduction() {
    if (!T.tankIntroductionOpen) {
      document.getElementById("backButton").textContent = "back";
      T.showStartPanel("start"); return;
    }
    T.tankIntroductionOpen = false;
    document.body.classList.remove("tankIntroductionOpen");
    // Controls stayed live, so keep their targets and ongoing bubbles unchanged.
    T.setStartScreenVisible(false); T.setMode("explore");
    document.getElementById("introductionBackButton").textContent = "back";
    document.getElementById("backButton").textContent = "back";
    document.getElementById(T.tankPanelShortcut || "tankIntroductionButton").focus();
  };

  T.setStartScreenVisible = function setStartScreenVisible(visible) {
    var startScreen = document.getElementById("startScreen");
    if (!startScreen) return;
    startScreen.style.display = visible ? "flex" : "none";
  };

  T.showStartPanel = function showStartPanel(panelName) {
    document.getElementById("backButton").textContent = T.tankIntroductionOpen ? "Back to Tank" : "back";
    var startPanel = document.getElementById("startPanel");
    var controlsPanel = document.getElementById("controlsPanel");
    var introductionPanel = document.getElementById("introductionPanel");
    if (!startPanel || !controlsPanel || !introductionPanel) return;
    var showingControls = panelName === "controls";
    var showingIntroduction = panelName === "introduction";
    startPanel.style.display = showingControls || showingIntroduction || panelName === "eeg" ? "none" : "block";
    document.getElementById("eegPanel").style.display = panelName === "eeg" ? "block" : "none";
    controlsPanel.style.display = showingControls ? "block" : "none";
    introductionPanel.style.display = showingIntroduction ? "block" : "none";
  };

  T.showIntroductionSlide = function showIntroductionSlide(index) {
    var slides = document.querySelectorAll("#introductionPanel .introductionSlide");
    if (!slides.length) return;

    T.introductionSlideIndex = Math.max(0, Math.min(index, slides.length - 1));
    for (var slide = 0; slide < slides.length; slide += 1) {
      slides[slide].classList.toggle("active", slide === T.introductionSlideIndex);
    }

    var previousButton = document.getElementById("introductionPreviousButton");
    var nextButton = document.getElementById("introductionNextButton");
    var progress = document.getElementById("introductionProgress");
    if (previousButton) previousButton.disabled = T.introductionSlideIndex === 0;
    if (nextButton) {
      nextButton.textContent = T.introductionSlideIndex === slides.length - 1 ? "Done" : "Next";
    }
    if (progress) progress.textContent = (T.introductionSlideIndex + 1) + " / " + slides.length;
  };

  T.setMode = function setMode(mode) {
    if ((T.state.signalChecking || T.tankIntroductionOpen) && T.state.connected) return;
    if (mode !== "explore" && mode !== "lab") return;
    var nextMode = T.state.connected ? mode : "explore";
    var modeChanged = nextMode !== T.state.mode;
    if (nextMode !== T.state.mode) {
      // Discard pending visual targets, not sensor history. Resume from what is visible.
      T.state.targetFieldOfView = T.getAquariumFieldOfView();
      T.state.targetRadius = T.getAquariumTargetRadius();
      T.state.targetFishSpeed = T.getAquariumFishSpeed();
      T.state.targetFishTailSpeed = T.getAquariumFishTailSpeed();
      T.controlResumeAt = nextMode === "explore" && T.state.connected ? Date.now() : 0;
      if (nextMode === "explore") {
        // Lab blinks are never queued. Existing bubbles fade from their frozen opacity.
        T.state.bubbles.visibleUntil = 0;
        T.state.bubbles.fountains.forEach(function(fountain) { fountain.visibleUntil = 0; });
      }
    }
    // Mode changes require an active Muse connection; disconnect returns to Explore.
    T.state.mode = nextMode;
    var explore = document.getElementById("exploreModeButton");
    var lab = document.getElementById("labModeButton");
    var screen = document.getElementById("labScreen");
    if (explore) {
      explore.disabled = !T.state.connected;
      explore.setAttribute("aria-pressed", String(T.state.mode === "explore"));
    }
    if (lab) {
      lab.disabled = !T.state.connected;
      lab.setAttribute("aria-pressed", String(T.state.mode === "lab"));
    }
    if (screen) screen.hidden = T.state.mode !== "lab";
    var introShortcut = document.getElementById("tankIntroductionButton");
    if (introShortcut) introShortcut.disabled = !T.state.connected || T.state.mode !== "explore";
    ["tankControlsButton", "tankEEGButton"].forEach(function(id) {
      document.getElementById(id).disabled = !T.state.connected || T.state.mode !== "explore";
    });
    if (modeChanged) document.dispatchEvent(new CustomEvent("musemodechange", { detail: T.state.mode }));
  };

})(window.ThinkTank);
