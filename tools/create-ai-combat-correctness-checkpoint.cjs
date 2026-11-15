'use strict';
// One-time, non-overwriting checkpoint for the verified AI/multiplayer change set.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'rollback/ai-combat-multiplayer-correctness-final-20261029');
const files = [
  'AGENTS.md',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/www/zombie-hunt.js',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'tests/authoritative-combat.mjs',
  'tests/capture-lan-host-status.test.cjs',
  'tests/mp-authoritative-death-respawn-projection.test.cjs',
  'tests/mp-reload-transition-correctness.test.cjs',
  'tests/mp-remote-pose-reuse.test.cjs',
  'tests/phase2-android-asset-parity.mjs',
  'tests/phase5-refresh-android-hashes.cjs',
  'tests/phase6-source-manifest.cjs',
  'tools/bench-ai-perception-load.cjs',
  'tools/capture-lan-host-status.cjs',
  'tools/create-ai-combat-correctness-checkpoint.cjs',
  'acceptance/AI-COMBAT-MULTIPLAYER-CORRECTNESS-2026-10-29.md',
  'acceptance/AI-COMBAT-MULTIPLAYER-CORRECTNESS-2026-10-29.json',
  'acceptance/benchmarks/ai-perception-cumulative-cost-2026-10-29.json'
];
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (fs.existsSync(destination)) throw new Error('Refusing to overwrite existing checkpoint: ' + destination);
for (const relative of files) {
  const source = path.join(root, relative);
  if (!fs.statSync(source).isFile()) throw new Error('Checkpoint source is not a file: ' + relative);
}
fs.mkdirSync(destination, { recursive: true });
const copied = [];
for (const relative of files) {
  const source = path.join(root, relative), target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  const sourceHash = digest(source), targetHash = digest(target);
  if (sourceHash !== targetHash) throw new Error('Checkpoint copy hash mismatch: ' + relative);
  copied.push({ path: relative, sha256: sourceHash, bytes: fs.statSync(source).size });
}
const checkpoint = {
  name: 'ai-combat-multiplayer-correctness-final-20261029',
  createdAtUtc: new Date().toISOString(),
  rollbackToPreChange: 'rollback/ai-combat-navigation-post-20261029',
  scope: 'Changed source, parity/hash manifests, focused regression files, benchmark, and acceptance report; not a complete project backup.',
  files: copied
};
const checkpointFile = path.join(destination, 'CHECKPOINT.json');
fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2) + '\n');
const manifest = copied.concat([{ path: 'CHECKPOINT.json', sha256: digest(checkpointFile), bytes: fs.statSync(checkpointFile).size }]);
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), manifest.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n');
for (const row of manifest) if (digest(path.join(destination, row.path)) !== row.sha256) throw new Error('Final checkpoint verification failed: ' + row.path);
process.stdout.write(JSON.stringify({ status: 'CHECKPOINT_VERIFIED', destination, files: manifest.length, sourceSha256: digest(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js')) }, null, 2) + '\n');
