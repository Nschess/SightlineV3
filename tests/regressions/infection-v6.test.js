'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { G, players, MAPS, _t:T } = require('../../AndroidProject/app/src/main/assets/phone-host/server.js');
function reset() {
  players.clear();G.mode='infection';G.phase='live';G.map='courtyard';
  G.phaseEnd=Date.now()+120000;G.liveStart=Date.now();G.score=[0,0];
  T.INF.started=true;T.INF.chooseAt=0;T.INF.lastStandId=0;T.INF.conversions=0;T.INF.respawns.clear();
}
function party(n=3){reset();const ps=Array.from({length:n},()=>T.makeBot(0));for(const [i,p] of ps.entries()){
 p.alive=true;p.team=0;p.hp=100;p.armor=0;p.x=5+i*3;p.y=0;p.z=5;p.ep=1;p.nextShot=0;
 p.nextPush=0;p.ai=null;
}return ps;}
afterEach(()=>reset());
test('authoritative impulse is finite, nonnegative, weapon-sensitive and capped',()=>{
  assert.equal(T.infectionImpulse(0,'smg'),0);
  assert.equal(T.infectionImpulse(100,'knife'),0);
  assert.equal(T.infectionImpulse(Infinity,'smg'),0);
  assert.ok(T.infectionImpulse(100,'scatter')>T.infectionImpulse(100,'smg'));
  assert.ok(T.infectionImpulse(1e6,'scatter')<=1.05);
  assert.ok(T.infectionImpulse(1e6,'smg')<=.58);
});
test('patient zero becomes infected server-side without changing visual team, loadout revoked, conversion guards',()=>{
 const [a,b,c]=party();
 assert.equal(T.sameCombatSide(a,b),true,'Blue and Red identities are companions before infection');
 assert.equal(T.infectionConvert(a,null),true);
 assert.equal(a.team,0);assert.equal(a.infected,true);assert.deepEqual([...a.owned],['knife']);assert.equal(a.cur,'knife');
 assert.equal(a.hp,1150,'converted bots use the existing infected-bot health budget');assert.ok(a.nextShot>Date.now()+1000);
 assert.equal(T.infectionConvert(a,null),false);
 assert.equal(b.team,0);assert.equal(c.team,0);
 const oldHp=a.hp;T.damage(b,a,0,false,'knife');assert.equal(a.hp,oldHp);
 T.damage(a,a,300,false,'knife');assert.equal(a.hp,oldHp);
});
test('converted zombie cannot attack immediately, then can infect a nearby human',()=>{
 const [a,b,c]=party();a.x=b.x;a.z=b.z+1;
 assert.equal(T.infectionConvert(a,null),true);
 const before=T.stats.shots;
 T.onMessage(a,JSON.stringify({t:'shot',w:'knife',d:[[0,0,-1]],heavy:false}));
 assert.equal(T.stats.shots,before,'melee command during transformation must be rejected');
 a.nextShot=Date.now()-100;a.lastShot=Date.now()-5000;
 assert.equal(T.infectionConvert(b,a),true);
 assert.equal(b.team,0);assert.equal(b.infected,true);assert.deepEqual([...b.owned],['knife']);
 assert.equal(c.team,0);
});
test('last survivor reward grants armor and finite ammunition once only',()=>{
 const [a,b]=party(2);b.armor=0;b.ammo.pistol.res=0;
 assert.equal(T.infectionConvert(a,null),true);
 assert.equal(b.armor,45);assert.ok(b.ammo.pistol.res>0);
 const first=b.ammo.pistol.res;
 T.infectionLastStand();assert.equal(b.armor,45);assert.equal(b.ammo.pistol.res,first);
 assert.equal(T.INF.lastStandId,b.id);
});
test('rifle hits on an infected player apply server collision-aware impulse and force correction',()=>{
 const [a,b,c]=party();
 const m=MAPS[G.map];let pair;
 const N=T.buildNav(m);
 for (const v of N.nodes){if(!N.reachable[v.id??N.nodes.indexOf(v)]||v.y>.3)continue;
    const x=v.x,z=v.z;
    if(!T.boxOverlap(m,x,z,.7)&&!T.boxOverlap(m,x+2,z,.7)&&!T.boxOverlap(m,x+3,z,.7)) {pair={x,z};break;}}
 assert.ok(pair,'open space required for collision test');
 a.x=pair.x;a.z=pair.z;b.x=pair.x+2;b.z=pair.z;a.infected=false;b.infected=true;
 b.nextPush=0;b.bot=false;b.c={closed:false,text:()=>{}};b.ep=1;
 const x=b.x,ep=b.ep;
 const moved=T.infectionKnockback(a,b,90,'smg');
 assert.ok(moved>.10,`actual impulse ${moved}`);
 assert.ok(b.x>x);assert.equal(b.ep,ep+1);
 assert.ok(!T.boxOverlap(m,b.x,b.z,.4));
 assert.equal(T.infectionKnockback(a,b,90,'smg'),0,'120ms impulse cooldown prevents stutter');
});
test('no infection-side effects leak into tactical or outbreak matches',()=>{
 const [a,b]=party(2);a.team=0;b.team=1;
 G.mode='versus';const x=b.x;assert.equal(T.infectionKnockback(a,b,90,'smg'),0);assert.equal(b.x,x);
 G.mode='outbreak';assert.equal(T.infectionConvert(a,null),false);
});
test('sunrise awards human victory, while all humans converted award infection victory',()=>{
 const [a,b]=party(2);
 T.INF.chooseAt=Date.now()-50000;G.phaseEnd=Date.now()-10;
 T.infectionTick(Date.now());assert.equal(G.phase,'roundend');assert.equal(G.score[0],1);
 const [u,v]=party(2);G.phaseEnd=Date.now()+50000;
 assert.equal(T.infectionConvert(u,null),true);assert.equal(T.infectionConvert(v,u),true);
 assert.equal(G.phase,'roundend');assert.equal(G.score[1],1);
});

test('final 25 seconds triggers Dawn Rush only in live Infection, never in other modes',()=>{
 party(3);G.phaseEnd=Date.now()+26000;assert.equal(T.infectionSurge(),false);
 G.phaseEnd=Date.now()+24000;assert.equal(T.infectionSurge(),true);
 G.mode='outbreak';assert.equal(T.infectionSurge(),false);
 G.mode='tactical';assert.equal(T.infectionSurge(),false);
 G.mode='infection';G.phase='roundend';assert.equal(T.infectionSurge(),false);
});
