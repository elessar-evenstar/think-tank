/* Reuse upstream shader text without loading or executing the upstream page. */
(function(T) {
  "use strict";
  var expected = [
    'texVertexShader', 'texFragmentShader', 'laserVertexShader', 'laserFragmentShader',
    'fishVertexShader', 'fishNormalMapFragmentShader', 'fishReflectionFragmentShader',
    'seaweedVertexShader', 'seaweedFragmentShader', 'diffuseVertexShader', 'diffuseFragmentShader',
    'normalMapVertexShader', 'normalMapFragmentShader', 'reflectionMapVertexShader',
    'reflectionMapFragmentShader', 'innerRefractionMapVertexShader',
    'innerRefractionMapFragmentShader', 'outerRefractionMapVertexShader',
    'outerRefractionMapFragmentShader'
  ];
  T.loadShaders = async function() {
    var response = await fetch(new URL('aquarium.html', g_aquariumConfig.aquariumRoot));
    if (!response.ok) throw new Error('Aquarium shader source returned HTTP ' + response.status);
    var source = new DOMParser().parseFromString(await response.text(), 'text/html');
    var fragment = document.createDocumentFragment();
    expected.forEach(function(id) {
      var matches = source.querySelectorAll('script[id="' + id + '"]');
      if (matches.length !== 1 || matches[0].type !== 'text/something-not-javascript' ||
          !matches[0].textContent.trim() || document.getElementById(id)) {
        throw new Error('Missing, duplicate, or invalid aquarium shader: ' + id);
      }
      var shader = document.createElement('script');
      shader.id = id;
      shader.type = 'text/something-not-javascript';
      shader.textContent = matches[0].textContent;
      fragment.appendChild(shader);
    });
    document.head.appendChild(fragment);
  };
})(window.ThinkTank);
