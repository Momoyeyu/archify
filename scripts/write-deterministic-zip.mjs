#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { constants as zlibConstants, deflateRawSync } from 'node:zlib';

import {
  captureAtomicOutput,
  captureRegularFileBinding,
  releaseRegularFileBinding,
  removeOwnedRegularFile,
  verifyAtomicOutput,
  verifyRegularFileBinding,
} from '../archify/renderers/shared/atomic-output.mjs';
import { validateNativeOutputPath } from '../archify/renderers/shared/output-path.mjs';
import { validatePortablePathSet } from '../archify/renderers/shared/portable-path.mjs';

function usage() {
  console.error([
    'Usage: node scripts/write-deterministic-zip.mjs <directory> <output.zip> --mode-manifest <modes.json>',
    '       node scripts/write-deterministic-zip.mjs --validate-output <output.zip>',
  ].join('\n'));
  process.exit(2);
}

const positionals = [];
let modeManifestArg = null;
const argv = process.argv.slice(2);
if (argv[0] === '--validate-output') {
  if (argv.length !== 2) usage();
  validateArchiveOutputPath(argv[1]);
  process.exit(0);
}
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--mode-manifest') {
    modeManifestArg = argv[index + 1] ?? null;
    index += 1;
  } else if (argv[index].startsWith('--')) {
    usage();
  } else {
    positionals.push(argv[index]);
  }
}
const [rootArg, outputArg] = positionals;
if (!rootArg || !outputArg || positionals.length !== 2 || !modeManifestArg) usage();

function validateArchiveOutputPath(rawOutput) {
  try {
    validateNativeOutputPath(rawOutput, { kind: 'file' });
    if (process.platform !== 'win32') {
      // ZIPs are published and consumed cross-platform. Apply the shared
      // Windows component grammar on POSIX too, while removing only the POSIX
      // root marker so an ordinary /tmp/archive.zip is not mistaken for a
      // current-drive-rooted Windows spelling.
      const posixRoot = path.posix.parse(rawOutput).root;
      const windowsComparable = posixRoot ? rawOutput.slice(posixRoot.length) : rawOutput;
      validateNativeOutputPath(windowsComparable, { platform: 'win32', kind: 'file' });
    }
  } catch (error) {
    const reason = error?.archifyDiagnostics?.[0]?.evidence?.reason;
    console.error(
      `archive output is not a valid native filesystem path${reason ? ` (${reason})` : ''}: ${JSON.stringify(rawOutput)}`,
    );
    process.exit(2);
  }
}

validateArchiveOutputPath(outputArg);
const root = path.resolve(rootArg);
const output = path.resolve(outputArg);
const outputCapture = captureAtomicOutput(output, {
  requestedEntryPolicy: 'regular-or-absent',
});
if (outputCapture.status !== 'captured') {
  throw new Error(
    `archive output cannot be published safely (${outputCapture.reason?.code || 'capture-failed'}): ${output}`,
  );
}

// Entry modes come from the Git index, recorded by scripts/stage-clean-skill.mjs.
// Filesystem permission bits are not portable across platforms (Windows cannot
// store an executable bit), so deriving them from stat() would change the
// archive bytes depending on where it was built.
function loadModeManifest(manifestPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`unreadable mode manifest ${manifestPath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`mode manifest must be a JSON object: ${manifestPath}`);
  }
  const modes = new Map();
  for (const [relative, gitMode] of Object.entries(parsed)) {
    if (gitMode !== '100644' && gitMode !== '100755') {
      throw new Error(`unsupported Git mode ${JSON.stringify(gitMode)} for ${relative} in mode manifest`);
    }
    modes.set(relative, gitMode === '100755' ? 0o755 : 0o644);
  }
  validatePortablePathSet([...modes.keys()], { profile: 'archive' });
  return modes;
}

const recordedModes = loadModeManifest(path.resolve(modeManifestArg));
const unusedModes = new Set(recordedModes.keys());

function recordedMode(relative) {
  if (!recordedModes.has(relative)) {
    throw new Error(`staged file has no recorded Git mode: ${relative}`);
  }
  unusedModes.delete(relative);
  return recordedModes.get(relative);
}
const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const DOS_TIME = 0;
const DOS_DATE = 0x0021; // 1980-01-01, the earliest ZIP timestamp.
const ZIP32_MAX_ENTRIES = 0xffff;
const ZIP32_MAX_NAME_BYTES = 0xffff;
const ZIP32_MAX_VALUE = 0xffffffff;

function requireZip32(condition, detail) {
  if (!condition) throw new Error(`ZIP64 is not supported: ${detail}`);
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

function sortedEntries(directory, prefix = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`refusing to archive symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...sortedEntries(absolute, relative));
    else if (entry.isFile()) files.push({ absolute, relative });
    else throw new Error(`refusing to archive non-regular file: ${relative}`);
  }
  return files;
}

