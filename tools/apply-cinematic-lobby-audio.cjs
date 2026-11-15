'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return text.replace(before, after);
}

const musicRuntime = String.raw`
/* Lobby soundtrack uses one local HTML media element; SFX continue to use the
   game's existing singleton Web Audio context and buses. */
var lobbyMusicEl=null,lobbyMusicWanted=true,lobbyAudioUnlocked=false,lobbyMusicFadeTimer=0,lobbyMusicFailed=false,lobbyCueLastAt=-1000;
function lobbyMusicEnsure(){
  if(lobbyMusicEl||lobbyMusicFailed||typeof Audio==='undefined')return lobbyMusicEl;
  try{
    lobbyMusicEl=new Audio('lobby-cinematic.wav');lobbyMusicEl.loop=true;lobbyMusicEl.preload='none';lobbyMusicEl.volume=0;
    lobbyMusicEl.addEventListener('error',function(){lobbyMusicFailed=true;clearInterval(lobbyMusicFadeTimer);lobbyMusicFadeTimer=0;});
  }catch(e){lobbyMusicFailed=true;lobbyMusicEl=null;}
  return lobbyMusicEl;
}
function lobbyMusicTarget(){return soundOn&&!G.musicMuted?Math.max(0,Math.min(1,(Number(G.master)||0)/100*(Number(G.musicVol)||0)/100)):0;}
function lobbyMusicFade(target,duration){
  var el=lobbyMusicEnsure();if(!el)return;
  clearInterval(lobbyMusicFadeTimer);lobbyMusicFadeTimer=0;
  var from=Number(el.volume)||0,to=Math.max(0,Math.min(1,target)),started=Date.now(),ms=Math.max(0,duration||0);
  if(ms===0){el.volume=to;if(to===0&&(!lobbyMusicWanted||!lobbyAudioUnlocked||document.hidden||!soundOn||G.musicMuted||!G.musicVol)){try{el.pause();}catch(e){}}return;}
  lobbyMusicFadeTimer=setInterval(function(){
    var p=Math.max(0,Math.min(1,(Date.now()-started)/ms));
    var eased=p*p*(3-2*p);el.volume=from+(to-from)*eased;
    if(p>=1){clearInterval(lobbyMusicFadeTimer);lobbyMusicFadeTimer=0;if(to===0&&(!lobbyMusicWanted||!lobbyAudioUnlocked||document.hidden||!soundOn||G.musicMuted||!G.musicVol)){try{el.pause();}catch(e){}}}
  },35);
}
function lobbyMusicStart(){
  var el=lobbyMusicEnsure();if(!el||!lobbyMusicWanted||!lobbyAudioUnlocked||document.hidden||!soundOn||G.musicMuted||!(Number(G.musicVol)>0)||!(Number(G.master)>0))return;
  var target=lobbyMusicTarget();
  if(!el.paused){lobbyMusicFade(target,750);return;}
  el.volume=0;
  try{var p=el.play();if(p&&p.then)p.then(function(){if(lobbyMusicWanted&&lobbyAudioUnlocked)lobbyMusicFade(lobbyMusicTarget(),1150);}).catch(function(){});else lobbyMusicFade(target,1150);}catch(e){}
}
function lobbyMusicSetActive(active){
  lobbyMusicWanted=!!active;
  if(!active){if(lobbyMusicEl)lobbyMusicFade(0,650);return;}
  lobbyMusicEnsure();
  if(lobbyAudioUnlocked)lobbyMusicStart();
}
function lobbyMusicApplyVolume(){
  if(!lobbyMusicEl)return;
  if(lobbyMusicWanted&&lobbyAudioUnlocked&&soundOn&&!G.musicMuted&&Number(G.musicVol)>0&&Number(G.master)>0)lobbyMusicStart();
  else lobbyMusicFade(0,420);
}
function lobbyAudioUnlockFromGesture(){
  if(state!=='idle'||!menuOpen())return;
  audio();lobbyAudioUnlocked=true;lobbyMusicSetActive(true);
}
document.addEventListener('pointerdown',lobbyAudioUnlockFromGesture,true);
document.addEventListener('keydown',lobbyAudioUnlockFromGesture,true);
document.addEventListener('visibilitychange',function(){
  if(document.hidden){if(lobbyMusicEl)lobbyMusicFade(0,350);}
  else if(state==='idle'&&menuOpen()&&lobbyMusicWanted&&lobbyAudioUnlocked)lobbyMusicStart();
});
function lobbyCueTone(freq0,freq1,duration,level,type,delay){
  if(!AC||!busUi)return;
  var start=AC.currentTime+(delay||0),osc=AC.createOscillator(),gain=AC.createGain();
  osc.type=type||'sine';osc.frequency.setValueAtTime(Math.max(20,freq0),start);osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq1),start+duration);
  gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(level,start+Math.min(.009,duration*.18));gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(gain);gain.connect(busUi);osc.onended=function(){try{osc.disconnect();gain.disconnect();}catch(e){}};osc.start(start);osc.stop(start+duration+.015);
}
function lobbyCueNoise(duration,frequency,level,delay){
  if(!AC||!busUi||!noiseBuf)return;
  var start=AC.currentTime+(delay||0),src=AC.createBufferSource(),filter=AC.createBiquadFilter(),gain=AC.createGain();
  src.buffer=noiseBuf;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.75;
  gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  src.connect(filter);filter.connect(gain);gain.connect(busUi);src.onended=function(){try{src.disconnect();filter.disconnect();gain.disconnect();}catch(e){}};src.start(start,Math.random()*.7);src.stop(start+duration+.02);
}
function lobbyAudioCue(kind){
  if(!G.uiSound||!soundOn)return;
  var now=performance.now();if(now-lobbyCueLastAt<55)return;lobbyCueLastAt=now;
  if(!AC)audio();if(!AC)return;
  try{
    if(kind==='mission'){
      lobbyCueNoise(.022,3300,.026,0);lobbyCueTone(520,760,.082,.052,'triangle',.012);lobbyCueTone(780,1120,.095,.034,'sine',.075);
    }else if(kind==='weapon'){
      lobbyCueNoise(.045,2450,.032,0);lobbyCueTone(285,205,.095,.052,'triangle',.005);lobbyCueTone(1180,690,.13,.031,'triangle',.025);
    }else if(kind==='legendary'){
      lobbyCueNoise(.035,4100,.024,0);lobbyCueTone(392,392,.17,.038,'sine',.008);lobbyCueTone(587.33,587.33,.19,.034,'triangle',.07);lobbyCueTone(783.99,1046.5,.24,.028,'sine',.14);
    }else if(kind==='deploy'){
      lobbyCueTone(58,132,.62,.062,'sawtooth',0);lobbyCueTone(43.65,36.71,.72,.055,'sine',0);lobbyCueNoise(.11,1200,.044,.43);
    }
  }catch(e){}
}
`;

