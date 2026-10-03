/* ThinkTank: muse/connection.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.handleBattery = function handleBattery(event) {
    var data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    T.state.battery = data.getUint16(2) / 512;
  };

  T.handleAccelerometer = function handleAccelerometer(event) {
    T.state.accelerometer = T.decodeMotion(event, 0.0000610352);
  };

  T.handleGyroscope = function handleGyroscope(event) {
    T.state.gyroscope = T.decodeMotion(event, 0.0074768);
    // Lab recordings observe incoming motion without changing aquarium controls.
    document.dispatchEvent(new CustomEvent("musemotion", { detail: {
      time: performance.now(), values: T.state.gyroscope.slice()
    } }));
    var yawDps = T.state.gyroscope[T.HEAD_TURN_CONFIG.yawAxis] * T.HEAD_TURN_CONFIG.turnSign;
    T.state.smoothedYawDps += (yawDps - T.state.smoothedYawDps) * T.HEAD_TURN_CONFIG.gyroSmoothAmount;
  };

  T.sendCommand = function sendCommand(command) {
    return T.state.controlCharacteristic.writeValue(T.encodeCommand(command));
  };

  T.connectNotification = async function connectNotification(service, characteristicId, handler) {
    var characteristic = await service.getCharacteristic(characteristicId);
    characteristic.addEventListener("characteristicvaluechanged", handler);
    await characteristic.startNotifications();
    return characteristic;
  };

  T.handleDisconnect = function handleDisconnect() {
    T.tankIntroductionOpen = false;
    document.body.classList.remove("tankIntroductionOpen");
    document.getElementById("introductionBackButton").textContent = "back";
    T.resetEEGStream();
    T.state.connected = false;
    T.state.signalChecking = false;
    if (window.museSignalCheck) window.museSignalCheck.cancel();
    T.setMode("explore");
    T.state.connecting = false;
    T.state.device = null;
    T.state.controlCharacteristic = null;
    T.state.headTurn = "still";
    T.state.smoothedYawDps = 0;
    T.state.headPitch.initialized = false;
    T.state.headPitch.motion = "still";
    T.state.headPitch.velocityDps = 0;
    T.state.focus.signalQuality = "paused: waiting for EEG";
    T.state.focus.lastComputedAt = 0;
    T.state.focus.lastCheckedAt = 0;
    T.state.focus.lastMotionAt = 0;
    T.state.targetFishSpeed = T.state.baseFishSpeed;
    T.state.targetFishTailSpeed = T.state.baseFishTailSpeed;
    T.state.bubbles.visibleUntil = 0;
    for (var fountain = 0; fountain < T.state.bubbles.fountains.length; fountain += 1) {
      T.state.bubbles.fountains[fountain].visibleUntil = 0;
    }
    T.showStartPanel("start");
    T.setStartScreenVisible(true);
    T.setMuseStatsVisible(false);
    T.setEEGPanelVisible(false);
    T.updateEEGDisplay();
    T.setButtonState("Connect Muse", false);
    T.setStatus("Muse disconnected");
  };

  T.connect = async function connect() {
    if (T.state.connected || T.state.connecting) return;

    if (!navigator.bluetooth) {
      T.setStatus("Web Bluetooth needs Chrome or Edge on localhost");
      return;
    }

    T.state.connecting = true;
    T.resetEEGStream();
    T.setButtonState("Connecting...", true);
    T.setStatus("Choose your Muse in the Bluetooth picker");

    try {
      // This call stays in the click-triggered function for Web Bluetooth.
      T.state.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [T.MUSE_SERVICE] }]
      });
      T.state.device.addEventListener("gattserverdisconnected", T.handleDisconnect);

      var server = await T.state.device.gatt.connect();
      var service = await server.getPrimaryService(T.MUSE_SERVICE);

      T.state.controlCharacteristic = await T.connectNotification(
        service,
        T.CONTROL_CHARACTERISTIC,
        function() {}
      );
      await T.connectNotification(service, T.BATTERY_CHARACTERISTIC, T.handleBattery);
      await T.connectNotification(service, T.GYROSCOPE_CHARACTERISTIC, T.handleGyroscope);
      await T.connectNotification(service, T.ACCELEROMETER_CHARACTERISTIC, T.handleAccelerometer);
      for (var channel = 0; channel < T.EEG_CHARACTERISTICS.length; channel += 1) {
        await T.connectNotification(
          service,
          T.EEG_CHARACTERISTICS[channel],
          (function(channelIndex) {
            return function(event) {
              T.handleEEG(channelIndex, event);
            };
          })(channel)
        );
      }

      // Match the working Muse page's pause, preset, start, and resume sequence.
      await T.sendCommand("h");
      await T.sendCommand("p50");
      await T.sendCommand("s");
      await T.sendCommand("d");
      await T.sendCommand("v1");

      T.state.connected = true;
      T.setMode("explore");
      T.state.connecting = false;
      T.state.targetFieldOfView = T.getAquariumFieldOfView();
      T.state.targetRadius = T.getAquariumTargetRadius();
      T.state.baseFishSpeed = T.getAquariumFishSpeed();
      T.state.targetFishSpeed = T.state.baseFishSpeed;
      T.state.baseFishTailSpeed = T.getAquariumFishTailSpeed();
      T.state.targetFishTailSpeed = T.state.baseFishTailSpeed;
      T.setStartScreenVisible(false);
      T.setMuseStatsVisible(true);
      T.setEEGPanelVisible(true);
      T.updateEEGDisplay();
      T.setButtonState("muse connected", false);
      T.setStatus("Turn left to zoom out, right to zoom in");
      // Check signal usability before enabling interactive aquarium controls.
      T.state.signalChecking = true;
      document.getElementById("exploreModeButton").disabled = true;
      document.getElementById("labModeButton").disabled = true;
      T.setMuseStatsVisible(false);
      window.museSignalCheck.start(function() {
        T.state.signalChecking = false;
        T.controlResumeAt = Date.now();
        T.setMode("explore");
        T.setMuseStatsVisible(true);
      });
    } catch (error) {
      console.error("Muse connection failed:", error);
      if (T.state.device && T.state.device.gatt.connected) T.state.device.gatt.disconnect();
      T.handleDisconnect();
      T.setStatus(error && error.name === "NotFoundError"
        ? "Muse connection canceled"
        : "Could not connect to Muse");
    }
  };

})(window.ThinkTank);
