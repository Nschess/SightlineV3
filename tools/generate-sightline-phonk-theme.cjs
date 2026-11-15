'use strict';

// Original dark tactical phonk / industrial lobby score. All voices are
// synthesized here; there are no sampled or third-party musical assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sampleRate = 22050;
const bpm = 154;
const bars = 64;
const beatsPerBar = 4;
const beatSec = 60 / bpm;
const barSec = beatsPerBar * beatSec;
const duration = bars * barSec;
const frames = Math.round(duration * sampleRate);
const left = new Float32Array(frames);
const right = new Float32Array(frames);
const TAU = Math.PI * 2;

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function panGains(pan) { return [Math.sqrt((1 - pan) * .5), Math.sqrt((1 + pan) * .5)]; }
function mixSample(sample, time, gain = 1, pan = 0) {
  const start = Math.round(time * sampleRate);
  const [gl, gr] = panGains(Math.max(-.9, Math.min(.9, pan)));
  for (let i = 0; i < sample.length; i++) {
    let at = start + i;
    if (at >= frames) at %= frames; // wrap release tails across the loop boundary
    if (at < 0) continue;
    const v = sample[i] * gain;
    left[at] += v * gl;
    right[at] += v * gr;
  }
}

function makeKick(seed) {
  const rand = rng(seed), n = Math.floor(sampleRate * .235), out = new Float32Array(n);
  let phase = 0, lastNoise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const hz = 43 + 122 * Math.exp(-t * 34);
    phase += TAU * hz / sampleRate;
    const body = Math.sin(phase) * Math.exp(-t * 10.5);
    const clickEnv = Math.exp(-t * 170);
    const noise = rand() * 2 - 1;
    const click = (noise - lastNoise * .72) * clickEnv;
    lastNoise = noise;
    const knock = Math.sin(TAU * 176 * t) * Math.exp(-t * 62) * .28;
    out[i] = Math.tanh(body * 1.45 + click * .5 + knock);
  }
  return out;
}
function makeSnare(seed) {
  const rand = rng(seed), n = Math.floor(sampleRate * .205), out = new Float32Array(n);
  let phase = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    phase += TAU * (188 - 22 * t) / sampleRate;
    const raw = rand() * 2 - 1;
    const hp = raw - last * .82;
    last = raw;
    const clap = (t < .055 ? (Math.exp(-t * 62) + .45 * Math.exp(-Math.abs(t - .013) * 150) + .28 * Math.exp(-Math.abs(t - .027) * 155)) : 0);
    const body = (Math.sin(phase) * .36 + Math.sin(phase * 1.73) * .12) * Math.exp(-t * 15);
    const noise = hp * (.68 * Math.exp(-t * 20) + clap * .5);
    out[i] = Math.tanh(body + noise * .72);
  }
  return out;
}
function makeHat(seed, open = false) {
  const rand = rng(seed), seconds = open ? .17 : .047, n = Math.floor(sampleRate * seconds), out = new Float32Array(n);
  let last = 0, last2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const raw = rand() * 2 - 1;
    const hp = raw - last * 1.22 + last2 * .38;
    last2 = last; last = raw;
    const env = Math.exp(-t * (open ? 25 : 74));
    const shimmer = Math.sin(TAU * (6300 + (i % 97) * 13) * t) * .12;
    out[i] = (hp * .72 + shimmer) * env * (open ? .72 : 1);
  }
  return out;
}
function makeBell(note) {
  const hz = midiHz(note), n = Math.floor(sampleRate * .38), out = new Float32Array(n);
  let carrier = 0, mod = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const modHz = hz * 1.47;
    mod += TAU * modHz / sampleRate;
    carrier += TAU * hz / sampleRate;
    const index = 3.8 * Math.exp(-t * 19) + .38;
    const fm = Math.sin(carrier + index * Math.sin(mod));
    const clang = .42 * Math.sin(carrier * 2.31 + .2) + .19 * Math.sin(carrier * 3.77 + .7);
    const attack = Math.min(1, t / .0018);
    const env = attack * Math.exp(-t * 7.4);
    const tick = Math.exp(-t * 150) * Math.sin(TAU * hz * 3.1 * t) * .17;
    out[i] = Math.tanh((fm * .73 + clang) * env * 1.15 + tick);
  }
  return out;
}
function makeImpact(seed) {
  const rand = rng(seed), n = Math.floor(sampleRate * .68), out = new Float32Array(n);
  let p1 = 0, p2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    p1 += TAU * (92 + 23 * Math.exp(-t * 5)) / sampleRate;
    p2 += TAU * 731 / sampleRate;
    const raw = rand() * 2 - 1;
    const clank = Math.sin(p1) * Math.exp(-t * 5.5) + .38 * Math.sin(p2) * Math.exp(-t * 10);
    const crack = (raw - last * .65) * Math.exp(-t * 55) * .42;
    last = raw;
    out[i] = Math.tanh(clank * .8 + crack);
  }
  return out;
}
function makeRiser(seed, seconds = .8) {
  const rand = rng(seed), n = Math.floor(sampleRate * seconds), out = new Float32Array(n);
  let phase = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const hz = 110 + 660 * t * t;
    phase += TAU * hz / sampleRate;
    const raw = rand() * 2 - 1;
    const noise = raw - last * .82;
    last = raw;
    out[i] = (noise * .35 + Math.sin(phase) * .28) * Math.pow(t, 1.7);
  }
  return out;
}
function make808(note, seconds, slideFrom = note, seed = 1) {
  const rand = rng(seed), n = Math.floor(sampleRate * seconds), out = new Float32Array(n);
  let phase = 0;
  const target = midiHz(note), initial = midiHz(slideFrom);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const p = Math.min(1, t / .085);
    const hz = initial + (target - initial) * p;
    phase += TAU * hz / sampleRate;
    const fundamental = Math.sin(phase);
    const harmonics = .34 * Math.sin(2 * phase + .13) + .16 * Math.sin(3 * phase + .39) + .065 * Math.sin(5 * phase);
    const envelope = (1 - Math.exp(-t * 190)) * (.74 * Math.exp(-t * .72) + .26) * Math.exp(-Math.max(0, t - .29) * 6.2);
    const grit = (rand() * 2 - 1) * Math.exp(-t * 78) * .09;
    out[i] = Math.tanh((fundamental + harmonics) * 1.95 + grit) * envelope;
  }
  return out;
}

