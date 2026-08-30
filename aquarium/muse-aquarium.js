/*
 * Muse controls for the aquarium.
 *
 * A Muse connection must begin inside the button click handler because Web
 * Bluetooth requires a user gesture. Turning left narrows the field of view;
 * turning right widens it. The target and displayed values are both smoothed.
 */
(function() {
  "use strict";

  var MUSE_SERVICE = 0xfe8d;
  var CONTROL_CHARACTERISTIC = "273e0001-4c4d-454d-96be-f03bac821358";
  var BATTERY_CHARACTERISTIC = "273e000b-4c4d-454d-96be-f03bac821358";
  var GYROSCOPE_CHARACTERISTIC = "273e0009-4c4d-454d-96be-f03bac821358";
  var ACCELEROMETER_CHARACTERISTIC = "273e000a-4c4d-454d-96be-f03bac821358";
  var EEG_CHARACTERISTICS = [
    "273e0003-4c4d-454d-96be-f03bac821358",
    "273e0004-4c4d-454d-96be-f03bac821358",
    "273e0005-4c4d-454d-96be-f03bac821358",
    "273e0006-4c4d-454d-96be-f03bac821358",
    "273e0007-4c4d-454d-96be-f03bac821358"
  ];

  // These thresholds match the blink detector in the project's main index.html.
  var BLINK_CONFIG = {
    recentPoints: 14,
    baselinePoints: 96,
    minCommonDip: 70,
    minScore: 2.8,
    maxDisagreementRatio: 0.95,
    minChannelDip: 35,
    tpHardBlinkValue: -400,
    cooldownMs: 520,
    releaseCommonDip: 28,
    releaseScore: 1.2
  };

  var BUBBLE_CONFIG = {
    fountainCount: 5,
    fadeInMs: 700,
    minVisibleMs: 1800,
    maxVisibleMs: 4200,
    minFadeOutMs: 900,
    maxFadeOutMs: 2400
  };

  var HEAD_TURN_CONFIG = {
    // Muse yaw is the Z gyroscope axis. Change turnSign to -1 if left and
    // right are reversed for the way your headband is worn.
    yawAxis: 2,
    turnSign: 1,
    deadZoneDps: 12,
    fullSpeedDps: 90,
    fovChangePerSecond: 28,
    minFieldOfView: 45,
    maxFieldOfView: 120,
    gyroSmoothAmount: 0.2,
    fovSmoothAmount: 0.08
  };

  var HEAD_PITCH_CONFIG = {
    // This pitch calculation matches the detector in the main index.html.
    // Change pitchSign to -1 if up and down feel reversed.
    pitchSign: 1,
    pitchSmoothAmount: 0.55,
    velocitySmoothAmount: 0.2,
    neutralSmoothAmount: 0.025,
    movementThresholdDps: 4,
    neutralUpdateVelocityDps: 2,
    fullSpeedDps: 35,
    radiusChangePerSecond: 85,
    minTargetRadius: 35,
    maxTargetRadius: 155,
    radiusSmoothAmount: 0.08
  };

  // Focus detection matches the main index.html: beta power compared with
  // alpha + theta power on the AF7 and AF8 front EEG channels.
  var FOCUS_CONFIG = {
    sampleRate: 256,
    windowPoints: 512,
    computeIntervalMs: 600,
    smoothAlpha: 0.06,
    thetaBand: [4, 7],
    alphaBand: [8, 12],
    betaBand: [13, 30],
    artifactAbsThreshold: 220,
    recentBlinkPenaltyMs: 900
  };

  var FISH_SPEED_CONFIG = {
    minMultiplier: 0.45,
    maxMultiplier: 2.5,
    smoothAmount: 0.1
  };

  var state = {
    connected: false,
    connecting: false,
    device: null,
    controlCharacteristic: null,
    battery: null,
    accelerometer: [null, null, null],
    gyroscope: [null, null, null],
    eeg: [[], [], [], [], []],
    blink: {
      count: 0,
      score: 0,
      aboveThreshold: false,
      lastDetectedAt: 0,
      mode: "idle"
    },
    bubbles: {
      opacity: 0,
      visibleUntil: 0,
      fountains: []
    },
    headTurn: "still",
    smoothedYawDps: 0,
    headPitch: {
      initialized: false,
      pitchDeg: 0,
      neutralPitchDeg: 0,
      relativePitchDeg: 0,
      velocityDps: 0,
      motion: "still",
      lastUpdatedAt: 0
    },
    focus: {
      index: 50,
      thetaPower: 0,
      alphaPower: 0,
      betaPower: 0,
      ratio: 0,
      signalQuality: "waiting",
      level: "medium",
      lastComputedAt: 0
    },
    targetFieldOfView: null,
    targetRadius: null,
    baseFishSpeed: null,
    targetFishSpeed: null,
    baseFishTailSpeed: null,
    targetFishTailSpeed: null,
    lastFrameTime: 0,
    animationFrameId: 0
  };

  function setStatus(message) {
    var status = document.getElementById("museStatus");
    if (status) status.textContent = message;
  }

  function setStartScreenVisible(visible) {
    var startScreen = document.getElementById("startScreen");
    if (!startScreen) return;
    startScreen.style.display = visible ? "flex" : "none";
  }

  function showStartPanel(panelName) {
    var startPanel = document.getElementById("startPanel");
    var controlsPanel = document.getElementById("controlsPanel");
    if (!startPanel || !controlsPanel) return;
    var showingControls = panelName === "controls";
    startPanel.style.display = showingControls ? "none" : "block";
    controlsPanel.style.display = showingControls ? "block" : "none";
  }

  function setMuseStatsVisible(visible) {
    var stats = document.getElementById("museStats");
    if (!stats) return;
    stats.style.display = visible ? "block" : "none";
  }

  function setButtonState(label, disabled) {
    var button = document.getElementById("connectMuseButton");
    if (!button) return;
    button.textContent = label;
    button.disabled = disabled;
  }

  function decodeMotion(event, scale) {
    var data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    var latest = [0, 0, 0];

    // Each notification contains three XYZ samples. Keep the newest sample.
    for (var offset = 2; offset <= 14; offset += 6) {
      latest[0] = scale * data.getInt16(offset);
      latest[1] = scale * data.getInt16(offset + 2);
      latest[2] = scale * data.getInt16(offset + 4);
    }
    return latest;
  }

  function handleBattery(event) {
    var data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    state.battery = data.getUint16(2) / 512;
  }

  function handleAccelerometer(event) {
    state.accelerometer = decodeMotion(event, 0.0000610352);
  }

  function handleGyroscope(event) {
    state.gyroscope = decodeMotion(event, 0.0074768);
    var yawDps = state.gyroscope[HEAD_TURN_CONFIG.yawAxis] * HEAD_TURN_CONFIG.turnSign;
    state.smoothedYawDps += (yawDps - state.smoothedYawDps) * HEAD_TURN_CONFIG.gyroSmoothAmount;
  }

  function decodeEEG(event) {
    var data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    var bytes = new Uint8Array(data.buffer).subarray(2);
    var samples = [];

    for (var i = 0; i < bytes.length; i += 1) {
      if (i % 3 === 0) {
        samples.push((bytes[i] << 4) | (bytes[i + 1] >> 4));
      } else {
        samples.push(((bytes[i] & 0x0f) << 8) | bytes[i + 1]);
        i += 1;
      }
    }
    return samples;
  }

  function handleEEG(channel, event) {
    var decoded = decodeEEG(event);
    var series = state.eeg[channel];
    for (var i = 0; i < decoded.length; i += 1) {
      series.push(0.48828125 * (decoded[i] - 0x800));
    }
    var maxEEGSamples = FOCUS_CONFIG.windowPoints + 32;
    if (series.length > maxEEGSamples) {
      series.splice(0, series.length - maxEEGSamples);
    }
  }

  function encodeCommand(command) {
    var encoded = new TextEncoder().encode("X" + command + "\n");
    encoded[0] = encoded.length - 1;
    return encoded;
  }

  function sendCommand(command) {
    return state.controlCharacteristic.writeValue(encodeCommand(command));
  }

  async function connectNotification(service, characteristicId, handler) {
    var characteristic = await service.getCharacteristic(characteristicId);
    characteristic.addEventListener("characteristicvaluechanged", handler);
    await characteristic.startNotifications();
    return characteristic;
  }

  function handleDisconnect() {
    state.connected = false;
    state.connecting = false;
    state.device = null;
    state.controlCharacteristic = null;
    state.headTurn = "still";
    state.smoothedYawDps = 0;
    state.headPitch.initialized = false;
    state.headPitch.motion = "still";
    state.headPitch.velocityDps = 0;
    state.focus.signalQuality = "waiting";
    state.focus.lastComputedAt = 0;
    state.targetFishSpeed = state.baseFishSpeed;
    state.targetFishTailSpeed = state.baseFishTailSpeed;
    state.bubbles.visibleUntil = 0;
    for (var fountain = 0; fountain < state.bubbles.fountains.length; fountain += 1) {
      state.bubbles.fountains[fountain].visibleUntil = 0;
    }
    showStartPanel("start");
    setStartScreenVisible(true);
    setMuseStatsVisible(false);
    setButtonState("connect muse", false);
    setStatus("Muse disconnected");
  }

  async function connect() {
    if (state.connected || state.connecting) return;

    if (!navigator.bluetooth) {
      setStatus("Web Bluetooth needs Chrome or Edge on localhost");
      return;
    }

    state.connecting = true;
    setButtonState("connecting...", true);
    setStatus("Choose your Muse in the Bluetooth picker");

    try {
      // This call stays in the click-triggered function for Web Bluetooth.
      state.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [MUSE_SERVICE] }]
      });
      state.device.addEventListener("gattserverdisconnected", handleDisconnect);

      var server = await state.device.gatt.connect();
      var service = await server.getPrimaryService(MUSE_SERVICE);

      state.controlCharacteristic = await connectNotification(
        service,
        CONTROL_CHARACTERISTIC,
        function() {}
      );
      await connectNotification(service, BATTERY_CHARACTERISTIC, handleBattery);
      await connectNotification(service, GYROSCOPE_CHARACTERISTIC, handleGyroscope);
      await connectNotification(service, ACCELEROMETER_CHARACTERISTIC, handleAccelerometer);
      for (var channel = 0; channel < EEG_CHARACTERISTICS.length; channel += 1) {
        await connectNotification(
          service,
          EEG_CHARACTERISTICS[channel],
          (function(channelIndex) {
            return function(event) {
              handleEEG(channelIndex, event);
            };
          })(channel)
        );
      }

      // Match the working Muse page's pause, preset, start, and resume sequence.
      await sendCommand("h");
      await sendCommand("p50");
      await sendCommand("s");
      await sendCommand("d");
      await sendCommand("v1");

      state.connected = true;
      state.connecting = false;
      state.targetFieldOfView = getAquariumFieldOfView();
      state.targetRadius = getAquariumTargetRadius();
      state.baseFishSpeed = getAquariumFishSpeed();
      state.targetFishSpeed = state.baseFishSpeed;
      state.baseFishTailSpeed = getAquariumFishTailSpeed();
      state.targetFishTailSpeed = state.baseFishTailSpeed;
      setStartScreenVisible(false);
      setMuseStatsVisible(true);
      setButtonState("muse connected", false);
      setStatus("Turn left to zoom in, right to zoom out");
    } catch (error) {
      console.error("Muse connection failed:", error);
      if (state.device && state.device.gatt.connected) state.device.gatt.disconnect();
      handleDisconnect();
      setStatus(error && error.name === "NotFoundError"
        ? "Muse connection canceled"
        : "Could not connect to Muse");
    }
  }

  function getAquariumFieldOfView() {
    if (window.g && g.globals && Number.isFinite(g.globals.fieldOfView)) {
      return g.globals.fieldOfView;
    }
    return 85;
  }

  function getAquariumTargetRadius() {
    if (window.g && g.globals && Number.isFinite(g.globals.targetRadius)) {
      return g.globals.targetRadius;
    }
    return 88;
  }

  function getAquariumFishSpeed() {
    if (window.g && g.globals && Number.isFinite(g.globals.speed)) {
      return g.globals.speed;
    }
    return 1;
  }

  function getAquariumFishTailSpeed() {
    if (window.g && g.fish && Number.isFinite(g.fish.fishTailSpeed)) {
      return g.fish.fishTailSpeed;
    }
    return 1;
  }

  function detectHeadPitch(now) {
    var ax = state.accelerometer[0];
    var ay = state.accelerometer[1];
    var az = state.accelerometer[2];
    if (![ax, ay, az].every(Number.isFinite)) return;

    var magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
    if (magnitude < 0.000001) return;

    var rawPitchDeg = HEAD_PITCH_CONFIG.pitchSign *
      Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI);
    var pitch = state.headPitch;

    if (!pitch.initialized) {
      pitch.pitchDeg = rawPitchDeg;
      pitch.neutralPitchDeg = rawPitchDeg;
      pitch.relativePitchDeg = 0;
      pitch.velocityDps = 0;
      pitch.motion = "still";
      pitch.lastUpdatedAt = now;
      pitch.initialized = true;
      return;
    }

    var smoothedPitch = pitch.pitchDeg +
      (rawPitchDeg - pitch.pitchDeg) * HEAD_PITCH_CONFIG.pitchSmoothAmount;
    var dt = Math.max(0.016, (now - pitch.lastUpdatedAt) / 1000);
    var rawVelocityDps = (smoothedPitch - pitch.pitchDeg) / dt;
    pitch.velocityDps += (rawVelocityDps - pitch.velocityDps) *
      HEAD_PITCH_CONFIG.velocitySmoothAmount;

    if (Math.abs(pitch.velocityDps) <= HEAD_PITCH_CONFIG.neutralUpdateVelocityDps) {
      pitch.neutralPitchDeg += (smoothedPitch - pitch.neutralPitchDeg) *
        HEAD_PITCH_CONFIG.neutralSmoothAmount;
    }

    pitch.pitchDeg = smoothedPitch;
    pitch.relativePitchDeg = smoothedPitch - pitch.neutralPitchDeg;
    pitch.motion = "still";
    if (pitch.velocityDps >= HEAD_PITCH_CONFIG.movementThresholdDps) {
      pitch.motion = "up";
    } else if (pitch.velocityDps <= -HEAD_PITCH_CONFIG.movementThresholdDps) {
      pitch.motion = "down";
    }
    pitch.lastUpdatedAt = now;
  }

  function meanFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var total = 0;
    var samples = 0;
    for (var i = start; i < end; i += 1) {
      if (!Number.isFinite(series[i])) continue;
      total += series[i];
      samples += 1;
    }
    return samples ? total / samples : 0;
  }

  function minFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    var min = Infinity;
    for (var i = start; i < end; i += 1) {
      if (Number.isFinite(series[i]) && series[i] < min) min = series[i];
    }
    return min === Infinity ? 0 : min;
  }

  function stdFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var mean = meanFromEnd(series, count, offset);
    var total = 0;
    var samples = 0;
    for (var i = start; i < end; i += 1) {
      if (!Number.isFinite(series[i])) continue;
      total += (series[i] - mean) * (series[i] - mean);
      samples += 1;
    }
    return samples ? Math.sqrt(total / samples) : 0;
  }

  function windowFromEnd(series, count, offset) {
    var end = Math.max(0, series.length - (offset || 0));
    var start = Math.max(0, end - count);
    var window = [];
    for (var i = start; i < end; i += 1) {
      if (Number.isFinite(series[i])) window.push(series[i]);
    }
    return window;
  }

  function combineWindows(windows) {
    var minLength = Infinity;
    for (var windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
      minLength = Math.min(minLength, windows[windowIndex].length);
    }
    if (!Number.isFinite(minLength) || minLength <= 0) return [];

    var combined = new Array(minLength);
    for (var i = 0; i < minLength; i += 1) {
      var total = 0;
      var samples = 0;
      for (var w = 0; w < windows.length; w += 1) {
        var source = windows[w];
        var value = source[source.length - minLength + i];
        if (!Number.isFinite(value)) continue;
        total += value;
        samples += 1;
      }
      combined[i] = samples ? total / samples : 0;
    }
    return combined;
  }

  function removeMean(series) {
    if (!series.length) return [];
    var total = 0;
    for (var i = 0; i < series.length; i += 1) total += series[i];
    var mean = total / series.length;
    var centered = [];
    for (var j = 0; j < series.length; j += 1) centered.push(series[j] - mean);
    return centered;
  }

  function applyHannWindow(series) {
    var n = series.length;
    if (n <= 1) return series.slice();
    var windowed = [];
    for (var i = 0; i < n; i += 1) {
      var weight = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      windowed.push(series[i] * weight);
    }
    return windowed;
  }

  function estimateBandPower(series, sampleRate, lowHz, highHz) {
    var n = series.length;
    if (!n) return 0;
    var power = 0;
    var minK = Math.max(1, Math.ceil((lowHz * n) / sampleRate));
    var maxK = Math.max(minK, Math.floor((highHz * n) / sampleRate));

    for (var k = minK; k <= maxK; k += 1) {
      var re = 0;
      var im = 0;
      for (var i = 0; i < n; i += 1) {
        var angle = (2 * Math.PI * k * i) / n;
        re += series[i] * Math.cos(angle);
        im -= series[i] * Math.sin(angle);
      }
      power += (re * re + im * im) / (n * n);
    }
    return power;
  }

  function maxAbsFromEnd(series, count, offset) {
    var end = series.length - (offset || 0);
    var start = Math.max(0, end - count);
    if (end <= start) return 0;
    var found = false;
    var maxAbs = 0;
    for (var i = start; i < end; i += 1) {
      var value = series[i];
      if (!Number.isFinite(value)) continue;
      maxAbs = Math.max(maxAbs, Math.abs(value));
      found = true;
    }
    return found ? maxAbs : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, alpha) {
    return a + (b - a) * alpha;
  }

  function focusLevelFromIndex(index) {
    if (index >= 67) return "high";
    if (index >= 40) return "medium";
    return "low";
  }

  function detectFocus(now) {
    if (now - state.focus.lastComputedAt < FOCUS_CONFIG.computeIntervalMs) return;

    var af7 = state.eeg[1];
    var af8 = state.eeg[2];
    var needed = FOCUS_CONFIG.windowPoints + 8;
    if (Math.min(af7.length, af8.length) < needed) return;

    var af7Window = windowFromEnd(af7, FOCUS_CONFIG.windowPoints);
    var af8Window = windowFromEnd(af8, FOCUS_CONFIG.windowPoints);
    if (!af7Window.length || !af8Window.length) return;

    var combined = combineWindows([af7Window, af8Window]);
    var prepped = applyHannWindow(removeMean(combined));
    var thetaPower = estimateBandPower(
      prepped,
      FOCUS_CONFIG.sampleRate,
      FOCUS_CONFIG.thetaBand[0],
      FOCUS_CONFIG.thetaBand[1]
    );
    var alphaPower = estimateBandPower(
      prepped,
      FOCUS_CONFIG.sampleRate,
      FOCUS_CONFIG.alphaBand[0],
      FOCUS_CONFIG.alphaBand[1]
    );
    var betaPower = estimateBandPower(
      prepped,
      FOCUS_CONFIG.sampleRate,
      FOCUS_CONFIG.betaBand[0],
      FOCUS_CONFIG.betaBand[1]
    );

    var denominator = alphaPower + thetaPower + 0.000001;
    var ratio = betaPower / denominator;
    var ratioClamped = clamp(ratio, 0.2, 2.6);
    var rawIndex = 100 * (ratioClamped - 0.2) / (2.6 - 0.2);

    var recentMaxAbs = Math.max(maxAbsFromEnd(af7, 48), maxAbsFromEnd(af8, 48));
    var artifactPenalty = recentMaxAbs > FOCUS_CONFIG.artifactAbsThreshold
      ? clamp((recentMaxAbs - FOCUS_CONFIG.artifactAbsThreshold) / 220, 0, 0.55)
      : 0;
    var blinkPenalty = now - state.blink.lastDetectedAt <= FOCUS_CONFIG.recentBlinkPenaltyMs
      ? 0.18
      : 0;
    var motionAmount = Math.max(
      Math.abs(state.smoothedYawDps || 0),
      Math.abs(state.headPitch.velocityDps || 0)
    );
    var motionPenalty = clamp(motionAmount / 160, 0, 0.2);
    rawIndex = rawIndex * (1 - artifactPenalty) * (1 - blinkPenalty) * (1 - motionPenalty);
    rawIndex = clamp(rawIndex, 0, 100);

    state.focus.index = lerp(state.focus.index, rawIndex, FOCUS_CONFIG.smoothAlpha);
    state.focus.thetaPower = thetaPower;
    state.focus.alphaPower = alphaPower;
    state.focus.betaPower = betaPower;
    state.focus.ratio = ratio;
    state.focus.signalQuality = artifactPenalty >= 0.45
      ? "noisy"
      : (artifactPenalty >= 0.18 ? "fair" : "good");
    state.focus.level = focusLevelFromIndex(state.focus.index);
    state.focus.lastComputedAt = now;
  }

  function updateFishSpeed() {
    if (!window.g || !g.globals || !Number.isFinite(g.globals.speed)) return;
    if (state.baseFishSpeed === null) state.baseFishSpeed = g.globals.speed;
    if (state.targetFishSpeed === null) state.targetFishSpeed = g.globals.speed;
    if (g.fish && state.baseFishTailSpeed === null) {
      state.baseFishTailSpeed = getAquariumFishTailSpeed();
    }
    if (g.fish && state.targetFishTailSpeed === null) {
      state.targetFishTailSpeed = getAquariumFishTailSpeed();
    }

    if (state.connected && state.focus.lastComputedAt) {
      var focusFraction = clamp(state.focus.index / 100, 0, 1);
      var multiplier = lerp(
        FISH_SPEED_CONFIG.minMultiplier,
        FISH_SPEED_CONFIG.maxMultiplier,
        focusFraction
      );
      state.targetFishSpeed = state.baseFishSpeed * multiplier;
      if (state.baseFishTailSpeed !== null) {
        state.targetFishTailSpeed = state.baseFishTailSpeed * multiplier;
      }
    }

    g.globals.speed += (state.targetFishSpeed - g.globals.speed) *
      FISH_SPEED_CONFIG.smoothAmount;
    if (g.fish && Number.isFinite(g.fish.fishTailSpeed) &&
        state.targetFishTailSpeed !== null) {
      g.fish.fishTailSpeed += (state.targetFishTailSpeed - g.fish.fishTailSpeed) *
        FISH_SPEED_CONFIG.smoothAmount;
    }
  }

  function detectBlink(now) {
    var tp9 = state.eeg[0];
    var tp10 = state.eeg[3];
    var minLength = BLINK_CONFIG.baselinePoints + BLINK_CONFIG.recentPoints + 2;
    if (Math.min(tp9.length, tp10.length) < minLength) return;

    var tp9Baseline = meanFromEnd(tp9, BLINK_CONFIG.baselinePoints, BLINK_CONFIG.recentPoints);
    var tp10Baseline = meanFromEnd(tp10, BLINK_CONFIG.baselinePoints, BLINK_CONFIG.recentPoints);
    var tp9RecentMin = minFromEnd(tp9, BLINK_CONFIG.recentPoints, 0);
    var tp10RecentMin = minFromEnd(tp10, BLINK_CONFIG.recentPoints, 0);
    var tp9Dip = Math.max(0, tp9Baseline - tp9RecentMin);
    var tp10Dip = Math.max(0, tp10Baseline - tp10RecentMin);
    var commonDip = (tp9Dip + tp10Dip) / 2;
    var disagreement = Math.abs(tp9Dip - tp10Dip);
    var noise = Math.max(12,
      (stdFromEnd(tp9, BLINK_CONFIG.baselinePoints, BLINK_CONFIG.recentPoints) +
       stdFromEnd(tp10, BLINK_CONFIG.baselinePoints, BLINK_CONFIG.recentPoints)) / 2);
    var score = commonDip / noise;
    var tpMostNegative = Math.min(tp9RecentMin, tp10RecentMin);
    var hardBlink = tpMostNegative <= BLINK_CONFIG.tpHardBlinkValue;
    var dipBlink = commonDip >= BLINK_CONFIG.minCommonDip &&
      tp9Dip >= BLINK_CONFIG.minChannelDip &&
      tp10Dip >= BLINK_CONFIG.minChannelDip &&
      score >= BLINK_CONFIG.minScore &&
      disagreement <= Math.max(14, commonDip * BLINK_CONFIG.maxDisagreementRatio);
    var enterThreshold = hardBlink || dipBlink;
    var stayAbove = state.blink.aboveThreshold &&
      (hardBlink || (commonDip >= BLINK_CONFIG.releaseCommonDip &&
        score >= BLINK_CONFIG.releaseScore));
    var aboveThreshold = enterThreshold || stayAbove;

    state.blink.score = Number.isFinite(score) ? score : 0;
    state.blink.mode = hardBlink ? "tp-hard" : (dipBlink ? "tp-dip" : "idle");

    if (enterThreshold && !state.blink.aboveThreshold &&
        now - state.blink.lastDetectedAt >= BLINK_CONFIG.cooldownMs) {
      var shouldStartBubbles = state.bubbles.opacity < 0.05 && now >= state.bubbles.visibleUntil;
      state.blink.count += 1;
      state.blink.lastDetectedAt = now;
      state.bubbles.visibleUntil = 0;
      for (var fountain = 0; fountain < state.bubbles.fountains.length; fountain += 1) {
        var fountainState = state.bubbles.fountains[fountain];
        fountainState.visibleUntil = now + randomBetween(
          BUBBLE_CONFIG.minVisibleMs,
          BUBBLE_CONFIG.maxVisibleMs
        );
        fountainState.fadeOutMs = randomBetween(
          BUBBLE_CONFIG.minFadeOutMs,
          BUBBLE_CONFIG.maxFadeOutMs
        );
        state.bubbles.visibleUntil = Math.max(
          state.bubbles.visibleUntil,
          fountainState.visibleUntil
        );
      }
      if (shouldStartBubbles && typeof window.triggerAllBubbleFountains === "function") {
        window.triggerAllBubbleFountains();
      }
    }
    state.blink.aboveThreshold = aboveThreshold;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function updateBubbles(now, dt) {
    var opacities = [];
    var maxOpacity = 0;
    for (var fountain = 0; fountain < state.bubbles.fountains.length; fountain += 1) {
      var fountainState = state.bubbles.fountains[fountain];
      var targetOpacity = now < fountainState.visibleUntil ? 1 : 0;
      if (targetOpacity > fountainState.opacity) {
        fountainState.opacity = Math.min(1,
          fountainState.opacity + dt * 1000 / BUBBLE_CONFIG.fadeInMs);
      } else {
        fountainState.opacity = Math.max(0,
          fountainState.opacity - dt * 1000 / fountainState.fadeOutMs);
      }
      opacities.push(fountainState.opacity);
      maxOpacity = Math.max(maxOpacity, fountainState.opacity);
    }
    state.bubbles.opacity = maxOpacity;

    if (typeof window.setBubbleOpacities === "function") {
      window.setBubbleOpacities(opacities);
    }
  }

  function updateFieldOfView(time) {
    var dt = state.lastFrameTime ? Math.min((time - state.lastFrameTime) / 1000, 0.1) : 0;
    state.lastFrameTime = time;
    var now = Date.now();

    if (state.connected) detectBlink(now);
    if (state.connected) detectHeadPitch(now);
    if (state.connected) detectFocus(now);
    updateBubbles(now, dt);

    if (state.targetFieldOfView === null) {
      state.targetFieldOfView = getAquariumFieldOfView();
    }
    if (state.targetRadius === null) {
      state.targetRadius = getAquariumTargetRadius();
    }

    if (state.connected && Math.abs(state.smoothedYawDps) > HEAD_TURN_CONFIG.deadZoneDps) {
      var turnStrength = Math.min(
        (Math.abs(state.smoothedYawDps) - HEAD_TURN_CONFIG.deadZoneDps) /
          (HEAD_TURN_CONFIG.fullSpeedDps - HEAD_TURN_CONFIG.deadZoneDps),
        1
      );
      var direction = state.smoothedYawDps < 0 ? -1 : 1;
      state.headTurn = direction < 0 ? "left" : "right";
      state.targetFieldOfView += direction * turnStrength *
        HEAD_TURN_CONFIG.fovChangePerSecond * dt;
      state.targetFieldOfView = Math.max(
        HEAD_TURN_CONFIG.minFieldOfView,
        Math.min(HEAD_TURN_CONFIG.maxFieldOfView, state.targetFieldOfView)
      );
    } else {
      state.headTurn = "still";
    }

    if (state.connected && state.headPitch.motion !== "still") {
      var pitchStrength = Math.min(
        (Math.abs(state.headPitch.velocityDps) - HEAD_PITCH_CONFIG.movementThresholdDps) /
          (HEAD_PITCH_CONFIG.fullSpeedDps - HEAD_PITCH_CONFIG.movementThresholdDps),
        1
      );
      var pitchDirection = state.headPitch.motion === "up" ? 1 : -1;
      state.targetRadius += pitchDirection * pitchStrength *
        HEAD_PITCH_CONFIG.radiusChangePerSecond * dt;
      state.targetRadius = Math.max(
        HEAD_PITCH_CONFIG.minTargetRadius,
        Math.min(HEAD_PITCH_CONFIG.maxTargetRadius, state.targetRadius)
      );
    }

    if (window.g && g.globals && Number.isFinite(g.globals.fieldOfView)) {
      g.globals.fieldOfView += (state.targetFieldOfView - g.globals.fieldOfView) *
        HEAD_TURN_CONFIG.fovSmoothAmount;

      if (Number.isFinite(g.globals.targetRadius)) {
        g.globals.targetRadius += (state.targetRadius - g.globals.targetRadius) *
          HEAD_PITCH_CONFIG.radiusSmoothAmount;
      }

      if (state.connected) {
        var batteryText = Number.isFinite(state.battery) ? " | " + state.battery.toFixed(0) + "%" : "";
        var radiusText = Number.isFinite(g.globals.targetRadius)
          ? " | Radius: " + g.globals.targetRadius.toFixed(0)
          : "";
        var speedText = Number.isFinite(g.globals.speed)
          ? " | Speed: " + g.globals.speed.toFixed(2)
          : "";
        setStatus("Turn: " + state.headTurn + " | Pitch: " + state.headPitch.motion +
          " | FOV: " + g.globals.fieldOfView.toFixed(0) + radiusText +
          " | Focus: " + state.focus.index.toFixed(0) + speedText + " | Blinks: " +
          state.blink.count + batteryText);
      }
    }
    updateFishSpeed();

    state.animationFrameId = requestAnimationFrame(updateFieldOfView);
  }

  document.addEventListener("DOMContentLoaded", function() {
    showStartPanel("start");
    setStartScreenVisible(true);
    setMuseStatsVisible(false);
    var button = document.getElementById("connectMuseButton");
    if (button) button.addEventListener("click", connect);
    var controlsButton = document.getElementById("controlsButton");
    if (controlsButton) {
      controlsButton.addEventListener("click", function() {
        showStartPanel("controls");
      });
    }
    var backButton = document.getElementById("backButton");
    if (backButton) {
      backButton.addEventListener("click", function() {
        showStartPanel("start");
      });
    }
    for (var fountain = 0; fountain < BUBBLE_CONFIG.fountainCount; fountain += 1) {
      state.bubbles.fountains.push({
        opacity: 0,
        visibleUntil: 0,
        fadeOutMs: BUBBLE_CONFIG.minFadeOutMs
      });
    }
    state.animationFrameId = requestAnimationFrame(updateFieldOfView);
  });

  // Keep sensor and control state inspectable from the browser console.
  window.museAquarium = {
    state: state,
    config: HEAD_TURN_CONFIG,
    headPitchConfig: HEAD_PITCH_CONFIG,
    focusConfig: FOCUS_CONFIG,
    fishSpeedConfig: FISH_SPEED_CONFIG,
    blinkConfig: BLINK_CONFIG,
    bubbleConfig: BUBBLE_CONFIG,
    connect: connect
  };
})();
