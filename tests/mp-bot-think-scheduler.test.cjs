'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, players, MAPS, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test.afterEach(() => {
  players.clear();
  _t.resetCoopSquad();
  _t.botStats.thinks = 0;
  _t.botStats.thinkBudgetHitTicks = 0;
  _t.botStats.thinkBudgetDeferredBots = 0;
  _t.botStats.thinkCapDeferredBots = 0;
  _t.botStats.scanLosReused = 0;
  G.phase = 'lobby'; G.mode = 'versus'; G.map = 'courtyard';
});

test('a not-yet-due bot does not starve later bots whose decision is due', () => {
  G.phase = 'live'; G.mode = 'versus'; G.map = 'courtyard';
  players.set(1, { id: 1, bot: false, alive: true, team: 0, x: 0, y: 0, z: 0 });
  const waiting = _t.makeBot(1), due = _t.makeBot(1);
  waiting.alive = due.alive = true;
  waiting.x = -8; waiting.z = 0; due.x = 8; due.z = 0;
  waiting.ai.scanT = due.ai.scanT = 10;
  waiting.ai.nextThinkAt = 1000;
  due.ai.nextThinkAt = 100;

  const before = _t.botStats.thinks;
  _t.botsTick(0.02, 100);

  assert.equal(waiting.ai.lastThinkAt, undefined, 'future-scheduled bot must be skipped');
  assert.equal(due.ai.lastThinkAt, 100, 'later due bot must still receive its AI update this tick');
  assert.equal(_t.botStats.thinks - before, 1, 'only the due bot should consume a decision this tick');
});

test('a budget-limited pass resumes after the last serviced roster entry', () => {
  const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../AndroidProject/app/src/main/assets/phone-host/server.js'),'utf8');
  const start=source.indexOf('function botsTick(dt, t) {'),end=source.indexOf('\nfunction botsRoundReset',start),body=source.slice(start,end);
  assert.ok(start>=0&&end>start,'active server scheduler source exists');
  assert.match(body,/botTickCursor=\(rosterIndex\+1\)%count;completedAny=true;/,'each serviced bot advances the next pass cursor past itself');
  assert.match(body,/if\(count&&!completedAny\)botTickCursor=\(start\+1\)%count;/,'idle passes still rotate instead of pinning the cursor');
});

test('64 overdue bots use the measured large-roster cadence and fair catch-up cap', () => {
  G.phase = 'live'; G.mode = 'versus'; G.map = 'courtyard';
  const m = _t.mapData(), bots=[];
  for(let i=0;i<64;i++){
    const b=_t.makeBot(i%2);b.alive=true;b.x=m.spawn.x+(i%8)*2;b.z=m.spawn.z+Math.floor(i/8)*2;
    b.ai.tacticSeeded=true;b.ai.scanT=10;b.ai.nextThinkAt=100;b.ai.wp=[b.x+12,b.z+12];b.ai.wpT=10;
    bots.push(b);
  }
  const cap=_t.botThinkPolicy.maxPerTick;
  assert.equal(_t.botThinkPolicy.intervalForRoster(64),110,'64 bots use the measured sustainable 9.1 Hz decision cadence');
  assert.ok(cap>=26&&cap<64,`20 ms host should have a bounded catch-up cap with headroom; got ${cap}`);
  const served=new Set();let prior=0;
  for(let tick=0;tick<12&&served.size<bots.length;tick++){
    const at=1000+tick*20;_t.botsTick(.02,at);
    const updated=bots.filter(b=>b.ai.lastThinkAt===at);
    assert.ok(updated.length<=cap,`tick ${tick} serviced ${updated.length} bots above the configured cap ${cap}`);
    for(const b of updated)served.add(b.id);
    assert.ok(served.size>prior,`fair cursor must service additional overdue bots on tick ${tick}`);prior=served.size;
  }
  assert.equal(served.size,64,'fair bounded batches eventually service every overdue bot');
  assert.equal(bots.filter(b=>!Number.isFinite(b.ai.nextThinkAt)).length,0,'every bot retains a finite next decision time');
  assert.ok(new Set(bots.map(b=>b.ai.nextThinkAt)).size>=cap,'late recovery preserves staggered deadlines instead of synchronizing the full roster');
});

