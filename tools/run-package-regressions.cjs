'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsRoot = path.join(root, 'tests');
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === '.tmp' || item.name === '__pycache__') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile() && /\.test\.(?:cjs|js)$/.test(item.name)) files.push(full);
  }
}
walk(testsRoot);
files.sort();
if (!files.length) throw new Error('No deterministic .test.cjs/.test.js files were packaged.');
// Several simulation tests use wall-clock budgets; running their separate test
// files concurrently adds avoidable CPU contention and intermittent timing
// failures. Keep every test and assertion, but execute files sequentially.
console.log(`Running ${files.length} deterministic Node test files sequentially from ${path.relative(root, testsRoot)}.`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit', shell: false });
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
