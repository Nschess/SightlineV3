'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { G, players, MAPS, _t: T } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Tactics = require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

afterEach(() => { players.clear(); T.OB.zs.clear(); G.mode='versus'; G.phase='lobby'; G.map='courtyard'; T.BOTCFG.mode='add'; T.BOTCFG.balance=false; T.BOTCFG.t0=0; T.BOTCFG.t1=0; T.BOTCFG.coop=0; T.BOTCFG.skill='regular'; T.INF.started=false; T.INF.chooseAt=0; });

test('LAN Infection keeps 64 bots as Blue/Red allies through incubation, then scales Patient Zero to the roster', () => {
  G.mode='versus'; G.phase='lobby'; G.map='courtyard';
  const conn={closed:false,backlog:0,text(){},sendFrame(){}};
  const human=T.addPlayer(conn,'InfectionRosterQA');
  T.onMessage(human,JSON.stringify({t:'cfg',mode:'infection'}));
  T.onMessage(human,JSON.stringify({t:'cfg',bots:{mode:'add',coop:64}}));
  assert.equal(T.BOTCFG.coop,64,'the host lobby setting reaches the server bot configuration');
  assert.deepEqual(T.desiredBots(),[32,32],'64 selected bots are divided evenly instead of all joining Blue');
  T.syncBots(true);
  assert.equal(T.botsOn(0).length,32); assert.equal(T.botsOn(1).length,32);
  T.startMatch();
  const blue=T.botsOn(0),red=T.botsOn(1);
  assert.equal(blue.filter(b=>b.alive).length,32,'all 32 Blue bot survivors spawn');
  assert.equal(red.filter(b=>b.alive).length,32,'all 32 Red bot companions spawn');
  assert.ok([...blue,...red].every(b=>!b.infected&&b.team===b.homeTeam&&b.owned.size>1),'both visual teams begin alive, armed, and uninfected');
  T.goLive();
  assert.equal(T.INF.started,false,'infection stays dormant during incubation');
  assert.ok(T.INF.chooseAt>Date.now()+9000&&T.INF.chooseAt<=Date.now()+10000,'server schedules a ten-second incubation');
  T.infectionTick(T.INF.chooseAt);
  assert.equal(T.INF.started,true,'infection begins after incubation');
  const all=[...blue,...red],infected=all.filter(b=>b.infected),infectedRoster=[...players.values()].filter(p=>p.alive&&p.infected);
  assert.equal(infectedRoster.length,8,'64 bots produce eight Patient Zero for a balanced 8-vs-56 opening');
  assert.ok(infected.every(b=>b.alive&&b.cur==='knife'&&b.team===b.homeTeam),'converted bots become infected without changing their Blue/Red identity');
  assert.equal(all.filter(b=>!b.infected&&b.alive).length,64-infected.length,'all non-selected bots stay alive as allied survivors');
});

test('LAN Infection Fill mode counts a human toward an even 32-versus-32 total', () => {
  G.mode='infection'; T.BOTCFG.mode='fill'; T.BOTCFG.coop=64;
  players.set(8601,{id:8601,bot:false,team:0});
  assert.deepEqual(T.desiredBots(),[31,32]);
});

test('Outbreak splits its co-op squad across Blue and Red while all remain companions', () => {
  G.mode='outbreak'; T.BOTCFG.mode='add'; T.BOTCFG.coop=64;
  players.set(8602,{id:8602,bot:false,team:0});
  assert.deepEqual(T.desiredBots(),[28,28],'Outbreak retains the 56 survivor-bot cap and splits the squad evenly');
  const a=T.makeBot(0),b=T.makeBot(1);
  assert.equal(T.sameCombatSide(a,b),true,'visual team color does not divide the Outbreak squad');
});

test('an infected bot can respawn regardless of its original visual team', () => {
  G.mode='infection';G.phase='live';G.map='courtyard';T.INF.started=true;
  const blue=T.makeBot(0);blue.alive=false;blue.infected=true;blue.team=blue.homeTeam=0;
  T.infectionRespawn(blue);
  assert.equal(blue.alive,true,'Blue-origin infected bot is eligible for infected respawn');
  assert.equal(blue.infected,true,'respawn preserves infection allegiance');
  assert.equal(blue.team,0,'respawn preserves Blue identity');
});

test('large LAN snapshots adapt to actor count and cap queued full-state data', () => {
  G.mode='infection';G.phase='live';
  for(let i=0;i<64;i++){const b=T.makeBot(i%2);b.alive=true;}
  assert.equal(T.snapshotEntityCount(),64);
  assert.equal(T.snapshotEveryNow(),1,'64 actors keep 50 Hz state snapshots for responsive motion');
  G.mode='outbreak';for(let i=0;i<16;i++)T.OB.zs.set(1000+i,{});
  assert.equal(T.snapshotEntityCount(),80);
  assert.equal(T.snapshotEveryNow(),2,'80 co-op actors use 25 Hz to protect host and client bandwidth');
  assert.equal(T.snapshotBacklogLimit(10000),12500,'slow peers cannot queue several stale 10 KB full snapshots');
  assert.equal(T.snapshotBacklogLimit(1000),4096,'small lobbies retain a 4 KB minimum send window');
});

test('Infection assigns stable survivor roles and keeps infected bots on hunt duty', () => {
  assert.deepEqual(Array.from({length:10},(_,i)=>T.infectionRole(i,0)),[
    'protect','hide','hunt','hold','hunt','hide','hunt','hold','protect','hide'
  ]);
  assert.ok(Array.from({length:12},(_,i)=>T.infectionRole(i,1)).every(r=>r==='hunt'));
});

