'use strict';

// Three separate original musical sketches for direction approval. These
// previews are standalone audition files and never replace the game's theme.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'audio-previews');
const SR = 44100;
const TAU = Math.PI * 2;
fs.mkdirSync(outDir, { recursive: true });

function rng(seed) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function panScale(p) { return [Math.sqrt((1 - p) * .5), Math.sqrt((1 + p) * .5)]; }
function makeMix(seconds) { const frames = Math.round(seconds * SR); return { seconds, frames, l: new Float32Array(frames), r: new Float32Array(frames) }; }
function add(m, sample, time, level = 1, pan = 0) {
  const start = Math.round(time * SR), [gl, gr] = panScale(Math.max(-.85, Math.min(.85, pan)));
  for (let i = 0; i < sample.length && start + i < m.frames; i++) {
    const at = start + i, v = sample[i] * level;
    if (at >= 0) { m.l[at] += v * gl; m.r[at] += v * gr; }
  }
}

function kick(style, seed) {
  const random = rng(seed), seconds = style === 'sport' ? .19 : .245, n = Math.floor(seconds * SR), a = new Float32Array(n);
  let phase = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const top = style === 'sport' ? 102 : style === 'tactical' ? 75 : 84;
    const floor = style === 'sport' ? 43 : style === 'tactical' ? 39 : 41;
    phase += TAU * (floor + top * Math.exp(-t * (style === 'sport' ? 34 : 25))) / SR;
    const raw = random() * 2 - 1, click = (raw - last * .65) * Math.exp(-t * 175) * (style === 'sport' ? .32 : .23);
    last = raw;
    const body = Math.sin(phase) * Math.exp(-t * (style === 'sport' ? 15 : 10));
    const knock = Math.sin(TAU * (style === 'tactical' ? 148 : 174) * t) * Math.exp(-t * 58) * .14;
    a[i] = Math.tanh(body * (style === 'sport' ? 1.05 : 1.18) + knock + click);
  }
  return a;
}
function snare(style, seed) {
  const random = rng(seed), n = Math.floor(SR * (style === 'luxury' ? .18 : .215)), a = new Float32Array(n);
  let ph = 0, previous = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, raw = random() * 2 - 1, hp = raw - previous * .78; previous = raw;
    ph += TAU * (style === 'luxury' ? 205 : style === 'sport' ? 190 : 178) / SR;
    const clap = Math.exp(-t * 42) + .32 * Math.exp(-Math.abs(t - .012) * 160);
    const body = (Math.sin(ph) * (style === 'tactical' ? .38 : .25) + Math.sin(ph * 1.61) * .12) * Math.exp(-t * 14);
    const noise = hp * (style === 'luxury' ? .32 : .42) * Math.exp(-t * 20) * clap;
    a[i] = Math.tanh(body + noise);
  }
  return a;
}
function hat(seed, open = false, darker = false) {
  const random = rng(seed), seconds = open ? .135 : .045, n = Math.floor(SR * seconds), a = new Float32Array(n);
  let last = 0, last2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, raw = random() * 2 - 1;
    const bright = raw - last * (darker ? 1.05 : 1.21) + last2 * .31;
    last2 = last; last = raw;
    const env = Math.exp(-t * (open ? 33 : 83));
    const softTone = Math.sin(TAU * (darker ? 4300 : 6500) * t) * .09;
    a[i] = (bright * (darker ? .48 : .62) + softTone) * env;
  }
  return a;
}
function bass(note, seconds, style, seed, slide = note) {
  const random = rng(seed), n = Math.floor(SR * seconds), a = new Float32Array(n);
  let p = 0, low = 0;
  const fc = style === 'luxury' ? 680 : style === 'sport' ? 1250 : 440;
  const coeff = 1 - Math.exp(-TAU * fc / SR), target = hz(note), start = hz(slide);
  for (let i = 0; i < n; i++) {
    const t = i / SR, glide = Math.min(1, t / (style === 'sport' ? .075 : .11));
    const f = start + (target - start) * glide; p += TAU * f / SR;
    const sub = Math.sin(p);
    let upper;
    if (style === 'sport') upper = (Math.sin(p * 2.01) * .24 + Math.sin(p * 3.03) * .08 + Math.sin(p * .5) * .12);
    else if (style === 'tactical') upper = Math.sign(Math.sin(p)) * .19 + Math.sin(p * 2.01) * .14;
    else upper = Math.sin(p * 2.01) * .2 + Math.sin(p * 3.01) * .045;
    const raw = sub + upper + (random() - .5) * Math.exp(-t * 90) * .018;
    low += coeff * (raw - low);
    const attack = 1 - Math.exp(-t * (style === 'sport' ? 90 : 65));
    const decay = style === 'luxury' ? (.85 * Math.exp(-t * .65) + .15) : (.72 * Math.exp(-t * .9) + .28);
    a[i] = style === 'sport' ? Math.tanh(low * 1.15) * attack * decay : low * attack * decay;
  }
  return a;
}
function lead(note, seconds, style, seed = 1) {
  const random = rng(seed), n = Math.floor(SR * seconds), a = new Float32Array(n);
  let p1 = 0, p2 = 0, p3 = 0, low = 0;
  const base = hz(note), coeff = 1 - Math.exp(-TAU * (style === 'sport' ? 4800 : style === 'tactical' ? 1450 : 2500) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p1 += TAU * base / SR; p2 += TAU * base * 1.004 / SR; p3 += TAU * base * .997 / SR;
    let raw, env;
    if (style === 'luxury') {
      raw = Math.sin(p1) * .62 + Math.sin(p2) * .20 + Math.sin(p1 * 2) * .13 + Math.sin(p1 * 3) * .05;
      env = Math.min(1, t / .018) * Math.exp(-t * 2.4) * (1 - Math.exp(-t * 34));
    } else if (style === 'sport') {
      const saw1 = 2 * (p1 / TAU - Math.floor(p1 / TAU)) - 1;
      const saw2 = 2 * (p2 / TAU - Math.floor(p2 / TAU)) - 1;
      const saw3 = 2 * (p3 / TAU - Math.floor(p3 / TAU)) - 1;
      raw = (saw1 + saw2 + saw3) / 3;
      env = Math.min(1, t / .008) * Math.exp(-t * 3.4);
      const sweep = .75 + .25 * Math.exp(-t * 4.2);
      raw *= sweep;
    } else {
      raw = Math.sign(Math.sin(p1)) * .62 + Math.sin(p1 * 2) * .20 + Math.sin(p2) * .08;
      env = Math.min(1, t / .012) * Math.exp(-t * 3.8);
    }
    low += coeff * (raw - low);
    const transient = (random() - .5) * Math.exp(-t * 150) * (style === 'sport' ? .015 : .007);
    a[i] = (low + transient) * env;
  }
  return a;
}
function chordTone(note, seconds, style) {
  const n = Math.floor(SR * seconds), a = new Float32Array(n), f = hz(note);
  let p = 0, low = 0;
  const fc = style === 'sport' ? 1700 : style === 'tactical' ? 730 : 1150;
  const coeff = 1 - Math.exp(-TAU * fc / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR; p += TAU * f / SR;
    let raw;
    if (style === 'luxury') raw = Math.sin(p) * .62 + Math.sin(p * 2.005) * .18 + Math.sin(p * 3) * .05;
    else if (style === 'sport') raw = Math.sin(p) * .5 + Math.sin(p * 1.003) * .28 + Math.sin(p * 2) * .12;
    else raw = Math.sin(p) * .72 + Math.sin(p * 2) * .14;
    low += coeff * (raw - low);
    const env = Math.min(1, t / .04) * Math.exp(-t * (style === 'luxury' ? 1.4 : 2.5));
    a[i] = low * env;
  }
  return a;
}
function metallicHit(seed, tactical = false) {
  const random = rng(seed), n = Math.floor(SR * .34), a = new Float32Array(n);
  let p1 = 0, p2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, raw = random() * 2 - 1;
    p1 += TAU * (tactical ? 510 : 870) / SR; p2 += TAU * (tactical ? 1190 : 1470) / SR;
    const noise = raw - last * .7; last = raw;
    a[i] = (Math.sin(p1) * Math.exp(-t * (tactical ? 13 : 9)) * .33 + Math.sin(p2) * Math.exp(-t * 17) * .12 + noise * Math.exp(-t * 75) * .12);
  }
  return a;
}
function riser(seed, seconds = .7) {
  const random = rng(seed), n = Math.floor(SR * seconds), a = new Float32Array(n);
  let p = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n, f = 170 + 530 * t * t; p += TAU * f / SR;
    const raw = random() * 2 - 1, hp = raw - last * .9; last = raw;
    a[i] = (Math.sin(p) * .19 + hp * .11) * Math.pow(t, 1.65);
  }
  return a;
}
function faded(m, duration, targetRmsDb = -14) {
  const fadeN = Math.floor(SR * .62), startFade = m.frames - fadeN;
  for (let i = 0; i < m.frames; i++) {
    let env = 1;
    if (i >= startFade) { const t = (m.frames - 1 - i) / Math.max(1, fadeN); env = Math.sin(Math.max(0, t) * Math.PI * .5); }
    m.l[i] *= env; m.r[i] *= env;
  }
  let peak = 0, sum = 0;
  for (let i = 0; i < m.frames; i++) { peak = Math.max(peak, Math.abs(m.l[i]), Math.abs(m.r[i])); sum += m.l[i] ** 2 + m.r[i] ** 2; }
  const rms = Math.sqrt(sum / (m.frames * 2)), targetRms = Math.pow(10, targetRmsDb / 20), peakCeiling = Math.pow(10, -1.5 / 20);
  const gain = Math.min(targetRms / Math.max(1e-8, rms), peakCeiling / Math.max(1e-8, peak));
  const out = Buffer.alloc(44 + m.frames * 4); out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(SR,24);out.writeUInt32LE(SR*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(m.frames*4,40);
  let outPeak=0, outSum=0;
  for (let i=0,off=44;i<m.frames;i++,off+=4) {
    const l=Math.max(-.999,Math.min(.999,m.l[i]*gain)),r=Math.max(-.999,Math.min(.999,m.r[i]*gain));
    const li=Math.round(l*32767),ri=Math.round(r*32767);out.writeInt16LE(li,off);out.writeInt16LE(ri,off+2);outPeak=Math.max(outPeak,Math.abs(li),Math.abs(ri));outSum+=l*l+r*r;
  }
  return { wav: out, peakDbfs: Number((20*Math.log10(outPeak/32768)).toFixed(2)), rmsDbfs: Number((20*Math.log10(Math.sqrt(outSum/(m.frames*2)))).toFixed(2)), seconds: Number((m.frames/SR).toFixed(3)) };
}

function previewA() {
  const bpm=138, beat=60/bpm, bar=beat*4, bars=10, m=makeMix(bar*bars);
  const kicks=Array.from({length:3},(_,i)=>kick('luxury',100+i)), snares=Array.from({length:3},(_,i)=>snare('luxury',220+i));
  const hats=Array.from({length:4},(_,i)=>hat(350+i,false,true)), open=hat(777,true,true), bellNotes=new Map();
  for(const n of [57,61,64,66,68,69,71,73,76,78])bellNotes.set(n,lead(n,.48,'luxury',n));
  const roots=[37,33,40,35], answer=[[61,64,68,69,68,64],[64,68,71,69,68,64]];
  for(let b=0;b<bars;b++){
    const root=roots[b%4], time=b*bar;
    for(const [k,t] of [[0,0],[2.5,.05],...(b%2===1?[[3.75,.04]]:[])]){add(m,kicks[Math.floor(b+k)%3],time+k*beat, .83,0);add(m,bass(root, .78,'luxury',b*7+k),time+k*beat+t,.73,0);}
    for(const bt of [1,3])add(m,snares[(b+bt)%3],time+bt*beat,.65,b%2?.025:-.025);
    for(let e=0;e<8;e++){const swing=(e%2===1?.016:0), useOpen=(e===7&&b%2===1);add(m,useOpen?open:hats[(b+e)%4],time+e*beat/2+swing,useOpen?.36:(e%2?.29:.4),e%2?.12:-.12);}
    const phrase=answer[b%2];const steps=b%2?[0,.75,1.5,2.5,3.1,3.6]:[0,.75,1.5,2.25,3,3.5];
    for(let i=0;i<phrase.length;i++){const note=phrase[i];const sample=bellNotes.get(note);add(m,sample,time+steps[i]*beat,(i===0?.72:.52),(i%3-1)*.13);add(m,sample,time+steps[i]*beat+.105,(i===0?.12:.09),-(i%3-1)*.13);}
    const chord=[root+24,root+28,root+31];for(let i=0;i<chord.length;i++)add(m,chordTone(chord[i],.52,'luxury'),time+(i===0?0:1.95*beat),.105,(i-1)*.2);
    if(b===7||b===9)add(m,metallicHit(800+b),time+3.65*beat,.16,b%2?.2:-.2);
  }
  return {m,bpm,bars,key:'C# minor',name:'A — DARK LUXURY PHONK',description:'Warm round bass, relaxed syncopation, muted glassy hook and sparse hats.'};
}
function previewB() {
  const bpm=144, beat=60/bpm, bar=beat*4, bars=11, m=makeMix(bar*bars);
  const kicks=Array.from({length:4},(_,i)=>kick('sport',1200+i)), snares=Array.from({length:4},(_,i)=>snare('sport',1400+i));
  const hats=Array.from({length:4},(_,i)=>hat(1600+i,false,false)), open=hat(1701,true,false), leadCache=new Map();
  for(const n of [72,74,76,77,79,81,84,86,88,89,91,93,96])leadCache.set(n,lead(n,.33,'sport',n));
  const roots=[38,34,41,36], arp=[74,77,81,84,81,79,77,72];
  for(let b=0;b<bars;b++){
    const time=b*bar, root=roots[b%4];
    for(let q=0;q<4;q++){add(m,kicks[(b+q)%4],time+q*beat,q===0?.82:.72,0);}
    for(const bt of [1,3])add(m,snares[(b+bt)%4],time+bt*beat,.62,bt===1?-.035:.035);
    for(let e=0;e<8;e++){const useOpen=(e===7&&b%2===1);add(m,useOpen?open:hats[(e+b)%4],time+e*beat/2,useOpen?.37:(e%2?.28:.39),(e%3-1)*.17);}
    // A rising, phrase-based eighth-note figure; later bars lift an octave.
    for(let e=0;e<8;e++){
      const lift=b>=7&&e>=4?12:0, note=arp[(e+(b%2?2:0))%arp.length]+lift;
      const sample=leadCache.get(Math.min(96,note));
      add(m,sample,time+e*beat/2,.37,e%2?.16:-.16);
      if(e===2||e===6)add(m,sample,time+e*beat/2+.075,.1,e%2?-.22:.22);
    }
    for(let e=0;e<4;e++){const slide=(b%4===3&&e===3)?root+7:root;add(m,bass(root+12,.28,'sport',b*11+e,slide),time+(e+.5)*beat,.53,0);}
    const chord=[root+24,root+31,root+35];for(let i=0;i<chord.length;i++)add(m,chordTone(chord[i],.38,'sport'),time+(i===0?0:2.0*beat),.09,(i-1)*.18);
    if([3,7,10].includes(b))add(m,riser(1900+b,.66),time+bar-.66,.34,b%2?.12:-.12);
    if(b===5||b===10)for(let j=0;j<4;j++)add(m,snares[(j+b)%4],time+3*beat+j*beat/8,.22,(j%2?.12:-.12));
  }
  return {m,bpm,bars,key:'D minor',name:'B — SUPERBIKE ELECTRONIC',description:'Sleek four-on-floor punch, rising saw-arp hook and acceleration-shaped transitions; no engine sample.'};
}
function previewC() {
  const bpm=132, beat=60/bpm, bar=beat*4, bars=10, m=makeMix(bar*bars);
  const kicks=Array.from({length:3},(_,i)=>kick('tactical',2400+i)), snares=Array.from({length:3},(_,i)=>snare('tactical',2600+i));
  const hats=Array.from({length:4},(_,i)=>hat(2800+i,false,true)), open=hat(2888,true,true), leads=new Map();
  for(const n of [60,63,65,68,70,72,75,77,80,82,84,85,87,89,91])leads.set(n,lead(n,.3,'tactical',n));
  const roots=[41,37,32,36], riff=[[77,72,75,72],[75,72,70,68],[72,75,77,75],[70,68,72,75]];
  for(let b=0;b<bars;b++){
    const time=b*bar, root=roots[b%4];
    for(const [k,vel] of [[0,.9],[2.5,.67],...(b%2===1?[[3.5,.45]]:[])]){add(m,kicks[Math.floor(b+k)%3],time+k*beat,vel,0);add(m,bass(root,.58,'tactical',b*17+k),time+k*beat+.02,.8,0);}
    for(const bt of [1,3])add(m,snares[(b+bt)%3],time+bt*beat,.72,bt===1?-.02:.02);
    for(let e=0;e<8;e++){const openHit=e===7&&b%2===1;add(m,openHit?open:hats[(b+e)%4],time+e*beat/2,openHit?.28:(e%2?.21:.3),e%2?.13:-.13);}
    const line=riff[b%4];for(let i=0;i<line.length;i++){const note=line[i]+(b>=8&&i===2?12:0);add(m,leads.get(Math.min(91,note)),time+[0,.9,2,3.15][i]*beat,.42,(i%2?-.14:.14));}
    const chord=[root+24,root+27,root+31];for(let i=0;i<chord.length;i++)add(m,chordTone(chord[i],.6,'tactical'),time+(i===0?0:2.05*beat),.12,(i-1)*.18);
    if(b%2===0)add(m,metallicHit(3000+b,true),time+bar-.03,.22,b%4===0?-.24:.24);
    if(b===3||b===7)add(m,riser(3300+b,.48),time+bar-.48,.18,b%2?.12:-.12);
  }
  return {m,bpm,bars,key:'F minor',name:'C — TACTICAL PREMIUM ELECTRONIC',description:'Half-time tactical pulse, restrained metal accents, low pulse bass and clipped minor-key motif.'};
}

function writePreview(track, filename) {
  // Keep short concepts near the same audition loudness without heavy limiting.
  const mastered=faded(track.m,track.m.seconds,-16.8), target=path.join(outDir,filename);
  fs.writeFileSync(target,mastered.wav);
  return {file:filename,title:track.name,style:track.description,bpm:track.bpm,key:track.key,durationSeconds:mastered.seconds,peakDbfs:mastered.peakDbfs,rmsDbfs:mastered.rmsDbfs,sha256:crypto.createHash('sha256').update(mastered.wav).digest('hex'),bytes:mastered.wav.length};
}

const results=[writePreview(previewA(),'A-dark-luxury-phonk.wav'),writePreview(previewB(),'B-superbike-electronic.wav'),writePreview(previewC(),'C-tactical-premium-electronic.wav')];
fs.writeFileSync(path.join(outDir,'PREVIEW-METADATA.json'),JSON.stringify({original:true,sourceSynthesis:'Local deterministic Node.js synthesis; no third-party samples or copied melodies.',comparisonPurpose:'Direction previews only. No file is wired to the game; the current lobby soundtrack remains unchanged.',previews:results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
