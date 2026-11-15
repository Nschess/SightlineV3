'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Evade = require('../AndroidProject/app/src/main/assets/phone-host/infection-evasion.js');
const { G, players, MAPS, _t: T } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
function scenario(s, t, d = 12, extra = {}) {
  return Evade.choose(s, { time:t, distance:d, x:0, z:0, target:{x:0,y:0,z:-d}, visible:true, grounded:true, clearance:true, skill:'regular', ...extra }, () => 0);
}
afterEach(() => { players.clear(); G.mode='versus'; G.phase='lobby'; });

test('Infection evasion responds only to nearby observed fire and real damage, then decays', () => {
  const s = Evade.create(7);
  const output = {};
  assert.deepEqual(scenario(s, 2000), {active:false,jump:false,goal:null});
  Evade.gunshot(s, 1000, 12);
  Evade.hurt(s, 1100);
  assert.equal(scenario(s, 1200).active, false);
  const ready = scenario(s, 1510);
  assert.equal(ready.active, true);
  assert.ok(ready.goal && Math.abs(ready.goal.x) <= 1.5);
  assert.equal(ready.jump, true);
  assert.equal(scenario(s, 1540).jump, false);
  assert.equal(scenario(s, 5000).active, false);
  assert.strictEqual(Evade.choose(s,{time:5100,distance:12,x:0,z:0,target:{x:0,y:0,z:-12},visible:true,skill:'regular'},null,output),output,'caller can reuse per-zombie output storage');
});

test('authoritative Infection server hooks record human gunfire and hits; Outbreak remains unchanged', () => {
  players.clear(); G.mode='infection'; G.phase='live'; G.map='courtyard'; G.phaseEnd=Date.now()+60000; T.INF.started=true;
  const defender=T.makeBot(0), infected=T.makeBot(0);
  for (const [i,p] of [defender,infected].entries()) { p.x=5+i*4; p.z=5; p.y=0; p.alive=true; p.armor=0; p.hp=100; }
  assert.equal(T.infectionConvert(infected,null),true);
  const infectedHp = infected.hp;
  T.hearShot(defender,{key:'smg'});
  assert.ok(infected.ai.infectionEvasion && infected.ai.infectionEvasion.pressure>0);
  T.damage(defender,infected,15,false,'smg');
  assert.ok(infected.ai.infectionEvasion.pressure>0.6);
  assert.equal(infected.hp,infectedHp-15);
  G.mode='outbreak';
  const other=T.makeBot(0); other.alive=true;
  T.damage(defender,other,1,false,'smg');
  assert.equal(other.ai.infectionEvasion,null);
});

test('LAN infected bots approach under threat using collision-safe movement and bounded jumps', () => {
  players.clear(); G.mode='infection'; G.phase='live'; G.map='courtyard'; G.phaseEnd=Date.now()+90000; T.INF.started=true;
  const N=T.buildNav(MAPS.courtyard); let pair=null;
  for (const a of N.nodes) {
    if (a.y>0.1 || T.boxOverlap(MAPS.courtyard,a.x,a.z,0.45)) continue;
    for (const b of N.nodes) {
      const d=Math.hypot(a.x-b.x,a.z-b.z);
      if (b.y>0.1 || d<14 || d>19 || !T.walkClear(N,a.x,a.z,b.x,b.z)) continue;
      pair=[a,b]; break;
    }
    if (pair) break;
  }
  assert.ok(pair,'map must provide an unobstructed legal pursuit lane');
  const [a,b]=pair, survivor=T.makeBot(0), zombie=T.makeBot(0);
  for (const [p,n] of [[survivor,a],[zombie,b]]) { p.x=n.x;p.z=n.z;p.y=0;p.alive=true;p.armor=0;p.hp=100;p.ai.scanT=100; }
  assert.equal(T.infectionConvert(zombie,null),true);
  const zombieHp = zombie.hp;
  zombie.ai.tgt=survivor; zombie.ai.scanT=100;
  zombie.yaw=Math.atan2(-(survivor.x-zombie.x),-(survivor.z-zombie.z));
  zombie.nextPush=Date.now()+10000;
  T.damage(survivor,zombie,15,false,'smg');
  const start=Date.now()+700, initial=Math.hypot(survivor.x-zombie.x,survivor.z-zombie.z);
  let apex=0,maxSpeed=0,maxStep=0; const oldRandom=Math.random; Math.random=()=>0;
  try {
    // The host's 6 ms decision-work budget may defer a due bot during a loaded
    // test run. On its next decision the server integrates the elapsed think
    // interval (capped at 100 ms), so compare movement with the actual AI step,
    // not an unconditional 50 ms host tick. Dividing a valid 100 ms catch-up
    // move by 50 ms produced a false 9.00144 speed-boost report. Client pose
    // continuity through a deferred decision is covered separately by the
    // snapshot-smoothing regressions.
    for(let tick=0;tick<60;tick++) {
      const ox=zombie.x,oz=zombie.z,priorThinkAt=zombie.ai.lastThinkAt;
      T.botsTick(0.05,start+tick*50);
      apex=Math.max(apex,zombie.y);
      const step=Math.hypot(zombie.x-ox,zombie.z-oz),thinkAt=zombie.ai.lastThinkAt;
      maxStep=Math.max(maxStep,step);
      const integratedMs=Number.isFinite(priorThinkAt)&&Number.isFinite(thinkAt)&&thinkAt>priorThinkAt
        ? Math.min(100,thinkAt-priorThinkAt) : 50;
      if(step>0)maxSpeed=Math.max(maxSpeed,step/(integratedMs/1000));
      assert.equal(T.boxOverlap(MAPS.courtyard,zombie.x,zombie.z,0.4),false,'collision boxes stay solid');
      if(G.phase!=='live') break;
    }
  } finally { Math.random=oldRandom; }
  const dist=Math.hypot(survivor.x-zombie.x,survivor.z-zombie.z);
  assert.ok(dist<initial-2.0,'infected must approach rather than dodge aimlessly: '+initial+' -> '+dist);
  assert.ok(apex>0.25&&apex<1.35,'jump stays inside normal ballistic height: '+apex);
  assert.ok(maxSpeed<=5.3,'movement stays within the 5.3 m/s cap over the actual AI integration interval: '+maxSpeed);
  assert.ok(maxStep<=0.53+1e-6,'deferred decisions integrate no more than the capped 100 ms step: '+maxStep);
  assert.equal(zombie.hp,zombieHp-15,'evasion cannot restore HP');
});
