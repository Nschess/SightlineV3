'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const clients = ['www', 'phone-host'].map(name => ({
  name,
  html: fs.readFileSync(path.join(assets, name, 'index.html'), 'utf8')
}));

for (const { name, html } of clients) {
  test(name + ': remote poses use the host timeline instead of arrival jitter', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpSnapshot(', start);
    assert.ok(start >= 0 && end > start, 'snapshot clock mapping source is present');
    const context = vm.createContext({ Math, Number });
    vm.runInContext(html.slice(start, end) + '\nthis.poseTime=mpSnapshotPoseTime;', context);
    const serverTimes = [0, 20, 40, 60, 80];
    const arrivals = [100, 134, 141, 174, 194];
    const net = {};
    const mapped = serverTimes.map((stamp, i) => context.poseTime(stamp, arrivals[i], net));
    assert.ok(mapped.every((time, i) => time <= arrivals[i]), 'mapped snapshots never render before they arrive');
    for (let i = 1; i < mapped.length; i++) {
      assert.ok(Math.abs((mapped[i] - mapped[i - 1]) - (serverTimes[i] - serverTimes[i - 1])) < .1,
        'delivery jitter does not change the authoritative 20 ms sample spacing');
    }
    assert.equal(context.poseTime(undefined, 250, net), 250, 'older servers retain arrival-time compatibility');
  });

  test(name + ': actual snapshot ingestion preserves host pose spacing during packet jitter', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpEnsureZombie(', start);
    assert.ok(start >= 0 && end > start, 'snapshot ingestion source is present');
    let now = 100;
    const actor = { id: 7, infected: false, wasAlive: true, buf: [], finishes: {} };
    const context = vm.createContext({
      Math, Number, MP: { on: true, id: 0, mode: 'versus', net: { ema: 20, jit: 0, last: 0, gapMax: 0, rn: 0 },
        snapN: 0, puppets: { 7: actor }, zombies: {}, weapons: ['pistol'] },
      performance: { now: () => now }, ensureWorldWeapon() {}, mpApplyWorldFinish() {}
    });
    vm.runInContext(html.slice(start, end) + '\nthis.snapshot=mpSnapshot;', context);
    const row = x => [7, x, 0, x, 0, 0, 0, 0, 0, 1, 0, 0];
    context.snapshot({ n:1, st: 0, a: [row(0)], z: [] });
    now = 134;
    context.snapshot({ n:2, st: 20, a: [row(.1)], z: [] });
    now = 141;
    context.snapshot({ n:3, st: 40, a: [row(.2)], z: [] });
    assert.equal(actor.buf.length, 3);
    assert.ok(Math.abs(actor.buf[1].t - actor.buf[0].t - 20) < .1, 'first pose spacing follows 20 ms host time despite 34 ms arrival gap');
    assert.ok(Math.abs(actor.buf[2].t - actor.buf[1].t - 20) < .1, 'second pose spacing follows 20 ms host time despite 7 ms arrival gap');
    now = 181;
    context.snapshot({ n:5, st:80, a:[row(.4)], z:[] });
    assert.equal(context.MP.net.poseSeqMissed,1,'snapshot sequence reports one omitted host update');
    assert.equal(context.MP.net.poseHostGapMax,40,'host cadence measurement reports the 40 ms sample gap');
  });

  test(name + ': duplicate and stale snapshot sequences cannot rewind remote pose state', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpEnsureZombie(', start);
    assert.ok(start >= 0 && end > start, 'snapshot sequence consumer is present');
    let now = 100;
    const actor = { id: 7, infected: false, wasAlive: true, buf: [], finishes: {} };
    const context = vm.createContext({
      Math, Number,
      performance: { now: () => now },
      MP: { on: true, id: 0, mode: 'versus', net: { ema: 20, jit: 0, last: 0, gapMax: 0, rn: 0 },
        snapN: 0, puppets: { 7: actor }, zombies: {}, weapons: ['pistol'] },
      ensureWorldWeapon() {}, mpApplyWorldFinish() {}
    });
    vm.runInContext(html.slice(start, end) + '\nthis.snapshot=mpSnapshot;', context);
    const row = x => [7, x, 0, x, 0, 0, 0, 0, 0, 1, 0, 0];
    context.snapshot({ n: 10, st: 1000, a: [row(1)], z: [] });
    now = 120; context.snapshot({ n: 10, st: 1000, a: [row(99)], z: [] });
    now = 140; context.snapshot({ n: 9, st: 980, a: [row(-50)], z: [] });
    assert.equal(actor.buf.length, 1, 'duplicate and older sequence numbers are discarded before enqueue');
    assert.equal(actor.buf[0].x, 1, 'stale poses cannot rewind the actor');
    assert.equal(context.MP.net.poseLastSeq, 10, 'the high-water sequence remains monotonic');
    assert.equal(context.MP.snapN, 1, 'discarded snapshots do not refresh actor/zombie freshness counters');
    assert.equal(context.MP.net.poseSeqRejected, 2, 'diagnostics count discarded duplicate and stale snapshots');

    now = 160; context.MP.net = { ema: 20, jit: 0, last: 0, gapMax: 0, rn: 0 };
    context.snapshot({ n: 1, st: 20, a: [row(2)], z: [] });
    assert.equal(actor.buf.length, 2, 'a new connection accepts its first sequence after reconnect reset');
    assert.equal(context.MP.net.poseLastSeq, 1, 'the new connection establishes an independent sequence high-water mark');
  });

  test(name + ': pose diagnostics distinguish wait, interpolation, prediction, and damped cap tail', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpEnsureZombie(', start);
    const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x=x; this.y=y; this.z=z; } });
    const context = vm.createContext({ Math, Number, MP:{net:{ema:20}}, SightlinePoses:{apply(){}}, poseWorldArms(){}, hurtGlow(){} });
    vm.runInContext(html.slice(start, end) + '\nthis.queue=mpQueueRemotePose;this.step=mpPuppetStep;', context);
    const actor = { wasAlive:true, alive:true, buf:[], poseSamplePool:[], x:0,y:0,z:0,yaw:0,pitch:0,phase:0,fall:0,gone:0,flashT:0,hurtT:0,
      op:{w:1,h:1}, legs:{rotation:{x:0}}, g:{parent:{},visible:true,position:axis(),rotation:{x:0,y:0,z:0},scale:{set(){}}} };
    context.queue(actor,100,0,0,0,0,0,0,0,true,0,false);
    context.queue(actor,120,.12,0,0,0,0,0,0,true,0,false);
    context.step(actor,1/60,90);
    assert.equal(actor.poseState,1,'target before oldest sample is a visible pose wait');
    context.step(actor,1/60,110);
    assert.equal(actor.poseState,0,'target bracketed by snapshots is interpolated');
    context.step(actor,1/60,140);
    assert.equal(actor.poseState,2,'short gap after newest sample uses bounded prediction');
    const beforeTailX=actor.x;
    context.step(actor,1/60,180);
    assert.equal(actor.poseState,3,'gap beyond normal prediction allowance enters the damped tail');
    assert.ok(actor.x>beforeTailX,'remote motion continues past the normal prediction cap instead of freezing');
    assert.ok(actor.x<=.12+6*(25+24)/1000+1e-9,'damped tail adds no more than 24 ms equivalent travel');
  });

  test(name + ': remote pose queue reuses samples and preserves interpolation order', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpSnapshot(', start);
    assert.ok(start >= 0 && end > start, 'remote pose queue source is present');
    const context = vm.createContext({});
    vm.runInContext(html.slice(start, end) + '\nthis.queue=mpQueueRemotePose;', context);

    const actor = { wasAlive: true, buf: [] };
    for (let i = 0; i < 12; i++) {
      context.queue(actor, i * 20, i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, true, i / 12, false);
    }
    assert.equal(actor.buf.length, 12, 'queue depth stays capped at the established 12 samples');
    const recycled = actor.buf[0];
    const returned = context.queue(actor, 240, 12, 13, 14, 15, 16, 17, 18, true, .75, false);
    assert.equal(returned, recycled, 'full queue recycles the oldest sample object');
    assert.equal(actor.buf.length, 12);
    assert.equal(actor.buf[0].t, 20, 'oldest sample is evicted in chronological order');
    assert.equal(actor.buf[11].t, 240, 'newest sample is appended in chronological order');
    assert.equal(actor.buf[11].rl, .75, 'reload interpolation data is retained');
  });

  test(name + ': respawn resets interpolation with a reused first sample', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpSnapshot(', start);
    const context = vm.createContext({});
    vm.runInContext(html.slice(start, end) + '\nthis.queue=mpQueueRemotePose;', context);
    const actor = { wasAlive: false, buf: [] };
    for (let i = 0; i < 6; i++) context.queue(actor, i * 20, i, 0, 0, 0, 0, 0, 0, false, 0, false);
    const first = actor.buf[0];
    const sample = context.queue(actor, 200, 8, 9, 10, 1.2, -.1, .4, .2, true, .5, true);
    assert.equal(sample, first, 'respawn reuses an existing sample');
    assert.equal(actor.buf.length, 1, 'respawn discards stale pre-death history');
    assert.equal(actor.poseSamplePool.length, 5, 'other stale samples return to the actor pool');
    assert.deepEqual({ t: sample.t, x: sample.x, y: sample.y, z: sample.z, yaw: sample.yaw, pitch: sample.pitch, cr: sample.cr, pr: sample.pr, al: sample.al, rl: sample.rl },
      { t: 200, x: 8, y: 9, z: 10, yaw: 1.2, pitch: -.1, cr: .4, pr: .2, al: true, rl: .5 });
  });

  test(name + ': render consumption recycles samples for 64 actors at 50 Hz snapshots / 60 Hz rendering', () => {
    const start = html.indexOf('function mpQueueRemotePose(');
    const end = html.indexOf('function mpEnsureZombie(', start);
    const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    const context = vm.createContext({
      Math, MP: { net: { ema: 20 }, dirty: false },
      SightlinePoses: { apply() {} }, poseWorldArms() {}, hurtGlow() {}
    });
    vm.runInContext(html.slice(start, end) + '\nthis.queue=mpQueueRemotePose;this.step=mpPuppetStep;', context);
    const actors = Array.from({ length: 64 }, (_, id) => ({
      id, wasAlive: true, alive: true, buf: [], poseSamplePool: [], seen: new Set(),
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, phase: 0, cr: 0, pr: 0, fall: 0, gone: 0,
      flashT: 0, hurtT: 0, op: { w: 1, h: 1 }, legs: { rotation: { x: 0 } },
      g: { parent: {}, visible: true, position: axis(), rotation: { x: 0, y: 0, z: 0 }, scale: { set() {} } }
    }));
    let now = 0, nextSnapshot = 0, snapshots = 0;
    for (let frame = 0; frame < 300; frame++) {
      now += 1000 / 60;
      if (now >= nextSnapshot) {
        snapshots++;
        for (const actor of actors) {
          const sample = context.queue(actor, now, actor.id + now / 1000, 0, now / 1000, 0, 0, 0, 0, true, 0, false);
          actor.seen.add(sample);
        }
        nextSnapshot += 20;
      }
      for (const actor of actors) context.step(actor, 1 / 60, now - 20);
    }
    assert.ok(snapshots >= 240 && snapshots <= 260, 'test covers about five seconds of 50 Hz snapshots');
    assert.ok(actors.every(actor => actor.buf.length <= 3), 'the live interpolation queue remains shallow');
    assert.ok(actors.every(actor => actor.seen.size <= 6), 'recycled pool bounds unique sample objects per live actor');
    assert.ok(actors.every(actor => actor.buf.length >= 1), 'rendered bots retain samples for interpolation');
    assert.ok(actors.every(actor => actor.x > 0), 'the real puppet step still advances actor transforms');
    assert.equal(actors.reduce((n, actor) => n + actor.seen.size, 0) <= 64 * 6, true,
      'many thousands of snapshot writes reuse a small fixed object pool');
  });
}

test('offline and phone-host remote-pose paths stay byte-identical', () => {
  function posePipeline(html){const start=html.indexOf('function mpQueueRemotePose('),end=html.indexOf('function mpEnsureZombie(',start+1);assert.ok(start>=0&&end>start,'remote-pose pipeline is present');return html.slice(start,end).trim();}
  assert.equal(posePipeline(clients[0].html),posePipeline(clients[1].html),'shared remote-pose functions remain in parity');
});
