#!/usr/bin/env node
// Node.js equivalent of the Python helper's `verify` command for packaging
// environments where Python is unavailable. Fails closed on unsupported ZIPs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REQUIRED_MARKERS = [
  '# Sightline V3 Project Instructions',
  'Protected baselines and scope',
  'Three.js r128',
  'Acceptance evidence',
].map((s) => Buffer.from(s, 'ascii'));
const ROOT_AGENTS = Buffer.from('AGENTS.md', 'ascii');
const MAX_INSTRUCTION_BYTES = 1024 * 1024;

function fail(message, code = 1) {
  console.error(message);
  return code;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function need(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`truncated or invalid ZIP ${label}`);
  }
}

function readRootAgents(archivePath) {
  const zip = fs.readFileSync(archivePath);
  if (zip.length < 22) throw new Error('not a valid ZIP archive');

  const minEocd = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= minEocd; i -= 1) {
    if (zip.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLength = zip.readUInt16LE(i + 20);
    if (i + 22 + commentLength === zip.length) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('cannot locate ZIP end-of-central-directory record');

  const disk = zip.readUInt16LE(eocd + 4);
  const centralDisk = zip.readUInt16LE(eocd + 6);
  const diskEntries = zip.readUInt16LE(eocd + 8);
  const totalEntries = zip.readUInt16LE(eocd + 10);
  const centralSize = zip.readUInt32LE(eocd + 12);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw new Error('multi-disk ZIP archives are unsupported');
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 archive is unsupported by the instruction verifier');
  need(zip, centralOffset, centralSize, 'central directory');
  if (centralOffset + centralSize > eocd) throw new Error('ZIP central directory overlaps its end record');

  let cursor = centralOffset;
  let matches = 0;
  let found = null;
  for (let i = 0; i < totalEntries; i += 1) {
    need(zip, cursor, 46, 'central-directory header');
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('invalid ZIP central-directory header');
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const expectedCrc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const startDisk = zip.readUInt16LE(cursor + 34);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const fullLength = 46 + nameLength + extraLength + commentLength;
    need(zip, cursor, fullLength, 'central-directory entry');
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength);
    if (name.equals(ROOT_AGENTS)) {
      matches += 1;
      found = { flags, method, expectedCrc, compressedSize, uncompressedSize, name: Buffer.from(name), startDisk, localOffset };
    }
    cursor += fullLength;
  }
  if (cursor > centralOffset + centralSize) throw new Error('ZIP central-directory entries exceed declared size');
  if (matches !== 1) throw new Error('archive must contain exactly one AGENTS.md at its project root');
  if (found.startDisk !== 0) throw new Error('root AGENTS.md resides on an unsupported ZIP disk');
  if (found.flags & (0x0001 | 0x0040)) throw new Error('encrypted root AGENTS.md cannot be verified');
  if (found.uncompressedSize > MAX_INSTRUCTION_BYTES) throw new Error('root AGENTS.md exceeds the verifier size limit');

  const local = found.localOffset;
  need(zip, local, 30, 'local-file header');
  if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('invalid local-file header for root AGENTS.md');
  const localFlags = zip.readUInt16LE(local + 6);
  const localMethod = zip.readUInt16LE(local + 8);
  const localNameLength = zip.readUInt16LE(local + 26);
  const localExtraLength = zip.readUInt16LE(local + 28);
  need(zip, local + 30, localNameLength + localExtraLength, 'local-file name/extra data');
  const localName = zip.subarray(local + 30, local + 30 + localNameLength);
  if (!localName.equals(found.name) || localMethod !== found.method || localFlags !== found.flags) throw new Error('local and central ZIP headers disagree for root AGENTS.md');
  const dataOffset = local + 30 + localNameLength + localExtraLength;
  need(zip, dataOffset, found.compressedSize, 'root AGENTS.md payload');
  const compressed = zip.subarray(dataOffset, dataOffset + found.compressedSize);
  let contents;
  if (found.method === 0) contents = Buffer.from(compressed);
  else if (found.method === 8) contents = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_INSTRUCTION_BYTES });
  else throw new Error(`unsupported ZIP compression method ${found.method} for root AGENTS.md`);
  if (contents.length !== found.uncompressedSize || crc32(contents) !== found.expectedCrc) throw new Error('root AGENTS.md ZIP size or CRC check failed');
  return contents;
}

export function verify(projectArg, archiveArg, templateArg) {
  const project = path.resolve(projectArg);
  const target = path.join(project, 'AGENTS.md');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return fail(`FAIL: DEV project root is missing AGENTS.md: ${target}`);

  const contents = fs.readFileSync(target);
  const missing = REQUIRED_MARKERS.filter((marker) => !contents.includes(marker)).map((marker) => marker.toString('ascii'));
  if (missing.length) return fail(`FAIL: project instructions are missing required sections: ${missing.join(', ')}`);

  // The Python helper's bundled default template is the AGENTS.md adjacent to
  // this tool. For a candidate-local tool this is the same project root file.
  const template = path.resolve(templateArg ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'AGENTS.md'));
  if (!fs.existsSync(template) || !fs.statSync(template).isFile()) return fail(`BLOCKED: authoritative template not found: ${template}`, 2);
  const canonical = fs.readFileSync(template);
  if (path.resolve(project) === path.resolve(path.dirname(template)) && !contents.equals(canonical)) {
    return fail('FAIL: canonical project AGENTS.md differs from its authoritative file');
  }
  console.log(`PASS: project root instructions present and applicable: ${target}`);

  if (!archiveArg) return 0;
  const archive = path.resolve(archiveArg);
  if (!fs.existsSync(archive) || !fs.statSync(archive).isFile()) return fail(`FAIL: DEV archive not found: ${archive}`);
  let packed;
  try { packed = readRootAgents(archive); }
  catch (error) { return fail(`FAIL: cannot read DEV archive: ${error.message}`); }
  if (!packed.equals(contents)) return fail('FAIL: packaged AGENTS.md differs from the editable DEV project');
  console.log(`PASS: archive contains the matching root AGENTS.md: ${archive}`);
  return 0;
}

function main(argv) {
  const [command, project, ...rest] = argv;
  if (command !== 'verify' || !project) {
    console.error('Usage: node preserve_sightline_dev_instructions.mjs verify <project> [--archive <zip>] [--template <AGENTS.md>]');
    return 2;
  }
  let archive;
  let template;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--archive' && rest[i + 1]) archive = rest[++i];
    else if (rest[i] === '--template' && rest[i + 1]) template = rest[++i];
    else { console.error(`Unknown or incomplete argument: ${rest[i]}`); return 2; }
  }
  try { return verify(project, archive, template); }
  catch (error) { console.error(`FAIL: instruction verification error: ${error.message}`); return 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
