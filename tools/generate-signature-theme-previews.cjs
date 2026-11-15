'use strict';

// Standalone, original 30-second direction previews. These files are for
// listening/review only and are deliberately not connected to the game.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'audio-previews');
const sr = 44100;
const tau = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);
const panGains = p => [Math.sqrt((1 - p) * .5), Math.sqrt((1 + p) * .5)];

function seeded(seed) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function createMix(seconds) {
  const frames = Math.ceil(seconds * sr);
  const stem = () => ({ l: new Float32Array(frames), r: new Float32Array(frames) });
  return { frames, seconds: frames / sr, drums: stem(), bass: stem(), lead: stem(), pad: stem(), texture: stem(), kickTimes: [] };
}

function addSample(bus, sample, time, gain = 1, pan = 0) {
  const start = Math.round(time * sr);
  if (start >= bus.l.length) return;
  const [gl, gr] = panGains(clamp(pan, -.8, .8));
  const end = Math.min(sample.length, bus.l.length - start);
  for (let i = 0; i < end; i++) {
    const v = sample[i] * gain;
    bus.l[start + i] += v * gl;
    bus.r[start + i] += v * gr;
  }
}

const noteCache = new Map();
function synthNote(midi, duration, kind) {
  const cacheKey = kind + ':' + midi + ':' + Math.round(duration * 1000);
  if (noteCache.has(cacheKey)) return noteCache.get(cacheKey);
  const settings = kind === 'grooveLead'
    ? { attack: .009, decay: .13, sustain: .38, release: .15, cutoff: 3200, detune: .0028, shape: 'pulse', vibrato: .0012 }
    : kind === 'anthemLead'
      ? { attack: .045, decay: .24, sustain: .55, release: .24, cutoff: 2400, detune: .0038, shape: 'warm', vibrato: .0018 }
      : kind === 'groovePad'
        ? { attack: .18, decay: .38, sustain: .34, release: .34, cutoff: 1400, detune: .005, shape: 'warm', vibrato: .0006 }
        : { attack: .11, decay: .28, sustain: .42, release: .28, cutoff: 1550, detune: .003, shape: 'warm', vibrato: .0009 };
  const length = Math.ceil((duration + settings.release) * sr);
  const out = new Float32Array(length);
  const base = midiHz(midi);
  const coeff0 = 1 - Math.exp(-tau * settings.cutoff / sr);
  let phaseA = 0, phaseB = 0, lowA = 0, lowB = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const vibrato = Math.sin(tau * 4.1 * t) * settings.vibrato;
    phaseA += tau * base * (1 + vibrato) / sr;
    phaseB += tau * base * (1 + settings.detune + vibrato) / sr;
    let a, b;
    if (settings.shape === 'pulse') {
      a = Math.sin(phaseA) * .70 + Math.sin(phaseA * 2) * .22 + Math.sin(phaseA * 3) * .08;
      b = Math.sin(phaseB) * .68 + Math.sin(phaseB * 2) * .24 + Math.sin(phaseB * 3) * .08;
    } else {
      a = Math.sin(phaseA) * .82 + Math.sin(phaseA * 2) * .15 + Math.sin(phaseA * 3) * .03;
      b = Math.sin(phaseB) * .80 + Math.sin(phaseB * 2) * .17 + Math.sin(phaseB * 3) * .03;
    }
    // A small attack brightness opens the filter, then settles into a smooth
    // analog-like body rather than a piercing bell or brittle saw.
    const open = Math.exp(-t * 5.4) * .75 + .25;
    const coeff = 1 - Math.exp(-tau * settings.cutoff * open / sr);
    lowA += coeff * (a - lowA);
    lowB += coeff * (b - lowB);
    let env;
    if (t < settings.attack) env = t / settings.attack;
    else if (t < settings.attack + settings.decay) {
      const q = (t - settings.attack) / settings.decay;
      env = 1 + (settings.sustain - 1) * q;
    } else if (t < duration) env = settings.sustain;
    else env = settings.sustain * Math.max(0, 1 - (t - duration) / settings.release);
    const body = lowA * .72 + lowB * .28;
    out[i] = body * env;
  }
  noteCache.set(cacheKey, out);
  return out;
}

