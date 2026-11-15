'use strict';
// Prepare an isolated Legendary 3.0 integration descendant. The protected
// parent is read-only; only an explicit, SHA-pinned mirrored asset allowlist
// can be overlaid, and the output directory must not already exist.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const EXPECTED_AGENTS_SHA256 = 'df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';
const ASSET_PREFIX = 'AndroidProject/app/src/main/assets/';
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const fileSha = file => digest(fs.readFileSync(file));
function walkFiles(root) {
  const out = [];
  function walk(dir, prefix = '') {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, ent.name), rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isSymbolicLink()) throw new Error(`Symbolic links are not accepted in a Legendary drop: ${rel}`);
      if (ent.isDirectory()) walk(abs, rel);
      else if (ent.isFile()) out.push(rel);
      else throw new Error(`Unsupported filesystem entry in Legendary drop: ${rel}`);
    }
  }
  walk(root);
  return out;
}
function normalizeAssetPath(value) {
  if (typeof value !== 'string' || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw new Error(`Invalid relative manifest path: ${value}`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe manifest path: ${value}`);
  if (!value.startsWith(ASSET_PREFIX)) throw new Error(`Only packaged game assets may be integrated automatically: ${value}`);
  const tail = value.slice(ASSET_PREFIX.length);
  if (!(tail.startsWith('www/') || tail.startsWith('phone-host/'))) throw new Error(`Asset path must be in www or phone-host: ${value}`);
  if (/prototype-continuous-arms|rejected[-_]hand|first[-_]person[-_]hand[-_]prototype/i.test(value)) throw new Error(`Rejected hand prototype path is not permitted: ${value}`);
  return value;
}
function validateDrop(dropRoot, manifest) {
  const root = path.resolve(dropRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error(`Legendary drop is not a directory: ${root}`);
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Manifest must be schemaVersion 1 with a non-empty files array.');
  const listed = new Map();
  for (const item of manifest.files) {
    const rel = normalizeAssetPath(item.path);
    const key = rel.toLowerCase();
    if (listed.has(key)) throw new Error(`Duplicate/case-colliding manifest path: ${rel}`);
    if (!/^[a-f0-9]{64}$/.test(String(item.sha256 || ''))) throw new Error(`Invalid SHA-256 for ${rel}`);
    listed.set(key, { path: rel, sha256: item.sha256 });
  }
  const actual = walkFiles(root).sort();
  if (actual.length !== listed.size) throw new Error(`Drop file count does not match manifest: ${actual.length} vs ${listed.size}`);
  for (const rel of actual) {
    const safe = normalizeAssetPath(rel);
    const item = listed.get(safe.toLowerCase());
    if (!item) throw new Error(`Unmanifested Legendary drop file: ${rel}`);
    if (fileSha(path.join(root, ...rel.split('/'))) !== item.sha256) throw new Error(`SHA-256 mismatch: ${rel}`);
  }
  for (const item of listed.values()) {
    const counterpart = item.path.includes('/www/') ? item.path.replace('/www/', '/phone-host/') : item.path.replace('/phone-host/', '/www/');
    const other = listed.get(counterpart.toLowerCase());
    if (!other) throw new Error(`Runtime asset must be supplied for both Offline and phone-host paths: ${item.path}`);
    if (other.sha256 !== item.sha256 || !fs.readFileSync(path.join(root, ...item.path.split('/'))).equals(fs.readFileSync(path.join(root, ...counterpart.split('/'))))) {
      throw new Error(`Offline and phone-host copies differ: ${item.path} vs ${counterpart}`);
    }
  }
  return { root, files: [...listed.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}
function parseHashFile(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!m) throw new Error(`Malformed hash-list line in ${file}: ${line}`);
    if (map.has(m[2])) throw new Error(`Duplicate hash-list path in ${file}: ${m[2]}`);
    map.set(m[2], m[1]);
  }
  return map;
}
function refreshHashFiles(projectRoot, incoming) {
  const androidRoot = path.join(projectRoot, 'AndroidProject');
  const currentFile = path.join(androidRoot, 'CURRENT-SOURCE-SHA256.txt');
  const current = parseHashFile(currentFile);
  for (const item of incoming) current.set(item.path.slice('AndroidProject/'.length), fileSha(path.join(projectRoot, ...item.path.split('/'))));
  for (const rel of current.keys()) {
    const abs = path.join(androidRoot, ...rel.split('/'));
    if (!fs.existsSync(abs)) throw new Error(`Android source manifest path is missing after staging: ${rel}`);
    current.set(rel, fileSha(abs));
  }
  fs.writeFileSync(currentFile, [...current].sort(([a], [b]) => a.localeCompare(b)).map(([p, h]) => `${h}  ${p}`).join('\n') + '\n');

  const hostRoot = path.join(androidRoot, 'app/src/main/assets/phone-host');
  const hostFile = path.join(hostRoot, 'SHA256SUMS');
  const host = parseHashFile(hostFile);
  for (const item of incoming) if (item.path.startsWith(`${ASSET_PREFIX}phone-host/`)) host.set(item.path.slice(`${ASSET_PREFIX}phone-host/`.length), fileSha(path.join(projectRoot, ...item.path.split('/'))));
  for (const rel of host.keys()) {
    const abs = path.join(hostRoot, ...rel.split('/'));
    if (!fs.existsSync(abs)) throw new Error(`Phone-host hash manifest path is missing after staging: ${rel}`);
    host.set(rel, fileSha(abs));
  }
  fs.writeFileSync(hostFile, [...host].sort(([a], [b]) => a.localeCompare(b)).map(([p, h]) => `${h}  ${p}`).join('\n') + '\n');
}
function copyProject(sourceRoot, outputRoot) {
  fs.cpSync(sourceRoot, outputRoot, { recursive: true, errorOnExist: true, force: false, filter(source) {
    const rel = path.relative(sourceRoot, source).split(path.sep);
    return !rel.some(part => part === '.git' || part === 'node_modules' || part === '.gradle' || part === 'build');
  } });
}
function prepareIntegration(sourceRoot, dropRoot, manifest, outputRoot) {
  const source = path.resolve(sourceRoot), output = path.resolve(outputRoot);
  const rel = path.relative(source, output);
  if (!rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))) throw new Error('Output must be a new directory outside the protected source root.');
  if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing output directory: ${output}`);
  const instruction = path.join(source, 'AGENTS.md');
  if (!fs.existsSync(instruction) || fileSha(instruction) !== EXPECTED_AGENTS_SHA256) throw new Error('Source AGENTS.md is missing or differs from the pinned current Sightline instructions. Reconcile instructions before staging.');
  const validated = validateDrop(dropRoot, manifest);
  copyProject(source, output);
  try {
    for (const item of validated.files) {
      const from = path.join(validated.root, ...item.path.split('/'));
      const to = path.join(output, ...item.path.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to); // output is a newly created private descendant, never the protected parent.
    }
    refreshHashFiles(output, validated.files);
    const delta = {
      schemaVersion: 1, owner: String(manifest.owner || 'Claude'), candidate: String(manifest.candidate || 'Legendary 3.0'),
      parent: path.basename(source), stagedAtUtc: new Date().toISOString(), parentAgentsSha256: fileSha(instruction),
      changedRuntimeFiles: validated.files.map(item => ({ path: item.path, parentSha256: fs.existsSync(path.join(source, ...item.path.split('/'))) ? fileSha(path.join(source, ...item.path.split('/'))) : null, stagedSha256: item.sha256 })),
      generatedHashFiles: ['AndroidProject/CURRENT-SOURCE-SHA256.txt', 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'],
      requirementsBeforeAcceptance: ['review visual and audio output', 'run full deterministic regression suite', 'run Android asset parity', 'build and verify a new APK with approved isolated toolchain', 'perform live LAN and physical-device acceptance where available']
    };
    const deltaPath = path.join(output, 'acceptance/legendary3-integration-delta.json');
    fs.mkdirSync(path.dirname(deltaPath), { recursive: true });
    fs.writeFileSync(deltaPath, JSON.stringify(delta, null, 2) + '\n');
    return { output, files: validated.files.length, deltaPath };
  } catch (error) {
    // Leave an incomplete output for forensic recovery rather than deleting a
    // directory recursively. The failure message names it explicitly.
    error.message += ` (partial isolated output preserved at ${output})`;
    throw error;
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 6) throw new Error('Usage: node tools/prepare-legendary3-integration.cjs <protected-dev-root> <drop-dir> <manifest.json> <new-output-dev-root>');
    const sourceRoot = process.argv[2], dropRoot = process.argv[3], manifestPath = path.resolve(process.argv[4]), outputRoot = process.argv[5];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(JSON.stringify({ status: 'PASS', ...prepareIntegration(sourceRoot, dropRoot, manifest, outputRoot) }, null, 2));
  } catch (error) { console.error(JSON.stringify({ status: 'REJECTED', error: String(error.stack || error) }, null, 2)); process.exitCode = 1; }
}
module.exports = { validateDrop, normalizeAssetPath, prepareIntegration };
