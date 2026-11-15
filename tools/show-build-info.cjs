'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'AndroidProject/app/src/main/assets/www');
const phone = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const local = {
  offlinePageSha256: sha(path.join(www, 'index.html')),
  phoneHostPageSha256: sha(path.join(phone, 'index.html')),
  phoneHostInventorySha256: sha(path.join(phone, 'SHA256SUMS')),
  phoneHostServerSourceSha256: sha(path.join(phone, 'server.js'))
};

async function probe(url) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(900) });
    const body = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
    return { state: response.ok ? 'running' : `http-${response.status}`, body };
  } catch (_) { return { state: 'not-running' }; }
}

(async () => {
  const [offline, lan] = await Promise.all([
    probe('http://127.0.0.1:8090/__build'), probe('http://127.0.0.1:8080/status')
  ]);
  const result = {
    candidate: 'Sightline V3 Expansion 8.3 experimental',
    local,
    served: {
      offline: offline.state === 'running' ? { state: offline.state, route: offline.body?.route || null, pageSha256: offline.body?.pageSha256 || null } : { state: offline.state },
      lanHost: lan.state === 'running' ? { state: lan.state, game: lan.body?.game || null, pageSha256: lan.body?.bundle || null, runtimeInventorySha256: lan.body?.server || null, phase: lan.body?.phase || null } : { state: lan.state }
    }
  };
  const mismatches = [];
  if (offline.state === 'running' && offline.body?.pageSha256 !== local.offlinePageSha256) mismatches.push('port 8090 serves a different Offline page than this package');
  if (lan.state === 'running') {
    if (lan.body?.bundle !== local.phoneHostPageSha256) mismatches.push('port 8080 serves a different phone-host page than this package');
    if (lan.body?.server !== local.phoneHostInventorySha256) mismatches.push('port 8080 serves a different phone-host inventory than this package');
  }
  result.status = mismatches.length ? 'STALE OR MISMATCHED SERVER' : (offline.state === 'running' || lan.state === 'running' ? 'SERVED BUILD MATCHES' : 'LOCAL CANDIDATE FINGERPRINTED; SERVERS NOT RUNNING');
  if (mismatches.length) result.mismatches = mismatches;
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (mismatches.length) process.exitCode = 2;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
