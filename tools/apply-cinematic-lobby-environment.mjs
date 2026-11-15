import fs from 'node:fs';
import path from 'node:path';

// Retired 2026-11-09: this one-shot patcher installs a procedural ready-room
// shell over the active game map. The lobby now uses the selected playable
// arena as its backdrop. Keep this historical tool from reintroducing the
// rejected overlay by accident; use the production source and rollback files.
throw new Error('Retired: procedural ready-room patching is no longer used. The lobby backdrop is the selected in-game map.');

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const pages = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
].map(rel => path.join(root, rel));
const premiumCss = fs.readFileSync(path.join(root, 'tools/sightline-premium-lobby-spaces.css'), 'utf8').trim();

const environmentBlock = String.raw`var LOBBY_PREVIEW=null,LOBBY_PREVIEW_KEY='',LOBBY_READY_ROOM=null;
function createLobbyReadyRoom(){
  var root=new THREE.Group();root.name='sightline-lobby-ready-room';root.visible=false;root.userData.sightlineLobbyOnly=true;
  var mats={
    shell:new THREE.MeshLambertMaterial({color:0x282d29}),wall:new THREE.MeshLambertMaterial({color:0x41433a}),panel:new THREE.MeshLambertMaterial({color:0x505246}),
    steel:new THREE.MeshLambertMaterial({color:0x777466}),dark:new THREE.MeshLambertMaterial({color:0x171c1b}),olive:new THREE.MeshLambertMaterial({color:0x66654d}),
    canvas:new THREE.MeshLambertMaterial({color:0x77735c}),wood:new THREE.MeshLambertMaterial({color:0x554638}),floor:new THREE.MeshLambertMaterial({color:0x333a36}),
    screen:new THREE.MeshBasicMaterial({color:0x061516}),teal:new THREE.MeshBasicMaterial({color:0x63d8c1}),amber:new THREE.MeshBasicMaterial({color:0xd9a75f}),
    warm:new THREE.MeshBasicMaterial({color:0xffd38e}),dimWarm:new THREE.MeshBasicMaterial({color:0xb18a55})
  };
  var batches=new Map(),unitBox=new THREE.BoxGeometry(1,1,1);
  function box(w,h,d,mat,x,y,z,rot){var a=batches.get(mat);if(!a){a=[];batches.set(mat,a);}a.push([x,y,z,w,h,d,rot||0]);}
  function boxes(mat,list){list.forEach(function(a){box(a[3],a[4],a[5],mat,a[0],a[1],a[2],a[6]);});}
  function flush(){batches.forEach(function(list,mat){var mesh=new THREE.InstancedMesh(unitBox,mat,list.length),dummy=new THREE.Object3D();list.forEach(function(a,i){dummy.position.set(a[0],a[1],a[2]);dummy.rotation.y=a[6];dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);});}
  function shape(geo,mat,items,name){var mesh=new THREE.InstancedMesh(geo,mat,items.length),dummy=new THREE.Object3D();items.forEach(function(a,i){dummy.position.set(a[0],a[1],a[2]);dummy.rotation.set(a[6]||0,a[7]||0,a[8]||0);dummy.scale.set(a[3],a[4],a[5]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.name=name;mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);}
  function opsTexture(){
    if(typeof document==='undefined'||!document.createElement)return null;
    var c=document.createElement('canvas');c.width=512;c.height=288;var x=c.getContext&&c.getContext('2d');if(!x)return null;
    var g=x.createLinearGradient(0,0,512,288);g.addColorStop(0,'#102723');g.addColorStop(.58,'#0c1b1a');g.addColorStop(1,'#172522');x.fillStyle=g;x.fillRect(0,0,512,288);
    x.fillStyle='#192e28';x.fillRect(0,0,512,38);x.fillStyle='#d5a45d';x.fillRect(0,37,512,2);x.font='bold 17px Consolas,monospace';x.fillStyle='#e8e4d6';x.fillText('SIGHTLINE  /  OPERATIONS GRID',18,25);x.font='12px Consolas,monospace';x.fillStyle='#9ec8b7';x.fillText('SECURE CHANNEL 03  ·  BAY READY',18,60);
    x.strokeStyle='rgba(125,185,157,.16)';x.lineWidth=1;for(var xx=18;xx<510;xx+=32){x.beginPath();x.moveTo(xx,70);x.lineTo(xx,256);x.stroke();}for(var yy=76;yy<258;yy+=24){x.beginPath();x.moveTo(14,yy);x.lineTo(500,yy);x.stroke();}
    x.fillStyle='rgba(95,124,92,.52)';x.beginPath();x.moveTo(40,112);x.lineTo(126,89);x.lineTo(180,111);x.lineTo(199,157);x.lineTo(269,147);x.lineTo(307,105);x.lineTo(401,91);x.lineTo(457,121);x.lineTo(430,180);x.lineTo(450,212);x.lineTo(347,236);x.lineTo(275,207);x.lineTo(224,228);x.lineTo(152,198);x.lineTo(93,213);x.lineTo(55,174);x.closePath();x.fill();x.strokeStyle='#d1c38e';x.lineWidth=2;x.stroke();
    [[80,123,58,25],[222,101,78,24],[326,184,60,23],[133,174,42,21]].forEach(function(r){x.fillStyle='rgba(9,21,18,.82)';x.fillRect(r[0],r[1],r[2],r[3]);x.strokeStyle='rgba(190,202,165,.52)';x.strokeRect(r[0],r[1],r[2],r[3]);});
    x.strokeStyle='#66dfbf';x.lineWidth=4;x.beginPath();x.moveTo(63,190);x.lineTo(145,162);x.lineTo(214,181);x.lineTo(271,139);x.lineTo(341,157);x.lineTo(419,115);x.stroke();
    [[85,118,'A','#e2b873'],[430,208,'B','#e2b873'],[271,139,'1','#6be0c1']].forEach(function(m){x.beginPath();x.fillStyle=m[3];x.arc(m[0],m[1],10,0,Math.PI*2);x.fill();x.font='bold 11px Consolas,monospace';x.textAlign='center';x.fillStyle='#071311';x.fillText(m[2],m[0],m[1]+4);});x.textAlign='left';
    x.fillStyle='#263d32';x.fillRect(0,271,512,17);x.fillStyle='#d9a75f';x.fillRect(16,271,138,3);x.fillStyle='#a6b8a7';x.font='11px Consolas,monospace';x.fillText('A / B OBJECTIVE ROUTES',18,264);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.generateMipmaps=true;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;return t;
  }
  var screenTex=opsTexture();
  /* Quiet, broad room shell; the operator stands in the open foreground lane. */
  var floor=new THREE.Mesh(new THREE.PlaneGeometry(13,16),mats.floor);floor.rotation.x=-Math.PI/2;floor.position.set(0,.03,2.8);floor.castShadow=false;floor.receiveShadow=false;root.add(floor);
  box(13,.15,.3,mats.dark,0,.16,-3.7);box(13,.16,.25,mats.panel,0,.26,-3.53);box(13,4.4,.24,mats.shell,0,2.47,-3.78);
  /* Extend the lobby-only floor, side returns, and ceiling well past the preview
     camera. The former shell ended 0.15 units in front of the camera, exposing
     a hard edge and the live map floor at the bottom of the rendered view. */
  box(.22,4.5,16,mats.shell,-6.35,2.3,2.8);box(.22,4.5,16,mats.shell,6.35,2.3,2.8);
  box(13,.16,16,mats.dark,0,4.78,2.8);
  box(12.5,.08,.12,mats.steel,0,.47,-3.54);box(12.5,.1,.12,mats.wood,0,.55,-3.43);
  box(12.4,.17,.28,mats.panel,0,4.56,-3.61);box(12.3,.045,.12,mats.dark,0,4.68,-3.55);
  /* Left wall: tall locker bank with door frames, vents, handles and warm inventory labels. */
  [-4.74,-3.55,-2.36].forEach(function(cx,i){
    box(1.08,2.85,.48,mats.dark,cx,1.89,-3.42);box(1.0,2.73,.10,i===1?mats.panel:mats.olive,cx,1.9,-3.34);
    box(.91,.035,.055,mats.steel,cx,3.25,-3.27);box(.91,.035,.055,mats.steel,cx,.55,-3.27);box(.035,2.59,.045,mats.steel,cx-.47,1.9,-3.28);
    for(var v=0;v<5;v++)box(.38,.026,.025,mats.dark,cx-.15,2.57-v*.105,-3.272);
    box(.11,.34,.07,mats.dark,cx+.29,1.73,-3.245);box(.035,.19,.025,mats.dimWarm,cx+.29,1.73,-3.202);
    box(.21,.055,.028,i===0?mats.amber:mats.teal,cx-.29,3.08,-3.255);
  });
  /* Open left equipment rack: field packs, helmet forms, radio cases and folded kit. */
  [-1.48,-.58].forEach(function(cx){box(.055,2.35,.055,mats.steel,cx,1.8,-3.17);});
  [.63,1.22,1.81,2.4,2.99].forEach(function(y){box(1.02,.055,.48,mats.dark,-1.03,y,-3.07);box(.92,.028,.38,mats.wood,-1.03,y+.04,-3.05);});
  box(.78,.42,.32,mats.olive,-1.03,2.68,-2.95);box(.62,.12,.35,mats.canvas,-1.03,2.39,-2.94);
  box(.5,.44,.32,mats.dark,-1.03,1.95,-2.95);box(.4,.3,.26,mats.canvas,-1.03,1.91,-2.77);
  box(.28,.08,.14,mats.amber,-1.03,1.93,-2.62);box(.56,.08,.16,mats.teal,-1.03,1.29,-2.82);
  /* Right workstation and illuminated command display. Keep all hard props behind the operator lane. */
  box(2.55,.11,.78,mats.wood,2.65,.94,-3.13);box(2.58,.09,.82,mats.dark,2.65,.84,-3.13);
  [-1,1].forEach(function(side){var x=2.65+side*1.04;box(.11,.86,.12,mats.dark,x,.43,-3.13);box(.17,.12,.18,mats.steel,x,.09,-3.13);});
  box(2.4,.035,.05,mats.amber,2.65,1.005,-2.71);box(.76,.12,.12,mats.dark,1.88,1.08,-3.11);box(.16,.13,.13,mats.teal,1.88,1.17,-3.11);
  box(1.98,1.2,.13,mats.dark,2.65,2.43,-3.47);box(1.88,1.1,.065,mats.steel,2.65,2.43,-3.4);box(1.77,1.0,.025,mats.screen,2.65,2.43,-3.355);
  if(screenTex){var face=new THREE.Mesh(new THREE.PlaneGeometry(1.75,.98),new THREE.MeshBasicMaterial({map:screenTex,toneMapped:false}));face.name='sightlineLobbyOperationsDisplay';face.position.set(2.65,2.43,-3.335);face.renderOrder=3;face.castShadow=false;face.receiveShadow=false;root.add(face);}
  box(.7,.035,.035,mats.amber,2.21,3.09,-3.37);box(.16,.1,.035,mats.teal,3.53,1.88,-3.38);
  /* Chair, modest storage, and floor markings establish scale without foreground obstructions. */
  box(.58,.14,.46,mats.dark,2.76,.58,-2.05);box(.09,.56,.1,mats.steel,2.76,.29,-2.05);box(.66,.09,.16,mats.dark,2.76,.06,-2.05);
  box(.68,.68,.48,mats.olive,4.55,.38,-3.12);box(.62,.075,.51,mats.panel,4.55,.75,-3.12);box(.52,.06,.026,mats.teal,4.55,.57,-2.87);
  box(1.4,.06,.09,mats.amber,0,.07,-1.7);box(1.4,.06,.09,mats.teal,0,.07,-3.0);
  [-.56,0,.56].forEach(function(dx){box(.025,.01,7.8,mats.panel,dx,.04,.1);});
  /* Warm practicals and small status lights remain static; no shadow maps or post-processing. */
  box(1.9,.055,.2,mats.dark,2.74,3.96,-3.42);box(1.55,.045,.18,mats.dark,-3.95,3.86,-3.43);
  box(1.62,.035,.12,mats.warm,2.74,3.91,-3.38);box(1.22,.032,.12,mats.warm,-3.95,3.82,-3.38);
  box(.11,.38,.045,mats.amber,-5.35,3.35,-3.25);box(.11,.38,.045,mats.teal,4.73,3.33,-3.25);
  flush();
  var ambient=new THREE.HemisphereLight(0xe5d7bc,0x282d2a,.38);ambient.name='sightlineLobbyAmbient';root.add(ambient);
  var warm=new THREE.PointLight(0xffc982,1.65,10,1.7);warm.name='sightlineLobbyPracticalWarm';warm.position.set(2.05,3.45,-2.2);warm.castShadow=false;root.add(warm);
  var fill=new THREE.PointLight(0xf5d5a3,.68,9,1.8);fill.name='sightlineLobbyOperatorFill';fill.position.set(-.15,3.05,-1.55);fill.castShadow=false;root.add(fill);
  var screenGlow=new THREE.PointLight(0x65cbb5,.38,5.5,2);screenGlow.name='sightlineLobbyScreenGlow';screenGlow.position.set(2.75,2.5,-2.55);screenGlow.castShadow=false;root.add(screenGlow);
  return root;
}
function lobbyPreviewUpdate(active){if(!active){if(LOBBY_PREVIEW&&LOBBY_PREVIEW.g)LOBBY_PREVIEW.g.visible=false;if(LOBBY_READY_ROOM)LOBBY_READY_ROOM.visible=false;return;}if(!LOBBY_READY_ROOM){LOBBY_READY_ROOM=createLobbyReadyRoom();scene.add(LOBBY_READY_ROOM);}var isOp=menuOpen()&&menuTab==='op',isLoadout=menuOpen()&&menuTab==='settings'&&setTab==='customization',operator=isOp?(opById(pendingOpId)||ME):ME,weapon=isLoadout?finishWeapon:'carbine',key=operator.id+'|'+CURMAP.id+'|'+weapon;if(!LOBBY_PREVIEW||LOBBY_PREVIEW_KEY!==key){if(LOBBY_PREVIEW&&LOBBY_PREVIEW.g)scene.remove(LOBBY_PREVIEW.g);var spawn=MAPD.spawn||{x:0,z:0};LOBBY_PREVIEW=makeUnit(spawn.x-3.2,spawn.z-4.0,operator);ensureWorldWeapon(LOBBY_PREVIEW,weapon);LOBBY_PREVIEW.g.userData.sightlineLobbyPreview=true;LOBBY_PREVIEW.g.userData.sightlineLobbyOperator=operator.id;LOBBY_PREVIEW_KEY=key;LOBBY_PREVIEW.baseY=.08;LOBBY_PREVIEW.baseYaw=Math.PI;LOBBY_PREVIEW.g.position.y=.08;LOBBY_PREVIEW.g.rotation.y=Math.PI;var lobbyFill=new THREE.PointLight(0xffe0d5,.82,8.5,2);lobbyFill.name='sightlineLobbyOperatorFill';lobbyFill.position.set(0,2.22,-.92);lobbyFill.castShadow=false;LOBBY_PREVIEW.g.add(lobbyFill);var lobbyRim=new THREE.PointLight(0x69bca8,.28,5.5,2);lobbyRim.name='sightlineLobbyOperatorRim';lobbyRim.position.set(.48,2.05,.52);lobbyRim.castShadow=false;LOBBY_PREVIEW.g.add(lobbyRim);var contact=new THREE.Mesh(new THREE.CircleGeometry(.58,20),new THREE.MeshBasicMaterial({color:0x090d0b,transparent:true,opacity:.22,depthWrite:false}));contact.name='sightlineLobbyContactShadow';contact.rotation.x=-Math.PI/2;contact.position.y=-.045;contact.renderOrder=1;contact.castShadow=false;contact.receiveShadow=false;LOBBY_PREVIEW.g.add(contact);LOBBY_PREVIEW.g.traverse(function(n){if(n.isMesh&&n!==contact){n.castShadow=false;n.receiveShadow=false;}});}LOBBY_PREVIEW.g.visible=true;var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches,t=performance.now()*.001;LOBBY_PREVIEW.g.rotation.y=LOBBY_PREVIEW.baseYaw+(reduced?0:Math.sin(t*.22)*.022);LOBBY_PREVIEW.g.position.y=LOBBY_PREVIEW.baseY+(reduced?0:Math.sin(t*.7)*.0025);var angle=.38;LOBBY_READY_ROOM.position.set(LOBBY_PREVIEW.g.position.x,0,LOBBY_PREVIEW.g.position.z);LOBBY_READY_ROOM.rotation.y=angle;LOBBY_READY_ROOM.visible=true;}
`;