for (const rel of [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
]) {
  const file = path.join(root, rel);
  const originalHtml = fs.readFileSync(file, 'utf8');
  let html = originalHtml.replace(/\r\n/g, '\n');
  html = replaceOnce(html,
    'master: 55, sfxVol: 100, uiVol: 70, hitSound: true, uiSound: true, legendaryAudio: true, legendaryEffects: true,',
    'master: 55, sfxVol: 100, uiVol: 70, musicVol: 62, musicMuted: false, hitSound: true, uiSound: true, legendaryAudio: true, legendaryEffects: true,',
    `${rel}: default music preferences`);
  html = replaceOnce(html,
    'var AC = null, master = null, busFx = null, busUi = null, noiseBuf = null, soundOn = true, legendAudioPending = [], legendAudioStateBound = false, legendaryAudioBus = null, legendaryAudioLimiter = null;',
    'var AC = null, master = null, busFx = null, busUi = null, noiseBuf = null, soundOn = true, legendAudioPending = [], legendAudioStateBound = false, legendaryAudioBus = null, legendaryAudioLimiter = null;',
    `${rel}: shared audio singleton anchor`);
  html = replaceOnce(html,
    '/* Procedural multi-layer transients, rendered once per weapon at audio unlock.',
    musicRuntime + '\n/* Procedural multi-layer transients, rendered once per weapon at audio unlock.',
    `${rel}: lobby audio runtime`);
  html = html.replace(
    /function applyAudio\(\) \{\n  if \(!AC\) return;\n  master\.gain\.value = G\.master \/ 100; busFx\.gain\.value = G\.sfxVol \/ 100; busUi\.gain\.value = G\.uiVol \/ 100;\n\}/,
    'function applyAudio() {\n  if (AC) { master.gain.value = G.master / 100; busFx.gain.value = G.sfxVol / 100; busUi.gain.value = G.uiVol / 100; }\n  lobbyMusicApplyVolume();\n}'
  );
  if (!html.includes('lobbyMusicApplyVolume();\n}')) throw new Error(`${rel}: applyAudio update failed`);
  html = replaceOnce(html,
    "{ t: 'range', k: 'uiVol', l: 'Menu sounds', min: 0, max: 100, step: 5, f: pc },\n    { t: 'check', k: 'hitSound', l: 'Hit tick when you damage an enemy' },",
    "{ t: 'range', k: 'uiVol', l: 'Menu sounds', min: 0, max: 100, step: 5, f: pc },\n    { t: 'range', k: 'musicVol', l: 'Lobby music', h: 'Atmospheric deployment score. Music stays below weapon and menu feedback.', min: 0, max: 100, step: 5, f: pc },\n    { t: 'check', k: 'musicMuted', l: 'Mute lobby music' },\n    { t: 'check', k: 'hitSound', l: 'Hit tick when you damage an enemy' },",
    `${rel}: music controls in Audio settings`);
  html = replaceOnce(html,
    "k === 'master' || k === 'sfxVol' || k === 'uiVol'",
    "k === 'master' || k === 'sfxVol' || k === 'uiVol' || k === 'musicVol' || k === 'musicMuted'",
    `${rel}: audio setting live application`);
  html = replaceOnce(html,
    "if (id === '#ov-start') onMenuShown();",
    "if (id === '#ov-start') onMenuShown();\n  lobbyMusicSetActive(id === '#ov-start' && state === 'idle');",
    `${rel}: lobby overlay entry`);
  html = replaceOnce(html,
    "function hideOverlays() { ['#ov-start', '#ov-buy', '#ov-end', '#ov-set'].forEach(function (s) { $(s).hidden = true; }); document.body.classList.remove('sl-lobby-screen'); }",
    "function hideOverlays() { ['#ov-start', '#ov-buy', '#ov-end', '#ov-set'].forEach(function (s) { $(s).hidden = true; }); document.body.classList.remove('sl-lobby-screen'); lobbyMusicSetActive(false); }",
    `${rel}: lobby overlay exit`);
  if (rel.includes('/phone-host/')) {
    html = replaceOnce(html,
      'M = { opS: {}, round: 0, you: 0, bots: 0, money: CFG.startMoney, stats: { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0 } };',
      "lobbyAudioCue('deploy');\n  M = { opS: {}, round: 0, you: 0, bots: 0, money: CFG.startMoney, stats: { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0 } };",
      `${rel}: deploy cue`);
  } else {
    html = replaceOnce(html,
      "if(R.mode!=='bomb')SOLO_BOMB.state=null;",
      "if(R.mode!=='bomb')SOLO_BOMB.state=null;\n  lobbyAudioCue('deploy');",
      `${rel}: deploy cue`);
  }
  html = replaceOnce(html,
    "$('#btn-sound').addEventListener('click', toggleSound);",
    "$('#btn-sound').addEventListener('click', toggleSound);",
    `${rel}: sound toggle anchor`);
  html = replaceOnce(html,
    "soundOn = !soundOn; var b = $('#btn-sound'); b.textContent = soundOn ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(soundOn));",
    "soundOn = !soundOn; var b = $('#btn-sound'); b.textContent = soundOn ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(soundOn)); lobbyMusicApplyVolume();",
    `${rel}: global sound toggle`);
  html = replaceOnce(html,
    "if(menuOpen()){renderNav();if(menuTab==='map')renderBody(true);else if(menuTab==='play')renderPlay();}\n}",
    "if(menuOpen()){renderNav();if(menuTab==='map')renderBody(true);else if(menuTab==='play')renderPlay();}\n  lobbyAudioCue('mission');\n}",
    `${rel}: map selection cue`);
  html = replaceOnce(html,
    'renderPlay();uiTick(true);});',
    "renderPlay();lobbyAudioCue('mission');});",
    `${rel}: mode selection cue`);
  html = replaceOnce(html,
    'if(firstLoadout)chooseLobbyWeapon(firstLoadout);renderBody(false);return;',
    "if(firstLoadout){chooseLobbyWeapon(firstLoadout);lobbyAudioCue('weapon');}renderBody(false);return;",
    `${rel}: loadout weapon category cue`);
  html = replaceOnce(html,
    "if ((b = t.closest('[data-loadout-finish]'))) { setFinish(Number(b.getAttribute('data-loadout-finish')),finishWeapon);renderBody(true);return; }",
    "if ((b = t.closest('[data-loadout-finish]'))) { var selectedLobbyFinish=Number(b.getAttribute('data-loadout-finish')),availableLobbyFinishes=weaponFinishList(finishWeapon);lobbyAudioCue(availableLobbyFinishes[selectedLobbyFinish]&&availableLobbyFinishes[selectedLobbyFinish].legendary?'legendary':'weapon');setFinish(selectedLobbyFinish,finishWeapon);renderBody(true);return; }",
    `${rel}: weapon finish selection cue`);
  html = replaceOnce(html,
    "if(t.matches('select[data-loadout-weapon]')){if(chooseLobbyWeapon(t.value)){loadoutCategory='all';renderBody(true);}return;}",
    "if(t.matches('select[data-loadout-weapon]')){if(chooseLobbyWeapon(t.value)){lobbyAudioCue('weapon');loadoutCategory='all';renderBody(true);}return;}",
    `${rel}: weapon selection cue`);
  fs.writeFileSync(file, originalHtml.includes('\r\n') ? html.replace(/\n/g, '\r\n') : html, 'utf8');
}

// The phone-host runtime uses an explicit static-file allowlist. Add only this
// local music asset; gameplay, WebSocket routes, and all other assets are intact.
const serverPath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js');
let server = fs.readFileSync(serverPath, 'utf8');
server = replaceOnce(server,
  "for (const family of ['coated_gunmetal','parkerized_steel','graphite_polymer','recoil_rubber','sight_steel','recess']) {",
  "FILES['/lobby-cinematic.wav'] = ['lobby-cinematic.wav', 'audio/wav'];\nfor (const family of ['coated_gunmetal','parkerized_steel','graphite_polymer','recoil_rubber','sight_steel','recess']) {",
  'phone-host static WAV allowlist');
fs.writeFileSync(serverPath, server, 'utf8');

console.log(JSON.stringify({status:'APPLIED',pages:2,phoneHostStaticRoute:'/lobby-cinematic.wav',scope:'lobby audio only'},null,2));
