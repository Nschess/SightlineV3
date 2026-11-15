import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verify } from '../tools/preserve_sightline_dev_instructions.mjs';

const VALID = Buffer.from([
  '# Sightline V3 Project Instructions',
  'Protected baselines and scope',
  'Three.js r128',
  'Acceptance evidence',
  'Private test artifacts versus production releases',
].join('\n') + '\n');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [entryName, content] of entries) {
    const name = Buffer.from(entryName, 'utf8');
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-instructions-'));
  const project = path.join(root, 'project');
  const template = path.join(root, 'template', 'AGENTS.md');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.dirname(template), { recursive: true });
  fs.writeFileSync(path.join(project, 'AGENTS.md'), VALID);
  fs.writeFileSync(template, VALID);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, template, agents: path.join(project, 'AGENTS.md') };
}

function check(t, project, archive, template) {
  let code;
  const oldLog = console.log;
  const oldError = console.error;
  console.log = () => {};
  console.error = () => {};
  try { code = verify(project, archive, template); }
  finally { console.log = oldLog; console.error = oldError; }
  return code;
}

test('accepts valid root instructions that exactly match the DEV project', (t) => {
  const f = fixture(t);
  const archive = path.join(f.root, 'valid.zip');
  fs.writeFileSync(archive, zip([['AGENTS.md', VALID], ['game.js', 'source']]));
  assert.equal(check(t, f.project, archive, f.template), 0);
});

test('rejects an archive whose AGENTS.md was tampered with but retains the required markers', (t) => {
  const f = fixture(t);
  const archive = path.join(f.root, 'tampered.zip');
  const changed = Buffer.concat([VALID, Buffer.from('tampered instruction\n')]);
  fs.writeFileSync(archive, zip([['AGENTS.md', changed]]));
  assert.equal(check(t, f.project, archive, f.template), 1);
});

test('rejects missing and duplicate root AGENTS.md entries', (t) => {
  const f = fixture(t);
  const missing = path.join(f.root, 'missing.zip');
  fs.writeFileSync(missing, zip([['project/AGENTS.md', VALID]]));
  assert.equal(check(t, f.project, missing, f.template), 1);
  const duplicate = path.join(f.root, 'duplicate.zip');
  fs.writeFileSync(duplicate, zip([['AGENTS.md', VALID], ['AGENTS.md', VALID]]));
  assert.equal(check(t, f.project, duplicate, f.template), 1);
});

test('rejects project instructions missing mandatory sections', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.agents, Buffer.from('# Sightline V3 Project Instructions\nThree.js r128\n'));
  assert.equal(check(t, f.project, undefined, f.template), 1);
});

test('rejects corrupt instruction payloads by CRC', (t) => {
  const f = fixture(t);
  const archive = path.join(f.root, 'corrupt.zip');
  const good = zip([['AGENTS.md', VALID]]);
  const payloadAt = 30 + Buffer.byteLength('AGENTS.md');
  good[payloadAt + 2] ^= 0x7f;
  fs.writeFileSync(archive, good);
  assert.equal(check(t, f.project, archive, f.template), 1);
});

test('rejects canonical instruction drift when project and template share a root', (t) => {
  const f = fixture(t);
  const otherTemplate = path.join(f.project, 'canonical.md');
  fs.writeFileSync(otherTemplate, Buffer.concat([VALID, Buffer.from('different canonical bytes')]));
  assert.equal(check(t, f.project, undefined, otherTemplate), 1);
});
