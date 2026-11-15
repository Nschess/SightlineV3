'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const { MAPS, G, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('Bomb settings are bounded and default to a 90-second round, 35-second bomb and 4/6-second actions', () => {
  assert.deepEqual(Rules.settings(), { roundSeconds:90, bombSeconds:35, plantSeconds:4, defuseSeconds:6, bestOf:7 });
  assert.deepEqual(Rules.settings({roundSeconds:999,bombSeconds:3,plantSeconds:1,defuseSeconds:99,bestOf:8}), {roundSeconds:180,bombSeconds:20,plantSeconds:3,defuseSeconds:10,bestOf:9});
});

test('Infection Patient Zero scales with the selected roster and never exceeds the available bots', () => {
  assert.equal(Rules.infectionPatientZeroCount(8,8),2);
  assert.equal(Rules.infectionPatientZeroCount(14,14),2);
  assert.equal(Rules.infectionPatientZeroCount(32,32),4);
  assert.equal(Rules.infectionPatientZeroCount(64,64),8);
  assert.equal(Rules.infectionPatientZeroCount(64,3),3);
});

test('every configured host map has two separated, reachable, ground-level Bomb sites', () => {
  const originalMap = G.map;
  try {
    for (const id of Object.keys(MAPS)) {
      G.map = id;
      const map = _t.mapData(), nav = _t.buildNav(map), sites = Rules.resolveBombSites(nav, map.area);
      assert.ok(sites, id + ': no valid pair');
      assert.ok(sites.separation >= Math.max(12, Math.min(30, (map.area.x1-map.area.x0)*.22)), id + ': sites are too close');
      for (const site of [sites.A,sites.B]) {
        assert.ok(nav.reachable[site.node], id + ': site is unreachable');
        assert.ok(Math.abs(site.y) <= .15, id + ': site is not on the supported ground floor');
        assert.ok(site.x > map.area.x0 && site.x < map.area.x1 && site.z > map.area.z0 && site.z < map.area.z1, id + ': site is outside map bounds');
      }
    }
  } finally { G.map = originalMap; }
});

test('Bomb plant is role, carrier, site, location, and hold-time validated', () => {
  const sites = {A:{id:'A',x:-10,y:0,z:0},B:{id:'B',x:10,y:0,z:0}};
  const s = Rules.createBombRound({round:1,attackTeam:0,carrierId:7,sites});
  const carrier={id:7,team:0,x:-10,z:0,alive:true}, defender={id:8,team:1,x:-10,z:0,alive:true};
  assert.equal(Rules.beginUse(s,defender,'plant',1000),false);
  assert.equal(Rules.beginUse(s,{...carrier,id:9},'plant',1000),false);
  assert.equal(Rules.beginUse(s,{...carrier,x:0},'plant',1000),false);
  assert.equal(Rules.beginUse(s,carrier,'plant',1000),true);
  assert.equal(Rules.advance(s,4999,carrier),null);
  const planted=Rules.advance(s,5000,carrier);
  assert.deepEqual(planted,{result:null,event:'planted'});
  assert.equal(s.phase,'planted'); assert.equal(s.siteId,'A'); assert.equal(s.explodeAt,40000);
});

test('Bomb attribution survives a real held plant and defuse; elapsed round time alone never starts or completes an action', () => {
  const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}};
  const s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,carrierName:'Mako',sites,settings:{plantSeconds:3,defuseSeconds:4,bombSeconds:35}});
  assert.equal(Rules.advance(s,60000,null),null,'a timer cannot plant without an active character interaction');
  assert.equal(s.phase,'carried');assert.equal(s.carrierName,'Mako');
  const attacker={id:1,team:0,name:'Mako',x:0,y:0,z:0,alive:true};
  assert.equal(Rules.beginUse(s,attacker,'plant',60000),true);assert.equal(s.use.actorName,'Mako');
  assert.equal(Rules.advance(s,62999,attacker),null);assert.equal(s.phase,'carried','the configured hold must finish before placement');
  assert.deepEqual(Rules.advance(s,63000,attacker),{result:null,event:'planted'});assert.deepEqual(s.plantedBy,{id:1,name:'Mako'});
  const defender={id:2,team:1,name:'Rook',x:0,y:0,z:0,alive:true};
  assert.equal(Rules.beginUse(s,defender,'defuse',64000),true);assert.equal(s.use.actorName,'Rook');
  assert.equal(Rules.advance(s,67999,defender),null);assert.equal(s.phase,'planted');
  assert.deepEqual(Rules.advance(s,68000,defender),{result:'defend',event:'defused'});assert.deepEqual(s.defusedBy,{id:2,name:'Rook'});
});

