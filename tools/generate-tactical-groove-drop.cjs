'use strict';

// Reworks the selected Tactical Groove direction into a 36-second preview.
// The opening four bars are sourced from the approved comparison WAV; all
// later music is an original local synthesis arrangement. This does not alter
// the game's active soundtrack or playback integration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'audio-previews');
const sourceFile = path.join(outDir, 'TACTICAL-GROOVE.wav');
const outputFile = path.join(outDir, 'TACTICAL-GROOVE-PHONK-DROP.wav');
const sr = 44100, tau = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const panGains = p => [Math.sqrt((1 - p) * .5), Math.sqrt((1 + p) * .5)];

function rng(seed) {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
function mixFor(seconds) {
  const frames = Math.ceil(seconds * sr), bus = () => ({ l: new Float32Array(frames), r: new Float32Array(frames) });
  return { frames, source: bus(), drums: bus(), bass: bus(), lead: bus(), pad: bus(), texture: bus(), kickTimes: [] };
}
function add(bus, sample, time, gain, pan = 0) {
  const start = Math.round(time * sr);
  if (start < 0 || start >= bus.l.length) return;
  const [gl, gr] = panGains(clamp(pan, -.75, .75));
  const n = Math.min(sample.length, bus.l.length - start);
  for (let i = 0; i < n; i++) {
    bus.l[start + i] += sample[i] * gain * gl;
    bus.r[start + i] += sample[i] * gain * gr;
  }
}
function readPcmWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a RIFF/WAVE file.');
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4), body = p + 8;
    if (id === 'fmt ') fmt = { encoding: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === 'data') data = { offset: body, size };
    p = body + size + (size & 1);
  }
  if (!fmt || !data || fmt.encoding !== 1 || fmt.channels !== 2 || fmt.rate !== sr || fmt.bits !== 16) throw new Error('Expected stereo 44.1 kHz 16-bit PCM source.');
  return { b, fmt, data };
}

