/*
* Copyright 2009, Google Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/* ThinkTank adaptation of upstream setupBubbles: five fixed, independently fading fountains. */
(function(T) {
  "use strict";
  var g_numBubbleSets = 5;
  var g_bubbleSets = [], g_bubbleEmitters = [], g_bubbleOpacities = [];
  var g_bubbleFountainPositions = [[-36,0,-16],[-20,0,14],[0,0,-20],[20,0,14],[36,0,-16]];
function updateBubbleColorRamp(index) {
    var emitter = g_bubbleEmitters[index];
    if (!emitter) {
      return;
    }
    var opacity = g_bubbleOpacities[index] || 0;
    emitter.setColorRamp(
        [1, 1, 1, opacity,
         1, 1, 1, opacity,
         1, 1, 1, opacity,
         1, 1, 1, opacity,
         1, 1, 1, opacity,
         1, 1, 1, 0]);
}

// Muse blink logic supplies one independent opacity per bubble fountain.
function setBubbleOpacities(opacities) {
    for (var ii = 0; ii < g_numBubbleSets; ++ii) {
      var nextOpacity = Math.max(0, Math.min(1, opacities[ii] || 0));
      if (Math.abs(nextOpacity - (g_bubbleOpacities[ii] || 0)) < 0.01) {
        continue;
      }
      g_bubbleOpacities[ii] = nextOpacity;
      updateBubbleColorRamp(ii);
    }
}

// A blink starts the 5 fixed bubble fountains. The Muse controller decides
// when to fade them in or out, so repeated blinks do not reset their motion.
function triggerAllBubbleFountains() {
    for (var ii = 0; ii < g_bubbleSets.length; ++ii) {
      var position = g_bubbleFountainPositions[ii % g_bubbleFountainPositions.length];
      var world = tdl.fast.matrix4.translation(
          new Float32Array(16),
          position);
      g_bubbleSets[ii].trigger(world);
    }
}

function setupBubbles(particleSystem) {
    var texture = tdl.textures.loadTexture(g_aquariumConfig.aquariumRoot + 'static_assets/bubble.png');
    for (var ii = 0; ii < g_numBubbleSets; ++ii) {
        var emitter = particleSystem.createParticleEmitter(texture.texture);
        g_bubbleEmitters[ii] = emitter;
        g_bubbleOpacities[ii] = 0;
        emitter.setTranslation(0, 0, 0);
        emitter.setState(tdl.particles.ParticleStateIds.ADD);
        updateBubbleColorRamp(ii);
        emitter.setParameters({
            numParticles: 100,
            numFrames: 1,
            frameDuration: 1000.0,
            frameStartRange: 0,
            lifeTime: 40,
            timeRange: 40,
            startTime: null,
            startSize: 0.2,
            startSizeRange: 0.12,
            endSize: 2.0,
            endSizeRange: 0.65,
            position: [0,-2,0],
            positionRange: [0.45,2.5,0.45],
            velocity: [0,0.08,0],
            velocityRange: [0.16,0.08,0.16],
            acceleration: [0,0.08,0],
            accelerationRange: [0,0.035,0],
            colorMult: [1.2,1.25,1.3,1]});
        g_bubbleSets[ii] = emitter.createOneShot();
    }
}


  T.setupBubbleFountains = setupBubbles;
  T.setBubbleOpacities = setBubbleOpacities;
  T.triggerAllBubbleFountains = triggerAllBubbleFountains;
})(window.ThinkTank);
