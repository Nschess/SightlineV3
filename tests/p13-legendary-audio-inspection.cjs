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
const server = fs.readFileSync(path.join(android, 'app/src/main/assets/phone-host/server.js'), 'utf8');
assert.strictEqual(phoneSkins, webSkins, 'offline and phone-host weapon skins must stay byte-identical');
function audioBlock(html) {
  const start = html.indexOf('var LEGEND_AUDIO_PROFILES={');
  const end = html.indexOf('var legendSeenEvents=', start);
  assert(start >= 0 && end > start, 'Legendary audio implementation must exist in both routes');
  return html.slice(start, end);
}
assert.strictEqual(audioBlock(phone), audioBlock(web), 'offline and phone-host Legendary audio implementation must stay byte-identical while route wrappers remain distinct');

const keys = ['smg', 'breacher', 'rook117', 'carbine'];
for (const key of keys) {
  assert(web.includes(key + ':{root:'), `missing per-skin audio profile: ${key}`);
  assert(webSkins.includes(`${key}:{title:`), `missing per-skin weapon prototype: ${key}`);
  assert(webSkins.includes(`${key}:{title:`) && webSkins.includes(`inspect:{duration:`), `missing inspection pose data: ${key}`);
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
assert(web.includes('function legendEliminationBurst') && web.includes('LEGEND_FX_MOTION') && web.includes('legendFxShape(key,type)'), 'confirmed elimination must emit bounded, weapon-keyed Legendary effect geometry and motion');
assert(web.includes('legendAudioVoices>=LEGEND_AUDIO_MAX_VOICES') && web.includes('legendAudioBuffers[cacheKey]'), 'audio must use cached buffers and a hard voice limit');
assert(web.includes("legendReloadAudioEvent") === false, 'reload event code should remain progress-driven, not timeouts');
assert(web.includes("if(progress>=.20") && web.includes("if(progress>=.70") && web.includes("if(progress>=.90"), 'reload accents must use existing progress without changing reload duration');
assert.match(fireFn,/playWeaponShotAudio\(cur,1,0,true,1,4\)/,'local Legendary fire must use its bounded priority audio route');
assert(web.includes('playWeaponShotAudio(m.w,remoteShotScale,pan,finish.legendary&&hasLegendaryAudio(m.w),remoteShotScale,2)'), 'remote Legendary shots retain panning and lower audio priority');
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
  createBufferSource() { const s = { connect() {}, disconnect() {}, start() {}, stop() {}, onended: null }; sources.push(s); return s; },
  createGain() { const gain = { values: [], setValueAtTime(v) { this.values.push(v); gainWrites.push(v); }, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }; return { gain, connect() {}, disconnect() {} }; },
  createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
};
const pending = [];
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
const context = vm.createContext({ AC, busFx: {}, legendaryAudioBus: null, soundOn: true, G: { legendaryAudio: true }, Math, Number, Object, Float32Array,
  performance: { now: () => 100 }, legendAudioPending: pending, window: packBrowser,
  SightlineWeaponSkins: { legend: { prototype(key) { const p = packSpecs[key]; return p ? { pack: p.pack, title: p.title } : null; } } },
  shotBuffer() { return { getChannelData() { return baseSignal; } }; }
});
const start = web.indexOf('var LEGEND_AUDIO_PROFILES={');
const end = web.indexOf('var legendSeenEvents=', start);
assert(start >= 0 && end > start, 'could not isolate the Legendary audio synthesizer for code-level execution');
vm.runInContext(web.slice(start, end) + '\nglobalThis.__probe={legendAudioBuffer:legendAudioBuffer,legendAudioEvent:legendAudioEvent,hasLegendaryAudio:hasLegendaryAudio,flush:legendFlushPendingAudio,voices:function(){return legendAudioVoices;},cache:legendAudioBuffers};', context);
const sig = (key) => {
  const data = context.__probe.legendAudioBuffer(key, 'fire').getChannelData(0);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 97) h = Math.imul(h ^ Math.round((data[i] + 1) * 100000), 16777619) >>> 0;
  return h;
};
const signatures = keys.map(sig);
assert.strictEqual(new Set(signatures).size, 4, 'the four firing overlays must be algorithmically distinct, not pitch-only copies');
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
    assert.strictEqual(buffer, context.__probe.legendAudioBuffer(key, event), `${key}/${event} audio buffer is cached`);
  }
  const data = context.__probe.legendAudioBuffer(key, 'fire').getChannelData(0);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 37) h = Math.imul(h ^ Math.round((data[i] + 1) * 100000), 16777619) >>> 0;
  packFireSignatures.push(h);
}
assert.strictEqual(new Set(packFireSignatures).size, Object.keys(packSpecs).length, 'all eight authored pack firing mixes remain individually distinct');
const smgFire = context.__probe.legendAudioBuffer('smg', 'fire');
const smgInspect = context.__probe.legendAudioBuffer('smg', 'inspect');
assert.notStrictEqual(smgFire, smgInspect, 'different events must have distinct generated cues');
assert.strictEqual(smgFire, context.__probe.legendAudioBuffer('smg', 'fire'), 'generated audio must cache by skin/event/sample rate');
context.G.legendaryAudio = false;
assert.strictEqual(context.__probe.legendAudioEvent('smg', 'fire', 0, 1), null, 'the dedicated audio setting must silence Legendary overlays');
context.G.legendaryAudio = true;
for (let i = 0; i < 8; i++) assert(context.__probe.legendAudioEvent(keys[i % keys.length], 'inspect', 0, 1), 'voice should start in the non-combat part of the pool');
assert.strictEqual(context.__probe.voices(), 8, 'eight low-priority cue voices may fill only the non-combat part of the pool');
assert.strictEqual(context.__probe.legendAudioEvent('smg', 'hit', 0, 1), null, 'voice cap must reject excess Legendary audio');
sources.forEach(s => { if (s.onended) s.onended(); });
assert.strictEqual(context.__probe.voices(), 0, 'ended cue voices must be released');
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
console.log('PASS: current sound palettes plus eight authored pack audio systems; fire/ADS/inspect/reload/hit/elimination cues are cached, finite, identity-specific, and voice-limited');
