/* Copy the authored hand GLBs into both offline roots and embed them for WebView. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(__dirname, 'assets', 'firstperson-hands');
const destinations = [
  path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host', 'firstperson-hands'),
  path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'firstperson-hands')
];
const data = {};
for (const kind of ['pistol', 'rifle']) {
  const file = path.join(source, `${kind}-hands.glb`);
  if (!fs.existsSync(file)) throw new Error(`Missing authored model: ${file}`);
  data[kind] = fs.readFileSync(file).toString('base64');
  for (const destination of destinations) {
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(file, path.join(destination, `${kind}-hands.glb`));
  }
}
const payload = `/* Offline, self-contained MPFB-derived weapon grip assets. */\nwindow.SIGHTLINE_FP_HAND_DATA=${JSON.stringify(data)};\n`;
for (const destination of destinations) {
  fs.writeFileSync(path.join(destination, 'fp-hand-data.js'), payload);
}
console.log(JSON.stringify(destinations.map(directory => ({
  directory,
  pistolBytes: fs.statSync(path.join(directory, 'pistol-hands.glb')).size,
  rifleBytes: fs.statSync(path.join(directory, 'rifle-hands.glb')).size,
  payloadBytes: fs.statSync(path.join(directory, 'fp-hand-data.js')).size
})), null, 2));