function localHeader({ name, crc, compressedSize, uncompressedSize }) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(DEFLATE_METHOD, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralHeader({ name, crc, compressedSize, uncompressedSize, offset, mode }) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4); // ZIP 2.0, created on Unix.
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(DEFLATE_METHOD, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

const localParts = [];
const centralParts = [];
let offset = 0;
const files = sortedEntries(root);
validatePortablePathSet(
  files.map((file) => `${path.basename(root)}/${file.relative}`),
  { profile: 'archive' },
);
requireZip32(files.length < ZIP32_MAX_ENTRIES, `entry count ${files.length} reaches ZIP64 sentinel ${ZIP32_MAX_ENTRIES}`);

for (const file of files) {
  const name = Buffer.from(`${path.basename(root)}/${file.relative}`, 'utf8');
  const content = fs.readFileSync(file.absolute);
  const compressed = deflateRawSync(content, {
    level: 9,
    memLevel: 9,
    strategy: zlibConstants.Z_FIXED,
  });
  requireZip32(name.length <= ZIP32_MAX_NAME_BYTES, `file name is too long: ${file.relative}`);
  requireZip32(content.length < ZIP32_MAX_VALUE, `file reaches the ZIP64 size sentinel: ${file.relative}`);
  requireZip32(compressed.length < ZIP32_MAX_VALUE, `compressed file reaches the ZIP64 size sentinel: ${file.relative}`);
  requireZip32(offset < ZIP32_MAX_VALUE, `local header offset reaches the ZIP64 sentinel: ${file.relative}`);
  const checksum = crc32(content);
  const mode = recordedMode(file.relative);
  const local = localHeader({
    name,
    crc: checksum,
    compressedSize: compressed.length,
    uncompressedSize: content.length,
  });
  localParts.push(local, name, compressed);
  centralParts.push(
    centralHeader({
      name,
      crc: checksum,
      compressedSize: compressed.length,
      uncompressedSize: content.length,
      offset,
      mode,
    }),
    name,
  );
  offset += local.length + name.length + compressed.length;
}
if (unusedModes.size > 0) {
  throw new Error(`mode manifest lists files that were not staged: ${[...unusedModes].sort().join(', ')}`);
}

const centralOffset = offset;
const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
const entryCount = files.length;
requireZip32(centralOffset < ZIP32_MAX_VALUE, `central directory offset ${centralOffset} reaches the ZIP64 sentinel`);
requireZip32(centralSize < ZIP32_MAX_VALUE, `central directory size ${centralSize} reaches the ZIP64 sentinel`);

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entryCount, 8);
end.writeUInt16LE(entryCount, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(centralOffset, 16);
end.writeUInt16LE(0, 20);

const archive = Buffer.concat([...localParts, ...centralParts, end]);
const archiveSha256 = createHash('sha256').update(archive).digest('hex');
const temporary = path.join(
  path.dirname(outputCapture.commitPath),
  `.${path.basename(outputCapture.commitPath)}.${randomBytes(16).toString('hex')}.tmp`,
);
let descriptor;
let candidateIdentity;
let candidateBinding;
try {
  const noFollow = process.platform === 'win32' ? 0 : (fs.constants.O_NOFOLLOW || 0);
  descriptor = fs.openSync(
    temporary,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow,
    0o666,
  );
  let candidateMetadata;
  try {
    candidateMetadata = fs.fstatSync(descriptor, { bigint: true });
  } catch (error) {
    try {
      const retry = fs.fstatSync(descriptor, { bigint: true });
      if (retry.isFile() && retry.ino !== 0n) {
        candidateIdentity = { device: retry.dev, inode: retry.ino };
      }
    } catch {}
    throw error;
  }
  if (!candidateMetadata.isFile() || candidateMetadata.ino === 0n) {
    throw new Error(`archive candidate identity is unavailable: ${temporary}`);
  }
  candidateIdentity = {
    device: candidateMetadata.dev,
    inode: candidateMetadata.ino,
  };
  fs.writeFileSync(descriptor, archive);
  if (outputCapture.mode !== null) fs.fchmodSync(descriptor, outputCapture.mode);
  fs.fsyncSync(descriptor);
  fs.closeSync(descriptor);
  descriptor = undefined;
  const candidate = captureRegularFileBinding(temporary, {
    subject: 'archive-candidate',
    expectedIdentity: candidateIdentity,
    expectedSha256: archiveSha256,
    expectedBytes: archive.length,
    ...(outputCapture.mode === null ? {} : { expectedMode: outputCapture.mode }),
  });
  if (candidate.status !== 'captured') {
    throw new Error(
      `archive candidate cannot be published safely (${candidate.reason?.code || 'capture-failed'}): ${temporary}`,
    );
  }
  candidateBinding = candidate.binding;
  const verifiedOutput = verifyAtomicOutput(outputCapture.snapshot);
  if (verifiedOutput.status !== 'match') {
    throw new Error(
      `archive output changed before publication (${verifiedOutput.reason?.code || 'verification-failed'}): ${output}`,
    );
  }
  const verifiedCandidate = verifyRegularFileBinding(candidateBinding);
  if (verifiedCandidate.status !== 'match') {
    throw new Error(
      `archive candidate changed before publication (${verifiedCandidate.reason?.code || 'verification-failed'}): ${temporary}`,
    );
  }
  const releasedCandidate = releaseRegularFileBinding(candidateBinding);
  candidateBinding = undefined;
  if (releasedCandidate.status !== 'released') {
    throw new Error(
      `archive candidate handle could not be released (${releasedCandidate.reason?.code || 'release-failed'}): ${temporary}`,
    );
  }
  fs.renameSync(temporary, outputCapture.commitPath);
  candidateIdentity = undefined;
} finally {
  if (descriptor !== undefined) fs.closeSync(descriptor);
  if (candidateBinding) releaseRegularFileBinding(candidateBinding);
  if (candidateIdentity) {
    const cleanup = removeOwnedRegularFile(temporary, candidateIdentity, {
      subject: 'archive-candidate',
    });
    if (!['removed', 'absent', 'preserved'].includes(cleanup.status)) {
      throw new Error(
        `archive candidate could not be cleaned safely (${cleanup.reason?.code || 'cleanup-failed'}): ${temporary}`,
      );
    }
  }
}
console.log(`built ${output} (${entryCount} files)`);
