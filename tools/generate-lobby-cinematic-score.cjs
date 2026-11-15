'use strict';

/* Original, locally synthesized Sightline lobby score. No samples or external
   libraries are used. A short equal-power tail/head crossfade makes the loop
   suitable for HTMLAudioElement playback on desktop and Android WebView. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sampleRate = 22050;
const duration = 48;
const frames = sampleRate * duration;
const fadeFrames = Math.round(sampleRate * 1.75);
const left = new Float32Array(frames);
const right = new Float32Array(frames);
const tau = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function addLayer(fn) {
  for (let i = 0; i < frames; i++) {
    const sample = fn(i / sampleRate, i);
    left[i] += sample[0];
    right[i] += sample[1];
  }
}

// Deep, stable D/A drones with slow movement instead of a looped short motif.
addLayer((t) => {
  const breathe = 0.78 + 0.22 * Math.sin(tau * t / duration);
  const drift = 1.7 * Math.sin(tau * 2 * t / duration);
  const l = Math.sin(tau * (36.708 + drift * 0.10) * t) * 0.19;
  const r = Math.sin(tau * (36.708 - drift * 0.10) * t + 0.13) * 0.19;
  const fifthL = Math.sin(tau * 55 * t + 0.2) * 0.075;
  const fifthR = Math.sin(tau * 55 * t - 0.17) * 0.075;
  const upper = Math.sin(tau * 73.416 * t + 0.6 * Math.sin(tau * t / 16)) * 0.045;
  return [(l + fifthL + upper) * breathe, (r + fifthR + upper) * breathe];
});

// Low brass-like chord pads. Four restrained harmonic voices crossfade between
// slow D-minor/modal voicings; gentle harmonic saturation keeps them audible.
const chords = [
  [55.00, 73.416, 110.00, 146.832],
  [49.00, 65.406, 98.00, 130.813],
  [43.654, 58.270, 87.307, 116.541],
  [49.00, 73.416, 98.00, 146.832]
];
addLayer((t) => {
  const phase = (t % 12) / 12;
  const phrase = Math.floor(t / 12) % chords.length;
  const cross = smooth((phase - 0.78) / 0.22);
  const next = (phrase + 1) % chords.length;
  const swell = 0.16 + 0.84 * Math.pow(Math.sin(Math.PI * clamp(phase / 0.98, 0, 1)), 1.25);
  let l = 0, r = 0;
  for (let n = 0; n < 4; n++) {
    const a = chords[phrase][n];
    const b = chords[next][n];
    const f = a + (b - a) * cross;
    const phaseJitter = n * 0.37;
    const waveL = Math.sin(tau * f * t + phaseJitter) + 0.31 * Math.sin(tau * f * 2.003 * t + phaseJitter * 0.6) + 0.12 * Math.sin(tau * f * 3.01 * t);
    const waveR = Math.sin(tau * (f * 1.0012) * t - phaseJitter) + 0.29 * Math.sin(tau * f * 2.001 * t - phaseJitter * 0.4) + 0.10 * Math.sin(tau * f * 3.007 * t);
    const amp = [0.055, 0.040, 0.022, 0.013][n] * swell;
    l += Math.tanh(waveL * 0.72) * amp;
    r += Math.tanh(waveR * 0.72) * amp;
  }
  return [l, r];
});

// A very soft deployment pulse every three seconds: no bright EDM kick or
// continuous drum loop. Each pulse is a short, weighted low-frequency throb.
for (let beat = 0; beat < duration; beat += 3) {
  const start = Math.round(beat * sampleRate);
  const length = Math.round(sampleRate * 0.72);
  const strength = beat % 6 === 0 ? 0.072 : 0.043;
  for (let j = 0; j < length && start + j < frames; j++) {
    const t = j / sampleRate;
    const env = (1 - Math.exp(-t * 42)) * Math.exp(-t * 5.0);
    const freq = 66 - 25 * Math.min(1, t / 0.42);
    const body = Math.sin(tau * freq * t) * env * strength;
    const click = Math.sin(tau * (188 - 90 * Math.min(1, t / 0.08)) * t) * Math.exp(-t * 34) * strength * 0.20;
    left[start + j] += body + click;
    right[start + j] += (body + click) * 0.96;
  }
}

// Sparse, distant machinery: dark metallic partials with long, quiet tails.
const metalEvents = [
  [4.8, 392, 0.030, -0.32], [11.3, 523.25, 0.022, 0.38],
  [17.9, 329.63, 0.028, -0.20], [25.4, 440, 0.024, 0.30],
  [32.1, 587.33, 0.020, -0.35], [39.7, 349.23, 0.026, 0.24],
  [45.2, 466.16, 0.018, -0.12]
];
for (const [when, freq, gain, pan] of metalEvents) {
  const start = Math.round(when * sampleRate);
  const length = Math.round(sampleRate * 2.4);
  for (let j = 0; j < length && start + j < frames; j++) {
    const t = j / sampleRate;
    const env = (1 - Math.exp(-t * 90)) * Math.exp(-t * 2.25);
    const ring = Math.sin(tau * freq * t) + 0.34 * Math.sin(tau * freq * 2.76 * t + 0.8) + 0.15 * Math.sin(tau * freq * 4.17 * t + 1.4);
    const sample = Math.tanh(ring * 0.72) * env * gain;
    left[start + j] += sample * (pan < 0 ? 1 : 1 - pan * 0.32);
    right[start + j] += sample * (pan > 0 ? 1 : 1 + pan * 0.32);
  }
}

// Filtered slow noise bed, deterministic and low in level, for distant air and
// electrical room texture. A seeded PRNG keeps the generated asset repeatable.
let seed = 0x51A71E;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
let filter = 0;
for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const white = random() * 2 - 1;
  filter += 0.018 * (white - filter);
  const movement = 0.55 + 0.45 * Math.sin(tau * 3 * t / duration + 0.9);
  const airy = filter * movement * 0.048;
  left[i] += airy;
  right[i] += airy * 0.90;
}

// Equal-power tail-to-head crossfade; the last frame returns to the opening
// ambience so looping introduces no hard cut or added playback work.
for (let n = 0; n < fadeFrames; n++) {
  const tail = frames - fadeFrames + n;
  const w = n / (fadeFrames - 1);
  const a = Math.cos(w * Math.PI * 0.5);
  const b = Math.sin(w * Math.PI * 0.5);
  left[tail] = left[tail] * a + left[n] * b;
  right[tail] = right[tail] * a + right[n] * b;
}

let peak = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const normalize = peak > 0 ? 0.78 / peak : 1;
const dataBytes = frames * 4;
const wav = Buffer.allocUnsafe(44 + dataBytes);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
let sum = 0, sq = 0;
for (let i = 0, off = 44; i < frames; i++) {
  for (const value of [left[i], right[i]]) {
    const v = clamp(value * normalize, -0.999969, 0.999969);
    const s = Math.round(v * 32768);
    wav.writeInt16LE(s, off); off += 2; sum += Math.abs(v); sq += v * v;
  }
}

const outputs = [
  path.join(root, 'AndroidProject/app/src/main/assets/www/lobby-cinematic.wav'),
  path.join(root, 'AndroidProject/app/src/main/assets/phone-host/lobby-cinematic.wav')
];
for (const output of outputs) fs.writeFileSync(output, wav);
console.log(JSON.stringify({
  status: 'GENERATED', source: 'original deterministic synthesis; no external samples',
  sampleRate, channels: 2, durationSeconds: duration, sizeBytes: wav.length,
  peakDbfs: Number((20 * Math.log10(0.78)).toFixed(2)),
  rmsDbfs: Number((20 * Math.log10(Math.sqrt(sq / (frames * 2)))).toFixed(2)),
  meanAbsolute: Number((sum / (frames * 2)).toFixed(4)),
  files: outputs.map(f => path.relative(root, f).replace(/\\/g, '/'))
}, null, 2));