test('LAN Infection places protectors near a human and spreads hide/hold posts', () => {
  G.mode='infection'; G.phase='live'; G.map='courtyard'; G.phaseEnd=Date.now()+90000; T.INF.started=true;
  const human={id:8800,bot:false,alive:true,team:0,x:0,y:0,z:0,yaw:0,hp:100};
  players.set(human.id,human);
  const defenders=Array.from({length:10},(_,i)=>T.makeBot(0));
  defenders.forEach((b,i)=>{b.alive=true;b.x=-8+i*1.6;b.y=0;b.z=9;b.ai.scanT=100;});
  defenders.forEach(b=>T.botPickWaypoint(b,MAPS.courtyard));
  assert.deepEqual(defenders.map(b=>b.ai.infectionRole),[
    'protect','hide','hunt','hold','hunt','hide','hunt','hold','protect','hide'
  ]);
  const protectors=defenders.filter(b=>b.ai.infectionRole==='protect');
  assert.equal(protectors.length,2);
  assert.ok(protectors.every(b=>b.ai.guardPlayer&&b.ai.guardAnchor===human.id&&b.ai.wp),'protectors receive human-anchored posts');
  assert.ok(defenders.filter(b=>b.ai.infectionRole!=='protect').every(b=>!b.ai.guardPlayer&&b.ai.wp),'hide, hunt, and hold bots receive independent posts');
  const posts=defenders.map(b=>({x:b.ai.wp[0],z:b.ai.wp[1]}));
  for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++)
    assert.ok(Math.hypot(posts[i].x-posts[j].x,posts[i].z-posts[j].z)>1.2,'survivor posts should not stack');
  const hunters=Array.from({length:6},(_,i)=>T.makeBot(1));
  hunters.forEach(b=>{b.alive=true;b.x=20;b.y=0;b.z=20;b.ai.scanT=100;});
  hunters.forEach(b=>T.botPickWaypoint(b,MAPS.courtyard));
  assert.ok(hunters.every(b=>b.ai.infectionRole==='hunt'),'all infected bots keep pursuit/search behavior');
});

test('LAN Infection assigns and separates the full 64-bot survivor roster', () => {
  G.mode='infection';G.phase='live';G.map='courtyard';G.phaseEnd=Date.now()+90000;T.INF.started=true;
  const human={id:8700,bot:false,alive:true,team:0,x:0,y:0,z:36,yaw:0,hp:100};players.set(human.id,human);
  const defenders=Array.from({length:64},(_,i)=>T.makeBot(0));
  defenders.forEach((b,i)=>{b.alive=true;b.x=((i%8)-3.5)*1.1;b.y=0;b.z=34-Math.floor(i/8)*.7;b.ai.scanT=100;});
  defenders.forEach(b=>T.botPickWaypoint(b,MAPS.courtyard));
  const roles=defenders.map(b=>b.ai.infectionRole);
  assert.equal(roles.filter(r=>r==='protect').length,8);
  assert.equal(roles.filter(r=>r==='hide').length,16);
  assert.equal(roles.filter(r=>r==='hold').length,16);
  assert.equal(roles.filter(r=>r==='hunt').length,24);
  const posts=defenders.map(b=>({x:b.ai.wp[0],z:b.ai.wp[1]}));
  assert.ok(posts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),'all selected bots receive a finite navigation post');
  assert.ok(Math.max(...posts.map(p=>p.x))-Math.min(...posts.map(p=>p.x))>35,'full survivor roster spans the map width');
  assert.ok(Math.max(...posts.map(p=>p.z))-Math.min(...posts.map(p=>p.z))>45,'full survivor roster spans the map depth');
  for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++)assert.ok(Math.hypot(posts[i].x-posts[j].x,posts[i].z-posts[j].z)>.8,'64 survivor bots are not assigned to one stacked spot');
});

test('64 Infection survivors are distributed across the playable map, not one clump', () => {
  const N=T.buildNav(MAPS.courtyard),origin={x:0,y:0,z:36},occupied=[],posts=[];
  for(let i=0;i<64;i++){
    if(T.infectionRole(i,0)==='protect')continue;
    const p=Tactics.patrol(N,origin,i,0,occupied,'infection',64);
    assert.ok(p,'every non-protector should have a reachable map post');
    occupied.push(p);posts.push(p);
  }
  const xs=posts.map(p=>p.x),zs=posts.map(p=>p.z);
  assert.ok(Math.max(...xs)-Math.min(...xs)>35,'posts span most of the map width');
  assert.ok(Math.max(...zs)-Math.min(...zs)>45,'posts span most of the map depth');
  for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++)
    assert.ok(Math.hypot(posts[i].x-posts[j].x,posts[i].z-posts[j].z)>1.2,'post assignments do not stack');
  const before=Tactics.patrol(N,origin,17,0,[],'infection',64,0),after=Tactics.patrol(N,origin,17,0,[],'infection',64,1);
  assert.ok(Math.hypot(before.x-after.x,before.z-after.z)>4,'later patrol cycles move a bot to another map sector');
});

test('non-Infection tactical assignment does not gain Infection role state', () => {
  G.mode='versus'; G.phase='live'; G.map='courtyard';
  const human={id:9900,bot:false,alive:true,team:0,x:0,y:0,z:0,yaw:0,hp:100}; players.set(human.id,human);
  const bots=Array.from({length:5},()=>T.makeBot(0));
  bots.forEach(b=>{b.alive=true;b.x=0;b.y=0;b.z=8;b.ai.scanT=100;});
  bots.forEach(b=>T.botPickWaypoint(b,MAPS.courtyard));
  assert.ok(bots.every(b=>b.ai.infectionRole===undefined),'other modes remain unchanged');
});
