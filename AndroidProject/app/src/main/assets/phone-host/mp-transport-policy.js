(function (root, factory) {
  'use strict';
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.SightlineTransport = policy;
}(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  function authority(raw, defaultProtocol) {
    if (typeof raw !== 'string' || !raw.trim() || raw !== raw.trim() ||
        /[\s/?#@\\]/.test(raw) || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      throw new Error('Enter a host name only, without a scheme or path.');
    }
    let url;
    try { url = new URL(defaultProtocol + '//' + raw); }
    catch (_) { throw new Error('The multiplayer host address is invalid.'); }
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        !url.hostname || url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) {
      throw new Error('The multiplayer host address is invalid.');
    }
    return url.host.toLowerCase();
  }

  function resolveWebSocketEndpoint(pageProtocol, pageHost, requestedHost) {
    if (pageProtocol !== 'https:' && pageProtocol !== 'http:' && pageProtocol !== 'file:') {
      throw new Error('Multiplayer requires an HTTP, HTTPS, or local file game page.');
    }
    if (pageProtocol === 'https:') {
      const originAuthority = authority(pageHost, 'https:');
      const requested = String(requestedHost || '').trim();
      if (/^(?:ws|http):\/\//i.test(requested)) {
        throw new Error('Secure pages cannot downgrade multiplayer to WS or HTTP.');
      }
      if (requested && authority(requested, 'https:') !== originAuthority) {
        throw new Error('Secure multiplayer must use the current approved host.');
      }
      if (Number(new URL('https://' + originAuthority).port || 443) !== 8080) {
        throw new Error('Secure multiplayer host must use port 8080.');
      }
      return Object.freeze({ url: 'wss://' + originAuthority + '/ws', authority: originAuthority, secure: true });
    }
    let requested = String(requestedHost || pageHost || '').trim();
    if (/^(?:https|wss):\/\//i.test(requested)) {
      throw new Error('Development pages cannot switch transport schemes.');
    }
    requested = requested.replace(/^(?:http|ws):\/\//i, '');
    requested = requested.replace(/\/.*$/, '');
    const devAuthority = authority(requested, 'http:');
    return Object.freeze({ url: 'ws://' + devAuthority + '/ws', authority: devAuthority, secure: false });
  }

  return Object.freeze({ resolveWebSocketEndpoint });
}));

