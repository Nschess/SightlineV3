'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');

const assetRoot = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
function functionSource(file, name, nextName) {
  const html = fs.readFileSync(path.join(assetRoot, file, 'index.html'), 'utf8');
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, file + ': could not locate ' + name);
  return html.slice(start, end);
}
function operators(team, count, prefix) {
  return Array.from({ length: count }, (_, i) => ({ id: prefix + i, team, hp:100, w:.9, h:1.8 }));
}

for (const client of ['www', 'phone-host']) {
  test(client + ': Infection selector exposes 14/64 bots and begins with a 10-second incubation', () => {
    const src = functionSource(client, 'beginRound', 'endRound');
    const helper = functionSource(client, 'infectionPlanText', 'beginRound');
    for (const requested of [14, 64]) {
      let lastSpawn = null, message = '';
      const ctx = vm.createContext({
        R: { mode:'infection', bots:requested, mates:6, ztime:180, zinf:1, zhorde:1 }, SightlineModeRules:Rules,
        M: { round:1 }, CFG: { roundTime:120 }, SOLO_INF: {}, OB: {},
        state:'buy', T:0, touchMode:false, cur:'pistol', P:{ alive:true },
        guns:{ pistol:{visible:true}, knife:{visible:false} },
        el:{ hud:{hidden:true} }, audio(){},
        spawnBots(enemies, allies){ lastSpawn=[enemies,allies]; },
        obInit(){}, hideOverlays(){}, enterTouchSession(){}, updateHud(){},
        showMsg(_title, body){ message=body; }, lockPointer(){},
        $(id){ return { hidden:true }; }
      });
      vm.runInContext(helper, ctx); vm.runInContext(src, ctx);
      ctx.beginRound();
      assert.deepEqual(lastSpawn, [0, requested], client + ': selected count means bots alone');
      assert.equal(ctx.SOLO_INF.delay, 10, client + ': incubation is 10 seconds');
      assert.equal(ctx.SOLO_INF.chosen, false);
      assert.match(message, new RegExp(requested + ' AI bots \\+ you'));
    }
    const html=fs.readFileSync(path.join(assetRoot,client,'index.html'),'utf8');
    if (client === 'www') {
      assert.match(html,/if \(it\.k === 'bots'\) return R\.mode !== 'outbreak'/,
        'offline bot count must be available in supported combat modes');
      assert.match(html,/ffaBotRule=it\.k==='bots'&&R\.mode==='ffa',\s*bombBotRule=it\.k==='bots'&&R\.mode==='bomb'/,
        'offline FFA and Bomb bot counts use mode-specific rules');
    } else {
      assert.match(html,/it\.k === 'bots' && R\.mode === 'infection'\) return true/,
        client + ': Infection bot rule remains visible despite the tactical-only default filter');
    }
    assert.match(html,/choose 2–64 bots plus you/);
    if (client === 'www') {
      assert.match(html,/var options=infectionBotRule\?it\.opts\.filter\(function\(p\)\{return p\[0\]!==1;\}\):bombBotRule\?it\.opts\.filter\(function\(p\)\{return p\[0\]<=32;\}\)/,
        'offline Infection excludes 1 bot and Bomb keeps each side within 32 bots');
    } else {
      assert.match(html,/infectionBotRule\?it\.opts\.filter\(function\(p\)\{return p\[0\]!==1;\}\):it\.opts/,
        'the LAN Infection UI excludes 1 bot, which cannot support the two Patient Zero rule');
    }
    assert.match(html,/class="rule-select" data-o="R" data-k="bots"/,
      'the Infection count uses a compact selectable control on mobile');
    assert.match(html,/R\.bots=a==='rules-max'\?64:8/,
      'Infection presets mean 8 or 64 selected bots, not a stale 32-vs-32 split');
  });

  test(client + ': 64 Offline Infection bots spawn as allied units split evenly across Red and Blue', () => {
    const html=fs.readFileSync(path.join(assetRoot,client,'index.html'),'utf8');
    const helpers=functionSource(client,'infectionAllyRoster','spawnBots');
    const spawn=functionSource(client,'spawnBots','localSquadNode');
    const red=operators('red',17,'r'), blue=operators('blue',17,'b'), me=red[0];
    let nextId=0;
    const ctx=vm.createContext({
      R:{mode:'infection',cash:800,diff:'regular'}, ME:me, ENEMY:'blue',
      ROSTER:{red,blue}, MAPD:{botSpawn:{x0:-20,z0:-20,x1:20,z1:20},spawn:{x:0,z:0}},
      WEAPONS:{pistol:{price:0,mag:12,reserve:48},carbine:{price:700,mag:30,reserve:90},kestrel:{price:500,mag:24,reserve:72}},
      DIFF:{regular:{hp:1}}, MP:{on:false}, P:{x:0,z:0}, OB:{on:false},
      bots:[],mates:[],units:[],nextSquadT:0,
      shuffled(a){return a.slice();}, findSpot(){const i=nextId++;return{x:i*.75,y:0,z:0};},
      makeUnit(x,z,op){return{id:nextId,x,z,y:0,op,alive:true,g:{position:{y:0}},aiAmmo:null};},
      ensureWorldWeapon(){}, pickWaypoint(){}, rebuildTargets(){},
      SightlineLoadout:{ammo(){return{mag:30,res:90,unlimitedReserve:true};}}
    });
    ctx.clearUnits=()=>{ctx.bots=[];ctx.mates=[];ctx.units=[];};
    vm.runInContext(helpers,ctx); vm.runInContext(spawn,ctx);
    for(const requested of [16,32,64]){
      ctx.spawnBots(0,requested);
      assert.equal(ctx.bots.length,0);
      assert.equal(ctx.mates.length,requested);
      assert.equal(ctx.units.length,requested);
      assert.ok(ctx.mates.every(m=>m.alive&&m.side==='ally'));
      assert.equal(ctx.mates.filter(m=>m.homeTeam==='red').length,requested/2);
      assert.equal(ctx.mates.filter(m=>m.homeTeam==='blue').length,requested/2);
      assert.equal(new Set(ctx.mates.map(m=>m.id)).size,requested);
    }
    assert.equal(html.includes('choose 2–64 bots plus you'),true);
    assert.equal(64+1,65,'64 selected bots plus the human player is 65 total participants');
  });

  test(client + ': Offline Infection scales Patient Zero to the selected roster after incubation', () => {
    const src=functionSource(client,'infectionSoloTick','outbreakTick');
    let created=0;
    const teammates=Array.from({length:64},(_,i)=>({alive:true,x:i,z:i,y:0,op:{name:'Mate '+i},g:{visible:true}}));
    const ctx=vm.createContext({
      OB:{t:0,infected:0,wave:0,phase:'prep'},ffT:1,SOLO_INF:{chosen:false,delay:.01,respawnT:5,supplyT:30,lastStand:false,dawnRush:false,zCount:0},
      mates:teammates,bots:[],infecting:[],P:{alive:true,x:0,z:0},roundT:100,MP:{on:false},R:{mode:'infection',bots:64},SightlineModeRules:Rules,
      ffUpdate(){},makeZombie(x,z,type,wave,y){created++;return{x,z,y,zombie:true,rise:0,g:{rotation:{x:0},position:{y:0}},atkT:0};},
      addFeed(){},showMsg(){},sfxTone(){},rebuildTargets(){},
      zSpot(){return null;},aliveCount(a){return a.filter(u=>u.alive).length;},
      resetNades(){},restock(){},M:{money:0}
    });
    vm.runInContext(src,ctx);ctx.infectionSoloTick(1);
    assert.equal(ctx.SOLO_INF.chosen,true);
    const expected=Rules.infectionPatientZeroCount(64,64);
    assert.equal(created,expected);
    assert.equal(ctx.OB.infected,expected);
    assert.equal(ctx.SOLO_INF.zCount,expected);
    assert.equal(teammates.filter(m=>m.alive).length,64-expected);
  });

  test(client + ': player converts on a Hollowed kill and receives a delayed infected respawn', () => {
    const schedule=functionSource(client,'scheduleSoloInfectedPlayerRespawn','respawnSoloInfectedPlayer');
    const respawn=functionSource(client,'respawnSoloInfectedPlayer','pickZType');
    let resetCount=0, loadedHp=0;
    const ctx=vm.createContext({
      SOLO_INF:{on:true,chosen:true,playerInfected:false,playerRespawnT:0,playerDown:false,zCount:2},
      OB:{infected:2},P:{alive:false,x:1,y:0,z:2,vx:0,vy:0,vz:0,onGround:false},
      touchMode:false,fireHeld:true,scoped:true,reloading:.4,guns:{pistol:{visible:true},knife:{visible:false}},
      el:{scope:{hidden:false}},M:{money:500},resetNades(){resetCount++;},rebuildTargets(){},
      showMsg(){},updateHud(){},
      zSpot(){return{x:7,y:1,z:9};},MAPD:{spawn:{x:0,y:0,z:0}},groundAt(){return 1;},
      sliding:true,slideT:.4,jumpQ:true,
    });
    ctx.soloInfectionPlayer=()=>!!(ctx.SOLO_INF.on&&ctx.SOLO_INF.chosen&&ctx.SOLO_INF.playerInfected);
    ctx.applyInfectedPlayerLoadout=hp=>{loadedHp=hp;};
    vm.runInContext(schedule,ctx);
    assert.equal(ctx.scheduleSoloInfectedPlayerRespawn({zombie:true}),true);
    assert.equal(ctx.SOLO_INF.playerInfected,true);
    assert.equal(ctx.SOLO_INF.playerRespawnT,4.5);
    assert.equal(ctx.SOLO_INF.zCount,3);
    assert.equal(ctx.OB.infected,3);
    assert.equal(ctx.fireHeld,false); assert.equal(ctx.scoped,false); assert.equal(ctx.reloading,0);
    assert.equal(ctx.guns.pistol.visible,false);
    assert.equal(resetCount,1);
    assert.equal(ctx.scheduleSoloInfectedPlayerRespawn({zombie:false}),true,'later infected deaths remain on the infected side');
    assert.equal(ctx.SOLO_INF.zCount,3,'repeat death must not count the same player as a new infection');
    ctx.SOLO_INF.playerRespawnT=0;
    vm.runInContext(respawn,ctx);
    assert.equal(ctx.respawnSoloInfectedPlayer(),true);
    assert.equal(ctx.P.alive,true); assert.deepEqual([ctx.P.x,ctx.P.y,ctx.P.z],[7,1,9]);
    assert.equal(loadedHp,1150);
    assert.equal(ctx.SOLO_INF.playerDown,false);
  });

  test(client + ': the first lethal Hollowed hit converts instead of opening spectator mode; later Hollowed hits are friendly', () => {
    const schedule=functionSource(client,'scheduleSoloInfectedPlayerRespawn','respawnSoloInfectedPlayer');
    const hurt=functionSource(client,'hurtPlayer','meleeAttack');
    const stats={deaths:0,kills:0}; let spectateCalled=0;
    const ctx=vm.createContext({
      R:{mode:'infection'},
      SOLO_INF:{on:true,chosen:true,playerInfected:false,playerRespawnT:0,playerDown:false,zCount:2},
      OB:{inf:false},P:{alive:true,hp:100,armor:0,x:0,y:0,z:0,yaw:0},M:{stats,money:500},ME:{id:'player'},
      G:{dmgDir:false},el:{flash:{classList:{add(){}}},scope:{hidden:false},ring:{style:{},classList:{add(){}}}},
      touchMode:false,guns:{pistol:{visible:true},knife:{visible:false}},fireHeld:true,scoped:true,reloading:.2,
      flashTimer:0,
      resetNades(){},rebuildTargets(){},showMsg(){},updateHud(){},
      addFeed(){},ost(){return{k:0,d:0};},checkRound(){},
      specUnit(){spectateCalled++;return{};},
      sfxTone(){},clearTimeout(){},setTimeout(){return 1;},
    });
    ctx.soloInfectionPlayer=()=>!!(ctx.SOLO_INF.on&&ctx.SOLO_INF.chosen&&ctx.SOLO_INF.playerInfected);
    vm.runInContext(schedule,ctx);vm.runInContext(hurt,ctx);
    ctx.hurtPlayer(20,{zombie:true,op:{id:'patient-zero',name:'Patient Zero'},x:2,z:3});
    assert.equal(ctx.P.alive,false);assert.equal(ctx.SOLO_INF.playerInfected,true);
    assert.equal(ctx.SOLO_INF.playerRespawnT,4.5);assert.equal(ctx.SOLO_INF.zCount,3);
    assert.equal(stats.deaths,1);assert.equal(spectateCalled,0);
    ctx.P.alive=true;ctx.P.hp=1150;ctx.SOLO_INF.playerRespawnT=0;
    ctx.hurtPlayer(1000,{zombie:true,op:{id:'hollowed'},x:1,z:1});
    assert.equal(ctx.P.hp,1150,'Hollowed cannot damage a Hollowed player');
    assert.equal(ctx.P.alive,true);assert.equal(stats.deaths,1);
  });

  test(client + ': infected loadout is Hollowed-only and returning to a new round restores survivor gear', () => {
    const loadout=functionSource(client,'applyInfectedPlayerLoadout','mpInfectedMe');
    const end=functionSource(client,'endRound','finishRoundEnd');
    let refreshed=0, hud=0;
    const ctx=vm.createContext({
      owned:{pistol:true,knife:true},cur:'pistol',P:{alive:true,hp:100,armor:0},M:{money:2500,you:0,bots:0},
      CFG:{startMoney:800,maxMoney:16000,winBonus:250,lossBonus:150},guns:{pistol:{visible:true},knife:{visible:false}},
      MP:{on:false},SOLO_BOMB:{state:null},scoped:true,reloading:.5,zoomLvl:2,ammo:{},
      applySelectedFirstPersonAppearance(){refreshed++;},updateHud(){hud++;},fillAmmo(){},
      state:'live',SOLO_INF:{on:true,chosen:true,playerInfected:false,playerRespawnT:0,playerDown:false},
      el:{hud:{}},endT:0,endWon:false,showMsg(){},$(){return{hidden:true};},hideOverlays(){},resetNades(){}
    });
    ctx.soloInfectionPlayer=()=>!!(ctx.SOLO_INF.on&&ctx.SOLO_INF.chosen&&ctx.SOLO_INF.playerInfected);
    vm.runInContext(loadout,ctx);ctx.applyInfectedPlayerLoadout(1150);
    assert.deepEqual(Object.keys(ctx.owned),['knife']);assert.equal(ctx.cur,'knife');
    assert.equal(ctx.P.hp,1150);assert.equal(ctx.P.armor,0);assert.equal(ctx.M.money,0);
    assert.equal(ctx.guns.pistol.visible,false);assert.equal(ctx.guns.knife.visible,true);
    assert.equal(refreshed,1);assert.equal(hud,1);
    ctx.SOLO_INF.playerInfected=true;ctx.P.hp=1150;ctx.M.money=0;ctx.cur='knife';ctx.owned={knife:true};
    vm.runInContext(end,ctx);ctx.endRound(true,'Infected side held');
    assert.equal(ctx.SOLO_INF.on,false);assert.equal(ctx.SOLO_INF.playerInfected,false);
    assert.equal(ctx.P.hp,100);assert.equal(ctx.P.armor,0);
    assert.deepEqual(Object.keys(ctx.owned).sort(),['knife','pistol']);assert.equal(ctx.cur,'pistol');
    assert.equal(ctx.M.money,1050);assert.equal(ctx.M.you,1);assert.equal(ctx.state,'roundend');
    assert.equal(refreshed,2,'first-person appearance returns to the selected survivor after the round');
  });

  test(client + ': restarting a match clears any stale Infection role and restores the selected survivor appearance', () => {
    const src=functionSource(client,'startMatch','nextRound');
    let refreshed=0,started=0;
    const ctx=vm.createContext({
      R:{mode:'infection'},
      SOLO_INF:{on:true,chosen:true,playerInfected:true,playerRespawnT:2,playerDown:true},
      SOLO_BOMB:{state:null,sites:null,settings:null,supportMap:null,playerTeam:0},
      applySelectedFirstPersonAppearance(){refreshed++;},applyRules(){},refreshSpec(){},lobbyAudioCue(){},setLobbyMusicActive(){},
      touchMode:false,CFG:{startMoney:800},M:null,owned:{knife:true},P:{armor:0},cur:'knife',
      resetNades(){},curBuys:[],lastBuys:[],mel:{t:0,hit:true},mpBuildSupplies(){},
      offlineAmmoStations(){return[];},nextRound(){started++;},$(){return{hidden:true};},renderBeginnerOperation(){},clearMobileAim(){}
    });
    vm.runInContext(src,ctx);ctx.startMatch();
    assert.equal(ctx.SOLO_INF.on,false);assert.equal(ctx.SOLO_INF.chosen,false);
    assert.equal(ctx.SOLO_INF.playerInfected,false);assert.equal(ctx.SOLO_INF.playerRespawnT,0);
    assert.equal(ctx.owned.pistol,true);assert.equal(ctx.cur,'pistol');
    assert.equal(refreshed,1);assert.equal(started,1);
  });

  test(client + ': first-person materials and loadout follow infected and survivor role transitions', () => {
    const appearance=functionSource(client,'applyFirstPersonCharacterAppearance','applySelectedFirstPersonAppearance');
    const html=fs.readFileSync(path.join(assetRoot,client,'index.html'),'utf8');
    assert.match(appearance,/soloHollowed=soloInfectionPlayer\(\)/);
    assert.match(appearance,/state\.sleeve\.color\.set\(soloHollowed\?0x9ab5a2:0xffffff\)/);
    assert.match(appearance,/soloHollowed\?\[\.34,\.48,\.39\]:D\.gloveCol/);
    assert.match(html,/function soloInfectionPlayer\(\) \{ return !!\(typeof SOLO_INF!=='undefined'/,
      'the character renderer can safely initialize before the Infection rules object');
    assert.match(html,/soloInfectionPlayer\(\) \? mates : bots/);
    assert.match(html,/P\.alive && foe !== soloInfectionPlayer\(\)/);
    assert.match(html,/if \(t === P\) hurtPlayer\(dmg, killer\)/);
    assert.match(html,/if \(soloInfectionPlayer\(\) && mates\.indexOf\(b\) >= 0\)/,
      'infected local melee must contact survivor hit targets');
  });

  test(client + ': infected player attacks survivor bots with melee and adds them to the Hollowed roster', () => {
    const src=functionSource(client,'infectMateFromPlayer','hurtMate');
    const target={alive:true,op:{id:'survivor-1'}}; let killed=0, credited=0;
    const ctx=vm.createContext({
      SOLO_INF:{on:true,chosen:true,playerInfected:true},P:{x:4,z:5},mates:[target],ME:{id:'player'},
      M:{stats:{kills:0}},ost(){return{k:0,d:0};},
      soloInfectionPlayer(){return true;},
      killMate(m,k){assert.equal(m,target);assert.equal(k.zombie,true);killed++;m.alive=false;}
    });
    vm.runInContext(src,ctx);
    assert.equal(ctx.infectMateFromPlayer(target),true);
    assert.equal(killed,1); assert.equal(target.alive,false); assert.equal(ctx.M.stats.kills,1);
    assert.equal(ctx.infectMateFromPlayer(target),false,'dead survivors cannot be infected repeatedly');
  });

  test(client + ': infected melee uses real survivor death bookkeeping and queues one Hollowed replacement', () => {
    const src=functionSource(client,'killMate','hurtMate');
    const target={alive:true,hp:100,sees:true,tgt:'enemy',infected:false,op:{id:'survivor-7',name:'Survivor Seven'}};
    const scores=new Map(),stats={kills:0};let checks=0,feeds=0;
    const ctx=vm.createContext({
      SOLO_INF:{on:true,chosen:true,playerInfected:true},OB:{on:true,infected:2},
      mates:[target],infecting:[],ME:{id:'local-player'},P:{x:4,z:5},M:{stats},
      soloInfectionPlayer(){return true;},
      ost(id){if(!scores.has(id))scores.set(id,{k:0,d:0});return scores.get(id);},
      addFeed(){feeds++;},checkRound(){checks++;}
    });
    vm.runInContext(src,ctx);
    assert.equal(ctx.infectMateFromPlayer(target),true);
    assert.equal(target.alive,false);assert.equal(target.hp,0);
    assert.equal(target.infected,true);assert.equal(target.infT,2.2);
    assert.deepEqual(ctx.infecting,[target]);
    assert.equal(stats.kills,1);assert.equal(scores.get('local-player').k,1);
    assert.equal(scores.get('survivor-7').d,1);assert.equal(checks,1);assert.equal(feeds,1);
    assert.equal(ctx.infectMateFromPlayer(target),false,'a converted survivor cannot be queued or scored twice');
    assert.equal(ctx.infecting.length,1);assert.equal(stats.kills,1);assert.equal(checks,1);
  });

  test(client + ': Offline Infection survivor bots target the infected player, while Hollowed do not target their own side', () => {
    const insert=functionSource(client,'insertCand','unitSees');
    const scan=functionSource(client,'scanTarget','turnTo');
    const player={alive:true,x:2,z:3},target={alive:true,x:6,z:3};
    const ctx=vm.createContext({
      R:{mode:'infection'},
      cand:[],candD:[],P:player,mates:[target],bots:[],
      SOLO_INF:{on:true,chosen:true,playerInfected:true},
      unitSees(_u,t){return true;}
    });
    vm.runInContext('function soloInfectionPlayer(){return !!(SOLO_INF.on&&SOLO_INF.chosen&&SOLO_INF.playerInfected);}',ctx);
    vm.runInContext(insert,ctx);vm.runInContext(scan,ctx);
    const survivorBot={side:'ally',x:7,z:3};
    assert.equal(ctx.scanTarget(survivorBot),player,'survivor AI should see the player as an infected opponent');
    ctx.cand=[];ctx.candD=[];ctx.mates=[];
    assert.equal(ctx.scanTarget({side:'foe',x:1,z:3}),null,'Hollowed AI must not acquire its infected player companion');
    ctx.SOLO_INF.playerInfected=false;
    ctx.cand=[];ctx.candD=[];ctx.mates=[];
    assert.equal(ctx.scanTarget({side:'foe',x:1,z:3}),player,'regular enemy targeting still includes the survivor player');
  });

  test(client + ': infected deaths do not enter spectator mode; defender elimination awards infected side', () => {
    const src=functionSource(client,'checkRound','killBot');
    let ended=[],messages=0,spectates=0;
    const ctx=vm.createContext({
      R:{mode:'infection'},
      state:'live',OB:{on:true,inf:false,wave:1},
      SOLO_INF:{on:true,chosen:true,playerDown:true,playerInfected:true,playerRespawnT:3},
      P:{alive:false},mates:[{alive:true,infected:false,op:{name:'Riptide'}}],bots:[],specCur:null,
      specUnit(){spectates++;return{op:{name:'Riptide'}};},showMsg(){messages++;},endRound(...args){ended.push(args);}
    });
    ctx.soloInfectionPlayer=()=>!!(ctx.SOLO_INF.on&&ctx.SOLO_INF.playerInfected);
    vm.runInContext(src,ctx); ctx.checkRound();
    assert.equal(ended.length,0,'one defender and the turning player keep the round alive');
    assert.equal(messages,0,'an infected player is not sent to spectator mode');
    assert.equal(spectates,0);
    ctx.mates[0].alive=false; ctx.checkRound();
    assert.deepEqual(ended,[[true,'The defenders were overrun']]);
  });

  test(client + ': survivor player still spectates during the infected respawn delay, then sunrise awards survivors', () => {
    const check=functionSource(client,'checkRound','killBot');
    const sunrise=functionSource(client,'endRound','finishRoundEnd');
    let messages=0,ended=[];
    const ctx=vm.createContext({
      R:{mode:'infection'},
      state:'live',OB:{on:true,inf:false,wave:1},
      SOLO_INF:{on:true,chosen:true,playerDown:false,playerInfected:false,playerRespawnT:0},
      P:{alive:false},mates:[{alive:true,infected:false,op:{name:'Riptide'}}],bots:[],specCur:null,
      soloInfectionPlayer(){return !!SOLO_INF.on&&!!SOLO_INF.playerInfected;},
      specUnit(){return{op:{name:'Riptide'}};},showMsg(){messages++;},endRound(...a){ended.push(a);}
    });
    vm.runInContext(check,ctx); ctx.checkRound(); ctx.checkRound();
    assert.equal(messages,1,'spectator mode remains for a genuine noninfected downed player');
    const rollover=vm.createContext({
      R:{mode:'infection'},
      state:'live',SOLO_INF:{on:true,chosen:true,playerInfected:false},SOLO_BOMB:{state:null},
      soloInfectionPlayer(){return false;},P:{alive:true},M:{you:0,bots:0,money:2000},
      CFG:{startMoney:800,maxMoney:16000,winBonus:250,lossBonus:150},owned:{pistol:true,knife:true},cur:'pistol',
      reloading:0,scoped:false,fireHeld:false,fillAmmo(){},applySelectedFirstPersonAppearance(){},
      el:{hud:{}},endT:0,endWon:false,showMsg(){},updateHud(){},
      $(){return{hidden:true};},hideOverlays(){},resetNades(){}
    });
    vm.runInContext(sunrise,rollover); rollover.endRound(true,'Sunrise');
    assert.deepEqual(ended,[]);
    assert.equal(rollover.SOLO_INF.on,false);
    assert.equal(rollover.SOLO_INF.playerInfected,false);
    assert.equal(rollover.M.you,1);
    assert.equal(rollover.state,'roundend');
  });
}