const kicks = Array.from({ length: 4 }, (_, i) => makeKick(120 + i * 17));
const snares = Array.from({ length: 4 }, (_, i) => makeSnare(400 + i * 31));
const hats = Array.from({ length: 5 }, (_, i) => makeHat(810 + i * 37, false));
const openHats = Array.from({ length: 3 }, (_, i) => makeHat(1300 + i * 41, true));
const bells = new Map();
for (let note = 72; note <= 98; note++) bells.set(note, makeBell(note));
const impacts = Array.from({ length: 4 }, (_, i) => makeImpact(1900 + i * 53));
const risers = Array.from({ length: 4 }, (_, i) => makeRiser(2300 + i * 59));

const rootNotes = [30, 28, 26, 25]; // F#1, E1, D1, C#1
const melody = [
  [[0, 78], [3, 81], [6, 85], [8, 84], [11, 81], [14, 79]],
  [[0, 78], [2, 81], [5, 85], [8, 88], [10, 85], [13, 81], [15, 79]],
  [[0, 83], [3, 81], [6, 78], [8, 76], [11, 79], [14, 81]],
  [[0, 78], [4, 85], [7, 84], [8, 81], [12, 79], [14, 78]]
];
const kickGrid = [
  [0, 6, 8, 11, 14], [0, 3, 8, 10, 14],
  [0, 7, 8, 12, 15], [0, 5, 8, 11, 13, 15]
];
function stageAt(bar) {
  if (bar >= 16 && bar < 24) return 1; // driving half-time break, never ambient
  if (bar >= 24 && bar < 40) return 2; // second drop
  if (bar >= 40 && bar < 48) return 3; // snare and 808 build
  if (bar >= 48 && bar < 60) return 4; // final drop
  return 0; // opening drop and four-bar loop reprise
}
function addBell(note, time, gain, pan) {
  const sample = bells.get(Math.max(72, Math.min(98, note)));
  mixSample(sample, time, gain, pan);
  // short opposite-channel slap gives the hard lead dimension without a long wash
  mixSample(sample, time + .072, gain * .19, -pan);
}

