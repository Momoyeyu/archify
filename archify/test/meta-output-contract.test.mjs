import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');
const architectureExample = path.join(skillRoot, 'examples', 'web-app.architecture.json');
const workflowFixture = path.join(
  __dirname,
  'fixtures',
  'v1-workflow-explicit-coordinates.workflow.json',
);

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-meta-output-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeDocument(directory, name, source, output) {
  const document = JSON.parse(fs.readFileSync(source, 'utf8'));
  document.meta.output = output;
  const target = path.join(directory, name);
  fs.writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  return target;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function jsonOutput(result) {
  assert.doesNotThrow(
    () => JSON.parse(result.stdout),
    `expected JSON stdout, received:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

test('validate checks authored output even though its verification artifact uses a staging path', t => {
  const directory = workspace(t);
  const invalidOutputs = [
    { output: '', code: 'output/meta-path-syntax' },
    { output: '/absolute/diagram.html', code: 'output/meta-absolute' },
    { output: 'reports\\diagram.html', code: 'output/meta-path-syntax' },
    { output: 'C:diagram.html', code: 'output/meta-path-syntax' },
    { output: 'file:///tmp/diagram.html', code: 'output/meta-path-syntax' },
  ];

  for (const [index, { output, code }] of invalidOutputs.entries()) {
    const input = writeDocument(directory, `invalid-${index}.architecture.json`, architectureExample, output);
    const result = run(['validate', 'architecture', input, '--json'], directory);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const failure = jsonOutput(result);
    assert.equal(failure.ok, false);
    assert.equal(failure.command, 'validate');
    assert.equal(failure.diagnostics.length, 1, result.stdout);
    assert.equal(failure.diagnostics[0].code, code);
    assert.equal(failure.diagnostics[0].subject.path, '/meta/output');
  }

  const valid = writeDocument(
    directory,
    'valid.architecture.json',
    architectureExample,
    'reports/diagram.html',
  );
  const result = run(['validate', 'architecture', valid, '--json'], directory);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(jsonOutput(result).ok, true);
  assert.equal(fs.existsSync(path.join(directory, 'reports')), false);
});

test('an explicit CLI output does not hide an invalid durable authored output', t => {
  const directory = workspace(t);
  const input = writeDocument(
    directory,
    'invalid-override.architecture.json',
    architectureExample,
    'reports\\diagram.html',
  );
  const override = path.join(directory, 'override.html');

  const result = run(['render', 'architecture', input, override], directory);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /output\/meta-path-syntax/);
  assert.equal(fs.existsSync(override), false);
});

test('migration rejects a non-portable authored output without mutating its destination', t => {
  const directory = workspace(t);
  const source = writeDocument(
    directory,
    'invalid.workflow.json',
    workflowFixture,
    'reports\\diagram.html',
  );
  const sourceBytes = fs.readFileSync(source);
  const destination = path.join(directory, 'destination.workflow.json');
  const sentinel = Buffer.from('destination sentinel\n');
  fs.writeFileSync(destination, sentinel);

  const result = run([
    'migrate', 'workflow', source, destination, '--to-schema', '2', '--json',
  ], directory);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.deepEqual(fs.readFileSync(source), sourceBytes);
  assert.deepEqual(fs.readFileSync(destination), sentinel);
  const failure = jsonOutput(result);
  assert.equal(failure.ok, false);
  assert.equal(failure.command, 'migrate');
  assert.equal(failure.diagnostics.length, 1, result.stdout);
  assert.equal(failure.diagnostics[0].code, 'output/meta-path-syntax');
  assert.equal(failure.diagnostics[0].subject.path, '/meta/output');
});

test('migration preserves a portable authored output and remains byte-idempotent', t => {
  const directory = workspace(t);
  const source = writeDocument(
    directory,
    'valid.workflow.json',
    workflowFixture,
    'reports/diagram.html',
  );
  const firstDestination = path.join(directory, 'first.workflow.json');
  const secondDestination = path.join(directory, 'second.workflow.json');

  const first = run([
    'migrate', 'workflow', source, firstDestination, '--to-schema', '2', '--json',
  ], directory);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(JSON.parse(fs.readFileSync(firstDestination, 'utf8')).meta.output, 'reports/diagram.html');

  const second = run([
    'migrate', 'workflow', firstDestination, secondDestination, '--to-schema', '2', '--json',
  ], directory);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.deepEqual(fs.readFileSync(secondDestination), fs.readFileSync(firstDestination));
});
