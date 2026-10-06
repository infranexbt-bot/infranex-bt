/**
 * Headless-browser detector that never inspects the User-Agent.
 *
 * This module exposes `detect_headless` and returns true when the
 * environment shows signals consistent with a headless browser. It deliberately
 * avoids `navigator.userAgent` / `navigator.userAgentData` so it stays effective
 * against runners that spoof the User-Agent string.
 *
 * Each probe is defensive: a throwing or unavailable API contributes no signal
 * rather than breaking detection.
 */

function detect_headless() {
  var signals = [];

  // navigator.webdriver is set by the WebDriver/CDP automation flag.
  try {
    signals.push(navigator.webdriver === true);
  } catch (e) { /* probe unavailable */ }

  // Real browsers expose at least one plugin (PDF viewer); many headless
  // contexts report an empty list.
  try {
    if (navigator.plugins) {
      signals.push(navigator.plugins.length === 0);
    }
  } catch (e) { /* probe unavailable */ }

  // navigator.languages is normally a non-empty list; headless runs often leave
  // it empty.
  try {
    signals.push(!navigator.languages || navigator.languages.length === 0);
  } catch (e) { /* probe unavailable */ }

  // Permissions inconsistency: a denied Notification permission paired with a
  // "prompt" Permissions API result is a classic headless contradiction.
  try {
    if (navigator.permissions && typeof Notification !== 'undefined') {
      navigator.permissions
        .query({ name: 'notifications' })
        .then(function (status) {
          if (Notification.permission === 'denied' && status.state === 'prompt') {
            window.__headless_permission_mismatch = true;
          }
        })
        .catch(function () { /* async probe: ignore */ });
    }
  } catch (e) { /* probe unavailable */ }
  signals.push(window.__headless_permission_mismatch === true);

  // Headless windows commonly have no outer chrome, so outer dimensions collapse
  // to zero while the viewport still has size.
  try {
    if (window.outerWidth === 0 && window.outerHeight === 0 && window.innerWidth > 0) {
      signals.push(true);
    }
  } catch (e) { /* probe unavailable */ }

  // WebGL renderer often reports a software rasterizer (SwiftShader) under
  // headless GPU-less execution.
  try {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        var renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
        signals.push(/swiftshader|llvmpipe/i.test(renderer));
      }
    }
  } catch (e) { /* probe unavailable */ }

  for (var i = 0; i < signals.length; i++) {
    if (signals[i] === true) return true;
  }
  return false;
}

if (typeof window !== 'undefined') window.detect_headless = detect_headless;
