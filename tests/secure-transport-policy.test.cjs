'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

const root = path.resolve(__dirname, '..');
const hostDir = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const HostTransport = require(path.join(hostDir, 'host-transport-config.js'));
const ClientTransport = require(path.join(hostDir, 'mp-transport-policy.js'));
const certPem = fs.readFileSync(path.join(__dirname, 'fixtures', 'TEST-ONLY-do-not-deploy-cert.pem'));
const keyPem = fs.readFileSync(path.join(__dirname, 'fixtures', 'TEST-ONLY-do-not-deploy-key.pem'));

test('development and release host modes are explicit and unknown modes fail closed', () => {
  assert.equal(HostTransport.resolveTransportMode([], { defaultMode: 'dev' }), 'dev');
  assert.throws(() => HostTransport.resolveTransportMode([], { defaultMode: null }), /explicit --transport/);
  assert.equal(HostTransport.resolveTransportMode(['--transport', 'dev']), 'dev');
  assert.equal(HostTransport.resolveTransportMode(['--transport', 'release']), 'release');
  assert.throws(() => HostTransport.resolveTransportMode(['--transport', 'plain']), /Transport must be dev or release/);
  assert.throws(() => HostTransport.resolveTransportMode(['--transport', 'dev', '--transport', 'release']), /only once/);
});

test('release hostname policy accepts ordinary DNS names and rejects test, local, IP, and malformed names', () => {
  assert.equal(HostTransport.normalizeApprovedHostname('Game.Sightline.com'), 'game.sightline.com');
  for (const value of ['', 'localhost', 'host.local', 'host.test', 'host.invalid', 'example.com',
    'game.example.com', '127.1', '0x7f.1', '0177.0.0.1',
    '192.168.1.20', 'https://game.sightline.com', 'game.sightline.com:8080',
    'bad_host.sightline.com', '-bad.sightline.com', 'game..sightline.com']) {
    assert.throws(() => HostTransport.normalizeApprovedHostname(value), undefined, value);
  }
});

test('release bind is a configured private IPv4 address assigned to an interface', () => {
  const interfaces = { lan0: [{ family: 'IPv4', address: '192.168.20.8', internal: false }] };
  assert.equal(HostTransport.normalizePrivateBindAddress('192.168.20.8', interfaces), '192.168.20.8');
  for (const value of ['0.0.0.0', '127.0.0.1', '8.8.8.8', '192.168.20.9']) {
    assert.throws(() => HostTransport.normalizePrivateBindAddress(value, interfaces));
  }
});

test('test-only certificate validates SAN, validity, private-key match, and TLS 1.2 options in memory', () => {
  const options = HostTransport.createSecureServerOptions({
    host: 'sightline.test',
    certPem,
    keyPem,
    now: new Date('2026-11-01T00:00:00Z')
  });
  assert.equal(options.minVersion, 'TLSv1.2');
  assert.ok(options.key);
  assert.throws(() => HostTransport.createSecureServerOptions({
    host: 'other.sightline.test', certPem, keyPem, now: new Date('2026-11-01T00:00:00Z')
  }), /SAN does not match/);
  assert.throws(() => HostTransport.createSecureServerOptions({
    host: 'sightline.test', certPem, keyPem, now: new Date('2037-01-01T00:00:00Z')
  }), /validity window/);
  assert.throws(() => HostTransport.createSecureServerOptions({
    host: 'sightline.test', certPem: 'not a certificate', keyPem
  }), /certificate PEM is invalid/);
  const unrelatedPrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    .export({ type: 'pkcs8', format: 'pem' });
  assert.throws(() => HostTransport.createSecureServerOptions({
    host: 'sightline.test', certPem, keyPem: unrelatedPrivateKey,
    now: new Date('2026-11-01T00:00:00Z')
  }), /certificate and private key do not match/);
});

