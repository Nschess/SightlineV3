'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainActivity = fs.readFileSync(path.resolve(__dirname,
  '../AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');

test('MainActivity declares the WebViewAssetLoader domain and offline URL it uses', () => {
  const domain = mainActivity.match(/private static final String ASSET_DOMAIN = "([^"]+)";/);
  assert.ok(domain, 'ASSET_DOMAIN must be declared before it is used by origin policy');
  assert.equal(domain[1], 'appassets.androidplatform.net');
  assert.match(mainActivity,
    /private static final String OFFLINE_URL = "https:\/\/" \+ ASSET_DOMAIN \+ "\/assets\/www\/index\.html";/,
    'OFFLINE_URL must resolve to the packaged WebViewAssetLoader index');
});

test('offline WebView allowlist admits every bundled startup script', () => {
  const assetRoot = path.resolve(__dirname, '../AndroidProject/app/src/main/assets/www');
  const html = fs.readFileSync(path.join(assetRoot, 'index.html'), 'utf8');
  const filesSection = mainActivity.match(/Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
  assert.ok(filesSection, 'offline FILES allowlist must exist');
  const allowed = new Set([...filesSection[1].matchAll(/"([^"\r\n]+)"/g)].map(m => m[1]));
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.ok(fs.existsSync(path.join(assetRoot, script)), `bundled script missing: ${script}`);
    assert.ok(allowed.has(script), `offline WebView blocks startup script: ${script}`);
  }
  assert.match(mainActivity, /return FILES\.contains\(path\.substring\("\/assets\/www\/"\.length\(\)\)\)/);
  assert.ok(!allowed.has('unapproved-script.js'), 'arbitrary scripts must remain blocked');
});
