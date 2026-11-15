#!/usr/bin/env node
// Apply Claude Lobby 10's authored overlay onto this candidate's existing pages.
// This intentionally does not copy Claude's full index.html or MainActivity.java.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lobby = path.join(root, 'lobby-10');
const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');

function once(source, needle, replacement, label) {
  const at = source.indexOf(needle);
  if (at < 0 || source.indexOf(needle, at + needle.length) >= 0) {
    throw new Error(`${label}: expected exactly one anchor, found ${at < 0 ? 0 : 'multiple'}`);
  }
  return source.slice(0, at) + replacement + source.slice(at + needle.length);
}

function read(rel) { return fs.readFileSync(path.join(lobby, rel), 'utf8'); }

const brief = '<div class="mode-brief" id="mode-brief" aria-live="polite"></div>';
const introButton = '<button type="button" class="lobby-intro-btn" id="btn-intro">Watch intro</button>';
const soundButton = '<button type="button" class="mn-sound" id="mn-sound" aria-pressed="true" aria-label="Menu music" title="Menu music"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path class="w" d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path class="x" d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
const oldFinish = `'<button type="button" class="loadout-finish'+(i===selectedFinish(key)?' is-selected':'')+'" data-loadout-finish="'+i+'" aria-pressed="`;
const newFinish = `'<button type="button" class="loadout-finish'+(f.legendary?' is-legendary':'')+(i===selectedFinish(key)?' is-selected':'')+'" data-loadout-finish="'+i+'" data-slfid="'+esc(key+'|'+f.name)+'" aria-pressed="`;
const oldDesc = `+esc(f.desc||'Cosmetic finish')+'</small></span></button>'`;
const newDesc = `+esc(f.desc||'Cosmetic finish')+'</small></span>'+slFinishTags(key,f,list)+'</button>'`;
const oldCamera = 'angle=.38,d=4.2;';
const newCamera = 'angle=.38+(SL_SWAY?Math.sin(orbit*5)*.09:0),d=4.2;';
const finishNote = '<p class="small loadout-integrity-note">';
const oldScroll = "var sc = keep ? $('.mn-main').scrollTop : 0;";
const newScroll = oldScroll + ' var dsc = keep ? dyn.scrollTop : 0;';
const oldRestore = "$('.mn-main').scrollTop = sc;";
const newRestore = oldRestore + ' dyn.scrollTop = dsc;';
const closureAnchor = 'idleCamera(0);\nrequestAnimationFrame(frame);\n})();';
const tail = '</style></body></html>';
const deployRowPattern = /<div class="lobby-deploy-row">.*?Quit to menu<\/button><\/div><\/div>/gs;