const lobbyCameraBranch = "if(state==='idle'&&menuOpen()&&LOBBY_PREVIEW&&LOBBY_PREVIEW.g){var a=LOBBY_PREVIEW.g.position,angle=.38,d=4.55;camera.position.set(a.x+Math.sin(angle)*d,1.83,a.z+Math.cos(angle)*d);var rx=Math.cos(angle),rz=-Math.sin(angle),off=.82;camera.lookAt(a.x-rx*off,1.10,a.z-rz*off);if(camera.fov!==49){camera.fov=49;camera.updateProjectionMatrix();}camera.rotation.z=0;return;}";

const playPanelHtml = String.raw`<div class="mn-panel image2-lobby" id="pn-play" role="tabpanel" aria-label="Play">
  <section class="lobby-title-block" aria-labelledby="ov-title"><span class="lobby-eyebrow">SIGHTLINE  /  TACTICAL OPERATIONS</span><header class="pn-h"><h2 id="ov-title">READY FOR<br>DEPLOYMENT</h2></header><p id="ov-text">Choose a mission and prepare your squad.</p></section>
  <section class="lobby-mode-deck" aria-label="Mission selection"><div class="mode-header"><span class="mode-label">SELECT A MISSION</span></div><div class="mode-grid" id="mode-select" role="group" aria-label="Solo game mode"></div><div class="mode-brief" id="mode-brief" aria-live="polite"></div></section>
  <aside class="lobby-ready-rail" aria-label="Current deployment setup"><div class="lobby-rail-kicker">DEPLOYMENT SETUP</div><div class="play-map-card"><div class="play-map-card-head"><div><span class="lobby-mini-label">SELECTED MAP</span><strong id="play-map-name">Courtyard</strong></div><span id="play-map-tag">CLASSIC YARD</span></div><div id="play-map-preview" aria-hidden="true"></div><button type="button" class="play-map-open" data-go="map" aria-label="Change selected map"><span>CHANGE MAP</span><b aria-hidden="true">↗</b></button></div><div class="pl-sum" id="pl-sum"></div></aside>
  <div class="lobby-deploy-row"><div class="lobby-deploy-note"><span class="lobby-status-dot" aria-hidden="true"></span><span id="ov-note">Deploy to begin the operation.</span></div><div class="btnrow"><button class="btn" id="btn-start" type="button">DEPLOY</button><button class="btn ghost" id="btn-restart" type="button" hidden>Restart match</button><button class="btn ghost" id="btn-quit" type="button" hidden>Quit to menu</button></div></div>
</div>`;

