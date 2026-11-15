'use strict';

// One-time, source-pinned Play-screen layout migration. This only rearranges
// existing menu markup; mode, map, and deploy handlers remain attached to the
// same IDs/data attributes in both production entrypoints.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const pages = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
];
const expected = new Map([
  [pages[0], '4ca163bab458d923913ff5e4391bca876e53ca70ca7d5026388d13f48aa232a4'],
  [pages[1], 'a488e9098c034c4bbd808a81ef702e9de502c9218a498afc7e42d53fd2831a43']
]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const newMarkup = [
  '<div class="mn-panel image2-lobby lobby-deployment-strip-layout" id="pn-play" role="tabpanel" aria-label="Play">',
  '  <section class="lobby-title-block" aria-labelledby="ov-title"><span class="lobby-eyebrow">SIGHTLINE  /  READY ROOM</span><header class="pn-h"><h2 id="ov-title">READY FOR DEPLOYMENT</h2></header><p id="ov-text">Choose a mission and prepare your squad.</p></section>',
  '  <div class="lobby-scene-breathing-space" aria-hidden="true"></div>',
  '  <section class="lobby-deployment-strip" aria-label="Mission deployment">',
  '    <section class="lobby-mode-deck" aria-label="Mission selection"><div class="mode-header"><span class="mode-label">SELECT MISSION</span></div><div class="mode-grid" id="mode-select" role="group" aria-label="Solo game mode"></div><div class="mode-brief" id="mode-brief" aria-live="polite"></div></section>',
  '    <div class="lobby-strip-actions">',
  '      <aside class="lobby-ready-rail" aria-label="Selected map"><div class="play-map-card"><div class="play-map-card-head"><div><span class="lobby-mini-label">MAP</span><strong id="play-map-name">Courtyard</strong></div><span id="play-map-tag">CLASSIC YARD</span></div><div id="play-map-preview" aria-hidden="true"></div><button type="button" class="play-map-open" data-go="map" aria-label="Change selected map"><span>MAPS</span><b aria-hidden="true">↗</b></button></div><div class="pl-sum" id="pl-sum"></div></aside>',
  '      <div class="lobby-deploy-row"><div class="lobby-deploy-note"><span class="lobby-status-dot" aria-hidden="true"></span><span id="ov-note">Deploy to begin the operation.</span></div><div class="btnrow"><button class="btn" id="btn-start" type="button">DEPLOY</button><button class="btn ghost" id="btn-restart" type="button" hidden>Restart match</button><button class="btn ghost" id="btn-quit" type="button" hidden>Quit to menu</button></div></div>',
  '    </div>',
  '  </section>',
  '</div>'
].join('\n');

const css = [
  '/* Deployment Strip: one calm, persistent control surface; game scene remains the visual hero. */',
  'body.sl-lobby-screen[data-sl-route=play] #ov-start .mn::before{background:linear-gradient(90deg,rgba(5,9,9,.82) 0%,rgba(5,9,9,.58) 25%,rgba(5,9,9,.18) 48%,transparent 68%),linear-gradient(0deg,rgba(5,9,9,.24),transparent 24%);}',
  'body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-main{overflow:hidden;padding:0 clamp(14px,3vw,48px);}',
  '#ov-start #pn-play.lobby-deployment-strip-layout{position:relative;inset:auto;display:grid;flex:1 1 0;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;align-self:stretch;width:100%;height:100%;min-width:0;min-height:0;max-width:none;overflow:visible;padding:0 0 clamp(8px,1.4vh,16px);}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-title-block{grid-column:1;grid-row:1;align-self:start;width:min(100%,37rem);margin:clamp(12px,2.2vh,24px) 0 0;padding:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-eyebrow{margin:0 0 6px;color:#c9b17d;font-size:.61rem;letter-spacing:.15em;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .pn-h h2{width:auto;max-width:none;font-size:clamp(1.2rem,1.75vw,1.65rem);line-height:1;letter-spacing:.06em;white-space:nowrap;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout #ov-text{max-width:42ch;margin:8px 0 0;color:#e0e4dc;font-size:clamp(.78rem,.95vw,.94rem);line-height:1.4;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-scene-breathing-space{grid-column:1;grid-row:2;min-height:0;pointer-events:none;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deployment-strip{grid-column:1;grid-row:3;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,390px);align-items:center;gap:clamp(12px,2vw,28px);box-sizing:border-box;width:100%;min-width:0;padding:9px 12px;border:1px solid rgba(219,214,193,.2);border-top:1px solid rgba(211,173,112,.52);border-radius:3px;background:linear-gradient(100deg,rgba(7,13,13,.9),rgba(10,17,17,.94));box-shadow:0 9px 28px rgba(0,0,0,.2);}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-mode-deck{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto;gap:5px;width:100%;min-width:0;padding:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-header{min-height:14px;margin:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-label{color:#b9c3b9;font-size:.56rem;letter-spacing:.14em;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;width:100%;min-width:0;overflow:visible;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{position:relative;display:flex;align-items:center;justify-content:flex-start;gap:7px;box-sizing:border-box;width:100%;min-width:0;min-height:48px;padding:6px 8px;border:0;border-bottom:2px solid transparent;border-radius:2px;background:rgba(255,255,255,.025);box-shadow:none;text-align:left;white-space:normal;writing-mode:horizontal-tb;transition:background .14s,border-color .14s;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice::before{display:none;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice-head{display:flex;flex:0 0 auto;flex-direction:row;align-items:center;justify-content:center;gap:0;width:auto;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-glyph{width:21px;height:21px;color:#c4c5b8;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice-state,#ov-start #pn-play.lobby-deployment-strip-layout .mode-desc{display:none!important;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-name{display:block;flex:1 1 auto;min-width:0;max-width:none;overflow:visible;color:#e9e7dd;font:800 clamp(.62rem,.73vw,.78rem)/1.15 var(--f-label);letter-spacing:.015em;white-space:nowrap;text-overflow:clip;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice:hover,#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice:focus-visible{transform:none;border-bottom-color:rgba(130,226,203,.55);background:rgba(130,226,203,.08);outline:none;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice[aria-pressed=true]{border-bottom-color:#82e2cb;background:linear-gradient(180deg,rgba(44,112,96,.36),rgba(20,53,47,.18));box-shadow:none;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice[aria-pressed=true] .mode-glyph,#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice[aria-pressed=true] .mode-name{color:#c6f4e8;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .mode-brief{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-strip-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-ready-rail{display:block;width:auto;min-width:0;max-width:none;margin:0;padding:0;border:0;background:none;box-shadow:none;overflow:visible;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-card{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto;align-items:center;gap:8px;min-width:0;overflow:visible;border:0;background:none;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-card-head{display:grid;gap:2px;min-width:0;padding:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-mini-label{color:#aeb8af;font-size:.52rem;letter-spacing:.13em;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-card-head strong{color:#f1eee4;font-size:.86rem;letter-spacing:.045em;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-card-head>span,#ov-start #pn-play.lobby-deployment-strip-layout #play-map-preview{display:none!important;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-open{position:static;display:flex;align-items:center;justify-content:center;gap:6px;width:auto;min-height:42px;padding:0 10px;border:1px solid rgba(213,229,222,.24);border-radius:2px;background:rgba(255,255,255,.035);color:#d4e1d9;font:750 .6rem var(--f-mono);letter-spacing:.1em;white-space:nowrap;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .play-map-open:hover{border-color:#82e2cb;background:rgba(37,94,79,.28);color:#d4f5e9;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .pl-sum{display:none!important;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deploy-row{display:flex;align-items:center;justify-content:flex-end;min-width:0;margin:0;padding:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deploy-note{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deploy-row .btnrow{display:flex;justify-content:flex-end;gap:6px;margin:0;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout #btn-start{min-width:146px;min-height:48px;padding:0 22px;border:1px solid #efd098;border-radius:2px;background:linear-gradient(180deg,#e5bf7d,#c99550);box-shadow:0 4px 16px rgba(0,0,0,.2);color:#1a1c18;font:900 .82rem var(--f-label);letter-spacing:.18em;}',
  '#ov-start #pn-play.lobby-deployment-strip-layout #btn-start:hover,#ov-start #pn-play.lobby-deployment-strip-layout #btn-start:focus-visible{background:linear-gradient(180deg,#f0d499,#d7a45b);outline:2px solid rgba(241,207,147,.4);outline-offset:2px;}',
  '@media(max-width:1100px){#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deployment-strip{grid-template-columns:minmax(0,1fr);gap:8px;padding:8px 10px;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-strip-actions{grid-template-columns:minmax(0,1fr) auto;justify-self:end;width:min(100%,420px);}}',
  '@media(max-width:760px){body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-main{overflow-y:auto;padding:0 12px 12px;}#ov-start #pn-play.lobby-deployment-strip-layout{flex:0 0 auto;height:auto;min-height:calc(100dvh - 120px);grid-template-rows:auto minmax(32px,1fr) auto;padding-bottom:8px;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-title-block{margin-top:12px;}#ov-start #pn-play.lobby-deployment-strip-layout .pn-h h2{font-size:clamp(1.05rem,4vw,1.45rem);white-space:nowrap;}#ov-start #pn-play.lobby-deployment-strip-layout #ov-text{max-width:34ch;margin-top:5px;font-size:.76rem;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{min-height:42px;padding:5px 6px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-glyph{width:18px;height:18px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-name{font-size:.67rem;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deployment-strip{gap:7px;padding:7px;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-strip-actions{width:100%;}}',
  '@media(max-width:560px){body.sl-lobby-screen[data-sl-route=play] #ov-start .mn-main{overflow-y:auto;padding:0 10px 12px;}#ov-start #pn-play.lobby-deployment-strip-layout{min-height:0;padding:0 0 10px;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-title-block{margin-top:12px;}#ov-start #pn-play.lobby-deployment-strip-layout .pn-h h2{font-size:clamp(.9rem,4.4vw,1.28rem);white-space:nowrap;}#ov-start #pn-play.lobby-deployment-strip-layout #ov-text{max-width:36ch;font-size:.8rem;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deployment-strip{grid-template-columns:minmax(0,1fr);gap:9px;padding:8px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{min-height:42px;padding:5px 7px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-name{font-size:.71rem;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-strip-actions{grid-template-columns:minmax(0,1fr) auto;justify-self:stretch;width:100%;gap:7px;}#ov-start #pn-play.lobby-deployment-strip-layout #btn-start{min-width:118px;min-height:44px;padding:0 12px;font-size:.74rem;}}',
  '@media(max-width:340px){#ov-start #pn-play.lobby-deployment-strip-layout .mode-grid{grid-template-columns:minmax(0,1fr);}#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{min-height:38px;}}',
  '@media(max-height:560px) and (orientation:landscape){#ov-start #pn-play.lobby-deployment-strip-layout .lobby-title-block{margin-top:6px;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-eyebrow{margin-bottom:3px;font-size:.52rem;}#ov-start #pn-play.lobby-deployment-strip-layout .pn-h h2{font-size:clamp(1rem,3vh,1.4rem);white-space:nowrap;}#ov-start #pn-play.lobby-deployment-strip-layout #ov-text{margin-top:3px;font-size:.65rem;}#ov-start #pn-play.lobby-deployment-strip-layout .lobby-deployment-strip{gap:5px;padding:5px 7px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{min-height:36px;}#ov-start #pn-play.lobby-deployment-strip-layout .mode-glyph{width:16px;height:16px;}#ov-start #pn-play.lobby-deployment-strip-layout #btn-start,#ov-start #pn-play.lobby-deployment-strip-layout .play-map-open{min-height:36px;}}',
  '@media(prefers-reduced-motion:reduce){#ov-start #pn-play.lobby-deployment-strip-layout .mode-choice{transition:none;}}'
].join('\n');

function migrate(rel) {
  const file = path.join(root, rel);
  let text = fs.readFileSync(file, 'utf8');
  const actual = digest(Buffer.from(text, 'utf8'));
  if (actual !== expected.get(rel)) throw new Error('Source changed since review; refusing to patch ' + rel + ' (' + actual + ').');
  const start = text.indexOf('<div class="mn-panel image2-lobby" id="pn-play"');
  const next = text.indexOf('</div>\n            <div class="mn-panel" id="pn-dyn"', start);
  if (start < 0 || next < 0) throw new Error('Could not identify the current Play panel in ' + rel);
  const end = next + '</div>'.length;
  const oldPanel = text.slice(start, end);
  for (const marker of ['id="mode-select"', 'id="mode-brief"', 'id="play-map-name"', 'data-go="map"', 'id="pl-sum"', 'id="btn-start"', 'id="btn-restart"', 'id="btn-quit"']) {
    if (!oldPanel.includes(marker)) throw new Error('Current Play panel is missing required control ' + marker);
  }
  text = text.slice(0, start) + newMarkup + text.slice(end);
  const oldTitle = "$('#ov-title').innerHTML='READY FOR<br>DEPLOYMENT';";
  if (text.split(oldTitle).length !== 2) throw new Error('Expected one dynamic Play title to update in ' + rel);
  text = text.replace(oldTitle, "$('#ov-title').textContent='READY FOR DEPLOYMENT';");
  const insert = '</style><div class="wrap">';
  if (text.split(insert).length !== 2) throw new Error('Expected exactly one production lobby style insertion point in ' + rel);
  const block = '</style>\n<style id="sightline-lobby-deployment-strip">\n' + css + '\n</style>\n<div class="wrap">';
  text = text.replace(insert, block);
  fs.writeFileSync(file, text, 'utf8');
  return digest(fs.readFileSync(file));
}

const hashes = pages.map(rel => [rel, migrate(rel)]);
const offline = fs.readFileSync(path.join(root, pages[0]), 'utf8');
const host = fs.readFileSync(path.join(root, pages[1]), 'utf8');
for (const marker of ['class="lobby-deployment-strip"', 'class="lobby-strip-actions"', 'class="lobby-scene-breathing-space"', 'id="mode-select"', 'id="play-map-name"', 'id="btn-start"']) {
  if (!offline.includes(marker) || !host.includes(marker)) throw new Error('Migrated production page is missing ' + marker);
}
const styleStart = '<style id="sightline-lobby-deployment-strip">';
const styleEnd = '</style>';
const a = offline.indexOf(styleStart), b = host.indexOf(styleStart);
if (a < 0 || b < 0 || offline.slice(a, offline.indexOf(styleEnd, a)) !== host.slice(b, host.indexOf(styleEnd, b))) {
  throw new Error('Deployment Strip CSS differs between Offline and phone-host pages.');
}
console.log(JSON.stringify({ status: 'APPLIED', sourceHashes: Object.fromEntries(hashes) }, null, 2));
