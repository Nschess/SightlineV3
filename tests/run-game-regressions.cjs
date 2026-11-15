'use strict';

// Node-only equivalent of run-game-regressions.py for CMD users without
// Python. Each test receives an isolated copy of the shipped host/offline
// asset trees at the same relative paths used in the package.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const regressionDir = path.join(root, 'tests', 'regressions');
const tempParent = path.join(root, 'tests', '.tmp');
const tests = fs.readdirSync(regressionDir).filter(name => name.endsWith('.test.js')).sort();
if (!tests.length) throw new Error('No packaged host regression tests were found.');
fs.mkdirSync(tempParent, { recursive: true });
const temp = fs.mkdtempSync(path.join(tempParent, 'host-regressions-'));
let failed = 0;
try {
  const stagedAssets = path.join(temp, 'AndroidProject', 'app', 'src', 'main', 'assets');
  fs.mkdirSync(stagedAssets, { recursive: true });
  fs.cpSync(path.join(assets, 'phone-host'), path.join(stagedAssets, 'phone-host'), { recursive: true });
  fs.cpSync(path.join(assets, 'www'), path.join(stagedAssets, 'www'), { recursive: true });
  for (const name of tests) {
    const staged = path.join(temp, 'tests', 'regressions', name);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(path.join(regressionDir, name), staged);
    const result = spawnSync(process.execPath, ['--test', staged], { encoding: 'utf8', timeout: 55000 });
    const passed = !result.error && result.status === 0;
    if (!passed) failed++;
    process.stdout.write(`${name} ${passed ? 'PASS' : 'FAIL'}\n`);
    if (!passed) {
      if (result.error) process.stderr.write(`${result.error.message}\n`);
      if (result.stdout) process.stdout.write(result.stdout.slice(-1800));
      if (result.stderr) process.stderr.write(result.stderr.slice(-1800));
    }
  }
  const summary = { pass: failed === 0, tests: tests.length, passed: tests.length - failed, failed };
  process.stdout.write(JSON.stringify(summary) + '\n');
  if (failed) process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
