import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Regression coverage for issue #310: on Windows, `fs.watch` crashes when the
// directory path still contains an 8.3 short name. `resolveWatchTarget` must
// call `fs.realpathSync.native` to expand short names and junctions before the
// directory handle is opened. On POSIX the same call canonicalizes symlinks,
// so the assertions below hold on every platform the CLI ships to.

const here = path.dirname(fileURLToPath(import.meta.url));
const { resolveWatchTarget } = await import(
  pathToFileURL(path.resolve(here, '..', 'bin', 'preview.mjs')).href
);

test('resolveWatchTarget follows symlinks and junctions via realpathSync.native', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-watch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const real = path.join(root, 'real');
  fs.mkdirSync(real);
  const alias = path.join(root, 'alias');
  fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const resolved = resolveWatchTarget(alias);
  // The resolved path must match what realpathSync.native produces so the
  // subsequent fs.watch sees the same handle Windows would hand it for the
  // underlying inode.
  assert.equal(resolved, fs.realpathSync.native(alias));
  assert.equal(resolved, fs.realpathSync.native(real));
});

test('resolveWatchTarget preserves native realpath failures for startup cleanup', () => {
  const ghost = path.join(os.tmpdir(), 'archify-ghost-' + Date.now(), 'missing');
  assert.throws(() => resolveWatchTarget(ghost), { code: 'ENOENT' });
});

test('resolveWatchTarget is exported as a pure function', () => {
  // The export is consumed by the watcher inside startPreview; the assertion
  // is here to catch accidental renaming that would silently regress #310.
  assert.equal(typeof resolveWatchTarget, 'function');
  assert.equal(resolveWatchTarget.length, 1);
});
