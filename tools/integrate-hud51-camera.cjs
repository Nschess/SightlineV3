const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Expected one marker: '+a.slice(0,90));return s.replace(a,b);}
const helper=`/* Mobile projection: Three.js uses vertical degrees; mobile settings use horizontal.
   Projection only: world scale, hitboxes and authoritative shots are unchanged. */
var MobileProjection = (function () {
  var radians = Math.PI / 360, lastH = 0, lastAspect = 0, lastV = 0;
  function horizontal(value) { return Number.isFinite(value) ? Math.max(65, Math.min(95, value)) : 75; }
  function vertical(value, aspect) {
    var h = horizontal(value), a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
    if (h !== lastH || a !== lastAspect) { lastH = h; lastAspect = a; lastV = 2 * Math.atan(Math.tan(h * radians) / a) / (2 * radians); }
    return lastV;
  }
  function magnification(legacyFov, optic) {
    return optic === 'compact' ? 2 : Math.max(1, Math.tan(72 * radians) / Math.tan(legacyFov * radians));
  }
  function ads(hip, legacyFov, optic) { return 2 * Math.atan(Math.tan(hip * radians) / magnification(legacyFov, optic)) / (2 * radians); }
  function scale(actual, reference) { return Math.tan(actual * radians) / Math.tan(reference * radians); }
  return { horizontal: horizontal, vertical: vertical, magnification: magnification, ads: ads, scale: scale };
})();
G.mobileFov = MobileProjection.horizontal(G.mobileFov);
`;
for(const tree of ['www','phone-host']){
 const p=path.join(root,'AndroidProject/app/src/main/assets',tree,'index.html');const original=path.join(root,'recovery/hud51-runtime/assets',tree,'index.html');let s=fs.readFileSync(original,'utf8');const nl=s.includes('\r\n')?'\r\n':'\n';s=s.replace(/\r\n/g,'\n');
 s=replace(s,'var DEF_G = {','var DEF_G = {\n  mobileFov: 75, // Independent horizontal gameplay FOV; desktop S.fov stays unchanged.');
 s=replace(s,'var camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 200);',helper+'var camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 200);');
 s=replace(s,'scene.add(camera);','scene.add(camera);\n// Preserve existing weapon framing without a second render pass.\nvar mobileWeaponProjection = touchMode ? new THREE.Group() : null, mobileWeaponReferenceFov = 72;\nif (mobileWeaponProjection) camera.add(mobileWeaponProjection);');
 if((s.match(/camera\.add\(g\);/g)||[]).length!==2)throw Error('Gun parent sites changed');s=s.replace(/camera\.add\(g\);/g,'(mobileWeaponProjection || camera).add(g);');
 s=replace(s,'/* Cosmetic reload choreography',`function gameplayHipFov() { return touchMode ? MobileProjection.vertical(G.mobileFov, camera.aspect) : baseFov; }
function gameplayOpticFov(k) {
  var legacy = opticFov(k);
  return touchMode ? MobileProjection.ads(gameplayHipFov(), legacy, SightlineOptics.has(k) ? SightlineOptics.current(k) : null) : legacy;
}

/* Cosmetic reload choreography`);
 s=replace(s,"{ t: 'range', o: 'S', k: 'fov', l: 'Field of view', min: 65, max: 100, step: 1, f: function (v) { return Math.round(v) + '°'; } },","touchMode ? { t: 'range', k: 'mobileFov', l: 'Mobile field of view', h: 'Horizontal degrees. Lower values make distant enemies larger; ADS keeps its relative magnification.', min: 65, max: 95, step: 1, f: function (v) { return Math.round(v) + '° horizontal'; } } :\n    { t: 'range', o: 'S', k: 'fov', l: 'Field of view', min: 65, max: 100, step: 1, f: function (v) { return Math.round(v) + '°'; } },");
 s=replace(s,"  slider('fov', 'Field of view', 65, 100, 1, function (v) { return Math.round(v) + '°'; });","  if (!touchMode) slider('fov', 'Field of view', 65, 100, 1, function (v) { return Math.round(v) + '°'; });");
 s=replace(s,'var ratio = G.touchSens / 100, fine = scoped ? G.touchAdsSens / 100 : 1;','var ratio = G.touchSens / 100 * MobileProjection.scale(camera.fov, 72), fine = scoped ? G.touchAdsSens / 100 : 1;');
 s=replace(s,'  var targetFov = opticFov(cur);','  var legacyTargetFov = opticFov(cur), hipFov = gameplayHipFov();\n  var targetFov = gameplayOpticFov(cur);');
 s=replace(s,'Math.tan(baseFov * Math.PI / 360) * (1 - adsT) + Math.tan(targetFov * Math.PI / 360) * adsT','Math.tan(hipFov * Math.PI / 360) * (1 - adsT) + Math.tan(targetFov * Math.PI / 360) * adsT');
 s=replace(s,'  var showScope = adsT > 0.92 && w.scope',`  if (mobileWeaponProjection) {
    // XY compensation preserves screen-space weapon pose and sight axis, with unchanged depth.
    var referenceWant = 2 * Math.atan(Math.tan(72 * Math.PI / 360) * (1 - adsT) + Math.tan(legacyTargetFov * Math.PI / 360) * adsT) * 180 / Math.PI;
    mobileWeaponReferenceFov += (referenceWant - mobileWeaponReferenceFov) * (1 - Math.exp(-dt * 36));
    var framing = MobileProjection.scale(camera.fov, mobileWeaponReferenceFov);
    mobileWeaponProjection.scale.set(framing, framing, 1);
  }
  var showScope = adsT > 0.92 && w.scope`);
 s=replace(s,'options:SightlineOptics.options(k),fov:opticFov(k)','options:SightlineOptics.options(k),fov:gameplayOpticFov(k),legacyFov:opticFov(k),hipFov:gameplayHipFov()');
 s=replace(s,'target: WEAPONS[cur].zoomFov[Math.min(zoomLvl,WEAPONS[cur].zoomFov.length-1)]','target: gameplayOpticFov(cur)');
 const integrated=s.replace(/\n/g,nl);const current=fs.readFileSync(p);const prior=require('child_process').execFileSync('git',['show','77b2b6645df120c76a334c8a5ac2157feae68c2d:AndroidProject/app/src/main/assets/'+tree+'/index.html'],{cwd:root,maxBuffer:8e6});if(!current.equals(prior)&&!current.equals(Buffer.from(integrated)))throw Error('Unrecognized edits: refusing to overwrite '+tree);fs.writeFileSync(p,integrated);
}
console.log('Recovered the scoped mobile projection implementation into both pages. HUD untouched.');
