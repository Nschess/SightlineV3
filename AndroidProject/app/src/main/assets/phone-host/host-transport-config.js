'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { createPrivateKey, createPublicKey, X509Certificate } = require('node:crypto');
const { domainToASCII } = require('node:url');
const http = require('node:http');
const https = require('node:https');

const DEFAULT_PORT = 8080;
const RELEASE_TRANSPORT = 'release';
const DEVELOPMENT_TRANSPORT = 'dev';
const RESERVED_SUFFIXES = ['.localhost', '.local', '.test', '.invalid', '.example'];
const NUMERIC_HOST_PATTERN = /^(?:(?:0x[0-9a-f]+|[0-9]+)\.)+(?:0x[0-9a-f]+|[0-9]+)$/i;
const RESERVED_DOCUMENTATION_HOSTS = new Set([
  'example.com', 'example.net', 'example.org',
  'example.edu', 'example.gov', 'example.mil'
]);

function resolveTransportMode(argv, { defaultMode = DEVELOPMENT_TRANSPORT } = {}) {
  const indexes = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--transport') indexes.push(i);
  if (indexes.length > 1) throw new Error('Specify --transport only once.');
  if (indexes.length === 0) {
    if (defaultMode === DEVELOPMENT_TRANSPORT) return DEVELOPMENT_TRANSPORT;
    throw new Error('Host startup requires an explicit --transport dev or --transport release.');
  }
  const mode = argv[indexes[0] + 1];
  if (mode !== DEVELOPMENT_TRANSPORT && mode !== RELEASE_TRANSPORT) {
    throw new Error('Transport must be dev or release.');
  }
  return mode;
}

