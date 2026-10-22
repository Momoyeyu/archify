import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'benchmarks/diagram-quality/benchmark.mjs');
function run(args) { return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 90000 }); }

test('public corpus is checked before its provisional cases can be used as evidence', () => {
  const r = run(['check']);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const d = JSON.parse(r.stdout);
  assert.equal(d.coreCases, 30);
  assert.equal(d.extensionCases, 10);
  assert.equal(d.optimizationEligible, false);
  assert.deepEqual(d.splitCounts, { development: 15, calibration: 5, holdout: 10, extension: 10 });
});

test('invalid options cannot silently become a valid measurement', () => {
  const r = run(['check', '--invented', 'true']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'USAGE');
});
