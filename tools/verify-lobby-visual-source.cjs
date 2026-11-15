'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const offline=path.join(root,'AndroidProject/app/src/main/assets/www/index.html');
const phoneHost=path.join(root,'AndroidProject/app/src/main/assets/phone-host/index.html');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const offlineText=fs.readFileSync(offline,'utf8'),hostText=fs.readFileSync(phoneHost,'utf8');
function parseInlineScripts(file,text){
  const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;let match,count=0;
  while((match=re.exec(text))){
    if(/\bsrc\s*=/.test(match[1])||/\btype\s*=\s*["']module["']/i.test(match[1]))continue;
    new vm.Script(match[2],{filename:path.basename(file)+':inline-'+(++count)});
  }
  if(!count)throw new Error(`No inline classic scripts were checked in ${file}`);
  return count;
}
function sameBlock(marker,endMarker,label){
  const a=offlineText.indexOf(marker),b=hostText.indexOf(marker);
  if(a<0||b<0)throw new Error(`Missing ${label} in one entrypoint.`);
  const ae=offlineText.indexOf(endMarker,a),be=hostText.indexOf(endMarker,b);
  if(ae<0||be<0||offlineText.slice(a,ae)!==hostText.slice(b,be))throw new Error(`${label} differs between Offline and phone-host pages.`);
}
function verifyHashList(listPath,base){
  const rows=fs.readFileSync(listPath,'utf8').trim().split(/\r?\n/);
  for(const row of rows){
    const m=row.match(/^([a-f0-9]{64})  (.+)$/);if(!m)throw new Error(`Malformed checksum row: ${row}`);
    const file=path.resolve(base,...m[2].split('/'));
    if(!file.startsWith(base+path.sep)||!fs.statSync(file).isFile()||digest(fs.readFileSync(file))!==m[1])throw new Error(`Checksum mismatch: ${m[2]}`);
  }
  return rows.length;
}
try{
  const offlineScripts=parseInlineScripts(offline,offlineText),hostScripts=parseInlineScripts(phoneHost,hostText);
  sameBlock('/* Lobby 9.1 visual quality pass:','</style>','shared visual CSS block');
  sameBlock('/* Final hierarchy pass:','</style>','shared typography and mode CSS block');
  if(/<style id="sightline-lobby-command-reconstruction">/.test(offlineText+hostText))throw new Error('The superseded 610px reconstruction layout is still active.');
  sameBlock('<style id="sightline-premium-lobby-spaces">','</style>','shared Squad Bay / Operations Table / Armory Ready Room presentation CSS');
  sameBlock('<style id="sightline-lobby-production-art-direction">','</style>','shared Image 2 production composition and layout');
  sameBlock('<style id="sightline-lobby-fullscreen-hud">','</style>','shared Lobby 9.2 full-screen HUD');
  sameBlock('<div class="mn-panel image2-lobby lobby-fullscreen-layout" id="pn-play"','<div class="mn-panel" id="pn-dyn"','shared full-screen Play markup');
  if(/<style id="sightline-lobby-visual-correction">/.test(offlineText+hostText))throw new Error('Superseded wrap-anywhere layout correction is still present.');
  const phonePanelStart=hostText.indexOf('function mpPanel(head)');
  const phonePanelEnd=hostText.indexOf('var me = mpMe()',phonePanelStart);
  if(phonePanelStart<0||phonePanelEnd<0)throw new Error('The phone-host multiplayer connection panel is missing.');
  const phonePanel=hostText.slice(phonePanelStart,phonePanelEnd);
  for(const marker of ["hostRoute==='maps'",'Connect to load the host map list',"hostRoute==='rules'",'Connect to view and edit match rules','data-net="connect"'])if(!phonePanel.includes(marker))throw new Error(`The phone-host pre-connect route is missing ${marker}.`);
  const styleBody=(text,id)=>{const marker=`<style id="${id}">`,start=text.indexOf(marker);if(start<0)throw new Error(`Missing ${id} style block.`);const bodyStart=start+marker.length,end=text.indexOf('</style>',bodyStart);if(end<0)throw new Error(`Unclosed ${id} style block.`);return text.slice(bodyStart,end);};
  const artStyle=styleBody(offlineText,'sightline-lobby-production-art-direction');
  const premiumStyle=styleBody(offlineText,'sightline-premium-lobby-spaces');
  const fullscreenStyle=styleBody(offlineText,'sightline-lobby-fullscreen-hud');
  const lobbyCss=artStyle+'\n'+premiumStyle+'\n'+fullscreenStyle;
  for(const marker of ['body.sl-lobby-screen .stage-wrap{position:fixed;inset:0;z-index:0;width:100vw;height:100dvh','body.sl-lobby-screen #stage{width:100%;height:100%;min-height:100%;aspect-ratio:auto'])if(!artStyle.includes(marker))throw new Error(`The production WebGL lobby is missing full-screen composition: ${marker}`);
  if(/\.lobby-rail-links/.test(artStyle))throw new Error('The scene-covering duplicate navigation rail remains.');
  if(/overflow-wrap:anywhere|word-break:break-all|writing-mode:vertical/.test(lobbyCss))throw new Error('A rule permitting single-letter or vertical Play labels remains in the active lobby styles.');
  if(/#ov-start #pn-play \.mode-choice\{grid-template-columns:28px/.test(premiumStyle))throw new Error('The superseded high-specificity mode-card override remains in the shared premium stylesheet.');
  for(const marker of ['#ov-start #pn-play.lobby-fullscreen-layout{position:absolute;inset:0','grid-template-columns:repeat(5,minmax(0,1fr))','grid-template-columns:repeat(3,minmax(0,1fr))','grid-template-columns:repeat(2,minmax(0,1fr))','writing-mode:horizontal-tb','white-space:nowrap','overflow:hidden;padding:0;background:none','bottom:30px','min-height:52px','position:absolute;left:clamp(20px,4vw,64px);bottom:98px'])if(!fullscreenStyle.includes(marker))throw new Error(`Full-screen HUD is missing responsive/readability rule: ${marker}`);
  const playMarkup=offlineText.slice(offlineText.indexOf('<div class="mn-panel image2-lobby lobby-fullscreen-layout" id="pn-play"'),offlineText.indexOf('<div class="mn-panel" id="pn-dyn"'));
  if(!playMarkup||/class="lobby-deployment-strip"|class="lobby-ready-rail"|class="play-map-card"|id="pl-sum"|data-go="map"/.test(playMarkup))throw new Error('The rejected oversized Play setup panel or its duplicate controls remain.');
  sameBlock('var LOBBY_PREVIEW=null','var last = performance.now();','shared operator showcase code');
  const previewStart=offlineText.indexOf('var LOBBY_PREVIEW=null'),previewEnd=offlineText.indexOf('function idleCamera(dt)',previewStart);
  const previewBlock=offlineText.slice(previewStart,previewEnd);
  if(!previewBlock.includes('sightlineLobbyBackdropMap=CURMAP.id')||!previewBlock.includes("key=operator.id+'|'+CURMAP.id+'|'+weapon"))throw new Error('Lobby preview does not follow the selected in-game map.');
  if(/createLobbyReadyRoom|LOBBY_READY_ROOM|setLobbyWorldForPreview/.test(previewBlock))throw new Error('Lobby preview still substitutes or hides the selected map.');
  if(!offlineText.includes('buildWorld(CURMAP)')||!hostText.includes('buildWorld(CURMAP)'))throw new Error('The actual selected playable map is not built in both production pages.');
  for(const [label,text] of [['Offline',offlineText],['phone-host',hostText]]){
    if(/lobbyBuildStage|lobbyPreviewMaterialize|LOBBY_PREVIEW_(?:LIGHT|RIM|MATERIAL)|LOBBY_STAGE/.test(text))throw new Error(`${label} still contains the rejected showroom stage/material override.`);
    for(const marker of ['makeUnit(spawn.x-3.2,spawn.z-4.0,operator)','ensureWorldWeapon(LOBBY_PREVIEW,weapon)','sightlineLobbyOperatorFill','data-quick-mode="','sl-lobby-screen','prefers-reduced-motion:reduce','main.scrollLeft=0','repeat(5,minmax(0,1fr))','repeat(3,minmax(0,1fr))','repeat(2,minmax(0,1fr))'])if(!text.includes(marker))throw new Error(`${label} is missing required live-lobby behavior: ${marker}`);
    for(const marker of ['class="mn-panel image2-lobby lobby-fullscreen-layout"','lobby-mode-current','id="ov-mode-name"','id="mode-select"','id="btn-start"','class="operations-table"','mapSvg(CURMAP)','ops-bomb-plan','loadout-weapon-preview','operator-bay-callout'])if(!text.includes(marker))throw new Error(`${label} is missing full-screen lobby production wiring: ${marker}`);
    if(!text.includes("$('#ov-mode-name').textContent=String(info[0]||R.mode).toUpperCase()"))throw new Error(`${label} does not update the selected-mode HUD text.`);
    if(text.includes("$('#pl-sum').innerHTML"))throw new Error(`${label} still renders the removed Play setup dashboard summary.`);
    if(/READY FOR<br\s*\/?\s*>DEPLOYMENT/.test(text)||!text.includes("$('#ov-title').textContent='READY FOR DEPLOYMENT';"))throw new Error(`${label} deployment heading must remain one text node without a forced line break.`);
    if(!text.includes("camera.fov!==50")||!text.includes('off=0;camera.lookAt'))throw new Error(`${label} lobby camera must keep its centered operator framing over the selected map.`);
    for(const mode of ['tactical','ffa','bomb','outbreak','infection'])if(!text.includes("['"+mode+"'"))throw new Error(`${label} mode selector is missing ${mode}.`);
  }
  const rollbackRoot=path.join(root,'rollback/lobby-9.1-visual-quality-baseline-2026-11-07');
  const rollback=JSON.parse(fs.readFileSync(path.join(rollbackRoot,'ROLLBACK-MANIFEST.json'),'utf8'));
  let rollbackCount=0;
  for(const entry of rollback.files){
    const backup=path.resolve(rollbackRoot,...entry.path.split(/[\\/]/));
    const bytes=fs.readFileSync(backup);
    if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error(`Rollback copy mismatch: ${entry.path}`);
    rollbackCount++;
  }
  const rc92Root=path.join(root,'rollback/lobby-9.2-before-fullscreen-implementation-20261108');
  const rc92=JSON.parse(fs.readFileSync(path.join(rc92Root,'ROLLBACK-MANIFEST.json'),'utf8'));
  let rc92Count=0;
  for(const entry of rc92.files){
    const backup=path.resolve(rc92Root,...entry.path.split(/[\\/]/));
    const bytes=fs.readFileSync(backup);
    if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw new Error(`Lobby 9.2 rollback copy mismatch: ${entry.path}`);
    rc92Count++;
  }
  const pageHash=digest(fs.readFileSync(phoneHost));
  const activity=fs.readFileSync(path.join(root,'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'),'utf8');
  if(!activity.includes(`HOST_BUNDLE_SHA256 = "${pageHash}"`))throw new Error('Android host bundle pin does not match phone-host HTML.');
  const androidRows=verifyHashList(path.join(root,'AndroidProject/CURRENT-SOURCE-SHA256.txt'),path.join(root,'AndroidProject'));
  const hostRows=verifyHashList(path.join(root,'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'),path.join(root,'AndroidProject/app/src/main/assets/phone-host'));
  console.log(JSON.stringify({status:'PASS',offlineInlineScripts:offlineScripts,phoneHostInlineScripts:hostScripts,sharedStyles:'MATCH',showcaseCode:'MATCH',rollbackFiles:rollbackCount,lobby92RollbackFiles:rc92Count,androidHostPin:pageHash,androidSourceEntries:androidRows,phoneHostEntries:hostRows},null,2));
}catch(error){console.error(JSON.stringify({status:'FAIL',reason:error.message}));process.exitCode=1;}
