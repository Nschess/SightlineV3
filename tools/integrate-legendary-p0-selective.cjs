'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const work = path.resolve(__dirname, '..', '..', '..');
const roots = {
  base: path.join(work, 'production-stabilization-20261109', 'DEV'),
  accepted: path.join(work, 'legendary-design-studio-20261109', 'DEV'),
  integrated: path.join(work, 'legendary-p0-integration-20261109', 'DEV')
};
const expected = {
  baseOffline: 'e3f86554ff8a9c67e00cc4f84d3ffb7e97e1173c7a59bd210c7bbb55aaee97bd',
  baseHost: '4c0c546ce704c9c77310b0c98fc8f0080692dd6f668229f685b6066bed1fa660',
  p0Offline: 'd46d9f6243e88cb0235eacd4b96570713c91f841b3ed2fddf2463935edc14d47',
  p0Host: 'fbd3bbd8a5ec4d04e1f6802f586e7cd42cebeeec618aa3c66678d5ef6fc551e3'
};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function checkHash(root, rel, want) {
  const got = sha(fs.readFileSync(path.join(root, rel)));
  if (got !== want) throw new Error('Source identity mismatch ' + rel + ': ' + got);
}
function region(source, start, end, label) {
  const i = source.indexOf(start), j = source.indexOf(end, i + start.length);
  if (i < 0 || j < 0 || source.indexOf(start, i + 1) >= 0) throw new Error('Cannot uniquely locate ' + label);
  return source.slice(i, j);
}
function functionBlock(source, name) {
  const marker = 'function ' + name + '(', i = source.indexOf(marker);
  if (i < 0 || source.indexOf(marker, i + 1) >= 0) throw new Error('Expected one function ' + name);
  const open = source.indexOf('{', i);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let j = open; j < source.length; j++) {
    const c = source[j], next = source[j + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; j++; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (c === '\\') { escaped = true; continue; } if (c === quote) quote = ''; continue; }
    if (c === '/' && next === '/') { lineComment = true; j++; continue; }
    if (c === '/' && next === '*') { blockComment = true; j++; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(i, j + 1);
  }
  throw new Error('Unbalanced function ' + name);
}
function replaceOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(label + ': expected one target occurrence, found ' + count);
  return source.replace(oldText, newText);
}
function replaceFunction(target, accepted, name) {
  return replaceOnce(target, functionBlock(target, name), functionBlock(accepted, name), 'function ' + name);
}
function mergePage(rel, baseHash, acceptedHash) {
  checkHash(roots.base, rel, baseHash);
  checkHash(roots.accepted, rel, acceptedHash);
  const targetPath = path.join(roots.integrated, rel), accepted = fs.readFileSync(path.join(roots.accepted, rel), 'utf8');
  let target = fs.readFileSync(targetPath, 'utf8');
  const oldGlobals = 'var AC = null, master = null, busFx = null, busUi = null, noiseBuf = null, soundOn = true, legendAudioPending = [], legendAudioStateBound = false;';
  const newGlobals = 'var AC = null, master = null, busFx = null, busUi = null, noiseBuf = null, soundOn = true, legendAudioPending = [], legendAudioStateBound = false, legendaryAudioBus = null, legendaryAudioLimiter = null;';
  target = replaceOnce(target, oldGlobals, newGlobals, rel + ' audio globals');
  target = replaceOnce(target, functionBlock(target, 'audio'), functionBlock(accepted, 'audio'), rel + ' audio()');

  const audioStart = 'var LEGEND_AUDIO_PROFILES={', audioEnd = 'var legendInspection=null,legendAdsCueLatched=false;';
  target = replaceOnce(target, region(target, audioStart, audioEnd, rel + ' original Legendary audio subsystem'), region(accepted, audioStart, audioEnd, rel + ' accepted Legendary audio subsystem'), rel + ' Legendary audio subsystem');

  if (target.includes('LEGEND_FX_MOTION')) throw new Error(rel + ': Legendary effect motion map already present');
  const motion = region(accepted, 'var LEGEND_FX_MOTION={', 'var legendFxPools=', rel + ' accepted effect motion map');
  target = replaceOnce(target, 'var legendFxPools=', motion + 'var legendFxPools=', rel + ' effect motion map');
  for (const name of ['legendFxShape', 'spawnLegendFx', 'legendConfirmedElimination', 'legendEliminationBurst']) target = replaceFunction(target, accepted, name);

  const oldUpdate = functionBlock(target, 'updateEffects'), newUpdate = functionBlock(accepted, 'updateEffects');
  const reducedBranch = /if\(e\.legendFxReduced\)\{e\.obj\.scale\.setScalar\(e\.legendFxScale\);e\.obj\.material\.opacity=Math\.max\(0,\(1-q\)\*\.78\);\}\s*else if\(!elim\)\{/;
  if (newUpdate.replace(reducedBranch, 'if(!elim){') !== oldUpdate) throw new Error(rel + ': updateEffects contains unreviewed differences');
  target = replaceOnce(target, oldUpdate, newUpdate, rel + ' reduced-effects animation');
  target = replaceFunction(target, accepted, 'legendKillAudio');

  const oldLocal = "if(legendActive(gun)){if(cur==='longbow')sfxLegend('shot',1);else{sfxShot(w.key,1);legendAudioEvent(cur,'fire',0,1);}legendFire(gun,mp,end,legendHit);}else sfxShot(w.key, 1);";
  const newLocal = "if(legendActive(gun)){playWeaponShotAudio(cur,1,0,true,1,4);legendFire(gun,mp,end,legendHit);}else sfxShot(w.key, 1);";
  target = replaceOnce(target, oldLocal, newLocal, rel + ' local Legendary fire routing');
  const oldRemote = functionBlock(target, 'mpFx'), newRemote = functionBlock(accepted, 'mpFx');
  const normalizedRemote = newRemote.replace(/var dist = Math\.hypot\(u\.x - P\.x, u\.z - P\.z\),pan=shotPan\(u\.x,u\.z\),remoteShotScale=\.9\/\(1\+dist\*\.07\);\s*playWeaponShotAudio\(m\.w,remoteShotScale,pan,finish\.legendary&&hasLegendaryAudio\(m\.w\),remoteShotScale,2\);/, "var dist = Math.hypot(u.x - P.x, u.z - P.z),pan=shotPan(u.x,u.z); sfxShot(m.w, 0.9 / (1 + dist * 0.07), pan);\r\n    if(finish.legendary&&hasLegendaryAudio(m.w))legendAudioEvent(m.w,'fire',pan,.78/(1+dist*.035));");
  if (normalizedRemote !== oldRemote) throw new Error(rel + ': mpFx contains differences outside reviewed audio routing');
  target = replaceOnce(target, oldRemote, newRemote, rel + ' remote Legendary fire routing');
  fs.writeFileSync(targetPath, target, 'utf8');
  return { page: rel, sha256: sha(Buffer.from(target, 'utf8')), bytes: Buffer.byteLength(target) };
}

const offline = 'AndroidProject/app/src/main/assets/www/index.html';
const phoneHost = 'AndroidProject/app/src/main/assets/phone-host/index.html';
checkHash(roots.integrated, offline, expected.baseOffline);
checkHash(roots.integrated, phoneHost, expected.baseHost);
const results = [mergePage(offline, expected.baseOffline, expected.p0Offline), mergePage(phoneHost, expected.baseHost, expected.p0Host)];
console.log(JSON.stringify({ status: 'SELECTIVE_P0_MERGE_APPLIED', result: results, preservedFiles: ['weapon-skins.js', 'legend-overlay.js', 'legendary-packs.js', 'phone-host/server.js', 'MainActivity.java'], packagesCreated: false }, null, 2));
