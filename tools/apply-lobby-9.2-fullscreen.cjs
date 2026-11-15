'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
].map(p => path.join(root, p));

const css = `<style id="sightline-lobby-fullscreen-hud">
/* 9.2: a full-bleed WebGL lobby with a compact in-game HUD. */
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn::before{background:linear-gradient(90deg,rgba(4,9,10,.78),rgba(5,11,12,.61) 26%,rgba(5,11,12,.28) 43%,rgba(5,11,12,.04) 62%,rgba(5,11,12,.08)),linear-gradient(0deg,rgba(4,9,10,.42),transparent 34%,rgba(4,8,9,.12));}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-main{inset:68px 0 0;width:100%;max-width:none;height:auto;max-height:none;overflow:hidden;padding:0;background:none;}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-context{position:absolute;inset:7px auto auto clamp(20px,4vw,64px);z-index:8;width:max-content;max-width:calc(100% - 40px);margin:0;padding:0;background:none;border:0;}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-context-row{justify-content:flex-start;}
body.sl-lobby-screen[data-sl-route=play] #ov-start #mn-subnav{display:flex;flex-wrap:wrap;gap:6px;}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-subtab{min-height:34px;padding:5px 10px;border:1px solid rgba(222,225,210,.2);border-radius:2px;background:rgba(8,14,13,.42);font:700 .62rem var(--f-mono);letter-spacing:.055em;}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-subtab[aria-current=page]{border-color:rgba(122,215,191,.68);background:rgba(17,55,46,.58);color:#d5f2e8;}
body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-build-id,body.sl-lobby-screen[data-sl-route=play] #ov-start #mn-route-note{display:none!important;}
#ov-start #pn-play.lobby-fullscreen-layout{position:absolute;inset:0;z-index:2;display:block;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;overflow:hidden;padding:0;background:none;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-title-block{position:absolute;top:clamp(76px,10vh,112px);left:clamp(20px,4vw,64px);z-index:3;width:min(43vw,610px);max-width:calc(100vw - 40px);margin:0;padding:0;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-eyebrow{display:block;margin:0 0 8px;color:#dfbf83;font:750 .66rem var(--f-mono);letter-spacing:.16em;text-transform:uppercase;}
#ov-start #pn-play.lobby-fullscreen-layout .pn-h{display:block;margin:0;padding:0;border:0;}
#ov-start #pn-play.lobby-fullscreen-layout .pn-h::after,#ov-start #pn-play.lobby-fullscreen-layout .pn-h .no{display:none;}
#ov-start #pn-play.lobby-fullscreen-layout .pn-h h2{display:block;width:auto;max-width:none;min-width:0;color:#f4f0e5;font:900 clamp(1.8rem,3.05vw,3.15rem)/.98 var(--f-label);letter-spacing:.005em;white-space:nowrap;overflow:visible;text-shadow:0 2px 20px rgba(0,0,0,.58);}
#ov-start #pn-play.lobby-fullscreen-layout #ov-text{max-width:39ch;margin:9px 0 0;color:#e0e0d6;font:500 clamp(.82rem,.98vw,.98rem)/1.42 var(--f-body);text-shadow:0 1px 8px rgba(0,0,0,.7);}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-current{display:flex;align-items:center;gap:9px;margin-top:12px;color:#d4d4c8;font:700 .63rem var(--f-mono);letter-spacing:.13em;text-transform:uppercase;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-current span{color:#a7b1a7;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-current strong{color:#a9ead8;font:850 .78rem var(--f-label);letter-spacing:.09em;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-deck{position:absolute;left:clamp(20px,4vw,64px);bottom:98px;z-index:4;width:min(800px,56vw);min-width:0;margin:0;padding:0;background:none;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-header{min-height:18px;margin:0 0 7px;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-label{color:#d2c39f;font:700 .61rem var(--f-mono);letter-spacing:.14em;text-shadow:0 1px 8px rgba(0,0,0,.7);}
#ov-start #pn-play.lobby-fullscreen-layout .mode-grid{display:grid;width:100%;min-width:0;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;overflow:visible;border:0;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice{position:relative;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:7px;box-sizing:border-box;width:100%;min-width:0;min-height:50px;padding:7px 8px;border:1px solid rgba(223,225,210,.26);border-radius:2px;border-bottom:2px solid color-mix(in srgb,var(--mode-accent,#8ce8d1) 75%,transparent);background:rgba(7,13,13,.58);box-shadow:0 2px 10px rgba(0,0,0,.12);color:#f1eee4;text-align:left;white-space:nowrap;writing-mode:horizontal-tb;transition:background .14s,border-color .14s;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice::before{display:none;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice-head{display:flex;flex:0 0 auto;flex-direction:row;align-items:center;justify-content:center;width:auto;min-width:0;gap:0;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-num,#ov-start #pn-play.lobby-fullscreen-layout .mode-choice-state,#ov-start #pn-play.lobby-fullscreen-layout .mode-desc{display:none!important;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-glyph{display:block;flex:0 0 20px;width:20px;height:20px;color:var(--mode-accent,#a9c4bb);}
#ov-start #pn-play.lobby-fullscreen-layout .mode-name{display:block;flex:1 1 auto;min-width:0;max-width:none;overflow:visible;color:#eeeadd;font:800 clamp(.7rem,.78vw,.84rem)/1.1 var(--f-label);letter-spacing:.015em;white-space:nowrap;text-overflow:clip;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice:hover,#ov-start #pn-play.lobby-fullscreen-layout .mode-choice:focus-visible{border-color:rgba(140,232,209,.65);background:rgba(22,42,37,.84);outline:2px solid rgba(140,232,209,.42);outline-offset:1px;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice[aria-pressed=true]{border-color:#83e5cf;border-bottom-color:#83e5cf;background:rgba(23,73,61,.82);box-shadow:inset 0 0 0 1px rgba(131,229,207,.14),0 0 14px rgba(62,195,162,.12);}
#ov-start #pn-play.lobby-fullscreen-layout .mode-choice[aria-pressed=true] .mode-name{color:#d2f7eb;}
#ov-start #pn-play.lobby-fullscreen-layout .mode-brief{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-row{position:absolute;left:clamp(20px,4vw,64px);bottom:30px;z-index:4;display:flex;align-items:center;justify-content:flex-start;width:min(800px,56vw);min-width:0;margin:0;padding:0;background:none;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-note{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-row .btnrow{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:0;}
#ov-start #pn-play.lobby-fullscreen-layout #btn-start{min-width:174px;min-height:52px;padding:0 28px;border:1px solid #f1d198;border-radius:2px;background:linear-gradient(180deg,#e7c17f,#c99755);box-shadow:0 4px 18px rgba(0,0,0,.28);color:#171a16;font:900 .84rem var(--f-label);letter-spacing:.18em;}
#ov-start #pn-play.lobby-fullscreen-layout #btn-start:hover,#ov-start #pn-play.lobby-fullscreen-layout #btn-start:focus-visible{background:linear-gradient(180deg,#f1d69e,#d8a65f);outline:2px solid rgba(241,207,147,.48);outline-offset:3px;}
@media(max-width:900px){body.sl-lobby-screen[data-sl-route=play] #ov-start .mn::before{background:linear-gradient(90deg,rgba(4,9,10,.76),rgba(4,9,10,.48) 55%,rgba(4,9,10,.12)),linear-gradient(0deg,rgba(4,9,10,.55),transparent 62%);}body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-context{left:14px;top:5px;max-width:calc(100% - 28px);}body.sl-lobby-screen[data-sl-route=play] #ov-start #mn-subnav{gap:4px;}body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-subtab{min-height:32px;padding:4px 7px;font-size:.55rem;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-title-block{top:clamp(54px,13vh,76px);left:16px;width:calc(100vw - 32px);max-width:calc(100vw - 32px);}#ov-start #pn-play.lobby-fullscreen-layout .pn-h h2{font-size:clamp(1.15rem,5.1vw,2rem);}#ov-start #pn-play.lobby-fullscreen-layout #ov-text{max-width:34ch;margin-top:6px;font-size:.76rem;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-current{margin-top:7px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-deck{left:14px;bottom:88px;width:calc(100vw - 28px);}#ov-start #pn-play.lobby-fullscreen-layout .mode-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;}#ov-start #pn-play.lobby-fullscreen-layout .mode-choice{min-height:44px;padding:6px;}#ov-start #pn-play.lobby-fullscreen-layout .mode-name{font-size:clamp(.67rem,2vw,.82rem);}#ov-start #pn-play.lobby-fullscreen-layout .mode-glyph{flex-basis:18px;width:18px;height:18px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-row{left:14px;bottom:22px;width:calc(100vw - 28px);}#ov-start #pn-play.lobby-fullscreen-layout #btn-start{min-width:154px;min-height:46px;}}
@media(max-width:560px){#ov-start #pn-play.lobby-fullscreen-layout .lobby-title-block{top:50px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-eyebrow{font-size:.56rem;margin-bottom:5px;}#ov-start #pn-play.lobby-fullscreen-layout .pn-h h2{font-size:clamp(1.05rem,5vw,1.5rem);}#ov-start #pn-play.lobby-fullscreen-layout #ov-text{max-width:32ch;font-size:.72rem;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-deck{bottom:84px;}#ov-start #pn-play.lobby-fullscreen-layout .mode-grid{grid-template-columns:repeat(2,minmax(0,1fr));}#ov-start #pn-play.lobby-fullscreen-layout .mode-choice{min-height:40px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-row{bottom:16px;}#ov-start #pn-play.lobby-fullscreen-layout #btn-start{min-width:144px;min-height:44px;}}
@media(max-height:560px) and (orientation:landscape){#ov-start #pn-play.lobby-fullscreen-layout .lobby-title-block{top:50px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-eyebrow{margin-bottom:4px;}#ov-start #pn-play.lobby-fullscreen-layout .pn-h h2{font-size:clamp(1.25rem,4vh,2rem);}#ov-start #pn-play.lobby-fullscreen-layout #ov-text{margin-top:4px;font-size:.68rem;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-mode-deck{bottom:70px;}#ov-start #pn-play.lobby-fullscreen-layout .mode-choice{min-height:38px;}#ov-start #pn-play.lobby-fullscreen-layout .lobby-deploy-row{bottom:12px;}#ov-start #pn-play.lobby-fullscreen-layout #btn-start{min-height:40px;}}
@media(prefers-reduced-motion:reduce){#ov-start #pn-play.lobby-fullscreen-layout .mode-choice{transition:none!important;}}
</style>`;

