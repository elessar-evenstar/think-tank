/* ThinkTank: processing/blink-detector.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.detectBlink = function detectBlink(now) {
    var minLength = T.BLINK_CONFIG.baselinePoints + T.BLINK_CONFIG.recentPoints + 2;
    var aligned = T.getAlignedEEG(0, 3, minLength, now);
    if (aligned.reason) {
      T.state.blink.mode = aligned.reason;
      T.state.blink.aboveThreshold = false;
      return;
    }
    if (aligned.at <= T.lastBlinkPacketAt) return;
    T.lastBlinkPacketAt = aligned.at;
    var tp9 = aligned.first;
    var tp10 = aligned.second;

    var tp9Baseline = T.meanFromEnd(tp9, T.BLINK_CONFIG.baselinePoints, T.BLINK_CONFIG.recentPoints);
    var tp10Baseline = T.meanFromEnd(tp10, T.BLINK_CONFIG.baselinePoints, T.BLINK_CONFIG.recentPoints);
    var tp9RecentMin = T.minFromEnd(tp9, T.BLINK_CONFIG.recentPoints, 0);
    var tp10RecentMin = T.minFromEnd(tp10, T.BLINK_CONFIG.recentPoints, 0);
    var tp9Dip = Math.max(0, tp9Baseline - tp9RecentMin);
    var tp10Dip = Math.max(0, tp10Baseline - tp10RecentMin);
    var commonDip = (tp9Dip + tp10Dip) / 2;
    var disagreement = Math.abs(tp9Dip - tp10Dip);
    var noise = Math.max(12,
      (T.stdFromEnd(tp9, T.BLINK_CONFIG.baselinePoints, T.BLINK_CONFIG.recentPoints) +
       T.stdFromEnd(tp10, T.BLINK_CONFIG.baselinePoints, T.BLINK_CONFIG.recentPoints)) / 2);
    var score = commonDip / noise;
    var tpMostNegative = Math.min(tp9RecentMin, tp10RecentMin);
    var hardBlink = tpMostNegative <= T.BLINK_CONFIG.tpHardBlinkValue;
    var dipBlink = commonDip >= T.BLINK_CONFIG.minCommonDip &&
      tp9Dip >= T.BLINK_CONFIG.minChannelDip &&
      tp10Dip >= T.BLINK_CONFIG.minChannelDip &&
      score >= T.BLINK_CONFIG.minScore &&
      disagreement <= Math.max(14, commonDip * T.BLINK_CONFIG.maxDisagreementRatio);
    var enterThreshold = hardBlink || dipBlink;
    var stayAbove = T.state.blink.aboveThreshold &&
      (hardBlink || (commonDip >= T.BLINK_CONFIG.releaseCommonDip &&
        score >= T.BLINK_CONFIG.releaseScore));
    var aboveThreshold = enterThreshold || stayAbove;

    T.state.blink.score = Number.isFinite(score) ? score : 0;
    T.state.blink.mode = hardBlink ? "tp-hard" : (dipBlink ? "tp-dip" : "idle");

    if (enterThreshold && !T.state.blink.aboveThreshold &&
        now - T.state.blink.lastDetectedAt >= T.BLINK_CONFIG.cooldownMs) {
      var shouldStartBubbles = T.state.bubbles.opacity < 0.05 && now >= T.state.bubbles.visibleUntil;
      T.state.blink.count += 1;
      T.state.blink.lastDetectedAt = now;
      // Lab scores detector events separately from aquarium effects.
      document.dispatchEvent(new CustomEvent("museblink", { detail: { time: performance.now() } }));
      T.respondToBlink(now, shouldStartBubbles);
    }
    T.state.blink.aboveThreshold = aboveThreshold;
  };

})(window.ThinkTank);