const artDirectionCss = String.raw`<style id="sightline-lobby-production-art-direction">
/* Image 2 reconstruction: full-bleed rendered armory with a restrained left scrim. */
body.sl-lobby-screen{overflow:hidden;background:#061015;color:#edf2eb}
body.sl-lobby-screen .wrap{width:auto;max-width:none;margin:0;padding:0}
body.sl-lobby-screen .wrap>:not(.stage-wrap){display:none!important}
body.sl-lobby-screen .stage-wrap{position:fixed;inset:0;z-index:0;width:100vw;height:100dvh;margin:0;padding:0}
body.sl-lobby-screen #stage{width:100%;height:100%;min-height:100%;aspect-ratio:auto;border:0;border-radius:0;box-shadow:none;background:#081116}
body.sl-lobby-screen #gl{width:100%;height:100%}
body.sl-lobby-screen #ov-start{position:fixed;inset:0;z-index:12;display:block;overflow:hidden;background:transparent}
#ov-start.menu{padding:0;display:block;overflow:hidden;background:transparent!important;color:#f2eee2}
#ov-start .mn{display:block;position:relative;width:100%;height:100%;min-width:0;overflow:hidden;background:transparent!important}
#ov-start .mn::before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(7,10,9,.93) 0%,rgba(7,10,9,.82) 27%,rgba(7,10,9,.49) 43%,rgba(7,10,9,.08) 62%,rgba(7,10,9,.24) 100%),linear-gradient(0deg,rgba(5,8,7,.76) 0%,transparent 30%,rgba(4,7,7,.12) 100%)}
#ov-start .mn-rail{position:absolute;inset:0 0 auto;z-index:10;height:68px;box-sizing:border-box;display:grid;grid-template-columns:minmax(180px,1fr) auto minmax(180px,1fr);grid-template-rows:1fr;align-items:center;gap:16px;padding:0 clamp(18px,3vw,48px);border:0;border-bottom:1px solid rgba(228,218,194,.18);background:linear-gradient(180deg,rgba(8,12,11,.88),rgba(8,12,11,.66));backdrop-filter:none}
#ov-start .mn-brand{grid-column:1;grid-row:1;display:flex;align-self:stretch;align-items:center;padding:0;border:0;background:none}
#ov-start .mn-brand svg{color:#7ad7bf;width:27px;height:27px}
#ov-start .mn-brand b{font:800 1.08rem var(--f-label);letter-spacing:.18em;color:#f2eee2}
#ov-start .mn-brand span{color:#a9a48e;font:600 .52rem var(--f-mono);letter-spacing:.18em}
#ov-start .mn-nav{grid-column:2;grid-row:1;display:flex;align-items:center;justify-content:center;gap:clamp(4px,1.4vw,22px);min-width:0;overflow:visible;padding:0}
#ov-start .mn-tab{position:relative;display:flex;align-items:center;gap:7px;min-height:42px;padding:7px 8px;border:0;border-radius:0;background:none;color:#c2c4b9;white-space:nowrap;text-align:center}
#ov-start .mn-tab .no{display:none}
#ov-start .mn-tab .nm{font:800 .72rem var(--f-label);letter-spacing:.14em}
#ov-start .mn-tab svg{width:17px;height:17px;color:#aab5a9}
#ov-start .mn-tab .lk{display:none}
#ov-start .mn-tab:hover,#ov-start .mn-tab[aria-selected=true]{color:#fff;background:transparent}
#ov-start .mn-tab[aria-selected=true]::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:2px;background:#7ad7bf;box-shadow:0 0 12px rgba(122,215,191,.42)}
#ov-start .mn-card{grid-column:3;grid-row:1;justify-self:end;display:flex;min-width:0;align-items:center;gap:8px;padding:0 0 0 14px;border:0;border-left:1px solid rgba(228,218,194,.2);background:none}
#ov-start .mn-card svg{width:32px;height:32px;border:1px solid rgba(228,218,194,.28);border-radius:50%}
#ov-start .mn-card b{font:800 .72rem var(--f-label);letter-spacing:.1em;color:#f2eee2}
#ov-start .mn-card span{max-width:140px;color:#b4b4a5;font:500 .53rem var(--f-mono)}
#ov-start .mn-context{position:relative;z-index:8;display:block;width:max-content;max-width:100%;margin:9px 0 0;padding:0;border:0;background:none}
#ov-start .mn-context-row{display:flex;min-width:0;align-items:center}
#ov-start #mn-subnav{display:flex;flex-wrap:wrap;gap:5px;max-width:100%;min-width:0}
#ov-start .mn-subtab{min-height:34px;padding:6px 11px;border:1px solid rgba(224,215,192,.22);border-radius:2px;background:rgba(14,21,18,.66);color:#ddd9ca;font:750 .66rem var(--f-mono);letter-spacing:.075em}
#ov-start .mn-subtab[aria-current=page]{border-color:rgba(122,215,191,.72);background:rgba(24,63,53,.62);color:#d3f4e9}
#ov-start .mn-build-id,#ov-start #mn-route-note{display:none!important}
#ov-start .mn-main{position:absolute;inset:68px 0 0;z-index:2;display:flex;flex-direction:column;box-sizing:border-box;width:auto;max-width:none;max-height:none;height:auto;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;padding:0 clamp(20px,4vw,64px) 18px;background:none;scrollbar-color:rgba(217,167,95,.38) transparent}
#ov-start .mn-context{flex:0 0 auto;width:100%;max-width:100%;margin:8px 0 0;overflow-wrap:normal;word-break:normal}
#ov-start .mn-panel{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:normal;word-break:normal}
#ov-start #pn-play.image2-lobby{position:relative;inset:auto;align-self:stretch;flex:1 0 auto;display:grid;grid-template-columns:minmax(350px,min(42vw,660px)) minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto auto;column-gap:clamp(22px,3vw,48px);row-gap:0;width:100%;max-width:none;min-width:0;min-height:clamp(620px,calc(100dvh - 110px),820px);height:auto;overflow:visible;align-content:stretch;gap:0;padding:0 0 10px}
#ov-start .lobby-title-block{grid-column:1;grid-row:1;align-self:start;width:min(100%,660px);min-width:0;margin:clamp(20px,3vh,34px) 0 0;padding:0 clamp(0px,.7vw,12px)}
#ov-start .lobby-eyebrow,#ov-start .lobby-rail-kicker{display:block;margin-bottom:10px;color:#d1b37c;font:750 .7rem var(--f-mono);letter-spacing:.16em;text-transform:uppercase}
#ov-start .pn-h{display:block;margin:0;padding:0;border:0}
#ov-start .pn-h::after,#ov-start .pn-h .no{display:none}
#ov-start #pn-play .pn-h h2{display:block;width:100%;max-width:none;min-width:0;color:#f5f0e3;font:900 clamp(2.3rem,4.25vw,4.45rem)/.92 var(--f-label);letter-spacing:.012em;white-space:nowrap;overflow-wrap:normal;word-break:normal;text-shadow:0 2px 24px rgba(0,0,0,.38)}
#ov-start #ov-text{max-width:38ch;margin-top:16px;color:#d0d0c5;font:500 clamp(.83rem,1.05vw,1.02rem)/1.45 var(--f-body)}
#ov-start .lobby-mode-deck{grid-column:1/-1;grid-row:2;align-self:end;width:100%;min-width:0;padding:0 0 6px}
#ov-start .mode-header{display:flex;align-items:center;min-height:22px;margin:0 0 7px}
#ov-start .mode-label{color:#d1b37c;font:750 .7rem var(--f-mono);letter-spacing:.15em}
#ov-start #pn-play .mode-grid{display:grid;width:100%;min-width:0;grid-template-columns:repeat(5,minmax(0,1fr));gap:clamp(7px,.8vw,13px);overflow:visible}
#ov-start #pn-play .mode-choice{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr);grid-template-rows:auto auto;align-items:center;gap:4px 12px;box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:86px;padding:12px clamp(10px,1vw,16px);border:1px solid rgba(219,214,193,.25);border-bottom:2px solid rgba(219,214,193,.2);border-radius:3px;background:linear-gradient(145deg,rgba(33,43,37,.9),rgba(16,23,21,.94));color:#e4e0d4;text-align:left;white-space:normal;overflow-wrap:normal;word-break:normal;writing-mode:horizontal-tb;transition:background .14s,border-color .14s,transform .14s}
#ov-start .mode-choice::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--mode-accent,#87c5a7);opacity:.85}
#ov-start #pn-play .mode-choice-head{grid-column:1;grid-row:1/span 2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;min-width:0}
#ov-start .mode-num{display:none}
#ov-start #pn-play .mode-glyph{width:30px;height:30px;flex:none;color:var(--mode-accent,#87c5a7)}
#ov-start .mode-choice-state{color:#9da99e;font:700 .58rem var(--f-mono);letter-spacing:.08em}
#ov-start #pn-play .mode-name{grid-column:2;grid-row:1;display:block;min-width:0;max-width:100%;color:#f0ece0;font:850 clamp(.83rem,1vw,1rem)/1.12 var(--f-label);letter-spacing:.025em;white-space:nowrap;word-break:keep-all;overflow-wrap:normal;writing-mode:horizontal-tb;text-orientation:mixed;overflow:hidden;text-overflow:ellipsis}
#ov-start #pn-play .mode-desc{grid-column:2;grid-row:2;display:-webkit-box!important;min-width:0;max-width:100%;overflow:hidden;color:#c8c9bf;font:500 clamp(.68rem,.76vw,.78rem)/1.3 var(--f-body);text-overflow:ellipsis;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#ov-start .mode-choice:hover,#ov-start .mode-choice:focus-visible{z-index:1;transform:translateY(-2px);border-color:rgba(224,210,170,.65);outline:none}
#ov-start .mode-choice[aria-pressed=true]{border-color:#7ad7bf;border-bottom-color:#7ad7bf;background:linear-gradient(145deg,rgba(29,83,68,.93),rgba(14,44,38,.94));box-shadow:0 0 16px rgba(74,195,161,.1)}
#ov-start .mode-choice[aria-pressed=true] .mode-choice-state{color:#c5f1e5}
#ov-start .mode-tactical{--mode-accent:#77d7bd}#ov-start .mode-ffa{--mode-accent:#d8b06e}#ov-start .mode-bomb{--mode-accent:#e0b56c}#ov-start .mode-outbreak{--mode-accent:#a8c979}#ov-start .mode-infection{--mode-accent:#dd8b79}
#ov-start .mode-brief{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px;padding:8px 2px 0;border:0;background:none}
#ov-start .mode-brief-main{display:flex;align-items:center;gap:9px;min-width:0}
#ov-start .mode-brief-kicker{color:#b49d70;font:700 .62rem var(--f-mono);letter-spacing:.13em}
#ov-start .mode-brief-main strong{color:#f5f0e3;font:850 .88rem var(--f-label);letter-spacing:.1em;text-transform:uppercase}
#ov-start .mode-brief-main>span:last-child{overflow:hidden;color:#d2d2c8;font:500 .82rem var(--f-body);text-overflow:ellipsis;white-space:nowrap}
#ov-start .mode-brief em{flex:none;color:#b9d8c4;font:700 .6rem var(--f-mono);letter-spacing:.08em;font-style:normal;text-align:right}
#ov-start .lobby-ready-rail{grid-column:1;grid-row:1;align-self:end;display:grid;grid-template-columns:minmax(150px,.78fr) minmax(0,1.22fr);grid-template-rows:auto minmax(0,1fr);align-items:stretch;gap:8px 12px;box-sizing:border-box;width:min(100%,650px);min-width:0;max-width:100%;max-height:none;margin:0 0 18px;padding:12px 14px;border:1px solid rgba(216,205,176,.28);border-left:3px solid rgba(217,167,95,.9);background:linear-gradient(145deg,rgba(7,13,11,.91),rgba(12,18,15,.84));box-shadow:0 10px 28px rgba(0,0,0,.22);overflow:visible}
#ov-start .lobby-rail-kicker{grid-column:1/-1;margin:0;color:#e0c28d;font-size:.67rem}
#ov-start .play-map-card{position:relative;display:grid;grid-template-rows:auto minmax(56px,1fr) auto;min-width:0;overflow:hidden;border:1px solid rgba(210,200,171,.28);background:rgba(4,10,9,.48)}
#ov-start .play-map-card-head{display:flex;align-items:end;justify-content:space-between;gap:8px;padding:9px 9px 6px}
#ov-start .play-map-card-head>div{display:grid;gap:3px;min-width:0}
#ov-start .lobby-mini-label{color:#b8b49f;font:700 .57rem var(--f-mono);letter-spacing:.1em}
#ov-start .play-map-card-head strong{overflow:hidden;color:#f0ebde;font:850 .95rem var(--f-label);letter-spacing:.05em;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}
#ov-start .play-map-card-head>span{color:#d0bd91;font:650 .55rem var(--f-mono);text-align:right}
#ov-start #play-map-preview{height:64px;padding:5px;background:linear-gradient(140deg,rgba(37,74,60,.34),rgba(8,16,14,.42))}
#ov-start #play-map-preview svg{display:block;width:100%;height:100%;object-fit:contain}
#ov-start .play-map-open{position:static;display:flex;align-items:center;justify-content:space-between;width:100%;min-height:34px;padding:6px 9px;border:0;border-top:1px solid rgba(217,167,95,.28);background:rgba(83,60,34,.35);color:#f0d2a0;cursor:pointer;font:750 .65rem var(--f-mono);letter-spacing:.09em;text-align:left}
#ov-start .play-map-open span{display:inline!important}
#ov-start .play-map-open:hover{background:rgba(114,78,39,.5)}
#ov-start .pl-sum{display:grid;grid-template-columns:minmax(0,1fr);align-content:center;gap:0;min-width:0;border:0}
#ov-start .pl-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:3px 8px;padding:7px 0;border-bottom:1px solid rgba(216,205,176,.2)}
#ov-start .pl-row .k{grid-column:1/-1;color:#b8b49f;font:700 .57rem var(--f-mono);letter-spacing:.1em}
#ov-start .pl-row .vv{grid-column:1;display:flex;gap:7px;min-width:0;color:#f0ebde;font:800 .79rem var(--f-label);letter-spacing:.03em}
#ov-start .pl-row .vv svg{width:24px;height:24px;border-color:rgba(216,205,176,.25);border-radius:50%}
#ov-start .pl-row .vv small{display:block;max-width:none;overflow:hidden;color:#c3c5b9;font:500 .66rem/1.3 var(--f-body);text-overflow:ellipsis;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#ov-start .pl-row .lnk{grid-column:2;align-self:center;min-height:28px;padding:4px 6px;border:1px solid rgba(122,215,191,.32);color:#a9ead7;font:750 .58rem var(--f-mono);letter-spacing:.07em;text-transform:uppercase}
/* Video quality remains in Settings; Play keeps only launch-relevant squad and match information. */
#ov-start #pn-play #pl-sum>.pl-row:nth-child(3){display:none}
#ov-start .lobby-deploy-row{grid-column:1/-1;grid-row:3;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto;align-items:center;justify-content:stretch;gap:8px 18px;min-width:0;padding:12px 0 0}
#ov-start .lobby-deploy-note{display:flex;align-items:center;gap:9px;min-width:0;color:#d2d2c8;font:550 .72rem/1.4 var(--f-mono)}
#ov-start .lobby-status-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#8bd5ad;box-shadow:0 0 8px rgba(139,213,173,.55)}
#ov-start .lobby-deploy-row .btnrow{grid-column:2;grid-row:1;display:flex;justify-content:flex-end;flex:none;gap:8px;margin:0}
#ov-start .lobby-deploy-note{grid-column:1;grid-row:1;justify-content:flex-start;text-align:left}
#ov-start #btn-start{min-width:220px;min-height:56px;padding:0 30px;border:1px solid #efcf93;border-radius:3px;background:linear-gradient(180deg,#e2bd7a,#c7914b);box-shadow:0 7px 20px rgba(0,0,0,.18);color:#1a1a15;font:900 .92rem var(--f-label);letter-spacing:.2em;text-shadow:none}
#ov-start #btn-start:hover,#ov-start #btn-start:focus-visible{background:linear-gradient(180deg,#f0d499,#d7a45b);outline:2px solid rgba(241,207,147,.46);outline-offset:2px}
#ov-start #btn-start:active{transform:translateY(1px)}
#ov-start .lobby-deploy-row .btn.ghost{min-height:42px}
@media(max-width:1120px){
  #ov-start .mn-rail{grid-template-columns:minmax(150px,1fr) auto minmax(150px,1fr);gap:8px;padding-inline:18px}
  #ov-start .mn-tab{gap:5px;padding-inline:6px}#ov-start .mn-tab .nm{font-size:.64rem;letter-spacing:.1em}
  #ov-start .mn-main{padding-inline:24px}
  #ov-start #pn-play.image2-lobby{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;align-content:start;min-height:calc(100dvh - 130px);padding-top:10px}
  #ov-start #pn-play .lobby-title-block{grid-column:1;grid-row:1;align-self:start;margin:clamp(18px,3vh,40px) 0 18px;width:min(100%,680px)}
  #ov-start #pn-play .lobby-ready-rail{grid-column:1;grid-row:2;align-self:start;margin:0 0 18px;width:min(100%,720px)}
  #ov-start #pn-play .lobby-mode-deck{grid-row:3}
  #ov-start #pn-play .lobby-deploy-row{grid-row:4}
  #ov-start #pn-play .lobby-mode-deck{grid-column:1/-1}
  #ov-start #pn-play .mode-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  #ov-start #pn-play .mode-choice{min-height:66px}
  #ov-start .lobby-ready-rail{padding:10px 12px}
}
@media(max-width:760px){
  #ov-start .mn-rail{height:58px;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:1fr;gap:5px;padding:0 10px}
  #ov-start .mn-brand{grid-column:1;grid-row:1}.mn-card{display:none!important}
  #ov-start .mn-brand svg{width:22px;height:22px}#ov-start .mn-brand b{font-size:.86rem}#ov-start .mn-brand span{font-size:.43rem}
  #ov-start .mn-nav{grid-column:2;grid-row:1;justify-content:end;gap:2px}
  #ov-start .mn-tab{min-height:38px;gap:4px;padding:5px 6px}
  #ov-start .mn-tab .nm{font-size:.55rem;letter-spacing:.06em}#ov-start .mn-tab svg{width:14px;height:14px}
  #ov-start .mn-main{inset:58px 0 0;padding:0 14px 12px}
  #ov-start .mn-context{margin-top:6px}
  #ov-start .mn-subtab{min-height:26px;padding:3px 6px;font-size:.5rem}
  #ov-start #pn-play.image2-lobby{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;column-gap:0;min-height:calc(100dvh - 120px);padding-top:10px}
  #ov-start #pn-play .lobby-title-block{width:100%;padding:0}
  #ov-start #pn-play .pn-h h2{font-size:clamp(2rem,5.8vw,3.25rem)}
  #ov-start #pn-play #ov-text{max-width:36ch;margin-top:10px;font-size:.78rem}
  #ov-start #pn-play .mode-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  #ov-start #pn-play .mode-choice{grid-template-columns:34px minmax(0,1fr);min-height:76px;padding:8px}
  #ov-start #pn-play .mode-glyph{width:24px;height:24px}
  #ov-start #pn-play .mode-name{font-size:clamp(.76rem,1.7vw,.9rem)}
  #ov-start #pn-play .mode-desc{font-size:.68rem}
  #ov-start #pn-play .lobby-ready-rail{grid-column:1;grid-row:2;width:min(100%,720px);padding:8px}
  #ov-start #pn-play #play-map-preview{height:56px}
  #ov-start #pn-play .lobby-deploy-row{grid-row:4;padding-top:8px}
  #ov-start #pn-play #btn-start{min-width:190px;min-height:48px}
}
@media(max-width:560px){
  #ov-start .mn-rail{grid-template-columns:minmax(0,1fr);height:auto;min-height:52px;padding:0 8px}
  #ov-start .mn-brand{display:none}
  #ov-start .mn-nav{grid-column:1;justify-content:center;overflow-x:auto}
  #ov-start .mn-tab .nm{font-size:.59rem}
  #ov-start .mn-main{inset:52px 0 0;padding-inline:12px;overflow-y:auto}
  #ov-start #pn-play.image2-lobby{flex:0 0 auto;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;align-content:start;min-height:0;padding:18px 0 12px}
  #ov-start #pn-play .lobby-title-block{grid-column:1;grid-row:1;align-self:start;margin:0 0 16px}
  #ov-start #pn-play .pn-h h2{font-size:clamp(1.95rem,9vw,3rem)}
  #ov-start #pn-play #ov-text{font-size:.82rem}
  #ov-start #pn-play .lobby-mode-deck{grid-column:1;grid-row:2;padding:0}
  #ov-start #pn-play .mode-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  #ov-start #pn-play .mode-choice{min-height:58px;padding:7px 9px}
  #ov-start #pn-play .mode-name{font-size:.8rem}
  #ov-start #pn-play .lobby-ready-rail{grid-column:1;grid-row:2;align-self:stretch;margin:0 0 14px;width:100%;grid-template-columns:minmax(130px,.8fr) minmax(0,1.2fr)}
  #ov-start #pn-play .lobby-mode-deck{grid-column:1;grid-row:3}
  #ov-start #pn-play .lobby-deploy-row{grid-column:1;grid-row:4;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto;gap:6px;padding-top:12px}
  #ov-start #pn-play .lobby-deploy-row .btnrow,#ov-start #pn-play .lobby-deploy-note{grid-column:1;grid-row:auto;justify-content:center;text-align:center}
}
@media(max-width:360px){#ov-start #pn-play .mode-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-height:560px) and (orientation:landscape){
  #ov-start .mn-rail{height:52px}
  #ov-start .mn-main{inset:52px 0 0}
  #ov-start #pn-play.image2-lobby{min-height:calc(100dvh - 118px)}
  #ov-start #pn-play .lobby-eyebrow{margin-bottom:5px}
  #ov-start #pn-play .pn-h h2{font-size:clamp(1.8rem,5vh,3rem)}
  #ov-start #pn-play #ov-text{margin-top:6px;font-size:.74rem}
  #ov-start #pn-play .mode-choice{min-height:62px;padding:5px 7px}
  #ov-start #pn-play .mode-glyph{width:21px;height:21px}
  #ov-start #pn-play .mode-brief{min-height:28px;padding-top:4px}
  #ov-start #pn-play #play-map-preview{height:52px}
  #ov-start #pn-play .lobby-deploy-row{padding-top:4px}
  #ov-start #pn-play #btn-start{min-height:42px}
}
@media(prefers-reduced-motion:reduce){#ov-start .mode-choice{transition:none}#ov-start .mode-choice:hover{transform:none}}
</style>`;

