/* ThinkTank: muse/eeg-buffer.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.resetEEGStream = function resetEEGStream() {
    T.eegPackets = [[], [], [], [], []];
    T.state.eeg = [[], [], [], [], []];
    T.lastEngagementPacketAt = 0;
    T.lastBlinkPacketAt = 0;
    T.state.focus.index = null;
    T.state.focus.thetaPower = 0;
    T.state.focus.alphaPower = 0;
    T.state.focus.betaPower = 0;
    T.state.focus.ratio = 0;
    T.state.focus.rawIndex = null;
    T.state.focus.level = "collecting";
    T.state.focus.signalQuality = "paused: waiting for EEG";
    T.state.focus.lastComputedAt = 0;
    T.state.focus.lastCheckedAt = 0;
    T.state.focus.lastMotionAt = 0;
    T.state.blink.aboveThreshold = false;
    T.state.blink.lastDetectedAt = 0;
    T.state.blink.score = 0;
    T.state.blink.mode = "waiting for EEG";
  };

  T.getAlignedEEG = function getAlignedEEG(first, second, count, now) {
    var left = T.eegPackets[first];
    var right = T.eegPackets[second];
    if (!left.length || !right.length) return { reason: "waiting for EEG" };
    if (now - left[left.length - 1].at > T.EEG_STREAM_CONFIG.staleMs ||
        now - right[right.length - 1].at > T.EEG_STREAM_CONFIG.staleMs) {
      return { reason: "EEG stream stalled" };
    }
    // Find the newest shared counter rather than assuming arrivals are simultaneous.
    var i = left.length - 1;
    var j = -1;
    for (; i >= 0; i -= 1) {
      j = right.findIndex(function(packet) { return packet.sequence === left[i].sequence; });
      if (j >= 0) break;
    }
    if (j < 0) return { reason: "waiting for matching EEG" };
    var at = Math.min(left[i].at, right[j].at);
    if (now - at > T.EEG_STREAM_CONFIG.staleMs) return { reason: "waiting for matching EEG" };
    var needed = Math.ceil(count / T.EEG_STREAM_CONFIG.samplesPerPacket);
    if (i + 1 < needed || j + 1 < needed) return { reason: "collecting continuous EEG" };
    var a = [];
    var b = [];
    for (var offset = needed - 1; offset >= 0; offset -= 1) {
      a = a.concat(left[i - offset].samples);
      b = b.concat(right[j - offset].samples);
    }
    return { first: a.slice(-count), second: b.slice(-count), at: at };
  };

  T.handleEEG = function handleEEG(channel, event) {
    if (!T.state.connected && !T.state.connecting) return;
    var data = event.target.value;
    if (!(data instanceof DataView)) data = new DataView(data);
    var packets = T.eegPackets[channel];
    if (data.byteLength !== 20) {
      packets.length = 0;
      T.state.eeg[channel] = [];
      return;
    }
    var sequence = data.getUint16(0);
    var now = Date.now();
    var previous = packets[packets.length - 1];
    if (previous) {
      var step = (sequence - previous.sequence + 65536) % 65536;
      var stale = now - previous.at > T.EEG_STREAM_CONFIG.staleMs;
      // Ignore duplicate/late packets, but allow a restarted stream after a stall.
      if (!stale && (step === 0 || step > 32768)) return;
      if (stale || step !== 1) {
        packets.length = 0;
        T.state.eeg[channel] = [];
      }
    }
    var decoded = T.decodeEEG(event);
    var series = T.state.eeg[channel];
    var samples = [];
    for (var i = 0; i < decoded.length; i += 1) {
      var value = 0.48828125 * (decoded[i] - 0x800);
      samples.push(value);
      series.push(value);
    }
    packets.push({ sequence: sequence, at: now, samples: samples });
    // Publish accepted packets once, so the lab does not duplicate rolling samples.
    document.dispatchEvent(new CustomEvent("museeeg", { detail: {
      channel: channel, sequence: sequence, time: performance.now(), samples: samples.slice()
    } }));
    if (packets.length > T.EEG_STREAM_CONFIG.maxPackets) packets.shift();
    var maxEEGSamples = T.FOCUS_CONFIG.windowPoints + 32;
    if (series.length > maxEEGSamples) {
      series.splice(0, series.length - maxEEGSamples);
    }
    T.updateEEGDisplay();
  };

})(window.ThinkTank);