function bassNote(midi, duration, seed, glide = 0) {
  const rand = seeded(seed);
  const n = Math.ceil((duration + .07) * sr);
  const out = new Float32Array(n);
  const target = midiHz(midi), start = glide ? midiHz(glide) : target;
  let phase = 0, low = 0;
  const lp = 1 - Math.exp(-tau * 760 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = start + (target - start) * Math.min(1, t / .085);
    phase += tau * f / sr;
    const sub = Math.sin(phase);
    const harmonics = Math.sin(phase * 2.01) * .25 + Math.sin(phase * 3.02) * .06;
    const click = (rand() - .5) * Math.exp(-t * 115) * .012;
    low += lp * (sub * .76 + harmonics + click - low);
    const env = Math.min(1, t / .012) * (t < duration ? 1 : Math.max(0, 1 - (t - duration) / .07));
    out[i] = Math.tanh(low * 1.08) * env;
  }
  return out;
}

function kick(seed, warm = false) {
  const rand = seeded(seed), n = Math.floor(sr * .28), out = new Float32Array(n);
  let phase = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = (warm ? 82 : 91) * Math.exp(-t * 18) + (warm ? 43 : 46);
    phase += tau * f / sr;
    const noise = rand() * 2 - 1;
    const click = (noise - prev * .74) * Math.exp(-t * 150) * (warm ? .08 : .07);
    prev = noise;
    const knock = Math.sin(tau * 128 * t) * Math.exp(-t * 42) * .08;
    out[i] = Math.sin(phase) * Math.exp(-t * 8.5) + knock + click;
  }
  return out;
}

function snare(seed, dark = false) {
  const rand = seeded(seed), n = Math.floor(sr * .25), out = new Float32Array(n);
  let prev = 0, phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1, hp = x - prev * .82;
    prev = x;
    phase += tau * (dark ? 172 : 198) / sr;
    const tone = Math.sin(phase) * Math.exp(-t * 18) * .22;
    const body = Math.sin(phase * 1.51) * Math.exp(-t * 30) * .10;
    const noise = hp * Math.exp(-t * (dark ? 25 : 31)) * .34;
    const softSnap = (x - prev * .3) * Math.exp(-t * 190) * .10;
    out[i] = tone + body + noise + softSnap;
  }
  return out;
}

function hat(seed, open = false) {
  const rand = seeded(seed), seconds = open ? .11 : .052;
  const n = Math.floor(sr * seconds), out = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1;
    const hp = x - a * 1.05 + b * .22;
    b = a; a = x;
    const env = Math.exp(-t * (open ? 35 : 82));
    out[i] = (hp * .28 + Math.sin(tau * 5700 * t) * .025) * env;
  }
  return out;
}

function lowTom(seed, midi) {
  const rand = seeded(seed), n = Math.floor(sr * .32), out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += tau * midiHz(midi + 7 * Math.exp(-t * 20)) / sr;
    const transient = (rand() - .5) * Math.exp(-t * 110) * .05;
    out[i] = Math.sin(phase) * Math.exp(-t * 9) + transient;
  }
  return out;
}

function metalStrike(seed) {
  const rand = seeded(seed), n = Math.floor(sr * .46), out = new Float32Array(n);
  let p1 = 0, p2 = 0, p3 = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1, noise = x - prev * .8;
    prev = x;
    p1 += tau * 392 / sr; p2 += tau * 613 / sr; p3 += tau * 887 / sr;
    const attack = Math.exp(-t * 70);
    const tail = Math.exp(-t * 7.5);
    out[i] = noise * attack * .07 + (Math.sin(p1) * .24 + Math.sin(p2) * .13 + Math.sin(p3) * .065) * tail;
  }
  return out;
}

function warmPulse(midi, duration, seed) {
  const rand = seeded(seed), n = Math.ceil(sr * duration), out = new Float32Array(n);
  const f = midiHz(midi);
  let phase = 0, low = 0;
  const lp = 1 - Math.exp(-tau * 1100 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += tau * f / sr;
    const raw = Math.sin(phase) * .74 + Math.sin(phase * 2) * .18 + Math.sin(phase * 3) * .05 + (rand() - .5) * .018;
    low += lp * (raw - low);
    const env = (1 - Math.exp(-t * 65)) * Math.exp(-t * 3.8);
    out[i] = low * env;
  }
  return out;
}