test('release listener is HTTPS and development listener remains HTTP without opening sockets', () => {
  const options = HostTransport.createSecureServerOptions({
    host: 'sightline.test', certPem, keyPem, now: new Date('2026-11-01T00:00:00Z')
  });
  const handler = (_req, res) => res.end();
  assert.ok(HostTransport.createListener('release', handler, options) instanceof https.Server);
  assert.ok(HostTransport.createListener('dev', handler) instanceof http.Server);
  assert.throws(() => HostTransport.createListener('release', handler), /requires validated TLS options/);
});

test('client selects same-origin WSS for HTTPS and refuses scheme or host downgrade attempts', () => {
  assert.deepEqual(ClientTransport.resolveWebSocketEndpoint(
    'https:', 'game.sightline.com:8080', 'game.sightline.com:8080'
  ), { url: 'wss://game.sightline.com:8080/ws', authority: 'game.sightline.com:8080', secure: true });
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint(
    'https:', 'game.sightline.com:8080', 'ws://game.sightline.com:8080'
  ), /cannot downgrade/);
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint(
    'https:', 'game.sightline.com:8080', 'other.sightline.com:8080'
  ), /current approved host/);
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint(
    'https:', 'game.sightline.com:8080', 'game.sightline.com:8080/path'
  ));
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint(
    'https:', 'game.sightline.com:8080', 'game.sightline.com'
  ), /current approved host/);
});

test('development client retains WS while rejecting secure-scheme confusion and malformed origins', () => {
  assert.deepEqual(ClientTransport.resolveWebSocketEndpoint('http:', '192.168.20.8:8080', '192.168.20.8:8080'), {
    url: 'ws://192.168.20.8:8080/ws', authority: '192.168.20.8:8080', secure: false
  });
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint('http:', 'host:8080', 'wss://host:8080'), /cannot switch/);
  assert.deepEqual(ClientTransport.resolveWebSocketEndpoint('http:', '', 'http://192.168.20.8:8080/'), {
    url: 'ws://192.168.20.8:8080/ws', authority: '192.168.20.8:8080', secure: false
  });
  assert.deepEqual(ClientTransport.resolveWebSocketEndpoint('file:', '', '192.168.20.8:8080'), {
    url: 'ws://192.168.20.8:8080/ws', authority: '192.168.20.8:8080', secure: false
  });
  assert.deepEqual(ClientTransport.resolveWebSocketEndpoint('file:', '', 'http://192.168.20.8:8080/game/'), {
    url: 'ws://192.168.20.8:8080/ws', authority: '192.168.20.8:8080', secure: false
  });
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint('file:', '', 'wss://host:8080'), /cannot switch/);
  assert.throws(() => ClientTransport.resolveWebSocketEndpoint('ftp:', '', 'host:8080'), /requires an HTTP, HTTPS, or local file/);
});

