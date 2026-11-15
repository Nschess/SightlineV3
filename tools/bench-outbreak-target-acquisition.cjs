'use strict';

// Deterministic target-acquisition latency probe against the real LAN host
// perception function and a real map occluder. This opens no sockets and does
// not claim browser, Wi-Fi, or rendered-game acceptance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAPS, G, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');

const map = MAPS.courtyard;
const priorBoxes = map.boxes.slice();
const priorMode = G.mode;
const priorPhase = G.phase;
const priorMap = G.map;
const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets/phone-host');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

try {
  G.mode = 'outbreak'; G.phase = 'live'; G.map = 'courtyard';
  _t.obReset();
  _t.OB.zs.clear();
  // Blocks the nearer screen but leaves one farther survivor visible around
  // the left edge. The wall and layout match the authoritative fairness test.
  map.boxes.push([13, 17, 18, 20, 4]);
  const hidden = Array.from({ length: 63 }, (_, i) => ({
    id: 100 + i, bot: false, team: i % 2, alive: true,
    x: 15 + (i % 7) * 0.035, y: 0, z: 21 + (i % 3) * 0.04,
    hp: 100, armor: 0, hist: []
  }));
  const visible = { id: 1000, bot: false, team: 0, alive: true, x: 6, y: 0, z: 26, hp: 100, armor: 0, hist: [] };
  const survivors = [...hidden, visible];
  const zombie = _t.makeZ(15, 15, 'walker', 1);
  for (const [key, value] of _t.OB.zs) if (value === zombie) _t.OB.zs.delete(key);
  zombie.id = 6; // maximal documented sense interval: 220 + 6*43 = 478 ms
  _t.OB.zs.set(zombie.id, zombie);
  zombie.rise = 0; zombie.yaw = Math.PI; zombie.tt = 0; zombie.gSpd = 0;
  zombie.atkT = 1000; zombie.perceptionCursor = undefined;

  const los = target => {
    const dx = target.x - zombie.x, dz = target.z - zombie.z, d = Math.hypot(dx, dz);
    return _t.wallDist(map, zombie.x, zombie.y + 1.35, zombie.z,
      dx / d, (target.y - zombie.y) / d, dz / d, d) >= d - 0.12;
  };
  if (hidden.some(los) || !los(visible)) throw new Error('Probe fixture does not separate blocked and visible targets.');

  const start = 100000, stepMs = 20, dt = stepMs / 1000;
  let foundAt = null, scans = 0, maxCandidates = 0;
  const scanHistory = [];
  for (let tick = 0; tick <= 1500; tick++) {
    const now = start + tick * stepMs;
    zombie.senseDt = dt;
    const scanStep = Math.min(0.15, Math.max(0.01, zombie.senseDt || 0.05));
    const scanDue = zombie.tt <= scanStep;
    const target = _t.zombiePerceive(zombie, survivors, map, now);
    if (zombie.perceptionScratch) {
      maxCandidates = Math.max(maxCandidates, zombie.perceptionScratch.length);
      if (scanDue) {
        scans++;
        scanHistory.push({ atMs: now - start, candidateIds: zombie.perceptionScratch.map(x => x.p.id) });
      }
    }
    if (target === visible) { foundAt = now; break; }
  }
  const intervalMs = foundAt === null ? null : foundAt - start;
  const source = {
    server: hash(path.join(assets, 'server.js')),
    zombieHunt: hash(path.join(assets, 'zombie-hunt.js'))
  };
  const result = {
    test: 'authoritative Outbreak target-acquisition latency with occluded nearer survivors',
    status: foundAt === null ? 'FAIL' : 'MEASURED',
    workload: { survivors: survivors.length, hiddenOccluded: hidden.length, visibleOutlierId: visible.id, zombieId: zombie.id, senseIntervalMs: Math.round(_t.zombiePerceptionInterval(zombie.id) * 1000), hostTickMs: 20, map: 'courtyard' },
    result: { acquired: foundAt !== null, simulatedLatencyMs: intervalMs, perceptionScansIncludingInitial: scans, scanHistory, maxCandidateScratchLength: maxCandidates, candidateLimit: 5, visibilityLimitChanged: false },
    sourceSha256: source,
    limitations: [
      'Deterministic in-process test of the actual authoritative perception function, not a full match.',
      'No network, browser rendering, animation, Wi-Fi, Android device, or physical frame-time measurement.'
    ]
  };
  const out = path.resolve(process.argv[2] || path.join(__dirname, '../acceptance/benchmarks/outbreak-target-acquisition.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, out }, null, 2));
  if (foundAt === null) process.exitCode = 1;
} finally {
  map.boxes.splice(0, map.boxes.length, ...priorBoxes);
  _t.obReset();
  G.mode = priorMode; G.phase = priorPhase; G.map = priorMap;
}