for (let bar = 0; bar < bars; bar++) {
  const stage = stageAt(bar);
  const b = bar % 4;
  const rootNote = rootNotes[b];
  const kPattern = stage === 1 ? [0, 8, 14] : stage === 3 ? [0, 8] : kickGrid[b];
  const kickSet = new Set(kPattern);
  for (const step of kPattern) {
    const time = bar * barSec + step * barSec / 16;
    mixSample(kicks[(bar + step) % kicks.length], time, stage === 1 ? .94 : 1.08, 0);
    const bassDuration = step >= 12 ? .31 : .39;
    const bass = make808(rootNote, bassDuration, (bar % 8 === 7 && step === 0) ? rootNotes[(b + 1) % 4] : rootNote, bar * 13 + step + 1);
    mixSample(bass, time + .025, stage === 1 ? .92 : 1.08, 0);
  }
  // Syncopated mid-bass response between kick hits; maintains audible pitch on small speakers.
  if (stage !== 3 && (bar % 2 === 0 || stage === 4)) {
    for (const [step, offset] of [[7, 12], [15, -1]]) {
      if (!kickSet.has(step)) {
        const bass = make808(rootNote + offset, .27, rootNote, 900 + bar * 7 + step);
        mixSample(bass, bar * barSec + step * barSec / 16 + .008, .62, 0);
      }
    }
  }

  const snareSteps = stage === 1 ? (bar % 2 ? [12] : [4, 12]) : stage === 3 ? [4, 12] : [4, 12];
  for (const step of snareSteps) mixSample(snares[(bar + step) % snares.length], bar * barSec + step * barSec / 16, stage === 1 ? .8 : .93, (bar % 2 ? -.025 : .025));

  for (let step = 0; step < 16; step += 2) {
    const time = bar * barSec + step * barSec / 16;
    const accent = step === 0 || step === 8 ? 1.08 : .78;
    const open = (step === 6 || step === 14) && (stage === 0 || stage === 2 || stage === 4) && (bar % 2 === 1);
    mixSample(open ? openHats[(bar + step) % openHats.length] : hats[(bar * 3 + step) % hats.length], time, (stage === 1 ? .46 : stage === 3 ? .58 : .68) * accent, step % 4 ? .13 : -.11);
  }
  // Sixteenth-note hat push in second/final drops, varied every other bar.
  if ((stage === 2 || stage === 4) && bar % 2 === 0) {
    for (const step of [3, 7, 11, 15]) mixSample(hats[(bar + step + 2) % hats.length], bar * barSec + step * barSec / 16, .42, .18);
  }
  // The recognizable, original F# minor / Phrygian-color cowbell hook.
  const phrase = melody[b];
  if (stage === 0 || stage === 2 || stage === 4) {
    for (let i = 0; i < phrase.length; i++) {
      const [step, note] = phrase[i];
      const octave = stage === 4 && (i === 2 || i === 5) && bar % 2 === 0 ? 12 : 0;
      const accent = (i === 0 || i === 2) ? 1.12 : .83;
      addBell(note + octave, bar * barSec + step * barSec / 16, accent * (stage === 0 ? .5 : stage === 2 ? .61 : .69), (i % 3 - 1) * .17);
    }
    if ((stage === 2 || stage === 4) && bar % 4 === 3) {
      addBell(85, bar * barSec + 7 * barSec / 16, .36, -.22);
      addBell(84, bar * barSec + 15 * barSec / 16, .4, .22);
    }
  } else if (stage === 1) {
    for (const [step, note] of phrase.filter((_, i) => i % 2 === 0)) addBell(note - 12, bar * barSec + step * barSec / 16, .28, .1);
  } else {
    // Build: clipped low bell stabs and accelerating snare rolls.
    for (const step of [0, 8, 12]) addBell(step === 8 ? 84 : 78, bar * barSec + step * barSec / 16, .25 + .025 * (bar - 40), step === 8 ? .15 : -.15);
    const rollCount = bar < 44 ? 4 : bar < 46 ? 8 : 12;
    for (let i = 0; i < rollCount; i++) {
      const time = bar * barSec + barSec * .5 + i * (barSec * .5 / rollCount);
      mixSample(snares[(bar + i) % snares.length], time, .24 + .018 * (bar - 40), i % 2 ? .1 : -.1);
    }
    if (bar % 2) mixSample(openHats[bar % openHats.length], bar * barSec + barSec * .75, .4, .2);
  }

  // Mechanical accents support the beat rather than turning it into a trailer score.
  if (bar % 4 === 0 && bar > 0) mixSample(impacts[(bar / 4) % impacts.length], bar * barSec, stage === 1 ? .2 : .29, bar % 8 ? .32 : -.32);
  if ([15, 23, 39, 47, 59].includes(bar)) mixSample(risers[Math.floor(bar / 8) % risers.length], bar * barSec + barSec * .43, .31, bar % 2 ? -.12 : .12);
  if (bar % 8 === 7 && bar > 7) {
    mixSample(openHats[(bar + 1) % openHats.length], bar * barSec + barSec * .88, .34, .28);
    mixSample(impacts[(bar + 1) % impacts.length], bar * barSec + barSec * .9, .22, -.25);
  }
}