test('Bomb progress cancels when holder releases, dies, leaves the site, or moves away', () => {
  const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}};
  const s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites}),p={id:1,team:0,x:0,z:0,alive:true};
  assert.equal(Rules.beginUse(s,p,'plant',10),true);assert.equal(Rules.cancelUse(s,1),true);assert.equal(s.use,null);
  assert.equal(Rules.beginUse(s,p,'plant',20),true);assert.deepEqual(Rules.advance(s,4020,{...p,x:5}),{result:null,event:'cancelled'});assert.equal(s.use,null);assert.equal(s.phase,'carried');
  assert.equal(Rules.beginUse(s,p,'plant',5000),true);assert.deepEqual(Rules.advance(s,9000,{...p,alive:false}),{result:null,event:'cancelled'});assert.equal(s.phase,'carried');
});

test('dropped bomb can only be recovered by a living attacker in pickup range', () => {
  const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}},s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites});
  assert.equal(Rules.dropBomb(s,1,{x:3,y:0,z:4}),true);assert.equal(s.phase,'dropped');
  assert.equal(Rules.pickupBomb(s,{id:3,team:1,x:3,z:4,alive:true}),false);
  assert.equal(Rules.pickupBomb(s,{id:2,team:0,x:8,z:4,alive:true}),false);
  assert.equal(Rules.pickupBomb(s,{id:2,team:0,x:4,z:4,alive:true}),true);assert.equal(s.carrierId,2);assert.equal(s.phase,'carried');
  const bad=Rules.createBombRound({round:2,attackTeam:0,carrierId:1,sites});Rules.dropBomb(bad,1,{x:0,z:0});
  assert.equal(Rules.pickupBomb(bad,{id:2,team:0,x:NaN,z:0,alive:true}),false,'NaN must not bypass the pickup-distance comparison');
});

test('bomb interactions are exclusive so concurrent plant/defuse starts cannot replace the first actor', () => {
  const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}},s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites});
  const a={id:1,team:0,x:0,z:0,alive:true},b={id:2,team:0,x:0,z:0,alive:true};
  assert.equal(Rules.beginUse(s,a,'plant',0),true);assert.equal(Rules.beginUse(s,b,'plant',1),false);assert.equal(s.use.actorId,1);
});

test('FFA scoring ignores suicides, rejects duplicate life deaths, and chooses a unique timed leader', () => {
  const s=Rules.createFFA({killLimit:5,startedAt:10});
  assert.equal(Rules.recordFFAElimination(s,1,1,1).accepted,false);
  assert.equal(Rules.recordFFAElimination(s,1,2,4).accepted,true);
  assert.equal(Rules.recordFFAElimination(s,1,2,4).duplicate,true);
  assert.equal(Rules.recordFFAElimination(s,3,4,2).accepted,true);
  assert.equal(Rules.recordFFAElimination(s,1,5,1).winnerId,null);
  Rules.recordFFAElimination(s,1,6,1);Rules.recordFFAElimination(s,1,7,1);
  assert.equal(Rules.recordFFAElimination(s,1,8,1).winnerId,1);
  assert.equal(Rules.ffaTimedWinner(s),1);
  const tie=Rules.createFFA();Rules.recordFFAElimination(tie,1,2,1);Rules.recordFFAElimination(tie,2,3,1);assert.equal(Rules.ffaTimedWinner(tie),null);
});

test('defuse and explosion produce mutually exclusive authoritative round outcomes', () => {
  const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}},s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites});
  const attacker={id:1,team:0,x:0,z:0,alive:true};assert.equal(Rules.beginUse(s,attacker,'plant',0),true);Rules.advance(s,4000,attacker);
  assert.equal(Rules.bombWinner(s,1,1,false),null);
  const defender={id:2,team:1,x:0,z:0,alive:true};assert.equal(Rules.beginUse(s,defender,'defuse',5000),true);assert.equal(Rules.advance(s,10999,defender),null);
  assert.deepEqual(Rules.advance(s,11000,defender),{result:'defend',event:'defused'});assert.equal(Rules.bombWinner(s,1,1,false),'defend');
  const x=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites});assert.equal(Rules.beginUse(x,attacker,'plant',0),true);Rules.advance(x,4000,attacker);
  assert.equal(Rules.advance(x,x.explodeAt,attacker).result,'attack');assert.equal(Rules.bombWinner(x,1,1,false),'attack');
});