test('bot think cadence preserves 20 Hz for small rosters and caps large-roster host work', () => {
  assert.equal(_t.botThinkPolicy.intervalMs,50,'LAN bot decisions retain the existing 20 Hz target');
  assert.equal(_t.botThinkPolicy.targetDecisionsPerSecond,600,'aggregate decision budget matches the measured 64-bot host run');
  assert.equal(_t.botThinkPolicy.intervalForRoster(0),50);
  assert.equal(_t.botThinkPolicy.intervalForRoster(12),50);
  assert.equal(_t.botThinkPolicy.intervalForRoster(20),50);
  assert.equal(_t.botThinkPolicy.intervalForRoster(21),50);
  assert.equal(_t.botThinkPolicy.intervalForRoster(32),60);
  assert.equal(_t.botThinkPolicy.intervalForRoster(64),110);
  assert.equal(_t.botThinkPolicy.intervalForRoster(96),160);
  assert.equal(_t.botThinkPolicy.budgetMs,6,'the catch-up batch remains bounded to six milliseconds');
  assert.equal(_t.botThinkBudgetExpired(5.99),false,'work below the budget remains eligible');
  assert.equal(_t.botThinkBudgetExpired(6),true,'work at the budget defers later due bots');
  assert.equal(_t.botThinkBudgetExpired(12),true,'work over the budget remains deferred');
  assert.equal(_t.botThinkBudgetExpired(Number.NaN),false,'invalid timing samples cannot spuriously stop bot updates');
});

test('ordinary LAN status retains lightweight bot scheduler deferral counters',()=>{
  const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../AndroidProject/app/src/main/assets/phone-host/server.js'),'utf8');
  const start=source.indexOf('function botsTick(dt, t) {'),end=source.indexOf('\nfunction botsRoundReset',start),body=source.slice(start,end);
  const alwaysOn=body.indexOf('if(budgetHit)botStats.thinkBudgetHitTicks++');
  assert.ok(alwaysOn>=0,'budget-hit ticks must be counted without diagnostics mode');
  assert.ok(body.indexOf('botStats.thinkBudgetDeferredBots+=budgetDeferred')>alwaysOn,'budget-deferred bot count must be retained');
  assert.ok(body.indexOf('botStats.thinkCapDeferredBots+=deferredDue')>alwaysOn,'per-tick decision-cap deferrals must be distinguished');
  assert.ok(alwaysOn<body.indexOf('if(diag){const thinkElapsed='),'cause counters must not depend on diagnostics being enabled');
});

test('bot think reuses the visibility check it just performed instead of ray-testing the same target twice',()=>{
  G.phase='live';G.mode='versus';G.map='courtyard';players.clear();
  const bot=_t.makeBot(0);bot.alive=true;bot.team=0;bot.x=0;bot.y=0;bot.z=36;bot.yaw=0;bot.skill='recruit';bot.ai.scanT=0;bot.ai.tacticSeeded=true;
  const enemy={id:999,bot:false,alive:true,team:1,x:0,y:0,z:28,hp:100,cr:0,pr:0};
  players.set(bot.id,bot);players.set(enemy.id,enemy);
  const before=_t.botStats.scanLosReused;
  _t.botThink(bot,.02,Date.now(),_t.mapData());
  assert.equal(bot.ai.tgt?.id,enemy.id,'the forward target remains selected through the scan and engage path');
  assert.equal(_t.botStats.scanLosReused-before,1,'the scan LOS is reused by engagement validation in this think');
});

test('large Outbreak companion formations are assigned in bounded slices and finish without dropping bots', () => {
  G.phase='live';G.mode='outbreak';G.map='courtyard';
  const map=_t.mapData();_t.buildNav(map);
  const leader={id:9000,bot:false,alive:true,team:0,hp:100,x:map.spawn.x,y:0,z:map.spawn.z};
  players.set(leader.id,leader);
  const bots=[];
  for(let i=0;i<56;i++){
    const b=_t.makeBot(0);b.alive=true;b.x=map.spawn.x+(i%8)*1.5;b.y=0;b.z=map.spawn.z+Math.floor(i/8)*1.5;b.ai.nextThinkAt=1000000;bots.push(b);
  }
  _t.resetCoopSquad();
  /* Assignment is deliberately sliced by a 2 ms wall-clock budget. Under a
     loaded test runner a tick may service only one companion, so allow one
     full roster's worth of 20 ms ticks instead of asserting completion in a
     fixed 320 ms window. This still proves no bot is lost and progress stays
     monotonic while each slice respects its count cap. */
  for(let tick=0;tick<64&&bots.some(b=>b.ai.squadAnchor!==leader.id);tick++){
    const before=bots.filter(b=>b.ai.squadAnchor===leader.id).length;
    _t.updateCoopSquad(10000+tick*20);
    const after=bots.filter(b=>b.ai.squadAnchor===leader.id).length;
    assert.ok(after-before<=_t.coopSquadPolicy.assignmentsPerTick,`tick ${tick} assigned ${after-before} companions; limit is ${_t.coopSquadPolicy.assignmentsPerTick}`);
    assert.ok(after>=before,'formation progress must not go backwards');
  }
  assert.equal(bots.filter(b=>b.ai.squadAnchor===leader.id).length,56,'all companions eventually receive a leader assignment');
  assert.ok(_t.coopSquadPolicy.workBudgetMs>0,'formation work has a per-tick time budget');
});
