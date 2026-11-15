const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const phoneIndex = fs.readFileSync(path.join(assets, 'phone-host', 'index.html'), 'utf8');
const wwwIndex = fs.readFileSync(path.join(assets, 'www', 'index.html'), 'utf8');
const phoneSource = fs.readFileSync(path.join(assets, 'phone-host', 'character-realism-v12.js'), 'utf8');
const wwwSource = fs.readFileSync(path.join(assets, 'www', 'character-realism-v12.js'), 'utf8');

assert.equal(phoneIndex, wwwIndex, 'offline and phone-host game entry points must match');
assert.equal(phoneSource, wwwSource, 'offline and phone-host Claude builders must match');
assert.match(phoneIndex, /<script src="character-realism-v12\.js"><\/script>/);
assert.doesNotMatch(phoneIndex, /<script src="character-realism-claude-v12\.js"><\/script>/,
  'the original filename is retained so package allowlists stay compatible');
assert.match(phoneIndex, /SightlineClaudeCharacterV128\.bake\(op, THREE\)/,
  'active renderer must call the restored Claude v12.8 builder');
assert.doesNotMatch(phoneIndex, /SightlineCharacterAssetV128\.bake/,
  'active renderer must not fall back to the rejected merged builder');
assert.match(phoneIndex, /window\.SightlineCharacters\.build\(op/,
  'the preserved Claude P11.7 fallback remains available if v12.8 fails');

assert.match(phoneSource, /var sx = \.205 \* sh \+ \.014/,
  'original Claude shoulder proportion must be restored');
assert.match(phoneSource, /arm\(1, \[\.222, 1\.205, -\.36\]/);
assert.match(phoneSource, /arm\(-1, \[\.152, 1\.268, -\.468\]/);
assert.match(phoneSource, /armBuilders\.right = mb/);
assert.match(phoneSource, /armBuilders\.left = mb/);
assert.match(phoneSource, /global\.SightlineClaudeCharacterV128 =/);
assert.match(phoneSource, /if \(op\.zombie\).*buildZombie/s,
  "Claude's original builder retains its Hollowed construction path");
assert.match(phoneIndex, /armRAnchor\?new THREE\.Vector3\(\)\.fromArray/,
  'arm pivots are created once per actor from Claude geometry metadata');
assert.match(phoneIndex, /pose\(u\.armR,u\.armRShoulder\|\|WORLD_RIGHT_SHOULDER/,
  'existing weapon pose system continues to drive the restored arms');
const server = fs.readFileSync(path.join(assets, 'phone-host', 'server.js'), 'utf8');
assert.match(server, /'\/character-realism-v12\.js':\['character-realism-v12\.js'/,
  'the actual LAN host must serve the character builder instead of falling back');
assert.match(server, /BIND !== '127\.0\.0\.1'/,
  'the server permits an explicitly loopback-only isolated QA bind');

console.log(JSON.stringify({
  pass: true,
  checks: 18,
  source: 'Claude original character-realism.js v12.8 with arm-pose adapter',
  activeImports: ['character-realism.js', 'character-realism-v12.js'],
  rejectedMergedBuilderLoaded: false,
  runtimeVisualEvidence: 'Captured by tests/phase10-character-prototype-review.cjs in isolated Chromium/SwiftShader; see evidence/claude-restore/before and evidence/claude-restore/after.',
  humanVisualAcceptance: 'UNVERIFIED: rendered comparison exists, but the roster remains stylized and requires player review.',
  note: 'This test checks source paths and packaging; it does not by itself establish visual or animation acceptance.'
}, null, 2));
