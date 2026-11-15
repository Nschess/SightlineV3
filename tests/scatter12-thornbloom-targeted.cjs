const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const THREE = require(path.join(assets, 'www', 'three.min.js'));
function canvasContext() {
  const gradient = { addColorStop() {} };
  const target = { createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; } };
  return new Proxy(target, { get(o, key) { return key in o ? o[key] : function () {}; }, set(o, key, value) { o[key] = value; return true; } });
}
const browser = {
  console, THREE, innerHeight: 900,
  document: { head: { appendChild() {} }, createElement() { const ctx = canvasContext(); return { width: 256, height: 256, getContext() { return ctx; } }; } }
};
browser.window = browser;
vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(assets, 'www', 'legendary-packs.js'), 'utf8'), browser, { filename: 'legendary-packs.js', timeout: 20000 });

const pack = browser.SightlineThorn;
assert(pack && pack.weapon === 'scatter' && pack.finish.name === 'Thornbloom Scatter', 'registered Thornbloom Scatter pack missing');
assert.strictEqual(typeof pack.killSound, 'function', 'Thornbloom kill cue is not exposed to the accepted audio router');
assert.strictEqual(typeof browser.SightlineVoid.killSound, 'undefined', 'an unrelated Legendary pack acquired a new kill cue');
const rig = pack.buildRig(THREE);
assert(rig && rig.group && rig.inspect, 'SCATTER12 rig/inspect hook missing');
const names = [];
rig.group.traverse(o => { if (o.name) names.push(o.name); });
for (const name of ['thornbloom-scatter-sculpted-receiver-armor','thornbloom-scatter-rose-steel-inlays','thornbloom-scatter-faceted-pump-shroud','thornbloom-scatter-pump-shroud-machined-vents','thornbloom-scatter-integral-bloom-barrel-shroud','thornbloom-scatter-side-saddle-shells','thornbloom-scatter-side-saddle-primers','thornbloom-scatter-carrier-cycle','thornbloom-scatter-hinged-ejection-cover','thornbloom-scatter-shell-feed-gate']) {
  assert(names.includes(name), `authored shotgun component missing: ${name}`);
}
let positions = 0, vertexCount = 0;
rig.group.traverse(o => {
  if (!o.isMesh || !o.geometry) return;
  const attr = o.geometry.attributes && o.geometry.attributes.position;
  if (attr) { vertexCount += attr.count; for (let i=0;i<attr.count;i++) { const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i); assert(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z),'non-finite mesh vertex'); positions++; } }
  if (o.isInstancedMesh && o.instanceMatrix) for (let i=0;i<o.instanceMatrix.array.length;i++) assert(Number.isFinite(o.instanceMatrix.array[i]),'non-finite instance transform');
});
assert(positions > 0 && vertexCount < 25000, 'authored geometry is empty or unexpectedly high-poly');

const carrier = rig.group.getObjectByName('thornbloom-scatter-carrier-cycle');
const ejectionCover = rig.group.getObjectByName('thornbloom-scatter-hinged-ejection-cover');
const feedGate = rig.group.getObjectByName('thornbloom-scatter-shell-feed-gate');
const baseZ = carrier.position.z;
rig.fire(); rig.group.updateMatrixWorld(true); rig.update(.05, { ads: 0 });
assert(carrier.position.z > baseZ + .006, 'firing did not produce a cosmetic carrier cycle');
assert(ejectionCover.rotation.z < -.1, 'firing did not open the cosmetic ejection cover');
rig.update(.12, { ads: 0 });
rig.inspect(true); for (let i=0;i<6;i++) rig.update(.03, { ads: 0 });
assert(carrier.position.z > baseZ + .008, 'inspect did not produce a cosmetic mechanical detail');
rig.setReload(.35, true); rig.update(.016, { ads: 0 });
assert(rig.state.reloading && rig.state.rf === .35, 'reload feedback altered or lost the supplied cosmetic reload state');
assert(feedGate.rotation.x > .1, 'reload fraction did not drive the cosmetic shell feed gate');
rig.setReload(0, false); rig.update(.016, { ads: 0 }); rig.dispose();

