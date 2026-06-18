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
    fountainCount: 10,
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
    targetFieldOfView: null,
    lastFrameTime: 0,
    animationFrameId: 0
  };

  function setStatus(message) {
    var status = document.getElementById("museStatus");
    if (status) status.textContent = message;
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
    if (series.length > 512) {
      series.splice(0, series.length - 512);
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
    state.bubbles.visibleUntil = 0;
    for (var fountain = 0; fountain < state.bubbles.fountains.length; fountain += 1) {
      state.bubbles.fountains[fountain].visibleUntil = 0;
    }
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
      if (typeof window.triggerAllBubbleFountains === "function") {
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
    updateBubbles(now, dt);

    if (state.targetFieldOfView === null) {
      state.targetFieldOfView = getAquariumFieldOfView();
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

    if (window.g && g.globals && Number.isFinite(g.globals.fieldOfView)) {
      g.globals.fieldOfView += (state.targetFieldOfView - g.globals.fieldOfView) *
        HEAD_TURN_CONFIG.fovSmoothAmount;

      if (state.connected) {
        var batteryText = Number.isFinite(state.battery) ? " | " + state.battery.toFixed(0) + "%" : "";
        setStatus("Head: " + state.headTurn + " | FOV: " +
          g.globals.fieldOfView.toFixed(0) + " | Blinks: " +
          state.blink.count + batteryText);
      }
    }

    state.animationFrameId = requestAnimationFrame(updateFieldOfView);
  }

  document.addEventListener("DOMContentLoaded", function() {
    var button = document.getElementById("connectMuseButton");
    if (button) button.addEventListener("click", connect);
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
    blinkConfig: BLINK_CONFIG,
    bubbleConfig: BUBBLE_CONFIG,
    connect: connect
  };
})();
