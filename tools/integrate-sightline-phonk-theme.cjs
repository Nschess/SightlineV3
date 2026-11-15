'use strict';

// The playback engine was accepted in the parent candidate. This script only
// updates its title/help copy; the existing preload, autoplay, gesture fallback,
// volume, cue ducking, deployment fade, and single-element loop remain intact.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html'
];
for (const relative of pages) {
  const file = path.join(root, relative);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes("new Audio('sightline-main-theme.wav')") || !html.includes('function lobbyMusicStartup()')) {
    throw new Error('The accepted startup playback path is missing from ' + relative);
  }
  html = html.replace('SIGHTLINE MAIN THEME: CONTACT ZERO', 'SIGHTLINE MAIN THEME: BREACH VECTOR');
  html = html.replace('Original 115-second Contact Zero theme.', 'Original 100-second Breach Vector phonk theme.');
  if (html.includes('CONTACT ZERO') || html.includes('Original 115-second')) throw new Error('Stale active theme copy remains in ' + relative);
  fs.writeFileSync(file, html, 'utf8');
}
console.log(JSON.stringify({ status: 'INTEGRATED', pages: pages.length, defaultTheme: 'BREACH VECTOR', retainedStartupAutoplay: true }, null, 2));