// Linked stereo bus compressor with cyclic warm-up, then safe loudness scaling.
const attackCoeff = Math.exp(-1 / (sampleRate * .004));
const releaseCoeff = Math.exp(-1 / (sampleRate * .095));
const threshold = Math.pow(10, -12 / 20);
let detector = 0;
for (let pass = 0; pass < 3; pass++) {
  const initial = detector;
  let lastAt = 0;
  for (let i = 0; i < frames; i++) {
    const level = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    const coeff = level > detector ? attackCoeff : releaseCoeff;
    detector = level + coeff * (detector - level);
    const compressed = detector > threshold ? (threshold + (detector - threshold) / 3.2) / detector : 1;
    if (pass === 2) { left[i] *= compressed; right[i] *= compressed; }
    lastAt = detector;
  }
  if (pass === 0) detector = lastAt;
  else if (pass === 1) detector = lastAt;
}
// A restrained analog-style soft clip controls kick/cowbell transients and
// raises average density without pushing the browser's music bus harder.
for (let i = 0; i < frames; i++) {
  left[i] = Math.tanh(left[i] * 2.25);
  right[i] = Math.tanh(right[i] * 2.25);
}
// Shift the loop point slightly into the first beat, then blend the ending
// tail into that same point so the audio element can repeat without a click.
const crossfadeFrames = Math.floor(sampleRate * .04);
const loopLeft = new Float32Array(frames), loopRight = new Float32Array(frames);
for (let i = 0; i < frames - crossfadeFrames; i++) {
  loopLeft[i] = left[i + crossfadeFrames];
  loopRight[i] = right[i + crossfadeFrames];
}
for (let i = 0; i < crossfadeFrames; i++) {
  const w = i / (crossfadeFrames - 1);
  const tail = frames - crossfadeFrames + i;
  loopLeft[tail] = left[tail] * (1 - w) + left[i] * w;
  loopRight[tail] = right[tail] * (1 - w) + right[i] * w;
}
left.set(loopLeft); right.set(loopRight);
let peak = 0, sumSquares = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
if (!Number.isFinite(peak) || peak === 0) throw new Error('empty phonk mix');
let gain = Math.min(.89125 / peak, .275 / Math.sqrt((left.reduce((s, x, i) => s + x * x + right[i] * right[i], 0)) / (frames * 2)));
for (let i = 0; i < frames; i++) {
  const l = left[i] * gain, r = right[i] * gain;
  left[i] = Math.max(-.999, Math.min(.999, l));
  right[i] = Math.max(-.999, Math.min(.999, r));
  sumSquares += left[i] * left[i] + right[i] * right[i];
}

