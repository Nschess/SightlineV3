import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, '..'));
const pages = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
].map(rel => path.join(root, rel));
const css = fs.readFileSync(path.join(root, 'tools/sightline-premium-lobby-spaces.css'), 'utf8').trim();

const modeFunction = `function sl91ModeGlyph(id){var art={
tactical:'<path d="M12 2.5 19.5 5v5.4c0 4.3-3 7.7-7.5 11.1-4.5-3.4-7.5-6.8-7.5-11.1V5z"/><path d="M7.8 9.5h8.4M8.5 13h7M12 7v9.4"/>',
ffa:'<circle cx="12" cy="5" r="2"/><circle cx="4.8" cy="9" r="1.6"/><circle cx="19.2" cy="9" r="1.6"/><path d="M8.4 20c.2-4.2 1.3-6.5 3.6-6.5s3.4 2.3 3.6 6.5M1.7 19c.2-3.2 1.1-4.8 3.1-4.8 1 0 1.8.5 2.5 1.4m15 3.4c-.2-3.2-1.1-4.8-3.1-4.8-1 0-1.8.5-2.5 1.4"/>',
bomb:'<path d="M8 7V4.5h8V7m-4-2.5V2"/><rect x="5.5" y="7" width="13" height="14" rx="1.8"/><path d="M9 11h6m-6 3h3m-3 3h6M2.5 11h2m13 0h4"/>',
outbreak:'<path d="M6 3.2c1.2 2.1 1.6 3.1 2.8 4.6L6.2 10l4.3 3.3-2.9 7.5M12 2.4l1.4 5.4-2.3 3.4 4.4 3.4-1.7 6.7M18 3.2c-1.2 2.1-1.6 3.1-2.8 4.6l2.6 2.2-4.3 3.3 2.9 7.5"/><path d="m3.4 7.4 2.2 1.2m15-1.2-2.2 1.2"/>',
infection:'<path d="M10.4 10.3 7.6 5.5a5.1 5.1 0 0 1 8.8 0l-2.8 4.8M10.1 13.3l-5.4 1.6a5.1 5.1 0 0 1 4.4-7.7l2.8 4.8m2 1.3 5.4 1.6a5.1 5.1 0 0 0-4.4-7.7l-2.8 4.8"/><circle cx="12" cy="12" r="2.1"/>'
};return '<svg class="mode-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(art[id]||art.tactical)+'</svg>';}`;
const navFunction = `function sl82NavGlyph(key){var d={play:'<circle cx="12" cy="12" r="8.5"/><path d="m10 8 6 4-6 4z"/>',loadout:'<path d="M4 6h16v12H4zM7 9h4M7 12h7M7 15h3M17 8v8"/>',operators:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.2 2.2-5 5.5-5s5 1.8 5.5 5M16 5.5a3 3 0 0 1 0 5.8M17 14c2.1.5 3.2 2.2 3.5 5"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>'};return '<svg class="mn-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(d[key]||d.play)+'</svg>';}`;

function replaceExactlyOne(source, regex, replacement, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) throw new Error(`${label}: expected one match, found ${matches?.length || 0}`);
  return source.replace(regex, replacement);
}

for (const file of pages) {
  let html = fs.readFileSync(file, 'utf8');
  html = replaceExactlyOne(html, /<style id="sightline-premium-lobby-spaces">[\s\S]*?<\/style>/g, `<style id="sightline-premium-lobby-spaces">\n${css}\n</style>`, 'premium lobby styles');
  html = replaceExactlyOne(html, /function sl91ModeGlyph\(id\)\{var art=\{[\s\S]*?\};return '<svg class="mode-glyph"[\s\S]*?<\/svg>';\}/g, modeFunction, 'five-mode glyph family');
  html = replaceExactlyOne(html, /function sl82NavGlyph\(key\)\{var d=\{[\s\S]*?\};return '<svg class="mn-glyph"[\s\S]*?<\/svg>';\}/g, navFunction, 'navigation glyph family');
  html = replaceExactlyOne(html, /new THREE\.PointLight\(0xd7e9e3,\.34,4\.5,2\)/g, 'new THREE.PointLight(0xd7e9e3,.4,5,2)', 'menu-only operator fill light');
  html = replaceExactlyOne(html, /,d=3\.65;camera\.position\.set\(a\.x\+Math\.sin\(angle\)\*d,1\.82,a\.z\+Math\.cos\(angle\)\*d\)/g, ',d=3.4;camera.position.set(a.x+Math.sin(angle)*d,1.82,a.z+Math.cos(angle)*d)', 'menu-only operator camera framing');
  fs.writeFileSync(file, html, 'utf8');
  console.log(`UPDATED ${path.relative(root, file)}`);
}
