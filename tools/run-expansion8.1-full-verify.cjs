'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testRoot = path.join(root, 'tests');
const tests = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '.tmp') walk(file);
    else if (entry.isFile() && /\.test\.(?:cjs|js|mjs)$/.test(entry.name)) tests.push(file);
    else if (entry.isSymbolicLink()) throw new Error(`Refusing a symbolic link in tests: ${file}`);
  }
}
walk(testRoot); tests.sort();
if (!tests.length) throw new Error('No Node regression test files found.');

function run(label, args, compact) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) { process.stderr.write(`${result.error.message}\n`); return false; }
  if (compact && result.status === 0) {
    try { process.stdout.write(JSON.stringify(compact(result.stdout)) + '\n'); }
    catch (error) { process.stderr.write(`Could not parse verification summary: ${error.message}\n`); return false; }
  } else if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.stderr.write(`exit=${result.status}\n`);
  return result.status === 0;
}

let failed = false;
process.stdout.write(`Node ${process.version}; ${tests.length} test files\n`);
if (!run('complete Node regression suite', ['--test', ...tests])) failed = true;
if (!run('authoritative combat', [path.join(testRoot, 'authoritative-combat.mjs')], out => {
  const line = out.split(/\r?\n/).find(s => s.trim().startsWith('{'));
  const data = JSON.parse(line); return { pass: data.pass, checks: data.count };
})) failed = true;
if (!run('19-map navigation audit', [path.join(testRoot, 'map-bot-navigation-audit.cjs')], out => {
  const data = JSON.parse(out); return { pass: data.pass, maps: data.configuredMapCount, faults: data.faults.length };
})) failed = true;
if (!run('Android source and asset parity', [path.join(testRoot, 'phase2-android-asset-parity.mjs')])) failed = true;
for (const file of [
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'tools/offline-static-server.cjs',
  'tools/create-expansion8.1-dev-manifest.cjs',
  'tools/verify-expansion8.1-dev-manifest.cjs',
  'tools/compare-expansion-8.1-benchmarks.cjs',
  'tools/run-expansion8.1-full-verify.cjs'
]) if (!run(`syntax: ${file}`, ['--check', path.join(root, file)])) failed = true;

const result = { status: failed ? 'FAIL' : 'PASS', nodeTestFiles: tests.length };
process.stdout.write(`\n${JSON.stringify(result)}\n`);
if (failed) process.exitCode = 1;