test('plantless round timeout and team elimination award only the correct side', () => {
  const s=Rules.createBombRound({round:1,attackTeam:0,carrierId:1,sites:{A:{id:'A',x:0,z:0},B:{id:'B',x:15,z:0}}});
  assert.equal(Rules.bombWinner(s,2,2,true),'defend');
  assert.equal(Rules.bombWinner(s,0,2,false),'defend');
  assert.equal(Rules.bombWinner(s,2,0,false),'attack');
});

test('offline and phone-host pages load the same rules module without touching Legendary-owned modules', () => {
  const fs=require('node:fs'),path=require('node:path'),assets=path.resolve(__dirname,'../AndroidProject/app/src/main/assets');
  const serverPage=fs.readFileSync(path.join(assets,'phone-host/index.html'),'utf8'),offlinePage=fs.readFileSync(path.join(assets,'www/index.html'),'utf8');
  for(const page of [serverPage,offlinePage])assert.match(page,/<script src="gameplay-mode-rules\.js"><\/script>/);
  assert.equal(fs.readFileSync(path.join(assets,'phone-host/gameplay-mode-rules.js'),'utf8'),fs.readFileSync(path.join(assets,'www/gameplay-mode-rules.js'),'utf8'));
});

test('LAN FFA treats every other actor as an opponent and honors add/fill bot controls under the 64-bot cap', () => {
  const prior={mode:G.mode,phase:G.phase,botMode:_t.BOTCFG.mode,t0:_t.BOTCFG.t0,t1:_t.BOTCFG.t1,balance:_t.BOTCFG.balance};
  try {
    Host.players.clear();G.mode='ffa';G.phase='lobby';_t.BOTCFG.balance=false;
    const a={id:9101,team:0,bot:false,host:true},b={id:9102,team:1,bot:false,host:false};Host.players.set(a.id,a);Host.players.set(b.id,b);
    assert.equal(_t.sameCombatSide(a,b),false,'FFA never makes an alliance from the visual team number');
    _t.BOTCFG.mode='add';_t.BOTCFG.t0=2;_t.BOTCFG.t1=3;
    assert.deepEqual(_t.desiredBots(),[2,3]);
    _t.BOTCFG.mode='fill';_t.BOTCFG.t0=3;_t.BOTCFG.t1=2;
    assert.deepEqual(_t.desiredBots(),[2,1]);
    _t.BOTCFG.mode='add';_t.BOTCFG.t0=32;_t.BOTCFG.t1=32;
    assert.deepEqual(_t.desiredBots(),[32,32]);
    assert.equal(_t.botModePolicy().id,'deathmatch','FFA bots use the active hunt policy');
  } finally {
    Host.players.clear();G.mode=prior.mode;G.phase=prior.phase;
    _t.BOTCFG.mode=prior.botMode;_t.BOTCFG.t0=prior.t0;_t.BOTCFG.t1=prior.t1;_t.BOTCFG.balance=prior.balance;
  }
});

test('LAN FFA start validation requires two total combatants while team modes retain their existing gate', () => {
  const prior=G.mode;
  try {
    Host.players.clear();G.mode='ffa';
    Host.players.set(9101,{id:9101,team:0,bot:false});
    assert.equal(_t.teamsOk(),false,'one lone player cannot start an empty FFA');
    Host.players.set(9102,{id:9102,team:0,bot:true});
    assert.equal(_t.teamsOk(),true,'a server bot counts as the second combatant');
    G.mode='bomb';
    assert.equal(_t.teamsOk(),false,'Bomb still requires both teams');
    Host.players.set(9103,{id:9103,team:1,bot:true});
    assert.equal(_t.teamsOk(),true);
  } finally { Host.players.clear();G.mode=prior; }
});

