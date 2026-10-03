/* ThinkTank: muse/protocol.js. See docs/architecture.md for the shared T interface. */
(function(T) {
  "use strict";

  T.MUSE_SERVICE = 0xfe8d;

  T.CONTROL_CHARACTERISTIC = "273e0001-4c4d-454d-96be-f03bac821358";

  T.BATTERY_CHARACTERISTIC = "273e000b-4c4d-454d-96be-f03bac821358";

  T.GYROSCOPE_CHARACTERISTIC = "273e0009-4c4d-454d-96be-f03bac821358";

  T.ACCELEROMETER_CHARACTERISTIC = "273e000a-4c4d-454d-96be-f03bac821358";

  T.EEG_CHARACTERISTICS = [
    "273e0003-4c4d-454d-96be-f03bac821358",
    "273e0004-4c4d-454d-96be-f03bac821358",
    "273e0005-4c4d-454d-96be-f03bac821358",
    "273e0006-4c4d-454d-96be-f03bac821358",
    "273e0007-4c4d-454d-96be-f03bac821358"
  ];

  

  T.decodeMotion = function decodeMotion(event, scale) {
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
  };

  T.decodeEEG = function decodeEEG(event) {
    var data = event.target.value;
    data = data.buffer ? data : new DataView(data);
    var bytes = new Uint8Array(data.buffer, data.byteOffset + 2, data.byteLength - 2);
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
  };

  T.encodeCommand = function encodeCommand(command) {
    var encoded = new TextEncoder().encode("X" + command + "\n");
    encoded[0] = encoded.length - 1;
    return encoded;
  };

})(window.ThinkTank);