function addChord(mix, notes, time, duration, gain, panOffset, kind) {
  const positions = notes.length > 3 ? [-.48, -.18, .18, .48, .58] : [-.35, 0, .35];
  notes.forEach((n, i) => {
    const s = synthNote(n, duration, kind);
    addSample(mix.pad, s, time, gain / Math.sqrt(notes.length), clamp(positions[i % positions.length] + panOffset, -.65, .65));
  });
}

function addDelay(bus, amount = .17) {
  const delayA = Math.round(sr * .19), delayB = Math.round(sr * .31);
  for (let i = bus.l.length - 1; i >= 0; i--) {
    const l = bus.l[i], r = bus.r[i];
    if (i + delayA < bus.l.length) { bus.l[i + delayA] += r * amount; bus.r[i + delayA] += l * amount; }
    if (i + delayB < bus.l.length) { bus.l[i + delayB] += l * amount * .45; bus.r[i + delayB] += r * amount * .45; }
  }
}

function addRoom(bus, amount = .09) {
  const taps = [[.037, .32], [.061, .21], [.089, .14], [.127, .08]];
  // A short, quiet synthetic room tail gives the melody a sense of space
  // without washing out the transient-heavy groove.
  for (let t = taps.length - 1; t >= 0; t--) {
    const offset = Math.round(taps[t][0] * sr), g = taps[t][1] * amount;
    for (let i = bus.l.length - offset - 1; i >= 0; i--) {
      const l = bus.l[i], r = bus.r[i];
      bus.l[i + offset] += r * g;
      bus.r[i + offset] += l * g;
    }
  }
}

function applySidechain(bus, kickTimes, beat, depth = .28) {
  const attack = .012, release = .28;
  for (const kt of kickTimes) {
    const start = Math.max(0, Math.floor((kt - .012) * sr));
    const end = Math.min(bus.l.length, Math.ceil((kt + release * 3) * sr));
    for (let i = start; i < end; i++) {
      const t = i / sr - kt;
      if (t < -.012) continue;
      const env = t < attack ? (t + .012) / (attack + .012) : Math.exp(-(t - attack) / release);
      const gain = 1 - depth * clamp(env, 0, 1);
      bus.l[i] *= gain; bus.r[i] *= gain;
    }
  }
}

function addDrums(mix, bpm, bars, style) {
  const beat = 60 / bpm, bar = beat * 4;
  const dark = style === 'anthem';
  const kCache = Array.from({ length: 5 }, (_, i) => kick(100 + i, dark));
  const sCache = Array.from({ length: 4 }, (_, i) => snare(220 + i, dark));
  const hats = Array.from({ length: 6 }, (_, i) => hat(300 + i));
  const openHat = hat(477, true);
  const tom = [lowTom(811, dark ? 38 : 41), lowTom(812, dark ? 45 : 48), lowTom(813, dark ? 50 : 53)];
  for (let b = 0; b < bars; b++) {
    const t = b * bar, variant = b % 4;
    const kickPattern = dark
      ? [[0, 2.5], [0, 2.75], [0, 2.0, 3.5], [0, 2.5]][variant]
      : [[0, 2.5], [0, 2.75, 3.5], [0, 2.0], [0, 2.5, 3.25]][variant];
    for (let j = 0; j < kickPattern.length; j++) {
      const at = t + kickPattern[j] * beat;
      mix.kickTimes.push(at);
      addSample(mix.drums, kCache[(b + j) % kCache.length], at, j === 0 ? .78 : .64, 0);
    }
    const snareBeats = dark ? [2] : [1, 3];
    for (let j = 0; j < snareBeats.length; j++) {
      const at = t + snareBeats[j] * beat;
      addSample(mix.drums, sCache[(b + j) % sCache.length], at, dark ? .62 : .49, j % 2 ? .035 : -.035);
    }
    for (let e = 0; e < 8; e++) {
      const at = t + e * beat / 2 + (e % 2 ? .012 : 0);
      const accent = e === 0 || e === 4 ? .28 : e % 2 ? .17 : .22;
      const isOpen = e === 7 && (b % 2 === 1);
      addSample(mix.drums, isOpen ? openHat : hats[(b + e) % hats.length], at, isOpen ? .24 : accent, e % 2 ? .12 : -.12);
    }
    // Restrained low tom punctuation gives the second direction a more
    // deliberate operator/march pulse; it is not a trailer roll.
    if (dark && b % 2 === 1) addSample(mix.drums, tom[(b / 2) % 3 | 0], t + 3.5 * beat, .17, b % 4 ? .08 : -.08);
    if (b % 4 === 3) {
      addSample(mix.drums, sCache[(b + 2) % sCache.length], t + 3.75 * beat, dark ? .13 : .12, .08);
    }
  }
}