const panel = `<div class="mn-panel image2-lobby lobby-fullscreen-layout" id="pn-play" role="tabpanel" aria-label="Play">
  <section class="lobby-title-block" aria-labelledby="ov-title"><span class="lobby-eyebrow">SIGHTLINE  /  OPERATIONS READY</span><header class="pn-h"><h2 id="ov-title">READY FOR DEPLOYMENT</h2></header><p id="ov-text">Choose a mission and prepare your squad.</p><div class="lobby-mode-current" aria-live="polite"><span>SELECTED MODE</span><strong id="ov-mode-name">TACTICAL</strong></div></section>
  <section class="lobby-mode-deck" aria-label="Mission selection"><div class="mode-header"><span class="mode-label">SELECT MISSION</span></div><div class="mode-grid" id="mode-select" role="group" aria-label="Solo game mode"></div><div class="mode-brief" id="mode-brief" aria-live="polite"></div></section>
  <div class="lobby-deploy-row"><div class="lobby-deploy-note"><span id="ov-note">Deploy to begin the operation.</span></div><div class="btnrow"><button class="btn" id="btn-start" type="button">DEPLOY</button><button class="btn ghost" id="btn-restart" type="button" hidden>Restart match</button><button class="btn ghost" id="btn-quit" type="button" hidden>Quit to menu</button></div></div>
</div>`;