const voiceCache = new Map();
function voice(midi, seconds, kind = 'dropLead') {
  const key = kind + ':' + midi + ':' + Math.round(seconds * 1000);
  if (voiceCache.has(key)) return voiceCache.get(key);
  const type = kind === 'buildLead'
    ? { atk: .026, dec: .22, sus: .42, rel: .16, cutoff: 2300, det: .002, harm: .2 }
    : { atk: .012, dec: .17, sus: .32, rel: .14, cutoff: 3000, det: .003, harm: .25 };
  const n = Math.ceil((seconds + type.rel) * sr), out = new Float32Array(n), f = hz(midi);
  let p1 = 0, p2 = 0, lp1 = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    p1 += tau * f / sr; p2 += tau * f * (1 + type.det) / sr;
    const brightness = .82 * Math.exp(-t * 3.8) + .18;
    const c = 1 - Math.exp(-tau * type.cutoff * brightness / sr);
    const a = Math.sin(p1) * .72 + Math.sin(2 * p1) * type.harm + Math.sin(3 * p1) * .055;
    const b = Math.sin(p2) * .72 + Math.sin(2 * p2) * type.harm + Math.sin(3 * p2) * .055;
    lp1 += c * (a - lp1); lp2 += c * (b - lp2);
    let env;
    if (t < type.atk) env = t / type.atk;
    else if (t < type.atk + type.dec) env = 1 + (type.sus - 1) * ((t - type.atk) / type.dec);
    else if (t < seconds) env = type.sus;
    else env = type.sus * Math.max(0, 1 - (t - seconds) / type.rel);
    out[i] = (lp1 * .68 + lp2 * .32) * env;
  }
  voiceCache.set(key, out);
  return out;
}
function bass808(midi, seconds, seed, glideMidi = null) {
  const rand = rng(seed), n = Math.ceil((seconds + .09) * sr), out = new Float32Array(n);
  const target = hz(midi), start = glideMidi == null ? target : hz(glideMidi);
  let phase = 0, lp = 0;
  const coeff = 1 - Math.exp(-tau * 900 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = start + (target - start) * Math.min(1, t / .075);
    phase += tau * f / sr;
    const sub = Math.sin(phase), second = Math.sin(phase * 2.004) * .34, third = Math.sin(phase * 3.012) * .075;
    const edge = (rand() - .5) * Math.exp(-t * 105) * .012;
    lp += coeff * (sub * .72 + second + third + edge - lp);
    const env = Math.min(1, t / .012) * (t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / .09));
    out[i] = Math.tanh(lp * 1.18) * env;
  }
  return out;
}
function snare(seed, weight = 1) {
  const rand = rng(seed), n = Math.floor(sr * .245), out = new Float32Array(n);
  let prev = 0, p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1, hp = x - prev * .84;
    prev = x; p += tau * 188 / sr;
    const body = Math.sin(p) * Math.exp(-t * 16) * .25 + Math.sin(p * 1.6) * Math.exp(-t * 27) * .10;
    out[i] = body + hp * Math.exp(-t * 27) * .32 * weight;
  }
  return out;
}
function hat(seed, open = false) {
  const rand = rng(seed), n = Math.floor(sr * (open ? .105 : .048)), out = new Float32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1, hp = x - a * 1.06 + b * .2;
    b = a; a = x;
    out[i] = (hp * .26 + Math.sin(tau * 6200 * t) * .018) * Math.exp(-t * (open ? 36 : 88));
  }
  return out;
}
function metal(seed, low = false) {
  const rand = rng(seed), n = Math.floor(sr * .42), out = new Float32Array(n);
  let p1 = 0, p2 = 0, p3 = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1, noise = x - prev * .84;
    prev = x;
    p1 += tau * (low ? 308 : 421) / sr;
    p2 += tau * (low ? 517 : 697) / sr;
    p3 += tau * (low ? 773 : 1033) / sr;
    out[i] = noise * Math.exp(-t * 88) * .035 +
      (Math.sin(p1) * .22 + Math.sin(p2) * .12 + Math.sin(p3) * .06) * Math.exp(-t * 8);
  }
  return out;
}
function tom(seed, midi) {
  const rand = rng(seed), n = Math.floor(sr * .28), out = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    p += tau * (hz(midi) * (1 + .1 * Math.exp(-t * 23))) / sr;
    out[i] = Math.sin(p) * Math.exp(-t * 9.5) + (rand() - .5) * Math.exp(-t * 100) * .035;
  }
  return out;
}
function filteredRise(seed, seconds) {
  const rand = rng(seed), n = Math.floor(sr * seconds), out = new Float32Array(n);
  let prev = 0, phase = 0, low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, x = rand() * 2 - 1, hp = x - prev * .9;
    prev = x;
    phase += tau * (175 + t * 230) / sr;
    const c = 1 - Math.exp(-tau * (450 + t * 2100) / sr);
    low += c * (hp - low);
    out[i] = (low * .10 + Math.sin(phase) * .12) * Math.pow(t, 1.35);
  }
  return out;
}
function addSidechain(bus, kickTimes, release = .23, depth = .3) {
  for (const at of kickTimes) {
    const from = Math.max(0, Math.floor(at * sr));
    const to = Math.min(bus.l.length, Math.ceil((at + release * 3.2) * sr));
    for (let i = from; i < to; i++) {
      const t = i / sr - at, g = 1 - depth * Math.exp(-Math.max(0, t) / release);
      bus.l[i] *= g; bus.r[i] *= g;
    }
  }
}
function addChord(bus, notes, time, duration, gain) {
  const pans = [-.42, -.16, .16, .42, .52];
  notes.forEach((n, i) => add(bus, voice(n, duration, 'buildLead'), time, gain / Math.sqrt(notes.length), pans[i % pans.length]));
}
function applySmallDelay(bus) {
  const taps = [[.17, .14], [.29, .07]];
  for (const [seconds, gain] of taps) {
    const d = Math.floor(seconds * sr);
    for (let i = bus.l.length - d - 1; i >= 0; i--) {
      bus.l[i + d] += bus.r[i] * gain;
      bus.r[i + d] += bus.l[i] * gain;
    }
  }
}

