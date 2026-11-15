'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const project = path.resolve(__dirname, '../AndroidProject');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function refresh(listFile, root) {
  const lines = fs.readFileSync(listFile, 'utf8').trimEnd().split(/\r?\n/);
  const updated = lines.map(line => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Malformed hash-list entry: ${line}`);
    const file = path.join(root, ...match[2].split('/'));
    if (!fs.statSync(file).isFile()) throw new Error(`Listed file is missing: ${match[2]}`);
    return `${digest(file)}  ${match[2]}`;
  });
  fs.writeFileSync(listFile, updated.join('\n') + '\n');
  return updated.length;
}
const hostCount = refresh(path.join(project, 'app/src/main/assets/phone-host/SHA256SUMS'), path.join(project, 'app/src/main/assets/phone-host'));
// CURRENT-SOURCE-SHA256.txt includes the phone-host SHA256SUMS file itself,
// so refresh the host inventory first and hash its final bytes afterward.
const androidCount = refresh(path.join(project, 'CURRENT-SOURCE-SHA256.txt'), project);
console.log(JSON.stringify({ status: 'PASS', androidSourceEntries: androidCount, phoneHostEntries: hostCount }, null, 2));