const fixedPlayCopy = "function updatePlayCopy(){if(state==='paused'||(MP.on&&MP.menu))return;var info=modeInfo(),copy={tactical:'Choose your side and prepare the operation.',ffa:'No squads. Outscore every operator in the arena.',bomb:'Secure site A or B, or stop the plant.',outbreak:'Deploy with your squad and hold against the Hollowed.',infection:'Stay together, survive the conversion and fight to sunrise.'};$('#ov-title').innerHTML='READY FOR<br>DEPLOYMENT';$('#ov-text').textContent=copy[R.mode]||info[2];$('#btn-start').textContent='DEPLOY';$('#ov-note').textContent=touchMode?'Touch controls are ready · deploy when your squad is set.':'Choose your mission · open maps or match rules to configure · Esc pauses, Tab opens the scoreboard.';}";
const completeModeInfo = `function modeInfo() {
  return { tactical: ['Tactical', 'Round-based firefights', 'Clear the opposing team. Manage credits, positioning and your loadout.'],
    ffa: ['Free-for-All', 'Solo score · every operator is a rival', 'No squads. Outscore every operator in the arena.'],
    bomb: ['Bomb Defusal', 'Attack or defend sites A/B', 'Plant at site A or B, or stop and defuse the device. Sides switch midway.'],
    outbreak: ['Outbreak', 'Squad survival', 'Hold out against Hollowed waves. AI allies have unlimited reserve ammo, with normal reloads.'],
    infection: ['Infection', 'Survive the conversion', 'Blue and Red are allied for 10 seconds, then two Patient Zero are chosen. Your AI defenders can reload endlessly; your own ammo is finite. Survive until sunrise.'] }[R.mode];
}`;