function normalizeApprovedHostname(raw) {
  if (typeof raw !== 'string' || raw !== raw.trim() || !raw || raw.length > 253 ||
      /[\s/:?#@\\]/.test(raw) || raw.endsWith('.')) {
    throw new Error('TLS host must be an approved DNS hostname without a port or URL path.');
  }
  const ascii = domainToASCII(raw);
  const reservedDocumentationHost = ascii && [...RESERVED_DOCUMENTATION_HOSTS].some(host =>
    ascii === host || ascii.endsWith('.' + host));
  if (!ascii || ascii !== raw.toLowerCase() || net.isIP(ascii) !== 0 || NUMERIC_HOST_PATTERN.test(ascii) ||
      !ascii.includes('.') || reservedDocumentationHost ||
      RESERVED_SUFFIXES.some(suffix => ascii.endsWith(suffix))) {
    throw new Error('TLS host must be a non-reserved DNS hostname, not an IP, localhost, or test name.');
  }
  const labels = ascii.split('.');
  if (labels.some(label => label.length < 1 || label.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error('TLS host contains an invalid DNS label.');
  }
  return ascii;
}

function normalizePrivateBindAddress(raw, interfaces) {
  if (typeof raw !== 'string' || net.isIP(raw) !== 4) {
    throw new Error('Release transport requires an explicit private IPv4 bind address.');
  }
  const parts = raw.split('.').map(Number);
  const isPrivate = parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
  if (!isPrivate) throw new Error('Release transport may bind only to a private IPv4 address.');
  const present = Object.values(interfaces || {}).flat().some(info =>
    info && info.family === 'IPv4' && info.address === raw && !info.internal);
  if (!present) throw new Error('TLS bind address is not assigned to a local network interface.');
  return raw;
}

function within(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function readExternalFile(rawPath, label, projectRoot, maximumBytes) {
  if (typeof rawPath !== 'string' || !rawPath.trim() || !path.isAbsolute(rawPath)) {
    throw new Error(label + ' file path is required and must be absolute.');
  }
  let resolved;
  try { resolved = fs.realpathSync(rawPath); }
  catch (_) { throw new Error(label + ' file is unavailable.'); }
  let root;
  try { root = fs.realpathSync(projectRoot); }
  catch (_) { throw new Error('Project root could not be verified.'); }
  if (within(root, resolved)) throw new Error(label + ' must be stored outside the project tree.');
  let stat;
  try { stat = fs.statSync(resolved); }
  catch (_) { throw new Error(label + ' file is unavailable.'); }
  if (!stat.isFile() || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error(label + ' file size is invalid.');
  }
  try { return fs.readFileSync(resolved); }
  catch (_) { throw new Error(label + ' file could not be read.'); }
}

function firstCertificate(pem) {
  const match = String(pem).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  if (!match) throw new Error('TLS certificate PEM is invalid.');
  return new X509Certificate(match[0]);
}

function createSecureServerOptions({ host, certPem, keyPem, passphrase, now = new Date() }) {
  const certificate = firstCertificate(certPem);
  const from = Date.parse(certificate.validFrom);
  const to = Date.parse(certificate.validTo);
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(at) || at < from || at > to) {
    throw new Error('TLS certificate is outside its validity window.');
  }
  if (!certificate.checkHost(host, { subject: 'never' })) {
    throw new Error('TLS certificate SAN does not match the configured host.');
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(passphrase ? { key: keyPem, passphrase } : { key: keyPem });
  } catch (_) {
    throw new Error('TLS private key is invalid or its passphrase is incorrect.');
  }
  const certificateKey = certificate.publicKey.export({ format: 'der', type: 'spki' });
  const configuredKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  if (!certificateKey.equals(configuredKey)) throw new Error('TLS certificate and private key do not match.');
  const options = { cert: certPem, key: keyPem, minVersion: 'TLSv1.2' };
  if (passphrase) options.passphrase = passphrase;
  try { tls.createSecureContext(options); }
  catch (_) { throw new Error('TLS certificate chain or key could not create a secure context.'); }
  return options;
}

function loadReleaseTlsConfig({ env = process.env, projectRoot, interfaces = require('node:os').networkInterfaces(), now = new Date() } = {}) {
  const host = normalizeApprovedHostname(env.SIGHTLINE_TLS_HOST);
  const bind = normalizePrivateBindAddress(env.SIGHTLINE_TLS_BIND, interfaces);
  if (String(env.SIGHTLINE_TLS_PORT || DEFAULT_PORT) !== String(DEFAULT_PORT)) {
    throw new Error('Release transport uses the fixed Android LAN port 8080.');
  }
  const certPem = readExternalFile(env.SIGHTLINE_TLS_CERT_FILE, 'TLS certificate', projectRoot, 1024 * 1024);
  const keyPem = readExternalFile(env.SIGHTLINE_TLS_KEY_FILE, 'TLS private key', projectRoot, 1024 * 1024);
  let passphrase = '';
  if (env.SIGHTLINE_TLS_PASSPHRASE_FILE) {
    const passphraseBytes = readExternalFile(env.SIGHTLINE_TLS_PASSPHRASE_FILE, 'TLS passphrase', projectRoot, 4096);
    passphrase = passphraseBytes.toString('utf8').replace(/[\r\n]+$/, '');
    if (!passphrase) throw new Error('TLS passphrase file is empty.');
  }
  const secureOptions = createSecureServerOptions({ host, certPem: certPem.toString('utf8'), keyPem, passphrase, now });
  return Object.freeze({
    mode: RELEASE_TRANSPORT,
    host,
    bind,
    port: DEFAULT_PORT,
    authority: host + ':' + DEFAULT_PORT,
    secureOptions
  });
}

function createListener(mode, handler, secureOptions) {
  if (mode === RELEASE_TRANSPORT) {
    if (!secureOptions || secureOptions.minVersion !== 'TLSv1.2' || !secureOptions.cert || !secureOptions.key) {
      throw new Error('HTTPS release listener requires validated TLS options.');
    }
    return https.createServer(secureOptions, handler);
  }
  if (mode !== DEVELOPMENT_TRANSPORT) throw new Error('Unknown host transport mode.');
  return http.createServer(handler);
}

function allowWebSocketUpgrade({ mode, origin, requestHost, encrypted, authority }) {
  if (mode !== DEVELOPMENT_TRANSPORT && mode !== RELEASE_TRANSPORT) return false;
  if (mode === RELEASE_TRANSPORT &&
      (!encrypted || !authority || String(requestHost || '').toLowerCase() !== authority.toLowerCase())) return false;
  if (!origin) return true; // Preserve non-browser V2 clients that do not send Origin.
  try {
    const url = new URL(origin);
    const expectedProtocol = mode === RELEASE_TRANSPORT ? 'https:' : 'http:';
    const sameOrigin = url.protocol === expectedProtocol &&
      url.host.toLowerCase() === String(requestHost || '').toLowerCase() &&
      (mode !== RELEASE_TRANSPORT || url.host.toLowerCase() === authority.toLowerCase()) &&
      url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
    if (sameOrigin) return true;
    // The Windows discovery client is served only from 127.0.0.1:8090. Permit
    // that exact development origin to join private IPv4 hosts; do not relax
    // TLS release origins or accept arbitrary websites/private-network origins.
    if (mode !== DEVELOPMENT_TRANSPORT || url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost'].includes(url.hostname.toLowerCase()) || url.port !== '8090' ||
        url.pathname !== '/' || url.search || url.hash || url.username || url.password) return false;
    const match = String(requestHost || '').match(/^((?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})):8080$/);
    return !!match && net.isIP(match[1]) === 4 && match[1].split('.').every(part => Number(part) <= 255);
  } catch (_) {
    return false;
  }
}

module.exports = Object.freeze({
  DEFAULT_PORT,
  DEVELOPMENT_TRANSPORT,
  RELEASE_TRANSPORT,
  createListener,
  createSecureServerOptions,
  allowWebSocketUpgrade,
  loadReleaseTlsConfig,
  normalizeApprovedHostname,
  normalizePrivateBindAddress,
  resolveTransportMode
});
