'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json'
});

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

function resolveStaticTarget(root, requestTarget) {
  let rootReal, pathname, decoded, candidate;
  try {
    rootReal = fs.realpathSync(root);
    pathname = new URL(requestTarget, 'http://127.0.0.1').pathname;
    decoded = decodeURIComponent(pathname);
    if (decoded.includes('\0')) return null;
    candidate = path.resolve(rootReal, '.' + decoded.replace(/[\\]/g, '/'));
    if (!inside(rootReal, candidate)) return null;
    let st = fs.statSync(candidate);
    if (st.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
      st = fs.statSync(candidate);
    }
    const real = fs.realpathSync(candidate);
    if (!inside(rootReal, real) || !st.isFile()) return null;
    return { file: real, stat: st, contentType: MIME[path.extname(real).toLowerCase()] || 'application/octet-stream' };
  } catch (_) { return null; }
}

function createOfflineServer(root, options = {}) {
  const rootReal = fs.realpathSync(root);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Allow': 'GET, HEAD', 'Cache-Control': 'no-store' }); res.end(); return;
    }
    if (new URL(req.url || '/', 'http://127.0.0.1').pathname === '/__build') {
      const page = path.join(rootReal, 'index.html');
      const bytes = fs.readFileSync(page);
      const body = Buffer.from(JSON.stringify({
        schema: 'sightline-build-v1', id: 'Sightline V3 Expansion 8.3 experimental',
        route: 'offline', entry: 'AndroidProject/app/src/main/assets/www/index.html',
        pageSha256: crypto.createHash('sha256').update(bytes).digest('hex'), pageBytes: bytes.length
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(body); return;
    }
    if (new URL(req.url || '/', 'http://127.0.0.1').pathname === '/__sightline/lan/hosts') {
      if (!options.discovery || typeof options.discovery.scan !== 'function') {
        res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end('LAN discovery is not enabled'); return;
      }
      Promise.resolve().then(() => options.discovery.scan()).then(result => {
        const body = Buffer.from(JSON.stringify({ schema: 'sightline-lan-hosts-v1', ...result }));
        res.writeHead(result && result.ok ? 200 : 503, {
          'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
        });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
      }).catch(() => {
        const body = Buffer.from(JSON.stringify({ schema: 'sightline-lan-hosts-v1', ok: false,
          error: 'Local host discovery failed. Use manual IP entry as a fallback.', hosts: [] }));
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
      });
      return;
    }
    const resolved = resolveStaticTarget(rootReal, req.url || '/');
    if (!resolved) { res.writeHead(404, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': resolved.contentType, 'Content-Length': resolved.stat.size,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(resolved.file).on('error', () => { if (!res.headersSent) res.writeHead(500); res.destroy(); }).pipe(res);
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../AndroidProject/app/src/main/assets/www');
  const discoveryEnabled = process.argv.includes('--lan-client');
  const discovery = discoveryEnabled ? require('./lan-discovery.cjs').createLanDiscoveryClient() : null;
  const server = createOfflineServer(root, { discovery });
  server.on('error', error => { console.error('Offline server failed:', error.message); process.exitCode = 1; });
  server.listen(8090, '127.0.0.1', () => {
    console.log(discoveryEnabled ? 'Sightline LAN client/discovery: http://127.0.0.1:8090/' : 'Sightline Offline game: http://127.0.0.1:8090/');
    console.log(discoveryEnabled
      ? 'Game assets and discovery API are loopback-only; UDP probes target private-LAN broadcast addresses. Ctrl+C stops this client bridge.'
      : 'Offline-only loopback server; this does not start or expose a LAN host. Ctrl+C stops it.');
  });
}

module.exports = { MIME, resolveStaticTarget, createOfflineServer };
