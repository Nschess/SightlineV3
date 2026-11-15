#!/usr/bin/env node
// Exercises actual server-authoritative damage/kill/round state in memory, never browser-side fake rules.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const mod=require(resolve(process.argv[2]||'./AndroidProject/app/src/main/assets/phone-host/server.js'));
const {players,G,_t}=mod;
const checks=[];function verify(label,condition){checks.push({label,pass:!!condition});if(!condition)throw Error(label);}
const mock=()=>({closed:false,backlog:0,events:[],text(s){this.events.push(JSON.parse(s));},sendFrame(_buf){}});
try{
 const ac=mock(),bc=mock(); const a=_t.addPlayer(ac,'DamageTester'),b=_t.addPlayer(bc,'Target');
 verify('Two actual authoritative players created',players.size===2&&a.team!==b.team);
 G.phase='live';G.mode='versus';a.alive=true;b.alive=true;a.hp=100;b.hp=100;a.armor=0;b.armor=0;
 _t.damage(a,b,25,false,'pistol');
 verify('Real damage reduced server HP',b.hp===75&&bc.events.some(x=>x.t==='hp'&&x.hp===75));
 verify('Damage does not invent a kill',a.k===0&&b.d===0&&b.alive);
 _t.damage(a,b,100,true,'pistol');
 verify('Real server damage results in death',b.hp===0&&!b.alive&&b.d===1);
 verify('Actual attacker kill and headshot scores',a.k===1&&a.hs===1);
 verify('Actual kill event sent',ac.events.some(x=>x.t==='hit'&&x.k===1));
 verify('Attacker receives money reward',ac.events.some(x=>x.t==='money'));
 verify('No client-side damage authority substituted',_t.damage.toString().includes('q.hp -= dmg'));
 console.log(JSON.stringify({pass:true,count:checks.length,checks}));
} catch(err){console.error(JSON.stringify({pass:false,checks,error:String(err.stack||err)}));process.exitCode=1;}
