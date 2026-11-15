'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
].map(p => path.join(root, p));
for (const file of files) {
  let source = fs.readFileSync(file, 'utf8');
  const copyStart = source.indexOf('function updatePlayCopy()');
  const renderStart = source.indexOf('function renderPlay()', copyStart);
  if (copyStart < 0 || renderStart < 0) throw Error(`Play functions missing in ${file}`);
  const copy = source.slice(copyStart, renderStart);
  if (!copy.includes("$('#ov-mode-name').textContent")) {
    const updated = "function updatePlayCopy(){if(state==='paused'||(MP.on&&MP.menu))return;var info=modeInfo(),copy={tactical:'Choose your side and prepare the operation.',ffa:'No squads. Outscore every operator in the arena.',bomb:'Secure site A or B, or stop the plant.',outbreak:'Deploy with your squad and hold against the Hollowed.',infection:'Stay together, survive the conversion and fight to sunrise.'};$('#ov-title').textContent='READY FOR DEPLOYMENT';$('#ov-mode-name').textContent=String(info[0]||R.mode).toUpperCase();$('#ov-text').textContent=copy[R.mode]||info[2];$('#btn-start').textContent='DEPLOY';$('#ov-note').textContent=touchMode?'Touch controls are ready · deploy when your squad is set.':'Choose a mission · use Maps or Match Rules above to configure · Esc pauses, Tab opens the scoreboard.';}\r\n";
    source = source.slice(0, copyStart) + updated + source.slice(renderStart);
  }
  const playStart = source.indexOf('function renderPlay() {');
  const bodyStart = source.indexOf('function renderBody(keep)', playStart);
  const mapStart = source.indexOf("  var mapName=$('#play-map-name')", playStart);
  if (playStart < 0 || bodyStart < 0) throw Error(`Play summary block missing in ${file}`);
  if (mapStart >= 0) {
    const closingBrace = source.lastIndexOf('}', bodyStart);
    if (closingBrace < mapStart) throw Error(`Play summary terminator missing in ${file}`);
    source = source.slice(0, mapStart) + source.slice(closingBrace);
  }
  if (source.slice(source.indexOf('function renderPlay() {'), source.indexOf('function renderBody(keep)')).includes("$('#pl-sum').innerHTML")) throw Error(`Duplicate Play setup summary remains in ${file}`);
  fs.writeFileSync(file, source, 'utf8');
  console.log(`Wired selected mode and removed duplicate Play setup from ${path.relative(root, file)}`);
}