function render() {
  const bpm = 132, beat = 60 / bpm, bar = beat * 4, bars = 20;
  const mix = mixFor(bar * bars);
  const source = readPcmWav(sourceFile);
  const introFrames = Math.floor(bar * 4 * sr);
  for (let i = 0, o = source.data.offset; i < introFrames; i++, o += 4) {
    mix.source.l[i] = source.b.readInt16LE(o) / 32768;
    mix.source.r[i] = source.b.readInt16LE(o + 2) / 32768;
  }

  const roots = [25, 21, 28, 23]; // C#1, A0, E1, B0: sub with audible harmonics
  const originalRoots = [37, 33, 40, 35]; // same bass identity as the approved preview
  const chordNotes = [
    [61, 64, 68, 71, 75], [57, 61, 64, 68, 71],
    [59, 64, 68, 71], [59, 63, 66, 71]
  ];
  const motif = [
    [[0, 73, .43], [.72, 76, .25], [1.38, 80, .5], [2.18, 78, .28], [2.72, 76, .48], [3.48, 73, .32]],
    [[0, 68, .42], [.72, 73, .33], [1.48, 76, .45], [2.25, 71, .32], [2.82, 68, .35], [3.48, 71, .3]],
    [[0, 76, .34], [.55, 80, .45], [1.35, 83, .42], [2.02, 80, .28], [2.58, 78, .42], [3.35, 76, .4]],
    [[0, 66, .48], [.8, 73, .32], [1.5, 76, .45], [2.25, 71, .32], [3, 68, .3], [3.5, 73, .38]]
  ];
  const dropKick = Array.from({ length: 8 }, (_, i) => dropKickSample(500 + i));
  const snareSamples = Array.from({ length: 8 }, (_, i) => snare(700 + i));
  const hats = Array.from({ length: 8 }, (_, i) => hat(900 + i));
  const openHat = hat(999, true);
  const toms = [tom(111, 38), tom(112, 45), tom(113, 50)];
  const metalSamples = [metal(1201), metal(1202, true), metal(1203)];

  // BUILD: bars 4-5 (7.27s-10.91s). Thin the groove, reprise the hook,
  // add a restrained tonal rise and a short snare/hat pickup into the drop.
  for (let b = 4; b < 6; b++) {
    const t = b * bar, ph = b % 4;
    addChord(mix.pad, chordNotes[ph], t, bar, .13);
    if (b === 4) {
      const k = t;
      mix.kickTimes.push(k);
      add(mix.drums, dropKick[0], k, .56, 0);
      add(mix.bass, bass808(originalRoots[0] - 12, beat * 1.25, 410, null), t, .42, 0);
      for (const [step, note, dur] of motif[0]) add(mix.lead, voice(note, dur * beat, 'buildLead'), t + step * beat, .28, step % 1 ? .07 : -.07);
    } else {
      add(mix.bass, bass808(roots[1], beat * 1.8, 411), t, .38, 0);
      // Hold the original phrase's top note while the low-end pulls away.
      add(mix.lead, voice(80, beat * 1.25, 'buildLead'), t + beat * .45, .32, 0);
      add(mix.lead, voice(76, beat * .75, 'buildLead'), t + beat * 2.2, .26, -.08);
      add(mix.texture, filteredRise(1401, bar * .92), t, .55, 0);
      // Four stepped snare notes, then a compact sixteenth-note pickup.
      for (const step of [1, 2, 3]) add(mix.drums, snareSamples[(b + step) % 8], t + step * beat, .21 + step * .035, 0);
      for (let j = 0; j < 8; j++) {
        const at = t + 3 * beat + j * beat / 8;
        add(mix.drums, hats[(j + b) % hats.length], at, .13 + j * .008, j % 2 ? .12 : -.12);
      }
      add(mix.texture, metalSamples[0], t + 3.55 * beat, .10, .18);
    }
  }

  // Main drop begins at bar 6, about 10.91s. It keeps the original phrase
  // and harmonic progression but switches to a denser kick/808 pocket.
  for (let b = 6; b < 14; b++) {
    const t = b * bar, ph = b % 4, root = roots[ph];
    const pattern = [
      [0, 1], [0, 2.5, 3.5], [0, 1.75, 2.75], [0, 2.5, 3.25]
    ][ph];
    for (let j = 0; j < pattern.length; j++) {
      const at = t + pattern[j] * beat;
      mix.kickTimes.push(at);
      add(mix.drums, dropKick[(b + j) % dropKick.length], at, j === 0 ? .84 : .69, 0);
    }
    for (const step of [1, 3]) add(mix.drums, snareSamples[(b + step) % 8], t + step * beat, .58, step === 1 ? -.035 : .035);
    for (let e = 0; e < 8; e++) {
      const at = t + e * beat / 2 + (e % 2 ? .012 : 0);
      const isOpen = e === 7 && b % 2 === 1;
      add(mix.drums, isOpen ? openHat : hats[(b + e) % hats.length], at, isOpen ? .24 : (e % 2 ? .17 : .24), e % 2 ? .14 : -.14);
    }
    // Rolls occur only at phrase turns, with room for the main hook.
    if (ph === 3) for (let j = 0; j < 8; j++) {
      add(mix.drums, hats[(j + b) % hats.length], t + 3 * beat + j * beat / 8, .12 + (j % 2) * .025, j % 2 ? -.17 : .17);
    }
    const bassSteps = [
      [[0, 0, .92], [1.5, 7, .29], [2.5, 0, .52], [3.5, 12, .24]],
      [[0, 0, .78], [1.75, 7, .30], [2.5, 0, .5], [3.5, -2, .24]],
      [[0, 0, .84], [1.5, 7, .32], [2.75, 12, .28], [3.5, 7, .2]],
      [[0, 0, .78], [1.5, 7, .28], [2.5, 0, .48], [3.25, -1, .28]]
    ][ph];
    for (let j = 0; j < bassSteps.length; j++) {
      const [step, interval, dur] = bassSteps[j];
      const midi = root + interval;
      const glide = (ph === 3 && j === 3) ? midi + 1 : null;
      add(mix.bass, bass808(midi, dur * beat, 1500 + b * 13 + j, glide), t + step * beat, step === 0 ? .82 : .65, 0);
    }
    addChord(mix.pad, chordNotes[ph], t, bar * .9, b % 4 === 0 ? .10 : .075);
    for (let j = 0; j < motif[ph].length; j++) {
      const [step, note, dur] = motif[ph][j];
      add(mix.lead, voice(note, dur * beat, 'dropLead'), t + step * beat, j === 0 ? .50 : .43, j % 2 ? .095 : -.095);
      if (b >= 10 && (j === 0 || j === 4)) {
        // A restrained octave answer develops the familiar hook at the drop's
        // second pass instead of adding an unrelated melody.
        add(mix.lead, voice(note + 12, dur * beat * .75, 'dropLead'), t + step * beat + .12, .17, j === 0 ? .25 : -.25);
      }
    }
    if (ph === 1 || ph === 3) add(mix.texture, metalSamples[ph === 1 ? 1 : 2], t + (ph === 1 ? 3.45 : 3.25) * beat, .085, ph === 1 ? -.28 : .28);
    if (ph === 2) add(mix.drums, toms[b % 3], t + 3.5 * beat, .16, .08);
  }

  // Two-bar release/reset before a final four-bar reprise keeps the payoff
  // musical and lets the hook breathe without losing the pulse.
  for (let b = 14; b < 16; b++) {
    const t = b * bar, ph = b % 4;
    addChord(mix.pad, chordNotes[ph], t, bar, .10);
    add(mix.bass, bass808(roots[ph], beat * 1.8, 2000 + b), t, .38, 0);
    if (b === 14) {
      for (const step of [0, 2]) {
        const at = t + step * beat;
        mix.kickTimes.push(at);
        add(mix.drums, dropKick[2], at, .45, 0);
      }
      for (const [step, note, dur] of motif[2]) add(mix.lead, voice(note, dur * beat, 'buildLead'), t + step * beat, .26, 0);
    } else {
      add(mix.texture, filteredRise(2001, bar * .96), t, .30, 0);
      for (let j = 0; j < 8; j++) add(mix.drums, hats[j], t + 3 * beat + j * beat / 8, .12 + j * .006, j % 2 ? .12 : -.12);
      add(mix.lead, voice(80, beat * 1.25, 'buildLead'), t + beat * .6, .28, 0);
    }
  }

  // Final 4-bar reprise: same C#-minor motif and drop groove, resolved on C#.
  for (let b = 16; b < 20; b++) {
    const t = b * bar, ph = b % 4, root = roots[ph];
    for (const step of [0, 1.75, 2.5, 3.5]) {
      const at = t + step * beat;
      if (step !== 1.75 || ph % 2 === 0) {
        mix.kickTimes.push(at);
        add(mix.drums, dropKick[(b + Math.floor(step)) % dropKick.length], at, step === 0 ? .82 : .64, 0);
      }
    }
    for (const step of [1, 3]) add(mix.drums, snareSamples[(b + step) % 8], t + step * beat, .56, 0);
    for (let e = 0; e < 8; e++) add(mix.drums, hats[(b + e) % hats.length], t + e * beat / 2 + (e % 2 ? .012 : 0), e % 2 ? .16 : .23, e % 2 ? .12 : -.12);
    for (const [step, interval, dur] of [[0, 0, .9], [1.5, 7, .3], [2.5, 0, .5], [3.5, ph === 3 ? 0 : 12, .28]]) {
      add(mix.bass, bass808(root + interval, dur * beat, 2300 + b * 9 + step, null), t + step * beat, step === 0 ? .8 : .62, 0);
    }
    addChord(mix.pad, chordNotes[ph], t, bar * .95, .105);
    for (let j = 0; j < motif[ph].length; j++) {
      const [step, note, dur] = motif[ph][j];
      const finalResolve = b === 19 && j === motif[ph].length - 1;
      add(mix.lead, voice(note, (finalResolve ? .48 : dur) * beat, 'dropLead'), t + step * beat, j === 0 ? .5 : .43, j % 2 ? .09 : -.09);
      if (b >= 18 && (j === 0 || j === 4)) add(mix.lead, voice(note + 12, dur * beat * .72, 'dropLead'), t + step * beat + .1, .15, j % 2 ? -.23 : .23);
    }
    if (ph === 3) {
      for (let j = 0; j < 8; j++) add(mix.drums, hats[j], t + 3 * beat + j * beat / 8, .13 + (j % 2) * .02, j % 2 ? .16 : -.16);
    }
    if (ph === 3) add(mix.texture, metalSamples[0], t + 3.45 * beat, .075, .22);
  }

  addSidechain(mix.bass, mix.kickTimes, .20, .34);
  applySmallDelay(mix.lead);
  return { mix, bpm, bars, dropSeconds: Number((6 * bar).toFixed(3)), seconds: bar * bars };
}

