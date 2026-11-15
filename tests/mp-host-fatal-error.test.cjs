'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../AndroidProject/app/src/main/assets/phone-host/server.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('function fatalHostError(');
const end = source.indexOf('\nif (require.main === module) process.on', start);
assert.ok(start >= 0 && end > start, 'fatal host diagnostic helper is present');
const context = vm.createContext({ Error, String, Date, JSON, fs: { writeSync() {} }, process: { exit() {} } });
vm.runInContext(source.slice(start, end) + '\nthis.fatalHostError=fatalHostError;', context);

test('unexpected host exceptions emit structured diagnostics and request fail-fast exit', () => {
  let line = '', exitCode = null;
  context.fatalHostError(new TypeError('simulation invariant failed'), {
    write: value => { line += value; },
    exit: code => { exitCode = code; }
  });
  assert.equal(exitCode, 1);
  assert.ok(line.startsWith('[sightline-host] '));
  const record = JSON.parse(line.slice('[sightline-host] '.length));
  assert.equal(record.event, 'fatal_uncaught_exception');
  assert.equal(record.name, 'TypeError');
  assert.equal(record.message, 'simulation invariant failed');
  assert.match(record.timestamp, /^\d{4}-\d\d-\d\dT/);
  assert.match(record.stack, /TypeError: simulation invariant failed/);
});

test('diagnostic strings are bounded and the host exits even when stderr fails', () => {
  let exitCode = null;
  context.fatalHostError({ name: 'X'.repeat(300), message: 'M'.repeat(5000), stack: 'S'.repeat(20000) }, {
    write: () => { throw new Error('stderr unavailable'); },
    exit: code => { exitCode = code; }
  });
  assert.equal(exitCode, 1);
});

test('host installs fail-fast uncaught-exception handling only as its direct entrypoint', () => {
  assert.match(source, /if \(require\.main === module\) process\.on\('uncaughtException', fatalHostError\);/);
  assert.doesNotMatch(source, /Recovered from an unexpected error/);
});