function renderGroove() {
  const bpm = 132, beat = 60 / bpm, bar = beat * 4, bars = 16;
  const mix = createMix(bar * bars);
  addDrums(mix, bpm, bars, 'groove');
  const roots = [37, 33, 40, 35]; // C#2, A1, E2, B1
  const chords = [
    [61, 64, 68, 71, 75], // C#m9
    [57, 61, 64, 68, 71], // Amaj9
    [59, 64, 68, 71],     // Eadd9
    [59, 63, 66, 71]      // Bsus
  ];
  const motifs = [
    [[0, 73, .43], [.72, 76, .25], [1.38, 80, .5], [2.18, 78, .28], [2.72, 76, .48], [3.48, 73, .32]],
    [[0, 68, .42], [.72, 73, .33], [1.48, 76, .45], [2.25, 71, .32], [2.82, 68, .35], [3.48, 71, .3]],
    [[0, 76, .34], [.55, 80, .45], [1.35, 83, .42], [2.02, 80, .28], [2.58, 78, .42], [3.35, 76, .4]],
    [[0, 66, .48], [.8, 73, .32], [1.5, 76, .45], [2.25, 71, .32], [3, 68, .3], [3.5, 73, .38]]
  ];
  const bassPatterns = [
    [[0, 0, .55], [1.5, 7, .24], [2.5, 0, .36], [3.5, 12, .22]],
    [[0, 0, .48], [1.75, 7, .22], [2.75, 12, .26], [3.5, 7, .2]],
    [[0, 0, .52], [1.5, 7, .22], [2.5, 0, .36], [3.25, 7, .27]],
    [[0, 0, .50], [1.5, 7, .22], [2.75, 0, .32], [3.5, -1, .22]]
  ];
  for (let b = 0; b < bars; b++) {
    const t = b * bar, phrase = b % 4, chord = chords[phrase];
    addChord(mix, chord, t, bar * .92, b < 4 ? .105 : .12, (phrase % 2 ? .025 : -.025), 'groovePad');
    for (const [step, offset, dur] of bassPatterns[phrase]) {
      const note = roots[phrase] + offset;
      const sample = bassNote(note, dur * beat, b * 23 + step * 11 + phrase, step === 3.5 && phrase === 3 ? note + 1 : 0);
      addSample(mix.bass, sample, t + step * beat, step === 0 ? .77 : .61, 0);
    }
    const pattern = motifs[phrase];
    for (let i = 0; i < pattern.length; i++) {
      const [step, note, dur] = pattern[i];
      const lift = b >= 12 && i === 2 ? 12 : 0;
      const sample = synthNote(note + lift, dur * beat, 'grooveLead');
      addSample(mix.lead, sample, t + step * beat, (i === 0 ? .54 : .43) * (b < 4 ? .9 : 1), i % 2 ? .09 : -.09);
    }
    if (b % 4 === 1) {
      addSample(mix.texture, metalStrike(900 + b), t + 3.48 * beat, .11, b % 2 ? .31 : -.31);
    }
    if (b % 4 === 3) {
      addSample(mix.texture, warmPulse(49, .22, 1100 + b), t + 3.48 * beat, .11, b % 2 ? -.2 : .2);
    }
  }
  addDelay(mix.lead, .105);
  addRoom(mix.pad, .07);
  applySidechain(mix.bass, mix.kickTimes, beat, .30);
  return { mix, bpm, bars, key: 'C# minor', title: 'TACTICAL GROOVE', hook: 'A compact five-note C#-minor signal phrase over a syncopated bass pocket.' };
}

