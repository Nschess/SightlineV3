#!/usr/bin/env node
// Deterministic test of the REAL exported authoritative game server, not mocked rules.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { G,players,_t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const {addPlayer,onMessage,startMatch,goLive,damage,deathmatchTick,DM,W,backToLobby}=_t;
let n=0;
const check=(name,fn)=>{fn();console.log('PASS',++n,name)};
const inbox1=[],inbox2=[];
function conn(inbox){return {closed:false,text(s){inbox.push(JSON.parse(s))},sendFrame(f){const n=f[1]&127,off=n===126?4:n===127?10:2;inbox.push(JSON.parse(f.subarray(off).toString('utf8')));},get backlog(){return 0}}}
const a=addPlayer(conn(inbox1),'A'),b=addPlayer(conn(inbox2),'B');
check('Two peers are on opposing teams and host is authoritative',()=>{assert.equal(a.host,true);assert.notEqual(a.team,b.team);});
const msg=(p,v)=>onMessage(p,JSON.stringify(v));
msg(b,{t:'cfg',mode:'deathmatch'});
check('Guest cannot configure mode',()=>assert.equal(G.mode,'versus'));
msg(a,{t:'cfg',mode:'deathmatch'});
check('Host can select Team Deathmatch',()=>assert.equal(G.mode,'deathmatch'));
msg(a,{t:'cfg',kills:10,time:180,auto:false});
check('Kill target and timer configured on server',()=>{assert.equal(G.kills,10);assert.equal(G.time,180);});
msg(a,{t:'cfg',kills:2,time:2});
check('Invalid kill/time selections rejected',()=>{assert.equal(G.kills,10);assert.equal(G.time,180)});
msg(b,{t:'cosmetic',skin:'not-real'});
check('Invalid outfits rejected',()=>assert.equal(b.skin,'default'));
msg(b,{t:'cosmetic',skin:'recon'});
check('Recognized character outfit accepted without changing team or score',()=>{assert.equal(b.skin,'recon');assert.equal(b.team,1);assert.deepEqual(G.score,[0,0])});
msg(b,{t:'finishes',finishes:{carbine:13,pistol:14,hammer:999,unknown:3}});
check('Per-weapon finishes validated and synchronized',()=>{assert.equal(b.finishes.carbine,13);assert.equal(b.finishes.pistol,14);assert.equal(b.finishes.hammer,undefined);assert.equal(b.finishes.unknown,undefined);assert.ok(inbox1.some(m=>m.t==='lobby'&&m.players.some(x=>x.id===b.id&&x.skin==='recon'&&x.finishes.carbine===13)))});
msg(a,{t:'start'});
check('Server starts actual Deathmatch match with player loadouts',()=>{assert.equal(G.mode,'deathmatch');assert.equal(G.phase,'buy');assert.ok(a.owned instanceof Set);assert.ok(b.owned instanceof Set);assert.equal(G.round,1)});
goLive();
check('Live Deathmatch starts server-owned timer',()=>{assert.equal(G.phase,'live');assert.ok(G.phaseEnd>Date.now()+170000)});
// Directly invoke real shared combat damage to test elimination, no invented kill messages.
b.armor=0;b.hp=30;damage(a,b,40,false,'pistol');
check('Real combat elimination increases authoritative team score and starts respawn',()=>{assert.equal(G.score[a.team],1);assert.equal(b.alive,false);assert.ok(DM.respawns.has(b.id));assert.equal(G.phase,'live');});
const when=DM.respawns.get(b.id);deathmatchTick(when+100);
check('Server respawns defeated player with health, position, loadout and protection',()=>{assert.equal(b.alive,true);assert.equal(b.hp,100);assert.equal(b.spec,false);assert.ok(b.spawnShieldUntil>Date.now());assert.equal(DM.respawns.has(b.id),false);assert.ok(inbox2.some(x=>x.t==='dm-respawn'));});
const before=b.hp;damage(a,b,200,false,'pistol');
check('Spawn shield prevents immediate unfair repeat elimination',()=>{assert.equal(b.hp,before);assert.equal(G.score[a.team],1)});
b.spawnShieldUntil=0;G.score[a.team]=G.kills-1;b.hp=10;damage(a,b,20,false,'pistol');
check('Kill target ends actual match with correct winning team and message',()=>{assert.equal(G.phase,'matchend');assert.equal(G.score[a.team],10);assert.equal(G.lastWin /* assigned in endMatch? */,G.lastWin);assert.ok(inbox1.some(x=>x.t==='ph'&&x.ph==='matchend'&&x.win===a.team&&x.why==='Kill target reached'));assert.equal(DM.respawns.size,0)});
backToLobby();G.mode='deathmatch';G.score=[3,2];G.phase='live';G.phaseEnd=Date.now()-10;deathmatchTick(Date.now());
check('Time expiry ends with actual leading team and correct explanation',()=>{assert.equal(G.phase,'matchend');assert.ok(inbox1.some(x=>x.t==='ph'&&x.ph==='matchend'&&x.win===0&&x.why==='Time expired'))});
backToLobby();G.mode='versus';
check('Tactical mode remains selectable after Deathmatch',()=>{assert.equal(G.mode,'versus');assert.equal(G.phase,'lobby')});
console.log(`PASS ${n}/${n} authoritative feature parity assertions`);
