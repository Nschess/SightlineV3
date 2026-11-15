'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');
const start = html.indexOf('var LAN_DIAG = (function () {');
const next = html.indexOf('var MP_PROTOCOL', start);
const end = html.lastIndexOf('})();', next);
assert.ok(start >= 0 && next > start && end > start, 'diagnostic initializer can be isolated');
const initializer = html.slice(start, end + '})();'.length);

function makeContext(search) {
  const elements = new Map();
  const body = { appendChild(node) { elements.set(node.id, node); } };
  const document = {
    body,
    createElement(tag) { return { tag, style: {}, click() { this.clicked = true; } }; },
    getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); }
  };
  let blobText = '';
  class FakeBlob { constructor(parts) { blobText = String(parts[0]); } }
  const context = {
    document, location: { search, origin: 'http://127.0.0.1:8080', pathname: '/' },
    navigator: { userAgent: 'LAN diagnostics test' }, MP: { on: true, mode: 'outbreak' },
    performance: { now: (() => { let n = 0; return () => ++n * 10; })() },
    Date, Math, Number, String, Array, Object, JSON, Blob: FakeBlob,
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout() {}, setInterval() {}, fetch() { throw new Error('test must not poll implicitly'); },
    __elements: elements, __blobText: () => blobText
  };
  vm.createContext(context);
  vm.runInContext(initializer, context, { timeout: 1000 });
  return context;
}

test('LAN diagnostics are absent unless explicitly opted in', () => {
  const c = makeContext('');
  assert.equal(c.LAN_DIAG, null);
  assert.equal(c.__elements.size, 0);
});

test('opt-in diagnostics summarize frames, snapshots, corrections, zombie motion and host recovery', () => {
  const c = makeContext('?lanDiag=1');
  const d = c.LAN_DIAG;
  assert.ok(d);
  assert.equal(c.__elements.has('sightline-lan-diag'), true);
  d.frame(10, true); d.frame(26, true); d.frame(49, true);
  d.snapshot(20, 20); d.snapshot(36, 20); d.missed(2);
  d.correction(0.4, 0.2, 'zombie-pose-recovery');
  d.zombieStep(0.1, 0.1, 0.02, 0);
  d.zombieStep(0.8, 1.1, 0.02, 2);
  d.host({ ok: true, bundle: 'page-hash', server: 'server-hash', phase: 'live', mode: 'outbreak', players: 1, bots: 16, zombies: 8, zombiePaths: { paths: 10, recover: 2, failed: 1 }, bot: { stuck: 3 }, navigation: { partial: 1 }, liveTiming: { tickP95: 4 } });
  d.host({ ok: true, bundle: 'page-hash', server: 'server-hash', zombiePaths: { paths: 14, recover: 3, failed: 1 }, bot: { stuck: 4 } });
  assert.equal(d.summary(d.frameMs).p50, 16);
  assert.equal(d.summary(d.frameMs).p95, 23);
  assert.equal(d.summary(d.snapshotGapMs).p50, 20);
  assert.equal(d.summary(d.hostSnapshotGapMs).p99, 20);
  assert.equal(d.sequenceMissed, 2);
  assert.equal(d.corrections, 1);
  assert.equal(d.correctionMaxM, 0.4);
  assert.equal(d.zombieDiscontinuities, 1);
  assert.equal(d.zombieTurns, 1);
  assert.equal(d.hostSamples[1].zombiePathDelta['zombiePaths.paths'], 4);
  assert.equal(d.hostSamples[1].zombiePathDelta.botStuck, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(d.fingerprints)), { bundle: 'page-hash', server: 'server-hash' });
  c.__elements.get('sightline-lan-diag-stop').onclick();
  d.snapshot(99, 99); d.frame(99, true);
  assert.equal(d.snapshots, 2, 'stopping freezes collection');
});