function renderAnthem() {
  const bpm = 128, beat = 60 / bpm, bar = beat * 4, bars = 16;
  const mix = createMix(bar * bars);
  addDrums(mix, bpm, bars, 'anthem');
  const roots = [38, 34, 41, 36]; // D2, Bb1, F2, C2
  const chords = [
    [62, 65, 69, 72], // Dm(add9 color)
    [58, 62, 65, 69], // Bbmaj7
    [60, 65, 69, 72], // Fadd2
    [60, 64, 67, 72], // C
    [62, 65, 69, 72],
    [58, 62, 65, 69],
    [55, 58, 62, 65], // Gm
    [57, 60, 64, 69]  // Asus color
  ];
  const motifs = [
    [[0, 74, 1.15], [1.5, 72, .36], [2, 70, .67], [3, 65, .7]],
    [[0, 69, .62], [1, 72, .62], [2, 74, 1.65]],
    [[0, 77, .58], [.75, 76, .27], [1.5, 74, .63], [2.5, 72, .53], [3.5, 69, .37]],
    [[0, 69, .62], [1, 72, .7], [2, 74, 1.6]]
  ];
  const bassRhythm = [[0, 0, .8], [2.5, 7, .34], [3.5, 0, .3]];
  for (let b = 0; b < bars; b++) {
    const t = b * bar, phrase = b % 4, chordIndex = b % chords.length;
    addChord(mix, chords[chordIndex], t, bar * .98, b < 4 ? .13 : .16, phrase % 2 ? .07 : -.07, 'anthemPad');
    const root = roots[phrase];
    for (let i = 0; i < bassRhythm.length; i++) {
      const [step, offset, dur] = bassRhythm[i];
      const sample = bassNote(root + offset, dur * beat, 1600 + b * 19 + i);
      addSample(mix.bass, sample, t + step * beat, step === 0 ? .83 : .62, 0);
    }
    const pattern = motifs[phrase];
    for (let i = 0; i < pattern.length; i++) {
      let [step, note, dur] = pattern[i];
      // A restrained higher answer appears only in the final reprise.
      if (b >= 12 && phrase === 1 && i === 2) note += 12;
      const sample = synthNote(note, dur * beat, 'anthemLead');
      addSample(mix.lead, sample, t + step * beat, i === 0 ? .63 : .51, i % 2 ? .11 : -.11);
    }
    // Soft low octave reinforcement on selected phrase downbeats.
    if (b % 4 === 0 || b % 4 === 2) {
      const pulse = warmPulse(root + 12, .78, 1800 + b);
      addSample(mix.texture, pulse, t, .11, b % 2 ? .06 : -.06);
    }
    if (b % 4 === 3) addSample(mix.texture, metalStrike(2000 + b), t + 3.45 * beat, .085, b % 2 ? .32 : -.32);
  }
  addDelay(mix.lead, .17);
  addRoom(mix.pad, .12);
  applySidechain(mix.bass, mix.kickTimes, beat, .22);
  return { mix, bpm, bars, key: 'D minor with restrained Phrygian tension', title: 'OPERATOR ANTHEM', hook: 'A descending D-minor signal motif, opening into a measured, confident melodic rise.' };
}