function transform(input, pageName) {
  // Python's source generator opens text in universal-newline mode.
  let s = input.replace(/\r\n?/g, '\n');
  if (s.includes('id="sightline-lobby-10-premium"') || s.includes('lobby-intro-btn')) {
    throw new Error(`${pageName}: Lobby 10 markers already exist; refusing a second application`);
  }
  s = once(s, brief, '', `${pageName}: remove old mode brief`);
  const rows = [...s.matchAll(deployRowPattern)];
  if (rows.length !== 1) throw new Error(`${pageName}: expected one deploy row, found ${rows.length}`);
  const row = rows[0][0];
  const deployCard = '<div class="lobby-nameplate" id="lobby-nameplate"></div><aside class="lobby-deploy-card" aria-label="Mission brief and deploy">' + brief + '<div class="lobby-squad" id="lobby-squad"></div>' + row + '</aside>';
  s = once(s, row, deployCard, `${pageName}: wrap deploy card`);
  const ovText = '<p id="ov-text">Choose a mission and prepare your squad.</p>';
  s = once(s, ovText, ovText + introButton, `${pageName}: add intro action`);
  const card = '<div class="mn-card" id="mn-card"></div>';
  s = once(s, card, card + soundButton, `${pageName}: add sound control`);
  s = once(s, oldScroll, newScroll, `${pageName}: preserve dynamic scroll`);
  s = once(s, oldRestore, newRestore, `${pageName}: restore dynamic scroll`);
  s = once(s, oldCamera, newCamera, `${pageName}: lobby camera sway`);
  s = once(s, oldFinish, newFinish, `${pageName}: legendary finish markup`);
  s = once(s, oldDesc, newDesc, `${pageName}: finish labels`);
  s = once(s, finishNote, '<div class="loadout-share"><button type="button" class="btn ghost" data-sl-share>Share loadout</button></div>' + finishNote, `${pageName}: loadout share control`);
  const featureJs = read('features.js');
  const featureBlock = "var slFinishTags=function(){return '';};\ntry{\n" + featureJs + "\n}catch(slFeatErr){if(window.console)console.warn('lobby features',slFeatErr);}\n" + closureAnchor;
  s = once(s, closureAnchor, featureBlock, `${pageName}: install lobby feature block`);
  s = s.trimEnd();
  if (!s.endsWith(tail)) throw new Error(`${pageName}: expected final stylesheet/document tail`);
  const insertAt = s.lastIndexOf(tail);
  const css = read('lobby10.css') + read('intro.css') + read('features.css');
  if (/@(?:V|PL|P)@/.test(css)) throw new Error('Lobby 10 generated CSS still has unresolved selector tokens');
  const introHtml = read('intro.html');
  const matchFoundHtml = read('matchfound.html');
  const introJs = read('intro.js');
  s = s.slice(0, insertAt) + '</style>\n<style id="sightline-lobby-10-premium">\n' + css + '</style>\n' + introHtml + matchFoundHtml + '<script>\n' + introJs + '</script></body></html>' + s.slice(insertAt + tail.length);
  return s;
}

const pages = [
  path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'),
  path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html'),
];
const original = pages.map((file) => fs.readFileSync(file, 'utf8'));
if (!original[0].includes('setLobbyMusicActive') || !original[1].includes('setLobbyMusicActive')) {
  throw new Error('Base lobby music lifecycle is absent from one of the two runtime pages');
}
const updated = original.map((src, i) => transform(src, i === 0 ? 'Offline' : 'phone-host'));
const newHostHash = digest(Buffer.from(updated[1], 'utf8'));
const activityPath = path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
const activity = fs.readFileSync(activityPath, 'utf8');
const declarations = [...activity.matchAll(/private\s+static\s+final\s+String\s+HOST_BUNDLE_SHA256\s*=\s*"([a-f0-9]{64})";/g)];
if (declarations.length !== 1) throw new Error(`MainActivity must retain one authoritative host pin; found ${declarations.length}`);
if (declarations[0][1] !== digest(Buffer.from(original[1].replace(/\r\n?/g, '\n'), 'utf8')) && declarations[0][1] !== digest(Buffer.from(original[1], 'utf8'))) {
  throw new Error('MainActivity host pin did not match the pre-integration phone-host page');
}
const updatedActivity = activity.replace(declarations[0][0], declarations[0][0].replace(declarations[0][1], newHostHash));

if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ status: 'PASS: unique Lobby 10 anchors and parity source validated', offlineBytes: Buffer.byteLength(updated[0]), phoneHostBytes: Buffer.byteLength(updated[1]), phoneHostSha256: newHostHash, nativePinDeclarations: declarations.length }, null, 2));
  process.exit(0);
}

const outputs = [...pages.map((file, i) => [file, updated[i]]), [activityPath, updatedActivity]];
const staged = [];
try {
  for (const [file, content] of outputs) {
    const temp = `${file}.lobby10-stage`;
    fs.writeFileSync(temp, content, 'utf8');
    staged.push([file, temp]);
  }
  for (const [file, temp] of staged) fs.renameSync(temp, file);
} catch (error) {
  for (let i = 0; i < pages.length; i += 1) fs.writeFileSync(pages[i], original[i], 'utf8');
  fs.writeFileSync(activityPath, activity, 'utf8');
  for (const [, temp] of staged) { try { fs.unlinkSync(temp); } catch {} }
  throw error;
}
console.log(JSON.stringify({ status: 'PASS: Lobby 10 overlay applied to both current pages; Codex native source preserved with refreshed single host pin', offlineSha256: digest(Buffer.from(updated[0])), phoneHostSha256: newHostHash }, null, 2));