function metrics(a) { let sum=0,peak=0; for(const x of a){assert(Number.isFinite(x),'audio contains NaN/Infinity');sum+=x*x;peak=Math.max(peak,Math.abs(x));} return {rms:Math.sqrt(sum/a.length),peak}; }
const sr=48000, base=new Float32Array(Math.floor(sr*.4));
for(let i=0;i<base.length;i++) base[i]=Math.sin(i*.17)*Math.exp(-i/950);
const fire=pack.mixShot(sr,base), kill=pack.killSound(sr), fireStats=metrics(fire), killStats=metrics(kill);
assert(fireStats.rms>.005 && fireStats.peak<=.901, `fire cue is silent or clipped: ${JSON.stringify(fireStats)}`);
assert(killStats.rms>.005 && killStats.peak<=.841, `kill cue is silent or clipped: ${JSON.stringify(killStats)}`);
assert(fire.length !== kill.length, 'fire and confirmed-kill cues unexpectedly share the same duration');

const web=fs.readFileSync(path.join(assets,'www','index.html'),'utf8');
const phone=fs.readFileSync(path.join(assets,'phone-host','index.html'),'utf8');
assert(web.includes("if((event==='elimination'||event==='kill-confirm'||event==='kill-chain')&&pack.killSound)return pack.killSound(sr);"), 'P0 router does not select Thornbloom confirmed-kill audio');
assert(phone.includes("if((event==='elimination'||event==='kill-confirm'||event==='kill-chain')&&pack.killSound)return pack.killSound(sr);"), 'phone-host P0 router does not select Thornbloom confirmed-kill audio');
assert(web.includes('function legendFxThornbloomGeometry(size)') && phone.includes('function legendFxThornbloomGeometry(size)'), 'Thornbloom elimination mesh missing from a production entrypoint');
assert(web.includes("bloomKill=key==='scatter'&&type==='elimination'") && web.includes('var bloomScale=.76+q*2.95'), 'distinct Thornbloom confirmed-kill bloom animation missing');
assert(phone.includes("bloomKill=key==='scatter'&&type==='elimination'") && phone.includes('var bloomScale=.76+q*2.95'), 'phone-host Thornbloom kill bloom differs');
assert(web.includes("if(cur==='scatter'&&legendActive(gun))thornbloomViewKick=Math.min(.10,thornbloomViewKick+.045)") && phone.includes("if(cur==='scatter'&&legendActive(gun))thornbloomViewKick=Math.min(.10,thornbloomViewKick+.045)"), 'viewmodel-only recoil is not gated to Legendary SCATTER12 on both pages');
assert(web.includes('scatterViewKick * .055') && phone.includes('scatterViewKick * .055'), 'Thornbloom viewmodel kick is not applied consistently');
assert(web.includes("!target||!claimLegendEvent('elimination',eventId)") && phone.includes("!target||!claimLegendEvent('elimination',eventId)"), 'authoritative elimination event dedupe guard was removed');
const routeStart=web.indexOf('function legendaryPackAudioSamples('),routeEnd=web.indexOf('\nvar LEGEND_AUDIO_DUR',routeStart);
assert(routeStart>=0&&routeEnd>routeStart,'could not isolate production pack audio selection route');
const routeContext=vm.createContext({Float32Array,Math});vm.runInContext(web.slice(routeStart,routeEnd),routeContext);
const routedKill=routeContext.legendaryPackAudioSamples(pack,'scatter','elimination',sr);
assert.deepStrictEqual(Array.from(routedKill),Array.from(kill),'confirmed elimination did not select the weapon-specific Thornbloom kill cue');
const helperStart=web.indexOf('function legendFxThornbloomGeometry(size)'),helperEnd=web.indexOf('\nfunction legendFxShape',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'could not isolate Thornbloom kill mesh generator');
const fxContext=vm.createContext({THREE});vm.runInContext(web.slice(helperStart,helperEnd),fxContext);
const bloom=fxContext.legendFxThornbloomGeometry(.096),bloomPositions=bloom.attributes.position;
assert(bloomPositions.count===41&&bloom.index.count===72,'kill bloom should be the bounded eight-thorn fan mesh');
bloom.computeBoundingBox();assert(Math.abs(bloom.boundingBox.max.x-.096)<.00001&&Math.abs(bloom.boundingBox.min.x+.096)<.00001,'kill bloom bounds are not centered/expected');

console.log(JSON.stringify({ pass:true, weapon:'SCATTER12 Thornbloom', vertices:vertexCount, fire:fireStats, kill:killStats,
  cosmeticCarrierCycle:true, inspectHook:true, reloadStatePreserved:true, offlinePhoneHostFxAudioParity:true }));