const wav = Buffer.alloc(44 + frames * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
let outputPeak = 0;
for (let i = 0, offset = 44; i < frames; i++, offset += 4) {
  const l = Math.round(left[i] * 32767), r = Math.round(right[i] * 32767);
  wav.writeInt16LE(l, offset); wav.writeInt16LE(r, offset + 2);
  outputPeak = Math.max(outputPeak, Math.abs(l), Math.abs(r));
}
const sha256 = crypto.createHash('sha256').update(wav).digest('hex');
const rms = Math.sqrt(sumSquares / (frames * 2));
const toDb = value => 20 * Math.log10(Math.max(1e-9, value));
const metadata = {
  title: 'BREACH VECTOR', artist: 'Sightline V3 Original Score', genre: 'Dark tactical phonk / industrial electronic',
  format: 'PCM WAV, 16-bit stereo', bpm, key: 'F# minor with Phrygian b2 color', bars, durationSeconds: Number(duration.toFixed(3)),
  harmonicFoundation: 'F# – E – D – C#; chromatic G-natural tension in the lead',
  openingHook: 'F#5 – A5 – C#6 – C6, syncopated cowbell over a hard 808 drop',
  sampleRateHz: sampleRate, channels: 2, originalComposition: true, externalSamples: false,
  arrangement: ['Immediate kick/808/cowbell drop at bar 1', 'Syncopated drift-phonk groove and original lead motif', 'Driving half-time break with bass and metallic accents', 'Second drop with sixteenth-note hat fills', 'Snare-roll and 808 build into final drop', 'Four-bar opening reprise for a seamless rhythmic loop'],
  instrumentation: ['Synthesized punch kick and layered snare/clap', 'Distorted 808 with sub and mid-bass harmonics', 'Original FM cowbell lead and counter-stabs', 'Fast closed/open hats, industrial steel impacts, and filtered noise risers'],
  mastering: { compressorRatio: '3.2:1 above -12 dBFS, linked stereo, 4 ms attack / 95 ms release', samplePeakCeilingDbfs: -1, noHardClipping: true },
  peakDbfs: Number(toDb(outputPeak / 32768).toFixed(2)), masteredRmsDbfs: Number(toDb(rms).toFixed(2)),
  loop: { exactBars: bars, circularReleaseTails: true, wrapRepriseBars: 4, seamCrossfadeMs: 40,
    edgeJump: Number(Math.max(Math.abs(left[0] - left[frames - 1]), Math.abs(right[0] - right[frames - 1])).toFixed(5)) },
  sha256, bytes: wav.length,
  outputs: ['AndroidProject/app/src/main/assets/www/sightline-main-theme.wav', 'AndroidProject/app/src/main/assets/phone-host/sightline-main-theme.wav']
};
const destinations = metadata.outputs.map(rel => path.join(root, rel));
for (const target of destinations) fs.writeFileSync(target, wav);
fs.writeFileSync(path.join(root, 'SIGHTLINE-MAIN-THEME-METADATA.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ status: 'GENERATED', ...metadata }, null, 2));
