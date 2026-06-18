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

  function updateFieldOfView(time) {
    var dt = state.lastFrameTime ? Math.min((time - state.lastFrameTime) / 1000, 0.1) : 0;
    state.lastFrameTime = time;

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
          g.globals.fieldOfView.toFixed(0) + batteryText);
      }
    }

    state.animationFrameId = requestAnimationFrame(updateFieldOfView);
  }

  document.addEventListener("DOMContentLoaded", function() {
    var button = document.getElementById("connectMuseButton");
    if (button) button.addEventListener("click", connect);
    state.animationFrameId = requestAnimationFrame(updateFieldOfView);
  });

  // Keep sensor and control state inspectable from the browser console.
  window.museAquarium = {
    state: state,
    config: HEAD_TURN_CONFIG,
    connect: connect
  };
})();
