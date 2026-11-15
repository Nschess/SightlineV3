'use strict';

// Register the two deterministic lobby soundtrack copies in the Android
// source and phone-host integrity indexes. Safe to rerun.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const android = path.join(root, 'AndroidProject');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function ensureRow(listPath, relativePath, filePath) {
  const lines = fs.readFileSync(listPath, 'utf8').trimEnd().split(/\r?\n/);
  const rows = lines.map(line => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Malformed integrity row in ${listPath}: ${line}`);
    return { path: match[2], line };
  });
  const matching = rows.filter(row => row.path === relativePath);
  if (matching.length > 1) throw new Error(`Duplicate integrity row: ${relativePath}`);
  const row = `${hash(filePath)}  ${relativePath}`;
  if (matching.length) lines[rows.indexOf(matching[0])] = row;
  else lines.push(row);
  fs.writeFileSync(listPath, lines.join('\n') + '\n');
}

ensureRow(
  path.join(android, 'CURRENT-SOURCE-SHA256.txt'),
  'app/src/main/assets/www/lobby-cinematic.wav',
  path.join(android, 'app/src/main/assets/www/lobby-cinematic.wav')
);
ensureRow(
  path.join(android, 'CURRENT-SOURCE-SHA256.txt'),
  'app/src/main/assets/phone-host/lobby-cinematic.wav',
  path.join(android, 'app/src/main/assets/phone-host/lobby-cinematic.wav')
);
ensureRow(
  path.join(android, 'app/src/main/assets/phone-host/SHA256SUMS'),
  'lobby-cinematic.wav',
  path.join(android, 'app/src/main/assets/phone-host/lobby-cinematic.wav')
);
console.log(JSON.stringify({ status: 'REGISTERED', soundtrackSha256: hash(path.join(android, 'app/src/main/assets/www/lobby-cinematic.wav')) }));