test('WebSocket upgrade origin policy requires encrypted same-host TLS in release mode', () => {
  const allow = HostTransport.allowWebSocketUpgrade;
  assert.equal(allow({ mode: 'release', origin: 'https://game.sightline.com:8080', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), true);
  assert.equal(allow({ mode: 'release', origin: 'http://game.sightline.com:8080', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), false);
  assert.equal(allow({ mode: 'release', origin: 'https://other.sightline.com:8080', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), false);
  assert.equal(allow({ mode: 'release', origin: 'https://game.sightline.com:8080/path', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), false);
  assert.equal(allow({ mode: 'release', origin: '', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), true);
  assert.equal(allow({ mode: 'release', origin: '', requestHost: 'game.sightline.com:8080', encrypted: false, authority: 'game.sightline.com:8080' }), false);
  assert.equal(allow({ mode: 'dev', origin: 'http://192.168.20.8:8080', requestHost: '192.168.20.8:8080', encrypted: false }), true);
  assert.equal(allow({ mode: 'dev', origin: 'http://127.0.0.1:8090', requestHost: '192.168.20.8:8080', encrypted: false }), true,
    'the loopback-only discovery client may connect to a private IPv4 development host');
  assert.equal(allow({ mode: 'dev', origin: 'http://localhost:8090', requestHost: '10.0.0.7:8080', encrypted: false }), true);
  assert.equal(allow({ mode: 'dev', origin: 'http://127.0.0.1:8090.evil.test', requestHost: '192.168.20.8:8080', encrypted: false }), false);
  assert.equal(allow({ mode: 'dev', origin: 'http://127.0.0.1:8090/path', requestHost: '192.168.20.8:8080', encrypted: false }), false);
  assert.equal(allow({ mode: 'dev', origin: 'http://127.0.0.1:8090', requestHost: '8.8.8.8:8080', encrypted: false }), false,
    'the loopback origin cannot use the discovery exception for public hosts');
  assert.equal(allow({ mode: 'release', origin: 'http://127.0.0.1:8090', requestHost: 'game.sightline.com:8080', encrypted: true, authority: 'game.sightline.com:8080' }), false,
    'the discovery exception never permits release TLS downgrade');
  assert.equal(allow({ mode: 'dev', origin: 'https://192.168.20.8:8080', requestHost: '192.168.20.8:8080', encrypted: false }), false);
  assert.equal(allow({ mode: 'dev', origin: 'null', requestHost: '192.168.20.8:8080', encrypted: false }), false);
  assert.equal(allow({ mode: 'dev', origin: '', requestHost: '192.168.20.8:8080', encrypted: false }), true);
});

test('missing certificate, missing key, and in-tree key configuration fail before server creation', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-tls-config-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const certFile = path.join(temp, 'cert.pem');
  const keyFile = path.join(temp, 'key.pem');
  fs.writeFileSync(certFile, certPem);
  fs.writeFileSync(keyFile, keyPem);
  const interfaces = { lan0: [{ family: 'IPv4', address: '192.168.20.8', internal: false }] };
  const base = {
    SIGHTLINE_TLS_HOST: 'game.sightline.com',
    SIGHTLINE_TLS_BIND: '192.168.20.8',
    SIGHTLINE_TLS_PORT: '8080'
  };
  const settings = extra => HostTransport.loadReleaseTlsConfig({
    env: { ...base, ...extra }, projectRoot: root, interfaces, now: new Date('2026-11-01T00:00:00Z')
  });
  assert.throws(() => settings({ SIGHTLINE_TLS_PORT: '8443' }), /fixed Android LAN port 8080/);
  assert.throws(() => settings({ SIGHTLINE_TLS_KEY_FILE: keyFile }), /TLS certificate file path is required/);
  assert.throws(() => settings({ SIGHTLINE_TLS_CERT_FILE: certFile }), /TLS private key file path is required/);
  assert.throws(() => settings({ SIGHTLINE_TLS_CERT_FILE: certFile, SIGHTLINE_TLS_KEY_FILE: path.join(root, 'tests', 'fixtures', 'TEST-ONLY-do-not-deploy-key.pem') }), /outside the project tree/);
  assert.throws(() => settings({ ...base, SIGHTLINE_TLS_CERT_FILE: certFile, SIGHTLINE_TLS_KEY_FILE: keyFile }), /SAN does not match/);
  assert.throws(() => settings({ ...base, SIGHTLINE_TLS_HOST: 'sightline.test', SIGHTLINE_TLS_CERT_FILE: certFile, SIGHTLINE_TLS_KEY_FILE: keyFile }), /non-reserved DNS hostname/);
});

test('release process reports missing configuration without exposing configured paths or secrets', () => {
  const sentinel = 'DO_NOT_LOG_TLS_SECRET_6F77A1';
  const result = spawnSync(process.execPath, [
    path.join(hostDir, 'server.js'), '--transport', 'release', '--bind', '192.168.20.8', '--port', '8080'
  ], {
    cwd: hostDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      SIGHTLINE_TLS_HOST: 'game.sightline.com',
      SIGHTLINE_TLS_BIND: '192.168.20.8',
      SIGHTLINE_TLS_KEY_FILE: sentinel,
      SIGHTLINE_TLS_PASSPHRASE_FILE: sentinel
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TLS bind address is not assigned|TLS certificate file path is required/);
  assert.ok(!result.stdout.includes(sentinel) && !result.stderr.includes(sentinel));
  assert.ok(!result.stdout.includes('BEGIN PRIVATE KEY') && !result.stderr.includes('BEGIN PRIVATE KEY'));
});

test('direct host process refuses to start without an explicit transport mode', () => {
  const env = { ...process.env };
  for (const name of ['SIGHTLINE_TLS_HOST','SIGHTLINE_TLS_BIND','SIGHTLINE_TLS_PORT','SIGHTLINE_TLS_CERT_FILE','SIGHTLINE_TLS_KEY_FILE','SIGHTLINE_TLS_PASSPHRASE_FILE']) delete env[name];
  const result = spawnSync(process.execPath, [path.join(hostDir, 'server.js')], {
    cwd: hostDir, encoding: 'utf8', env
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit --transport dev or --transport release/);
});

test('Android production source manifest and host launch configuration contain no private PEM material', () => {
  const android = path.join(root, 'AndroidProject');
  const lines = fs.readFileSync(path.join(android, 'CURRENT-SOURCE-SHA256.txt'), 'utf8').trim().split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^[a-f0-9]{64}  (.+)$/);
    assert.ok(match, 'Android source manifest entry is well formed');
    const source = fs.readFileSync(path.join(android, match[1]), 'utf8');
    assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
      `private PEM must not be packaged in Android source: ${match[1]}`);
  }
  const launchers = fs.readFileSync(path.join(root, 'SIGHTLINE.bat'), 'utf8');
  assert.doesNotMatch(launchers, /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/);
});

test('Android build and browser sources preserve secure release selection without altering V2 messages', () => {
  const gradle = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'build.gradle'), 'utf8');
  const activity = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'src', 'main', 'java', 'com', 'sightline', 'v3', 'MainActivity.java'), 'utf8');
  const server = fs.readFileSync(path.join(hostDir, 'server.js'), 'utf8');
  const page = fs.readFileSync(path.join(hostDir, 'index.html'), 'utf8');
  const androidManifest = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  const debugManifest = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'src', 'debug', 'AndroidManifest.xml'), 'utf8');
  const mainNetworkPolicy = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml'), 'utf8');
  const debugNetworkPolicy = fs.readFileSync(path.join(root, 'AndroidProject', 'app', 'src', 'debug', 'res', 'xml', 'network_security_config.xml'), 'utf8');
  assert.match(gradle, /-PsightlineLanTlsHost=<approved non-reserved FQDN>/);
  assert.match(gradle, /SECURE_LAN_RELEASE', 'true'/);
  assert.match(gradle, /native phone-host service uses development HTTP\/WS/);
  assert.ok(gradle.includes('0x[0-9a-f]+|[0-9]+'));
  assert.match(gradle, /endsWith\('\.' \+ host\)/);
  assert.match(gradle, /gradle\.taskGraph\.whenReady[\s\S]*releaseRequested[\s\S]*Release signing key missing/);
  assert.match(activity, /BuildConfig\.SECURE_LAN_RELEASE/);
  assert.match(activity, /BuildConfig\.LAN_TLS_HOST/);
  assert.match(activity, /"https"\.equals\(scheme\)/);
  assert.match(androidManifest, /usesCleartextTraffic="false"/);
  assert.match(mainNetworkPolicy, /cleartextTrafficPermitted="false"/);
  assert.match(debugManifest, /usesCleartextTraffic="true"/);
  assert.match(debugNetworkPolicy, /cleartextTrafficPermitted="true"/);
  assert.doesNotMatch(activity, /onReceivedSslError|handler\.proceed\s*\(/);
  assert.match(server, /HostTransport\.createListener\(/);
  assert.match(server, /req\.socket\.encrypted/);
  assert.match(server, /allowWebSocketUpgrade/);
  assert.match(server, /negotiation\.features/);
  assert.match(server, /lastActionSeq/);
  assert.match(page, /SightlineTransport\.resolveWebSocketEndpoint/);
  assert.match(page, /JSON\.stringify\(\{ t: 'hello', v: MP_PROTOCOL, features: MP_FEATURES, name: MP\.name \}\)/);
});