function once(text, old, next, label) {
  const n = text.split(old).length - 1;
  if (n !== 1) throw Error(`${label}: expected 1 occurrence, found ${n}`);
  return text.replace(old, next);
}
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  const start = s.indexOf('<style id="sightline-lobby-deployment-strip">');
  const end = s.indexOf('</style>', start);
  if (start < 0 || end < 0) throw Error(`Deployment CSS missing in ${file}`);
  s = s.slice(0, start) + css + s.slice(end + 8);
  const panelStart = s.indexOf('<div class="mn-panel image2-lobby lobby-deployment-strip-layout" id="pn-play"');
  const panelEnd = s.indexOf('<div class="mn-panel" id="pn-dyn"', panelStart);
  if (panelStart < 0 || panelEnd < 0) throw Error(`Play panel missing in ${file}`);
  s = s.slice(0, panelStart) + panel + '\n            ' + s.slice(panelEnd);
  const copyStart = s.indexOf('function updatePlayCopy()');
  const copyEnd = s.indexOf('function renderPlay()', copyStart);
  if (copyStart < 0 || copyEnd < 0) throw new Error(`Play copy function missing in ${file}`);
  if (!s.slice(copyStart, copyEnd).includes("$('#ov-mode-name').textContent")) {
    const updatedCopy = "function updatePlayCopy(){if(state==='paused'||(MP.on&&MP.menu))return;var info=modeInfo(),copy={tactical:'Choose your side and prepare the operation.',ffa:'No squads. Outscore every operator in the arena.',bomb:'Secure site A or B, or stop the plant.',outbreak:'Deploy with your squad and hold against the Hollowed.',infection:'Stay together, survive the conversion and fight to sunrise.'};$('#ov-title').textContent='READY FOR DEPLOYMENT';$('#ov-mode-name').textContent=String(info[0]||R.mode).toUpperCase();$('#ov-text').textContent=copy[R.mode]||info[2];$('#btn-start').textContent='DEPLOY';$('#ov-note').textContent=touchMode?'Touch controls are ready · deploy when your squad is set.':'Choose a mission · use Maps or Match Rules above to configure · Esc pauses, Tab opens the scoreboard.';}\r\n";
    s = s.slice(0, copyStart) + updatedCopy + s.slice(copyEnd);
  }
  const playStart = s.indexOf('function renderPlay() {');
  const renderBodyStart = s.indexOf('function renderBody(keep)', playStart);
  const mapStart = s.indexOf("  var mapName=$('#play-map-name')", playStart);
  if (playStart < 0 || renderBodyStart < 0) throw new Error(`Play renderer missing in ${file}`);
  if (mapStart >= 0) {
    const rendererEnd = s.lastIndexOf('}', renderBodyStart);
    if (rendererEnd < mapStart) throw new Error(`Play summary block is malformed in ${file}`);
    s = s.slice(0, mapStart) + s.slice(rendererEnd);
  }
  const oldCamera = ',d=4.55;camera.position.set(a.x+Math.sin(angle)*d,1.83,a.z+Math.cos(angle)*d);var rx=Math.cos(angle),rz=-Math.sin(angle),off=.82;camera.lookAt(a.x-rx*off,1.10,a.z-rz*off);if(camera.fov!==49){camera.fov=49;camera.updateProjectionMatrix();}';
  s = once(s, oldCamera, ',d=4.2;camera.position.set(a.x+Math.sin(angle)*d,2.05,a.z+Math.cos(angle)*d);var rx=Math.cos(angle),rz=-Math.sin(angle),off=1.28;camera.lookAt(a.x-rx*off,1.38,a.z-rz*off);if(camera.fov!==44){camera.fov=44;camera.updateProjectionMatrix();}', 'Lobby camera');
  s = once(s,
    'shell:new THREE.MeshLambertMaterial({color:0x282d29}),wall:new THREE.MeshLambertMaterial({color:0x41433a}),panel:new THREE.MeshLambertMaterial({color:0x505246}),\n    steel:new THREE.MeshLambertMaterial({color:0x777466}),dark:new THREE.MeshLambertMaterial({color:0x171c1b}),olive:new THREE.MeshLambertMaterial({color:0x66654d}),\n    canvas:new THREE.MeshLambertMaterial({color:0x77735c}),wood:new THREE.MeshLambertMaterial({color:0x554638}),floor:new THREE.MeshLambertMaterial({color:0x333a36}),',
    'shell:new THREE.MeshLambertMaterial({color:0x1d2523}),wall:new THREE.MeshLambertMaterial({color:0x303631}),panel:new THREE.MeshLambertMaterial({color:0x3a4039}),\n    steel:new THREE.MeshLambertMaterial({color:0x62665f}),dark:new THREE.MeshLambertMaterial({color:0x111715}),olive:new THREE.MeshLambertMaterial({color:0x535b43}),\n    canvas:new THREE.MeshLambertMaterial({color:0x626451}),wood:new THREE.MeshLambertMaterial({color:0x453a2f}),floor:new THREE.MeshLambertMaterial({color:0x202825}),',
    'Lobby material palette');
  s = once(s, 'new THREE.HemisphereLight(0xe5d7bc,0x282d2a,.38)', 'new THREE.HemisphereLight(0xd8d7c7,0x202724,.28)', 'Lobby ambient');
  s = once(s, 'new THREE.PointLight(0xffc982,1.65,10,1.7)', 'new THREE.PointLight(0xffc982,1.15,10,1.7)', 'Lobby practical');
  s = once(s, 'new THREE.PointLight(0xf5d5a3,.68,9,1.8)', 'new THREE.PointLight(0xf2ead9,.48,9,1.8)', 'Lobby fill');
  s = once(s, 'new THREE.PointLight(0x65cbb5,.38,5.5,2)', 'new THREE.PointLight(0x65cbb5,.3,5.5,2)', 'Lobby monitor light');
  s = once(s, 'new THREE.PointLight(0xffe0d5,.82,8.5,2)', 'new THREE.PointLight(0xffeadb,.94,8.5,2)', 'Operator key light');
  s = once(s, 'new THREE.PointLight(0x69bca8,.28,5.5,2)', 'new THREE.PointLight(0x70cbb4,.36,5.5,2)', 'Operator rim light');
  fs.writeFileSync(file, s, 'utf8');
  console.log(`Applied Lobby 9.2 to ${path.relative(root, file)}`);
}