function replaceExactlyOne(source, regex, replacement, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches?.length || 0}`);
  return source.replace(regex, replacement);
}
function removeAtMostOne(source, regex, label) {
  const matches = source.match(regex);
  if ((matches?.length || 0) > 1) throw new Error(`${label}: expected at most one match, found ${matches.length}`);
  return matches?.length ? source.replace(regex, '') : source;
}

for (const file of pages) {
  let html = fs.readFileSync(file, 'utf8');
  html = replaceExactlyOne(html, /var LOBBY_PREVIEW=null,LOBBY_PREVIEW_KEY=''(?:,LOBBY_READY_ROOM=null)?;[\s\S]*?(?=function idleCamera\(dt\)\{)/g, environmentBlock, 'lobby preview and ready-room scene');
  html = replaceExactlyOne(html, /if\(state==='idle'&&menuOpen\(\)&&LOBBY_PREVIEW&&LOBBY_PREVIEW\.g\)\{[\s\S]*?camera\.rotation\.z=0;return;\}/g, lobbyCameraBranch, 'idle lobby camera composition');
  html = replaceExactlyOne(html, /<div class="mn-panel (?:squad-bay|image2-lobby)" id="pn-play"[\s\S]*?(?=<div class="mn-panel" id="pn-dyn")/g, `${playPanelHtml}\n            `, 'production Image 2 Play composition');
  html = replaceExactlyOne(html, /function updatePlayCopy\(\)\{[\s\S]*?\}(?=\nfunction renderPlay\(\))/g, fixedPlayCopy, 'persistent Ready for Deployment headline');
  html = replaceExactlyOne(html, /function modeInfo\(\)\s*\{[\s\S]*?\n\}/g, completeModeInfo, 'five-mode deployment copy');
  html = removeAtMostOne(html, /<style id="sightline-lobby-command-reconstruction">[\s\S]*?<\/style>/g, 'remove superseded fixed-width reconstruction layout');
  html = removeAtMostOne(html, /<style id="sightline-lobby-visual-correction">[\s\S]*?<\/style>/g, 'remove superseded wrap-anywhere layout correction');
  html = replaceExactlyOne(html, /<style id="sightline-premium-lobby-spaces">[\s\S]*?<\/style>/g, `<style id="sightline-premium-lobby-spaces">\n${premiumCss}\n</style>`, 'sync canonical non-Play premium styles');
  const artStyle = /<style id="sightline-lobby-production-art-direction">[\s\S]*?<\/style>/g;
  const styleMatches = html.match(artStyle);
  if (styleMatches?.length > 1) throw new Error(`Multiple production art-direction styles found in ${file}`);
  html = styleMatches?.length === 1
    ? html.replace(artStyle, artDirectionCss)
    : replaceExactlyOne(html, /<div class="wrap">/, `${artDirectionCss}<div class="wrap">`, 'production style insertion point');
  fs.writeFileSync(file, html, 'utf8');
  console.log(`UPDATED ${path.relative(root, file)}`);
}