function writeWav(name, mix, stemGains) {
  const out = Buffer.alloc(44 + mix.frames * 4);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22); out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(mix.frames * 4, 40);
  let peak = 0, sum = 0, env = 0;
  const threshold = Math.pow(10, -12 / 20), ceiling = Math.pow(10, -1.2 / 20);
  const bodyTarget = Math.pow(10, -14 / 20);
  for (let i = 0, o = 44; i < mix.frames; i++, o += 4) {
    let l = 0, r = 0;
    for (const [busName, gain] of Object.entries(stemGains)) {
      l += mix[busName].l[i] * gain;
      r += mix[busName].r[i] * gain;
    }
    // Linked, gentle bus compression keeps transient contrast while avoiding
    // clipping. This is not a substitute for listening review.
    const detector = Math.max(Math.abs(l), Math.abs(r));
    const coeff = detector > env ? .08 : .0009;
    env += (detector - env) * coeff;
    let comp = 1;
    if (env > threshold) comp = Math.pow(threshold / env, .36);
    l *= comp; r *= comp;
    const fade = Math.min(1, i / (sr * .012), (mix.frames - 1 - i) / (sr * .035));
    l *= fade; r *= fade;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l * l + r * r;
    const maxBeforeNorm = peak || 1;
  }
  const rms = Math.sqrt(sum / (mix.frames * 2));
  const gain = Math.min(bodyTarget / Math.max(1e-9, rms), ceiling / Math.max(1e-9, peak));
  peak = 0; sum = 0;
  env = 0;
  for (let i = 0, o = 44; i < mix.frames; i++, o += 4) {
    let l = 0, r = 0;
    for (const [busName, g] of Object.entries(stemGains)) {
      l += mix[busName].l[i] * g;
      r += mix[busName].r[i] * g;
    }
    const detector = Math.max(Math.abs(l), Math.abs(r));
    const coeff = detector > env ? .08 : .0009;
    env += (detector - env) * coeff;
    let comp = 1;
    if (env > threshold) comp = Math.pow(threshold / env, .36);
    const fade = Math.min(1, i / (sr * .012), (mix.frames - 1 - i) / (sr * .035));
    l = clamp(l * comp * fade * gain, -.999, .999);
    r = clamp(r * comp * fade * gain, -.999, .999);
    const li = Math.round(l * 32767), ri = Math.round(r * 32767);
    out.writeInt16LE(li, o); out.writeInt16LE(ri, o + 2);
    peak = Math.max(peak, Math.abs(li), Math.abs(ri));
    sum += l * l + r * r;
  }
  const file = path.join(outDir, name);
  fs.writeFileSync(file, out);
  return {
    file: name,
    bytes: out.length,
    seconds: Number((mix.frames / sr).toFixed(3)),
    sha256: crypto.createHash('sha256').update(out).digest('hex'),
    samplePeakDbfs: Number((20 * Math.log10(peak / 32768)).toFixed(2)),
    rmsDbfs: Number((20 * Math.log10(Math.sqrt(sum / (mix.frames * 2)))).toFixed(2))
  };
}

fs.mkdirSync(outDir, { recursive: true });
const groove = renderGroove();
const anthem = renderAnthem();
const files = [
  writeWav('TACTICAL-GROOVE.wav', groove.mix, { drums: .73, bass: .82, lead: .63, pad: .60, texture: .46 }),
  writeWav('OPERATOR-ANTHEM.wav', anthem.mix, { drums: .78, bass: .82, lead: .72, pad: .72, texture: .42 })
];
const metadata = {
  purpose: 'Two standalone original direction sketches; neither changes the active in-game soundtrack.',
  source: 'Local deterministic synthesis; no third-party samples, external audio, or copied melodies.',
  format: 'PCM WAV, 16-bit stereo, 44100 Hz',
  researchNotes: [
    {
      source: 'https://playvalorant.com/en-us/news/dev/end-of-year-audio-discipline/',
      principle: 'Riot describes music as one part of a coordinated game audio identity, while also protecting competitive clarity and refining the work through player feedback.'
    },
    {
      source: 'https://gameinformer.com/b/features/archive/2016/06/28/talking-tunes-with-sarah-schachner-composer-of-call-of-duty-infinite-warfare',
      principle: 'Composer Sarah Schachner describes grounding a score in the game setting and emotional role, and using cold analog synths and metallic percussion to avoid default epic-action scoring.'
    }
  ],
  previews: [
    { title: groove.title, file: files[0].file, style: 'Rhythmic and bass-led; a syncopated pocket, warm sub/mid-bass, short signal-like motif, clean snare backbeat, and sparse metal punctuation.', bpm: groove.bpm, key: groove.key, bars: groove.bars, hook: groove.hook, arrangement: 'Immediate groove and hook; bass-pocket variation; hook answers and octave lift in the final reprise.', ...files[0] },
    { title: anthem.title, file: files[1].file, style: 'Melody-led and darker; half-time operator pulse, measured tom accents, minor-key descending signal motif, and restrained low synth harmony.', bpm: anthem.bpm, key: anthem.key, bars: anthem.bars, hook: anthem.hook, arrangement: 'Hook begins immediately; the melody opens across the middle phrases and returns with a restrained final lift.', ...files[1] }
  ]
};
fs.writeFileSync(path.join(outDir, 'SIGNATURE-PREVIEW-METADATA.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata.previews.map(({ title, file, seconds, bpm, key, samplePeakDbfs, rmsDbfs, sha256, bytes }) => ({ title, file, seconds, bpm, key, samplePeakDbfs, rmsDbfs, sha256, bytes })), null, 2));
