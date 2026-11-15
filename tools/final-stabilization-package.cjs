'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestRel = 'acceptance/FINAL-STABILIZATION-SOURCE-MANIFEST.json';
const packageName = 'SightlineV3-Gameplay-Expansion-8.0-Final-Stabilization-EXPERIMENTAL-DEV-2026-11-06';
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = file => path.relative(root, file).split(path.sep).join('/');
const manifestPath = path.join(root, ...manifestRel.split('/'));

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const name = rel(file);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${name}`);
    if (entry.isDirectory()) walk(file, files);
    else if (entry.isFile() && name !== manifestRel) {
      files.push({ path: name, size: fs.statSync(file).size, sha256: hashFile(file) });
    } else if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${name}`);
  }
  return files;
}

function fingerprint(file) {
  const full = path.join(root, ...file.split('/'));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`Missing fingerprint input: ${file}`);
  return hashFile(full);
}

function create() {
  if (fs.existsSync(manifestPath)) throw new Error(`Refusing to overwrite existing final manifest: ${manifestPath}`);
  const files = walk(root).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = {
    schemaVersion: 1,
    packageName,
    packageType: 'experimental editable source and evidence; not a release, signed APK, or distribution',
    generatedAtUtc: new Date().toISOString(),
    filesExcludingManifest: files.length,
    provenance: {
      protectedInputZipSha256: 'c6af9a1b6b97962132d1b27a9b7c1bd78d5dd31f1c63129891453059ea8f0ccc',
      protectedInputManifestSha256: 'b25247b33ddc355bd6409c9665bfe59824ae5960148ab991b8f008ccb8fdfa6d'
    },
    sourceFingerprints: {
      phoneHostServer: fingerprint('AndroidProject/app/src/main/assets/phone-host/server.js'),
      phoneHostPage: fingerprint('AndroidProject/app/src/main/assets/phone-host/index.html'),
      offlinePage: fingerprint('AndroidProject/app/src/main/assets/www/index.html'),
      projectInstructions: fingerprint('AGENTS.md')
    },
    files
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'CREATED', packageName, manifest: manifestRel, files: files.length, manifestSha256: hashFile(manifestPath) }, null, 2));
}

function verify(targetRoot = root) {
  const base = path.resolve(targetRoot);
  const manifestFile = path.join(base, ...manifestRel.split('/'));
  if (!fs.existsSync(manifestFile)) throw new Error(`Missing final source manifest: ${manifestFile}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.packageName !== packageName) throw new Error(`Unexpected package identity: ${manifest.packageName}`);
  const expected = new Map();
  for (const item of manifest.files) {
    const name = item.path.replace(/\\/g, '/');
    if (!name || path.posix.isAbsolute(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe path in manifest: ${item.path}`);
    if (expected.has(name)) throw new Error(`Duplicate manifest path: ${name}`);
    const file = path.resolve(base, ...name.split('/'));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing or unsafe file: ${name}`);
    if (fs.statSync(file).size !== item.size || hashFile(file) !== item.sha256) throw new Error(`Size or SHA-256 mismatch: ${name}`);
    expected.set(name, item);
  }
  const actual = new Set();
  const originalRoot = root;
  const scan = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      const name = path.relative(base, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${name}`);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile() && name !== manifestRel) actual.add(name);
      else if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${name}`);
    }
  };
  scan(base);
  for (const name of actual) if (!expected.has(name)) throw new Error(`Unmanifested file: ${name}`);
  for (const name of expected.keys()) if (!actual.has(name)) throw new Error(`Manifest-only file: ${name}`);
  const agents = path.join(base, 'AGENTS.md');
  if (!fs.existsSync(agents) || hashFile(agents) !== manifest.sourceFingerprints.projectInstructions) throw new Error('Root AGENTS.md missing or hash differs');
  console.log(JSON.stringify({ status: 'PASS', packageName: manifest.packageName, verifiedFiles: expected.size, manifestSha256: hashFile(manifestFile), instructionsSha256: hashFile(agents) }, null, 2));
}

const [command, target] = process.argv.slice(2);
if (command === 'create') create();
else if (command === 'verify') verify(target || root);
else throw new Error('Usage: node tools/final-stabilization-package.cjs create|verify [project-root]');