function dropKickSample(seed) { return dropKick(seed); }
function dropKick(seed) {
  const rand = rng(seed), n = Math.floor(sr * .245), out = new Float32Array(n);
  let phase = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = rand() * 2 - 1;
    phase += tau * (103 * Math.exp(-t * 21) + 42) / sr;
    const transient = (x - prev * .78) * Math.exp(-t * 165) * .105;
    prev = x;
    out[i] = Math.sin(phase) * Math.exp(-t * 9.3) + Math.sin(tau * 142 * t) * Math.exp(-t * 48) * .08 + transient;
  }
  return out;
}

function writeOutput(mix) {
  const out = Buffer.alloc(44 + mix.frames * 4);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22); out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(mix.frames * 4, 40);
  const gains = { source: 1, drums: .83, bass: .77, lead: .68, pad: .52, texture: .42 };
  const threshold = Math.pow(10, -11.5 / 20), ceiling = Math.pow(10, -1.35 / 20);
  let env = 0, peak = 0, sum = 0;
  // First pass finds the post-compressor peak for a clean final gain stage.
  for (let i = 0; i < mix.frames; i++) {
    let l = 0, r = 0;
    for (const [name, g] of Object.entries(gains)) { l += mix[name].l[i] * g; r += mix[name].r[i] * g; }
    const d = Math.max(Math.abs(l), Math.abs(r)), c = d > env ? .06 : .0011;
    env += (d - env) * c;
    const comp = env > threshold ? Math.pow(threshold / env, .35) : 1;
    const fade = Math.min(1, i / (sr * .01), (mix.frames - 1 - i) / (sr * .04));
    l *= comp * fade; r *= comp * fade;
    peak = Math.max(peak, Math.abs(l), Math.abs(r)); sum += l * l + r * r;
  }
  // Use available headroom up to the fixed true sample-peak ceiling. The
  // arrangement supplies the drop's energy; this only avoids an unnecessarily
  // quiet preview master.
  const gain = ceiling / Math.max(1e-9, peak);
  env = 0; peak = 0; sum = 0;
  for (let i = 0, o = 44; i < mix.frames; i++, o += 4) {
    let l = 0, r = 0;
    for (const [name, g] of Object.entries(gains)) { l += mix[name].l[i] * g; r += mix[name].r[i] * g; }
    const d = Math.max(Math.abs(l), Math.abs(r)), c = d > env ? .06 : .0011;
    env += (d - env) * c;
    const comp = env > threshold ? Math.pow(threshold / env, .35) : 1;
    const fade = Math.min(1, i / (sr * .01), (mix.frames - 1 - i) / (sr * .04));
    l = clamp(l * comp * fade * gain, -.999, .999);
    r = clamp(r * comp * fade * gain, -.999, .999);
    const li = Math.round(l * 32767), ri = Math.round(r * 32767);
    out.writeInt16LE(li, o); out.writeInt16LE(ri, o + 2);
    peak = Math.max(peak, Math.abs(li), Math.abs(ri)); sum += l * l + r * r;
  }
  fs.writeFileSync(outputFile, out);
  return {
    file: path.basename(outputFile), bytes: out.length,
    seconds: Number((mix.frames / sr).toFixed(3)),
    samplePeakDbfs: Number((20 * Math.log10(peak / 32768)).toFixed(2)),
    rmsDbfs: Number((20 * Math.log10(Math.sqrt(sum / (mix.frames * 2)))).toFixed(2)),
    sha256: crypto.createHash('sha256').update(out).digest('hex')
  };
}

