'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestFile = path.join(root, 'PACKAGE-MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const errors = [];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const toRel = file => path.relative(root, file).split(path.sep).join('/');
const expected = new Map();

function resolveSafe(rel) {
  if (typeof rel !== 'string' || !rel || path.posix.isAbsolute(rel) || rel.includes('\\') || rel.split('/').includes('..')) {
    throw new Error(`Unsafe manifest path: ${rel}`);
  }
  const full = path.resolve(root, ...rel.split('/'));
  if (!full.startsWith(root + path.sep)) throw new Error(`Manifest path escapes package: ${rel}`);
  return full;
}

for (const entry of manifest.files) {
  if (!/^[a-f0-9]{64}$/.test(entry.sha256) || expected.has(entry.path)) {
    errors.push(`Malformed or duplicate manifest row: ${entry.path}`);
    continue;
  }
  expected.set(entry.path, entry.sha256);
  const full = resolveSafe(entry.path);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    errors.push(`Missing packaged file: ${entry.path}`);
  } else if (hash(full) !== entry.sha256) {
    errors.push(`Hash mismatch: ${entry.path}`);
  }
}

const actual = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile()) {
      const rel = toRel(full);
      if (rel !== 'PACKAGE-MANIFEST.json') actual.push(rel);
    } else errors.push(`Unsupported filesystem entry: ${toRel(full)}`);
  }
}
walk(root);
for (const rel of actual) if (!expected.has(rel)) errors.push(`Unlisted packaged file: ${rel}`);
for (const rel of expected.keys()) if (!actual.includes(rel)) errors.push(`Manifest file absent from archive: ${rel}`);

for (const [name, rel] of Object.entries({
  server: 'AndroidProject/app/src/main/assets/phone-host/server.js',
  page: 'AndroidProject/app/src/main/assets/phone-host/index.html',
  hostManifest: 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  androidSourceManifest: 'AndroidProject/CURRENT-SOURCE-SHA256.txt'
})) {
  const full = resolveSafe(rel);
  if (!manifest.sourceFingerprints || hash(full) !== manifest.sourceFingerprints[name]) {
    errors.push(`Integrated source fingerprint mismatch: ${name}`);
  }
}

const instructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
if (!instructions.includes('# Sightline V3 Project Instructions') || !instructions.includes('Acceptance evidence')) {
  errors.push('Root AGENTS.md is absent or incomplete.');
}

const templateRel = 'config/release-inputs.template.env';
const template = fs.readFileSync(resolveSafe(templateRel), 'utf8');
for (const name of [
  'SIGHTLINE_TLS_HOST', 'SIGHTLINE_TLS_BIND', 'SIGHTLINE_TLS_CERT_FILE', 'SIGHTLINE_TLS_KEY_FILE',
  'SIGHTLINE_TLS_PASSPHRASE_FILE', 'SIGHTLINE_KEYSTORE_PATH', 'SIGHTLINE_KEYSTORE_PASSWORD',
  'SIGHTLINE_KEY_PASSWORD', 'SIGHTLINE_KEY_ALIAS'
]) {
  if (!new RegExp(`^${name}=$`, 'm').test(template)) errors.push(`Config template must leave ${name} empty.`);
}

const privateKeyPath = 'tests/fixtures/TEST-ONLY-do-not-deploy-key.pem';
for (const rel of actual) {
  if (/\.(?:jks|p12|pfx|keystore)$/i.test(rel)) errors.push(`Signing or production key artifact included: ${rel}`);
  const full = resolveSafe(rel);
  const bytes = fs.readFileSync(full);
  const text = bytes.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(text) && rel !== privateKeyPath) {
    errors.push(`Private-key material outside the named test fixture: ${rel}`);
  }
}
if (actual.includes(privateKeyPath)) {
  const fixtureNotice = fs.readFileSync(resolveSafe('tests/fixtures/README.md'), 'utf8');
  if (!/TEST-ONLY|do not deploy/i.test(fixtureNotice)) errors.push('Included test private-key fixture lacks a clear test-only notice.');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    result: 'PASS_SOURCE_PACKAGE_INTEGRITY',
    listedFiles: expected.size,
    extractedFiles: actual.length,
    sourceFingerprints: manifest.sourceFingerprints,
    testOnlyKeyFixture: actual.includes(privateKeyPath)
  }, null, 2));
}
