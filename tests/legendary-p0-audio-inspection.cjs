const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const android = path.join(root, 'AndroidProject');
const web = fs.readFileSync(path.join(android, 'app/src/main/assets/www/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(android, 'app/src/main/assets/phone-host/index.html'), 'utf8');
const webSkins = fs.readFileSync(path.join(android, 'app/src/main/assets/www/weapon-skins.js'), 'utf8');
const packSource = fs.readFileSync(path.join(android, 'app/src/main/assets/www/legendary-packs.js'), 'utf8');
const phoneSkins = fs.readFileSync(path.join(android, 'app/src/main/assets/phone-host/weapon-skins.js'), 'utf8');
const skins = require(path.join(android, 'app/src/main/assets/www/weapon-skins.js'));
function skinsLegendPrototype(key) { return skins.legend.prototype(key); }
const server = fs.readFileSync(path.join(android, 'app/src/main/assets/phone-host/server.js'), 'utf8');
assert.strictEqual(phoneSkins, webSkins, 'offline and phone-host weapon skins must stay byte-identical');
function audioBlock(html) { const start=html.indexOf('var LEGEND_AUDIO_PROFILES={'),end=html.indexOf('var legendSeenEvents=',start);assert(start>=0&&end>start,'Legendary audio block is missing');return html.slice(start,end); }
assert.strictEqual(audioBlock(phone),audioBlock(web), 'Offline and phone-host Legendary audio implementation must stay behavior-identical');

const keys = ['smg', 'breacher', 'rook117', 'carbine', 'stinger', 'aurora', 'falcon', 'longbow'];
for (const key of keys) {
  assert(web.includes(key + ':{root:'), `missing per-skin audio profile: ${key}`);
  if (key === 'longbow') {
    // The current game intentionally supplies Longbow through weapon-skins.js's
    // cosmetic fallback instead of a bespoke prototype. Verify that selection path
    // without importing the accepted candidate's deferred weapon appearance data.
    const fallback = skins.legend.spec('longbow', 'Longbow', 1);
    assert(fallback && fallback.legendary && fallback.weapon === 'longbow', 'Longbow keeps its current Legendary fallback finish');
  } else {
    assert(webSkins.includes(`${key}:{title:`), `missing per-skin weapon prototype: ${key}`);
    assert(skinsLegendPrototype(key), `missing callable per-skin prototype metadata: ${key}`);
  }
}
for (const cue of ['fire', 'ads', 'reload-out', 'reload-energy', 'reload-finish', 'hit', 'elimination', 'kill-confirm', 'kill-chain', 'inspect']) {
  assert(web.includes(cue + ':') || web.includes("'" + cue + "':"), `missing Legendary cue: ${cue}`);
}
assert(web.includes('legendaryAudio: true') && web.includes('legendaryEffects: true'), 'independent Legendary settings must default on');
assert(web.includes("k: 'legendaryAudio'") && web.includes("k: 'legendaryEffects'"), 'settings UI must expose both independent controls');
assert(web.includes("inspect: ['KeyI', '']") && web.includes("case 'inspect': startLegendaryInspection(); break;"), 'desktop inspection binding/action is missing');
assert(web.includes('id="tb-inspect"') && web.includes("tbtn('#tb-inspect'"), 'touch inspection control is missing');
const fireFn = web.slice(web.indexOf('function tryFire(edge)'), web.indexOf('function hurtPlayer(', web.indexOf('function tryFire(edge)')));
const reloadFn = web.slice(web.indexOf('function startReload()'), web.indexOf('function finishReload()', web.indexOf('function startReload()')));
assert(fireFn.slice(0, 260).includes('legendCancelInspect()'), 'fire must cancel inspection immediately');
assert(reloadFn.includes('legendCancelInspect()'), 'reload must cancel inspection immediately');
assert(web.includes('function legendInspectionTick') && web.includes('g.rotation.y+=(a.ry||0)*q'), 'inspection must animate the real viewmodel transform');
assert(web.includes('function legendEliminationBurst') && web.includes('LEGEND_FX_MOTION') && web.includes('legendFxShape(key,type)'), 'confirmed elimination must emit bounded, keyed Legendary effect geometry and motion');
assert(web.includes('legendAudioVoices>=LEGEND_AUDIO_MAX_VOICES') && web.includes('legendAudioBuffers[cacheKey]'), 'audio must use cached buffers and a hard voice limit');
assert(web.includes("legendReloadAudioEvent") === false, 'reload event code should remain progress-driven, not timeouts');
assert(web.includes("if(progress>=.20") && web.includes("if(progress>=.70") && web.includes("if(progress>=.90"), 'reload accents must use existing progress without changing reload duration');
const phoneFireFn = phone.slice(phone.indexOf('function tryFire(edge)'), phone.indexOf('function hurtPlayer(', phone.indexOf('function tryFire(edge)')));
assert.match(fireFn,/if\(legendActive\(gun\)\)\{playWeaponShotAudio\(cur,1,0,true,1,4\);legendFire/,
  'equipped Legendary local fire uses the priority signature route; factory audio is fallback only when that route cannot play');
assert.match(fireFn,/else sfxShot\(w\.key, 1\)/,'factory-equipped local weapons keep their original shot sound');
assert.match(phoneFireFn,/if\(legendActive\(gun\)\)\{playWeaponShotAudio\(cur,1,0,true,1,4\);legendFire/,
  'phone-host local fire follows the same Legendary voice and fallback rule');
assert.match(web,/playWeaponShotAudio\(m\.w,remoteShotScale,pan,finish\.legendary&&hasLegendaryAudio\(m\.w\),remoteShotScale,2\)/,
  'remote Legendary shots replace factory reports with their panned skin-specific voice and use factory audio only as fallback');
assert(web.includes("legendConfirmedElimination(m.w,pos,m.ev,f") && web.includes("legendConfirmedHit(cur,confirmed,m.ev,!!m.k"), 'confirmed network hit/kill hooks are missing');
assert(web.includes("claimLegendEvent('elimination',eventId)") && web.includes('legendSeenEvents[token]'), 'server cosmetic event dedupe is missing');
assert((server.match(/const eventId = COSMETIC_EVENT_SESSION/g) || []).length === 2, 'server must assign unique cosmetic IDs to bot/zombie and player hit paths');
assert((server.match(/ev: eventId/g) || []).length === 4, 'both authoritative hit and kill messages must carry event IDs');
assert((server.match(/f: Number\.isInteger\(from\.finishes/g) || []).length === 2, "authoritative kill event must carry the shooter finish selected by the server");

// Exercise the source-generated one-shot cache and voice cap with a small WebAudio stub.
const sources = [];
const gainWrites = [];
const AC = {
  sampleRate: 48000, currentTime: 1, state: 'running',
  createBuffer(_channels, length, sampleRate) { const data = new Float32Array(length); return { sampleRate, duration: length / sampleRate, getChannelData() { return data; } }; },
  createBufferSource() { const s = { playbackRate: { values: [], setValueAtTime(v) { this.values.push(v); } }, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null }; sources.push(s); return s; },
  createGain() { const gain = { values: [], setValueAtTime(v) { this.values.push(v); gainWrites.push(v); }, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }; return { gain, connect() {}, disconnect() {} }; },
  createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
};
const pending = [];
let audioClock = 100;
const packBrowser = { console, document: { head: { appendChild() {} }, createElement() { return { width: 1, height: 1, getContext() { return { createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; } }; } }; } } };
packBrowser.window = packBrowser;
vm.createContext(packBrowser);
vm.runInContext(packSource, packBrowser, { filename: 'legendary-packs.js', timeout: 20000 });
const packSpecs = {
  ranger: { pack: 'SightlineEclipse', title: 'Helios Eclipse' },
  tide: { pack: 'SightlinePrism', title: 'Prismatic Aurora' },
  hawk: { pack: 'SightlineVoid', title: 'Voidlight Hawk' },
  scatter: { pack: 'SightlineThorn', title: 'Thornbloom Scatter' },
  bulwark: { pack: 'SightlineAegis', title: 'Sunforged Aegis' },
  rampart: { pack: 'SightlinePhoenix', title: 'Phoenix Rebirth' },
  needle: { pack: 'SightlineTempest', title: 'Tempest Needle' },
  rook117: { pack: 'SightlineEmeraldRevenant', title: 'Emerald Revenant' }
};
const baseSignal = new Float32Array(2400);
for (let i = 0; i < baseSignal.length; i++) baseSignal[i] = Math.sin(i * .17) * Math.exp(-i / 900);
const fallbackShots = [];
const context = vm.createContext({ AC, busFx: {}, legendaryAudioBus: null, soundOn: true, G: { legendaryAudio: true }, Math, Number, Object, Float32Array, WeakMap,
  performance: { now: () => audioClock }, legendAudioPending: pending, window: packBrowser,
  fallbackShots, sfxShot(key, volume, pan) { fallbackShots.push({ key, volume, pan }); },
  SightlineWeaponSkins: { legend: { prototype(key) { const p = packSpecs[key]; return p ? { pack: p.pack, title: p.title } : null; } } },
  shotBuffer() { return { getChannelData() { return baseSignal; } }; }
});
const factoryStart = web.indexOf('var SHOT_VOICES = 0, SHOT_MAX_VOICES = 14, SHOT_VOICE_RECORDS = [], shotBuffers = {};');
const factoryEnd = web.indexOf('\nfunction releaseShotVoice(', factoryStart);
assert(factoryStart >= 0 && factoryEnd > factoryStart, 'could not isolate the real factory-shot PCM generator');
vm.runInContext(web.slice(factoryStart, factoryEnd), context, { filename: 'factory-shot-pcm.js', timeout: 10000 });
const start = web.indexOf('var LEGEND_AUDIO_PROFILES={');
const end = web.indexOf('var legendSeenEvents=', start);
assert(start >= 0 && end > start, 'could not isolate the Legendary audio synthesizer for code-level execution');
vm.runInContext(web.slice(start, end) + '\nglobalThis.__probe={legendAudioBuffer:legendAudioBuffer,legendAudioEvent:legendAudioEvent,hasLegendaryAudio:hasLegendaryAudio,playWeaponShotAudio:playWeaponShotAudio,sourceGain:legendAudioSourceGain,audioRms:legendAudioRms,flush:legendFlushPendingAudio,voices:function(){return legendAudioVoices;},records:legendAudioVoiceRecords,cache:legendAudioBuffers,fireDesign:LEGEND_FIRE_DESIGN,fireVariants:LEGEND_FIRE_VARIANTS,upgradeFire:upgradeLegendaryFireCue};', context);
const sig = (key) => {
  const data = context.__probe.legendAudioBuffer(key, 'fire').getChannelData(0);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 97) h = Math.imul(h ^ Math.round((data[i] + 1) * 100000), 16777619) >>> 0;
  return h;
};
const signatures = keys.map(sig);
assert.strictEqual(new Set(signatures).size, keys.length, 'the synthesized Legendary firing voices must have distinct timbres');
const packFireSignatures = [];
for (const [key, spec] of Object.entries(packSpecs)) {
  const pack = packBrowser[spec.pack];
  assert(pack && pack.weapon === key && pack.finish.name === spec.title, `${key} has its source-matched authored audio pack`);
  assert(context.__probe.hasLegendaryAudio(key), `${key} reports an active Legendary audio path`);
  for (const event of ['fire','ads','equip','inspect','reload-out','reload-energy','reload-finish','hit','elimination','kill-confirm','kill-chain']) {
    const buffer = context.__probe.legendAudioBuffer(key, event);
    assert(buffer && buffer.duration > 0, `${key}/${event} resolves to an audio buffer`);
    const samples = buffer.getChannelData(0);
    assert(samples.length > 0 && samples.every(Number.isFinite), `${key}/${event} audio samples are finite`);
    const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
    assert(peak > 0.0001, `${key}/${event} cue is not silent`);
    assert(peak <= 1, `${key}/${event} cue stays within normalized sample range`);
    assert.strictEqual(buffer, context.__probe.legendAudioBuffer(key, event), `${key}/${event} audio buffer is cached`);
  }
  const data = context.__probe.legendAudioBuffer(key, 'fire').getChannelData(0);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 37) h = Math.imul(h ^ Math.round((data[i] + 1) * 100000), 16777619) >>> 0;
  packFireSignatures.push(h);
}
assert.strictEqual(new Set(packFireSignatures).size, Object.keys(packSpecs).length, 'the eight registered Legendary pack firing paths remain individually distinct');
const expectedPackFxKeys=Object.keys(packSpecs).sort();
const expectedPackKillKeys=['ranger','tide','hawk','scatter','bulwark','rampart','needle'].sort();
const fxRegistry=web.match(/LEGENDARY_PACK_FX_KEYS=\{([^}]+)\}/);
assert(fxRegistry,'authored Legendary elimination FX registry is missing');
const actualPackFxKeys=Array.from(fxRegistry[1].matchAll(/([a-z0-9_]+):1/g),match=>match[1]).sort();
assert.deepStrictEqual(actualPackFxKeys,expectedPackFxKeys,'only packs that expose a real elimination-capable createFx builder are enabled');
for(const [key,spec] of Object.entries(packSpecs)){
 const proto=skins.legend.prototype(key),pack=packBrowser[spec.pack];
 assert(proto&&proto.pack===spec.pack&&proto.title===spec.title,key+' runtime skin maps to the exact authored pack');
 assert(pack&&typeof pack.createFx==='function',key+' authored model pack has a visual builder');
 if(expectedPackKillKeys.includes(key)){
  assert.strictEqual(typeof pack.killSound,'function',key+' has an authored confirmed-kill sound');
  const authored=pack.killSound(AC.sampleRate);
  assert(authored&&authored.length>=64&&authored.length<=AC.sampleRate*1.2,key+' authored kill samples are finite-sized');
  for(const event of ['elimination','kill-confirm','kill-chain']){
   const routed=context.__probe.legendAudioBuffer(key,event).getChannelData(0);
   assert.deepStrictEqual(Array.from(routed),Array.from(authored),key+' '+event+' uses the authored pack kill cue rather than generic synthesis');
  }
 }else{
  assert.strictEqual(key,'rook117','only ROOK117 lacks an authored pack killSound');
  assert.strictEqual(pack.killSound,undefined,'ROOK117 retains its existing generated kill cue fallback');
 }
}
for(const key of ['carbine','stinger'])assert(!actualPackFxKeys.includes(key),key+' custom/current model path is not incorrectly routed through a nonexistent legacy pack effect');
const eliminationRouter=web.slice(web.indexOf('function legendaryPackElimination('),web.indexOf('function legendRookOpticSync(',web.indexOf('function legendaryPackElimination(')));
assert(eliminationRouter.includes('pack.hasEliminationFx===false'), 'packs that only author fire/tracer FX retain the existing generic confirmed-kill fallback');
for(const key of ['scatter','bulwark'])assert.strictEqual(packBrowser[packSpecs[key].pack].hasEliminationFx,false,key+' authored fire effects do not replace the existing confirmed-kill FX fallback');
console.log('PASS authored Legendary kill sounds ('+expectedPackKillKeys.join(', ')+') and eligible effect registration ('+expectedPackFxKeys.join(', ')+')');
const activeAudioKeys = keys.concat(Object.keys(packSpecs).filter(key => !keys.includes(key)));
const activeAudioSignatures = activeAudioKeys.map(sig);
assert.strictEqual(activeAudioKeys.length, 15, 'the current registry exposes fifteen Legendary-capable weapons');
assert(activeAudioKeys.every(key => context.__probe.hasLegendaryAudio(key)), 'every current Legendary weapon has an active firing voice');
assert.strictEqual(new Set(activeAudioSignatures).size, activeAudioKeys.length, 'all fifteen active Legendary firing paths have unique signatures');
assert.deepStrictEqual(Object.keys(context.__probe.fireDesign).sort(), activeAudioKeys.slice().sort(), 'every registered Legendary key has its own firing-mix design');
assert.strictEqual(new Set(activeAudioKeys.map(key => JSON.stringify(context.__probe.fireDesign[key]))).size, activeAudioKeys.length,
  'all fifteen firing-mix designs use distinct timing and tonal parameters');
const fireMetrics = {};
for (const key of activeAudioKeys) {
  const design = context.__probe.fireDesign[key], buffer = context.__probe.legendAudioBuffer(key, 'fire'), data = buffer.getChannelData(0);
  assert.ok(design.mech > 0 && design.mechGain > 0 && design.subGain > 0 && design.slapGain > 0,
    key + ' fire design includes a keyed mechanical layer, low impact, and short reflection');
  assert.ok(design.click >= 500 && design.click <= 5000, key + ' uses a weapon-specific filtered transient frequency');
  assert.ok(design.slapMs >= 12 && design.slapMs <= 28, key + ' reflection remains a short controlled room response');
  assert.ok(Math.abs(buffer.duration - design.duration) <= 1 / buffer.sampleRate, key + ' fire cue uses its own intentional duration');
  const peak = data.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  assert.ok(peak > .5 && peak <= .781, key + ' layered fire asset is normalized with headroom');
  const attackCount = Math.max(1, Math.floor(buffer.sampleRate * .006));
  const bodyStart = Math.floor(buffer.sampleRate * .012), bodyEnd = Math.min(data.length, Math.floor(buffer.sampleRate * .052));
  const tailStart = Math.floor(data.length * .62), tailEnd = Math.max(tailStart + 1, data.length - Math.floor(buffer.sampleRate * .012));
  const attackRms = Math.sqrt(data.slice(0, attackCount).reduce((s, x) => s + x * x, 0) / attackCount);
  const bodyRms = Math.sqrt(data.slice(bodyStart, bodyEnd).reduce((s, x) => s + x * x, 0) / Math.max(1, bodyEnd - bodyStart));
  const tailRms = Math.sqrt(data.slice(tailStart, tailEnd).reduce((s, x) => s + x * x, 0) / Math.max(1, tailEnd - tailStart));
  const wholeRms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length);
  const factoryRms = context.__probe.audioRms(context.shotBuffer(key));
  const sourceGain = context.__probe.sourceGain(key, 'fire', buffer, 1);
  const loudnessRatio = wholeRms * sourceGain / (factoryRms * .5);
  assert.ok(loudnessRatio >= 1.49 && loudnessRatio <= 1.51, key + ' Legendary fire is calibrated to 1.50x its actual factory-shot RMS at equal master/SFX settings');
  assert.ok(peak * sourceGain <= .57, key + ' calibrated fire peak stays below the full-scale source ceiling');
  assert.ok(attackRms > .015, key + ' fire asset has an audible transient attack');
  assert.ok(bodyRms > .004, key + ' fire asset retains controlled mechanical body/resonance after the transient');
  assert.ok(tailRms > .002, key + ' fire asset retains a bounded late resonance/reflection instead of an abrupt thin cutoff');
  assert.ok(peak / Math.max(.0001, wholeRms) < 18, key + ' fire asset has bounded crest factor');
  fireMetrics[key] = { durationMs: Math.round(buffer.duration * 1000), peak: +peak.toFixed(3), pcmRms: +wholeRms.toFixed(4), factoryPcmRms: +factoryRms.toFixed(4), runtimeGain: +sourceGain.toFixed(3), fireVsFactoryDb: +(20 * Math.log10(loudnessRatio)).toFixed(2), attackRms: +attackRms.toFixed(4), bodyRms: +bodyRms.toFixed(4), tailRms: +tailRms.toFixed(4), crest: +(peak / wholeRms).toFixed(2) };
}
console.log('AUDIO_DSP_METRICS ' + JSON.stringify(fireMetrics));
for (const key of activeAudioKeys) {
  const variants = context.__probe.fireVariants.map((_v, index) => context.__probe.legendAudioBuffer(key, 'fire', index));
  assert.strictEqual(new Set(variants).size, 5, key + ' caches five separate bounded shot variations');
  const variantSignatures = variants.map(buffer => {
    const data=buffer.getChannelData(0);let h=2166136261>>>0;
    for(let i=0;i<data.length;i+=83)h=Math.imul(h^Math.round((data[i]+1)*100000),16777619)>>>0;
    const peak=data.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
    assert.ok(peak<=.781&&data.every(Number.isFinite),key+' variation remains finite and normalized');
    return h;
  });
  assert.strictEqual(new Set(variantSignatures).size, 5, key + ' variations alter the actual cached PCM, not only playback-rate metadata');
}
const firePcmBytes=Object.entries(context.__probe.cache).filter(([cacheKey])=>cacheKey.includes(':fire:')).reduce((sum,[,buffer])=>sum+buffer.getChannelData(0).byteLength,0);
assert.ok(firePcmBytes>0&&firePcmBytes<5*1024*1024,'all per-shot PCM variants stay within a small predictable cache budget');
console.log('AUDIO_FIRE_VARIANT_CACHE ' + JSON.stringify({weaponCount:activeAudioKeys.length,variantsPerWeapon:context.__probe.fireVariants.length,pcmBytes:firePcmBytes}));
assert(web.includes("event==='fire'&&pack"), 'authored Legendary pack fire design is used when available, including ROOK117');
assert(web.includes('upgradeLegendaryFireCue(key,sr,authoredFire,variant)'), 'pack fire cues receive keyed transient/resonance and per-shot variation in the runtime audio asset');
assert(web.includes('legendaryAudioBus.connect(legendaryAudioLimiter); legendaryAudioLimiter.connect(busFx)') && web.includes('legendaryAudioBus||busFx'), 'Legendary voices pass through the dedicated compressor and remain compatible when that node is unavailable');
assert(web.includes('legendaryAudioLimiter.threshold.value=-3') && web.includes('legendaryAudioLimiter.ratio.value=10'), 'the Legendary bus applies a bounded -3 dBFS dynamics stage for simultaneous cues');
assert(web.includes('master.gain.value = G.master / 100; busFx.gain.value = G.sfxVol / 100'), 'master and SFX settings still control the Legendary bus through the common FX stage');
for (const event of ['elimination','kill-confirm','kill-chain']) {
  const signatures = activeAudioKeys.map(key => {
    const buffer=context.__probe.legendAudioBuffer(key,event),data=buffer.getChannelData(0),factoryRms=context.__probe.audioRms(context.shotBuffer(key));
    const rms=context.__probe.audioRms(buffer),gain=context.__probe.sourceGain(key,event,buffer,1),ratio=rms*gain/(factoryRms*.5);
    assert.ok(ratio>=1.49&&ratio<=1.51,key+' '+event+' loudness ratio='+ratio.toFixed(3)+' rms='+rms.toFixed(4)+' factory='+factoryRms.toFixed(4)+' gain='+gain.toFixed(3)+' is calibrated to 1.50x actual factory gunfire');
    assert.ok(Math.max(...data.map(Math.abs))*gain<=.77,key+' '+event+' stays below 0 dBFS before the dedicated Legendary limiter');
    let h=2166136261>>>0;for(let i=0;i<data.length;i+=61)h=Math.imul(h^Math.round((data[i]+1)*100000),16777619)>>>0;return h;
  });
  assert.strictEqual(new Set(signatures).size, activeAudioKeys.length, 'all fifteen '+event+' cues have distinct waveform signatures');
}
// The current Longbow Legendary uses its established generic selection fallback;
// inspect-pose redesign is explicitly deferred and is not an integration gate.
const smgFire = context.__probe.legendAudioBuffer('smg', 'fire');
const smgInspect = context.__probe.legendAudioBuffer('smg', 'inspect');
assert.notStrictEqual(smgFire, smgInspect, 'different events must have distinct generated cues');
assert.strictEqual(smgFire, context.__probe.legendAudioBuffer('smg', 'fire'), 'generated audio must cache by skin/event/sample rate');
const successfulFireFallbacks = fallbackShots.length;
assert.strictEqual(context.__probe.playWeaponShotAudio('smg', 1, 0, true, 1, 4), true, 'an enabled/equipped Legendary shot selects its dedicated voice');
assert.strictEqual(fallbackShots.length, successfulFireFallbacks, 'factory fire is not stacked over a successful Legendary shot');
sources.at(-1).onended();
context.G.legendaryAudio = false;
assert.strictEqual(context.__probe.legendAudioEvent('smg', 'fire', 0, 1), null, 'the dedicated audio setting must silence Legendary overlays');
const fallbackCount = fallbackShots.length;
assert.strictEqual(context.__probe.playWeaponShotAudio('smg', 1, 0, true, 1, 4), false, 'the fire router reports factory fallback when Legendary audio is disabled');
assert.strictEqual(fallbackShots.length, fallbackCount + 1, 'factory sound remains the explicit disabled/unavailable fallback');
context.G.legendaryAudio = true;
for (let i = 0; i < 8; i++) assert(context.__probe.legendAudioEvent(keys[i % keys.length], 'inspect', 0, 1), 'background cue should start below its reserved-voice threshold');
assert.strictEqual(context.__probe.voices(), 8, 'eight low-priority cues may fill only the non-combat part of the pool');
assert.strictEqual(context.__probe.legendAudioEvent('smg', 'hit', 0, 1), null, 'voice cap must reject excess Legendary audio');
assert(context.__probe.legendAudioEvent('smg', 'fire', 0, 1, 4), 'local player fire can use a reserved priority slot');
assert.strictEqual(context.__probe.voices(), 9, 'priority local fire uses reserved capacity rather than falling back under background saturation');
assert(context.__probe.legendAudioEvent('smg', 'kill-confirm', 0, 1, 5), 'confirmed kill cue uses the highest-priority voice');
assert.strictEqual(context.__probe.voices(), 10, 'confirmed kill can occupy the last reserved slot');
assert(context.__probe.legendAudioEvent('smg', 'fire', 0, 1, 4), 'a new local shot can reclaim a lower-priority voice from a saturated pool');
assert.strictEqual(context.__probe.voices(), 10, 'priority replacement keeps the fixed maximum voice count');
sources.forEach(s => { if (s.onended) s.onended(); });
assert.strictEqual(context.__probe.voices(), 0, 'ended cue voices must be released');
const fireSources = [];
context.legendFireVariation.smg = 0;
for (let i = 0; i < 3; i++) { assert(context.__probe.legendAudioEvent('smg', 'fire', 0, 1), 'fire voice starts for variation check'); fireSources.push(sources.at(-1)); }
assert.deepStrictEqual(fireSources.map(s => s.playbackRate.values[0]), [.992, 1.008, .985], 'successive Legendary shots use subtle bounded pitch variation');
assert.strictEqual(new Set(fireSources.map(s=>s.buffer)).size,3,'successive shots use three distinct cached PCM variations as well as bounded pitch changes');
fireSources.forEach(s => s.onended && s.onended());
AC.state = 'suspended';
AC.resume = () => { AC.state = 'running'; return Promise.resolve(); };
const queuedCancel = context.__probe.legendAudioEvent('rook117', 'ads', 0, 1);
assert.equal(typeof queuedCancel, 'function', 'suspended AudioContext queues a cancellable cue while resuming');
assert.equal(context.legendAudioPending.length, 1, 'one Legendary ADS cue waits for audio unlock');
context.__probe.flush();
assert.equal(context.__probe.voices(), 1, 'queued cue starts once the AudioContext is running');
assert.ok(Math.abs(gainWrites.at(-1) - .052 * 1.8) < 1e-9, 'ROOK117 gain staging raises the previously quiet ADS cue by 1.8x');
queuedCancel();
sources.at(-1).onended();
assert.equal(context.__probe.voices(), 0, 'queued inspection/ADS cancellation releases the playing voice');
AC.state = 'suspended';
AC.resume = () => Promise.resolve();
const expiredFallbackCount = fallbackShots.length;
assert.strictEqual(context.__probe.playWeaponShotAudio('smg', 1, 0, true, 1, 4), true, 'an interrupted Legendary shot remains queued while audio resumes');
assert.equal(context.legendAudioPending.length, 1, 'a suspended fire cue keeps its one bounded fallback record');
audioClock = 1000; AC.state = 'running'; context.__probe.flush();
assert.equal(fallbackShots.length, expiredFallbackCount + 1, 'if the queued fire cue expires, the factory shot fallback is dispatched instead of silently dropping the shot');

