import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const pages = Object.fromEntries(['www', 'phone-host'].map(name => [name,
  fs.readFileSync(path.join(assets, name, 'index.html'), 'utf8')]));

function between(source, start, end, label) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `${label}: start marker is missing`);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `${label}: end marker is missing`);
  return source.slice(a, b);
}

test('Offline and phone-host have the same single Lobby 10 visual layer and feature block', () => {
  const offlineCss = between(pages.www, '<style id="sightline-lobby-10-premium">', '</style>', 'Offline lobby CSS');
  const hostCss = between(pages['phone-host'], '<style id="sightline-lobby-10-premium">', '</style>', 'host lobby CSS');
  const featureStart = '/* ===== Lobby 10 features (runs inside the game closure:';
  const featureEnd = '\nidleCamera(0);';
  const offlineFeatures = between(pages.www, featureStart, featureEnd, 'Offline lobby features');
  const hostFeatures = between(pages['phone-host'], featureStart, featureEnd, 'host lobby features');
  assert.equal((pages.www.match(/id="sightline-lobby-10-premium"/g) || []).length, 1);
  assert.equal((pages['phone-host'].match(/id="sightline-lobby-10-premium"/g) || []).length, 1);
  assert.equal(offlineCss, hostCss);
  assert.equal(offlineFeatures, hostFeatures);
  assert.equal(offlineCss.includes('@PL@'), false, 'generated CSS has no unresolved template selectors');
  assert.match(offlineFeatures, /function slRenderV8\(\)/);
  assert.match(offlineFeatures, /#btn-start/);
  assert.match(offlineFeatures, /#sl-matchfound/);
});

test('Lobby 10 keeps the existing theme asset and game-owned music lifecycle', () => {
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /el\.src='sightline-theme\.mp3'/, `${name}: original theme asset route`);
    assert.match(page, /function setLobbyMusicActive\(active\)/, `${name}: original music lifecycle`);
    assert.match(page, /setLobbyMusicActive\(id === '#ov-start'\)/, `${name}: music follows lobby visibility`);
    assert.match(page, /setLobbyMusicActive\(false\)/, `${name}: music stops when overlays close`);
  }
});

test('All inline scripts still parse after the overlay integration', () => {
  for (const [name, page] of Object.entries(pages)) {
    const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1]).filter(source => source.trim());
    assert.ok(scripts.length >= 2, `${name}: expected game and intro scripts`);
    scripts.forEach((source, index) => new vm.Script(source, { filename: `${name}:inline-${index}` }));
  }
});

test('Rollback snapshot is intact and only expected Android source pins changed', () => {
  const snapshot = path.join(root, 'rollback/claude-lobby10-premerge-20261114');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const listed = new Map(fs.readFileSync(path.join(snapshot, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/)
    .map(line => { const match = line.match(/^([a-f0-9]{64})  (.+)$/); assert.ok(match, `malformed rollback row: ${line}`); return [match[2], match[1]]; }));
  assert.equal(listed.size, 5);
  for (const [relative, expected] of listed) assert.equal(hash(path.join(snapshot, relative)), expected, `rollback file changed: ${relative}`);

  const beforeActivity = fs.readFileSync(path.join(snapshot, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
  const currentActivityFile = path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
  const currentActivity = fs.readFileSync(currentActivityFile, 'utf8');
  const oldPin = beforeActivity.match(/HOST_BUNDLE_SHA256\s*=\s*"([a-f0-9]{64})"/);
  const currentPin = currentActivity.match(/HOST_BUNDLE_SHA256\s*=\s*"([a-f0-9]{64})"/);
  assert.ok(oldPin && currentPin);
  assert.equal(currentPin[1], crypto.createHash('sha256').update(Buffer.from(pages['phone-host'], 'utf8')).digest('hex'));
  assert.equal(currentActivity.replace(currentPin[1], oldPin[1]), beforeActivity,
    'native Android source differs only by the refreshed phone-host page pin');

  const oldRows = new Map(fs.readFileSync(path.join(snapshot, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'), 'utf8').trim().split(/\r?\n/)
    .map(line => { const match = line.match(/^([a-f0-9]{64})  (.+)$/); assert.ok(match); return [match[2], match[1]]; }));
  const currentRows = new Map(fs.readFileSync(path.join(root, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'), 'utf8').trim().split(/\r?\n/)
    .map(line => { const match = line.match(/^([a-f0-9]{64})  (.+)$/); assert.ok(match); return [match[2], match[1]]; }));
  const changedRows = [...oldRows.keys()].filter(file => oldRows.get(file) !== currentRows.get(file)).sort();
  assert.deepEqual(changedRows, [
    'app/src/main/assets/phone-host/SHA256SUMS',
    'app/src/main/assets/phone-host/index.html',
    'app/src/main/assets/www/index.html',
    'app/src/main/java/com/sightline/v3/MainActivity.java'
  ]);
});