test('LAN FFA damage records one kill and queues one authoritative respawn', () => {
  const prior={mode:G.mode,phase:G.phase,kills:G.kills,score:G.score,match:_t.FFA.match};
  try {
    Host.players.clear();G.mode='ffa';G.phase='live';G.kills=20;G.score=[0,0];
    _t.FFA.match=Rules.createFFA({killLimit:20});_t.FFA.respawns.clear();
    const killer={id:9201,team:0,bot:false,alive:true,hp:100,armor:0,k:0,d:0,hs:0,ep:1,money:800,finishes:{},spawnShieldUntil:0,c:null};
    const victim={id:9202,team:0,bot:false,alive:true,hp:100,armor:0,k:0,d:0,hs:0,ep:7,money:800,finishes:{},spawnShieldUntil:0,c:null};
    Host.players.set(killer.id,killer);Host.players.set(victim.id,victim);
    assert.equal(_t.sameCombatSide(killer,victim),false);
    _t.damage(killer,victim,200,false,'pistol');
    assert.equal(victim.alive,false);assert.equal(killer.k,1);assert.equal(victim.d,1);
    assert.equal(_t.FFA.match.scores.get(killer.id),1);assert.ok(_t.FFA.respawns.has(victim.id));
    _t.damage(killer,victim,200,false,'pistol');
    assert.equal(_t.FFA.match.scores.get(killer.id),1,'dead victims cannot score twice before respawn');
  } finally {
    Host.players.clear();G.mode=prior.mode;G.phase=prior.phase;G.kills=prior.kills;G.score=prior.score;
    _t.FFA.match=prior.match;_t.FFA.respawns.clear();
  }
});

test('LAN Bomb objective actions require V2 session, ordered sequence and current life epoch', () => {
  const prior={mode:G.mode,phase:G.phase,state:_t.BOMB.state,settings:_t.BOMB.settings,rejected:_t.stats.rejected};
  try {
    Host.players.clear();G.mode='bomb';G.phase='live';_t.BOMB.settings=Rules.settings();
    const sites={A:{id:'A',x:0,y:0,z:0},B:{id:'B',x:15,y:0,z:0}};
    const p={id:9301,name:'Aster',team:0,bot:false,alive:true,x:0,y:0,z:0,ep:4,protocol:2,session:'current-session',lastActionSeq:0,msgs:0,c:null};
    _t.BOMB.state=Rules.createBombRound({round:1,attackTeam:0,carrierId:p.id,sites,settings:_t.BOMB.settings});Host.players.set(p.id,p);
    const send=(action,seq,session,ep)=>_t.onMessage(p,JSON.stringify({t:'obj',action,seq,session,ep}));
    send('plant',1,'old-session',4);assert.equal(_t.BOMB.state.use,null);assert.equal(p.lastActionSeq,0);
    send('plant',1,'current-session',3);assert.equal(_t.BOMB.state.use,null);assert.equal(p.lastActionSeq,0);
    send('plant',1,'current-session',4);assert.equal(_t.BOMB.state.use.actorId,p.id);assert.equal(p.lastActionSeq,1);
    const objective=_t.bombStateMessage();assert.equal(objective.carrierName,'Aster');assert.equal(objective.use.actorName,'Aster');assert.equal(objective.use.siteId,'A');assert.equal(objective.use.x,0);
    send('plant',1,'current-session',4);assert.equal(_t.BOMB.state.use.actorId,p.id,'duplicate sequence cannot replace or restart the action');
    send('cancel',2,'current-session',3);assert.notEqual(_t.BOMB.state.use,null);assert.equal(p.lastActionSeq,1);
    send('cancel',2,'current-session',4);assert.equal(_t.BOMB.state.use,null);assert.equal(p.lastActionSeq,2);
    p.alive=false;send('plant',3,'current-session',4);assert.equal(_t.BOMB.state.use,null,'a dead or spectating actor cannot begin an objective action');p.alive=true;
    p.protocol=1;send('drop',3,'current-session',4);assert.equal(_t.BOMB.state.phase,'carried','legacy clients cannot issue unsequenced objective actions');
    assert.ok(_t.stats.rejected>=prior.rejected+5);
  } finally {
    Host.players.clear();G.mode=prior.mode;G.phase=prior.phase;_t.BOMB.state=prior.state;_t.BOMB.settings=prior.settings;_t.stats.rejected=prior.rejected;
  }
});
