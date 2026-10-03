/* ThinkTank Lab screen navigation. */
(function() {
  "use strict";
  function element(id) { return document.getElementById(id); }
  function show(view) {
    ["labMenu", "labIntro", "labRunning", "labResults", "artifactView", "frequencyView", "frequencyExercise"].forEach(function(id) {
      element(id).hidden = id !== view;
    });
    element("labPanel").classList.toggle("artifactOpen", view === "artifactView");
  }
  window.bciLab = { show: show };
})();