fs.mkdirSync(outDir, { recursive: true });
const result = render();
const file = writeOutput(result.mix);
const meta = {
  title: 'TACTICAL GROOVE — PHONK DROP',
  purpose: 'A standalone direction preview; it does not replace the active game soundtrack.',
  sourceFoundation: 'The first four bars are copied from the selected TACTICAL-GROOVE.wav preview. Later sections retain its C#-minor motif and bass progression while adding an original drop arrangement.',
  originalComposition: 'The additional bass, drums, lead variations and transition are synthesized locally; no external samples or copied melodies.',
  format: 'PCM WAV, 16-bit stereo, 44100 Hz',
  tempoBpm: result.bpm,
  key: 'C# minor',
  bars: result.bars,
  durationSeconds: file.seconds,
  dropBeginsSeconds: result.dropSeconds,
  structure: [
    '0:00–0:07.27 — exact opening four bars from the approved Tactical Groove preview.',
    '0:07.27–0:10.91 — two-bar tension build with a short snare/hat pickup.',
    '0:10.91–0:25.45 — first phonk-inspired drop: tighter kick pattern, harmonically rich 808, motif variation, selective hat rolls and restrained industrial accents.',
    '0:25.45–0:29.09 — two-bar reduced-energy reset that preserves the pulse.',
    '0:29.09–0:36.36 — final four-bar drop reprise and C#-minor resolution.'
  ],
  subjectiveListeningAcceptance: 'Pending user listening; technical measurements do not establish musical quality.',
  ...file
};
fs.writeFileSync(path.join(outDir, 'TACTICAL-GROOVE-PHONK-DROP-METADATA.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta, null, 2));