// Verify the actual factory fallback voice cap preserves local Legendary fire.
const factoryContext = vm.createContext({ AC: {
  sampleRate: 48000, currentTime: 1, state: 'running',
  createBuffer(_channels, length, sampleRate) { return { sampleRate, duration: length / sampleRate, getChannelData() { return new Float32Array(length); } }; },
  createBufferSource() { const s = { playbackRate: { value: 1 }, stopTimes: [], connect() {}, disconnect() {}, start() {}, stop(t) { this.stopTimes.push(t); } }; return s; },
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }; },
  createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
}, busFx: {}, soundOn: true, Math, Number });
factoryContext.shotBuffer = () => ({ sampleRate: 48000, duration: .18, getChannelData() { return baseSignal; } });
const sfxStart = web.indexOf('function releaseShotVoice(');
const sfxEnd = web.indexOf('\n/* P11.4', sfxStart);
assert(sfxStart >= 0 && sfxEnd > sfxStart, 'could not isolate the bounded factory fire voice router');
vm.runInContext(web.slice(factoryStart, factoryEnd) + web.slice(sfxStart, sfxEnd), factoryContext, { filename: 'factory-fire-voice-router.js' });
for (let i = 0; i < 14; i++) factoryContext.sfxShot('smg', 1, 0, 2);
assert.equal(factoryContext.SHOT_VOICES, 14, 'remote/fallback fire voices remain capped at fourteen');
const oldestRemote = factoryContext.SHOT_VOICE_RECORDS[0];
factoryContext.sfxShot('smg', 1, 0, 4);
assert.equal(factoryContext.SHOT_VOICES, 14, 'a local Legendary fallback reuses a capped voice instead of exceeding the cap');
assert(oldestRemote.released, 'the local fire fallback replaces the oldest lower-priority remote voice');
for (let i = 0; i < 13; i++) factoryContext.sfxShot('smg', 1, 0, 4);
const boundedVoiceCount = factoryContext.SHOT_VOICES;
factoryContext.sfxShot('smg', 1, 0, 2);
assert.equal(factoryContext.SHOT_VOICES, boundedVoiceCount, 'remote traffic cannot steal a local-priority fire voice or exceed the cap');
factoryContext.sfxShot('smg', 1, 0, 4);
assert.equal(factoryContext.SHOT_VOICES, 14, 'local fire remains audible under a fully saturated factory voice pool');
assert(web.includes('p.ringGain*.46') && web.includes('p.mechGain*.68') && web.includes('p.slapGain*.42'), 'all Legendary cues use damped ring/mechanical/reflection layers to reduce the hollow synthetic ping');
assert(web.includes("item.event==='fire'&&typeof item.factoryFallback==='function'"), 'an expired suspended fire cue dispatches its bounded factory fallback after resume');
console.log('PASS: 15 Legendary firing identities; Offline/phone-host audio parity; generated and authored fire/ADS/inspect/reload/hit/elimination cues are cached, finite, varied, and voice-limited');
