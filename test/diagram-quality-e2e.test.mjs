import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyFiles, sha256, main } from '../benchmarks/diagram-quality/benchmark.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusPath = path.join(root, 'benchmarks/diagram-quality/corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

test('offline E2E: actual render, Chrome observation, editing, negative intervention, report and cleanup', async t => {
  if (!process.env.ARCHIFY_CHROME) return t.skip('Set ARCHIFY_CHROME to run browser E2E');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-quality-e2e-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const receipts = [], cases = ['architecture-02', 'workflow-01'];
  for (const id of cases) {
    const task = corpus.tasks.find(t => t.id === id);
    const sourceFile = path.join(dir, id + '.json'), artifact = path.join(dir, id + '.html');
    // Deliberately hand-authored fixture layout; this tests the harness, not AI generation performance.
    const source = task.type === 'architecture' ? {
      schema_version: 1, diagram_type: 'architecture', meta: { title: 'Offline fixture: weather alert', output: id + '.html' },
      components: [
        { id: 'n1', type: 'external', label: 'Weather Feed', pos: [40, 210], size: [180, 80] },
        { id: 'n2', type: 'backend', label: 'Alert API', pos: [450, 210], size: [180, 80] },
        { id: 'n3', type: 'database', label: 'Subscriber Store', pos: [920, 60], size: [220, 80] },
        { id: 'n4', type: 'external', label: 'SMS Provider', pos: [920, 370], size: [220, 80] },
      ],
      connections: [
        { from: 'n1', to: 'n2', label: 'forecast' },
        { from: 'n2', to: 'n3', label: 'lookup subscribers', fromSide: 'top', toSide: 'left', via: [[540, 100], [850, 100]] },
        { from: 'n2', to: 'n4', label: 'send alert', fromSide: 'bottom', toSide: 'left', via: [[540, 410], [850, 410]] },
      ],
    } : {
      schema_version: 1, diagram_type: 'workflow', meta: { title: 'Offline fixture: access request', output: id + '.html' },
      lanes: [{ id: 'request', label: 'Intake' }, { id: 'grant', label: 'Approved' }, { id: 'reject', label: 'Denied' }],
      nodes: [
        { id: 'n1', lane: 'request', col: 0, type: 'external', label: 'Request' },
        { id: 'n2', lane: 'request', col: 1, type: 'security', label: 'Review' },
        { id: 'n3', lane: 'grant', col: 2, type: 'backend', label: 'Grant' },
        { id: 'n4', lane: 'reject', col: 3, type: 'external', label: 'Reject' },
      ],
      edges: [
        { from: 'n1', to: 'n2', label: 'submit' },
        { from: 'n2', to: 'n3', label: 'approved', route: 'drop', fromSide: 'bottom', toSide: 'top' },
        { from: 'n2', to: 'n4', label: 'denied', route: 'outside-right', fromSide: 'right', toSide: 'right' },
      ],
    };
    write(sourceFile, source);
    const startedAt = new Date().toISOString();
    const render = spawnSync(process.execPath, [path.join(root, 'archify/bin/archify.mjs'), 'render', task.type, sourceFile, artifact], { cwd: dir, encoding: 'utf8', timeout: 30000 });
    assert.equal(render.status, 0, render.stderr + render.stdout);
    const artifactHash = sha256(fs.readFileSync(artifact));
    const submittedAt = new Date().toISOString(), runFile = path.join(dir, id + '-run.json');
    write(runFile, { runId: id + '-offline-e2e', taskId: id, arm: 'archify-fixture', model: 'none-offline-fixture', repeat: 1, status: 'completed', startedAt, completedAt: submittedAt, candidates: [{ submittedAt, artifactHash }], identity: { budget: { maxCandidates: 1, maxDurationMs: 30000 } }, artifactPath: 'artifacts/' + artifactHash + '.html', sourceEvidence: 'hand-authored smoke fixture; no model calls' });
    const receipt = await verifyFiles({ manifest: corpusPath, task: id, source: sourceFile, format: 'archify', artifact, run: runFile, chrome: process.env.ARCHIFY_CHROME, screenshot: path.join(dir, id + '.png') });
    assert.equal(receipt.objective.semantic.status, 'verified', JSON.stringify(receipt.unknownReasons));
    assert.equal(receipt.objective.semantic.passed, true, JSON.stringify(receipt.objective.semantic));
    assert.equal(receipt.objective.geometry.status, 'verified');
    assert.equal(receipt.editability.status, 'verified', JSON.stringify(receipt.editability));
    assert.equal(receipt.editability.passed, true);
    assert.equal(receipt.grader.browserProfileCleaned, true);
    assert.equal(fs.existsSync(receipt.observation.browserProfile), false);
    assert.equal(receipt.optimization.eligible, false);
    assert.equal(receipt.usage.totalTokens, null);
    assert.equal(receipt.human.status, 'not_requested');
    write(path.join(dir, id + '-receipt.json'), receipt);
    // Exercise the optional import route with explicitly synthetic test data, then discard it.
    const reviewFile = path.join(dir, id + '-synthetic-review.json'), reviewedFile = path.join(dir, id + '-synthetic-reviewed.json');
    write(reviewFile, { taskId: id, artifactHash, reviewerId: 'synthetic-test-fixture-not-a-human', rubricVersion: 'diagram-quality-human-v1', status: 'completed', ratings: { readability: 3, hierarchy: 3, layout: 3, style: 3, aesthetics: 3 }, semantic: { judgement: 'unverified' }, independent: false, note: 'Test fixture only; no human judgement occurred' });
    const reviewed = await main(['review', '--receipt', path.join(dir, id + '-receipt.json'), '--review', reviewFile, '--output', reviewedFile]);
    assert.equal(reviewed.human.status, 'completed'); assert.deepEqual(reviewed.objective, receipt.objective); assert.deepEqual(reviewed.optimization, receipt.optimization);
    fs.rmSync(reviewFile); fs.rmSync(reviewedFile);
    const sensitivity = await main(['ablate', '--manifest', corpusPath, '--receipt', path.join(dir, id + '-receipt.json'), '--source', sourceFile, '--format', 'archify', '--output', path.join(dir, id + '-ablation.json')]);
    for (const name of ['drop-required-node', 'reverse-first-edge', 'hide-first-node', 'truncate-required-label', 'tiny-font', 'overlap-first-two-nodes']) assert.equal(sensitivity.variants.find(v => v.name === name).passed, false, name);
    for (const name of ['drop-required-node', 'reverse-first-edge', 'hide-first-node', 'truncate-required-label']) assert.equal(sensitivity.variants.find(v => v.name === name).semantic.passed, false, name + ' must change semantic acceptance');
    assert.ok(sensitivity.variants.find(v => v.name === 'overlap-first-two-nodes').geometry.metrics.counts.node_overlap > (receipt.objective.geometry.metrics.counts.node_overlap || 0));
    assert.ok(sensitivity.variants.find(v => v.name === 'tiny-font').geometry.metrics.counts.tiny_font >= receipt.observation.texts.filter(t => t.visible).length);
    assert.equal(sensitivity.variants.find(v => v.name === 'equivalent-translation').passed, receipt.objective.passed);
    assert.deepEqual(sensitivity.variants.find(v => v.name === 'equivalent-translation').geometry.metrics.counts, receipt.objective.geometry.metrics.counts);
    // Forged imported measurements must not become verified evidence.
    const imported = path.join(dir, id + '-observation.json'); write(imported, { ...receipt.observation, status: 'verified' });
    const unverified = await verifyFiles({ manifest: corpusPath, task: id, source: sourceFile, format: 'archify', artifact, run: runFile, observation: imported, chrome: process.env.ARCHIFY_CHROME });
    assert.equal(unverified.objective.status, 'unverified');
    receipts.push(receipt);
    fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
    fs.copyFileSync(artifact, path.join(dir, 'artifacts', artifactHash + '.html'));
  }
  const results = path.join(dir, 'receipts.jsonl'), plan = path.join(dir, 'experiment.json');
  fs.writeFileSync(results, receipts.map(r => JSON.stringify(r)).join('\n') + '\n');
  write(plan, { identity: receipts[0].identity, plannedRuns: receipts.map(({ taskId, arm, model, repeat, taskType, complexity }) => ({ taskId, arm, model, repeat, taskType, complexity })) });
  const report = await main(['report', '--manifest', plan, '--results', results, '--output', path.join(dir, 'index.html')]);
  assert.equal(report.recorded, 2); assert.equal(report.coverageComplete, true); assert.equal(report.humanReviewed, false);
  assert.equal(report.optimization.eligible, false);
  // Retain only explicit review artifacts when requested; normal test runs leave no outputs.
  if (process.env.ARCHIFY_E2E_EXPORT) { fs.mkdirSync(process.env.ARCHIFY_E2E_EXPORT, { recursive: true }); fs.cpSync(dir, process.env.ARCHIFY_E2E_EXPORT, { recursive: true }); }
  fs.rmSync(dir, { recursive: true, force: true }); assert.equal(fs.existsSync(dir), false);
});
