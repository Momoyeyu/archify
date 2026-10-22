import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyFiles, sha256, main } from '../benchmarks/diagram-quality/benchmark.mjs';
import { fixture } from './fixtures/diagram-quality-score.mjs';

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

test('transparent, covered, clipped text and invalid arrows cannot establish visible facts', async t => {
  if (!process.env.ARCHIFY_CHROME) return t.skip('Set ARCHIFY_CHROME for browser E2E');
  const { observeArtifact } = await import('../benchmarks/diagram-quality/browser.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-quality-paint-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const graph = { status: 'verified', nodes: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }], edges: [{ from: 'a', to: 'b', label: 'secret' }] };
  const variants = [
    { name: 'transparent', textStyle: 'fill:transparent', badNode: true },
    { name: 'covered', overlay: '<rect x="0" y="0" width="220" height="240" fill="white"/>', badNode: true },
    { name: 'clipped', textStyle: 'clip-path:inset(100%)', badNode: true },
    { name: 'hidden-edge-label', edgeLabelStyle: 'opacity:0', badLabel: true },
    { name: 'missing-marker', marker: 'missing', badEdge: true },
    { name: 'empty-marker', marker: 'empty', badEdge: true },
    { name: 'transparent-marker', marker: 'transparent', badEdge: true },
    { name: 'double-arrow', startMarker: 'url(#arrow)', badEdge: true },
    { name: 'zero-marker', marker: 'zero', badEdge: true },
    { name: 'hidden-marker', marker: 'hidden', badEdge: true },
  ];
  for (const v of variants) {
    const file = path.join(dir, v.name + '.html');
    fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="black"/></marker><marker id="empty"/><marker id="transparent"><polygon points="0 0, 10 3.5, 0 7" fill="transparent"/></marker><marker id="zero" markerWidth="0" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7"/></marker><marker id="hidden" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" visibility="hidden"/></marker></defs><g data-node-id="a"><rect x="20" y="60" width="130" height="60"/><text x="40" y="95" font-size="20" fill="white" style="${v.textStyle || ''}">Client</text></g><g data-node-id="b"><rect x="400" y="60" width="130" height="60"/><text x="420" y="95" font-size="20" fill="white">Server</text></g><path data-edge-from="a" data-edge-to="b" d="M150 90L400 90" fill="none" stroke="black" marker-start="${v.startMarker || 'none'}" marker-end="url(#${v.marker || 'arrow'})"/><g data-edge-from="a" data-edge-to="b" style="${v.edgeLabelStyle || ''}"><text x="240" y="80" font-size="20">secret</text></g>${v.overlay || ''}</svg>`);
    const o = await observeArtifact({ artifactPath: file, graph, chromePath: process.env.ARCHIFY_CHROME });
    if (v.badNode) assert.ok(o.status === 'unverified' || !o.nodes.find(n => n.id === 'a').visible, v.name);
    if (v.badEdge) assert.ok(o.status === 'unverified' || !o.edges[0].visible, v.name);
    if (v.badLabel) assert.ok(o.status === 'unverified' || o.edges[0].label !== 'secret' || !o.edges[0].visible, v.name);
    assert.equal(fs.existsSync(o.browserProfile), false);
  }
});

test('browser observer reads painted text and closes its temporary Chrome profile', async t => {
  if (!process.env.ARCHIFY_CHROME) return t.skip('Set ARCHIFY_CHROME for browser E2E');
  const { observeArtifact } = await import('../benchmarks/diagram-quality/browser.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-quality-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'diagram.html');
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><g data-node-id="a" data-node-label="FAKE"><rect x="20" y="60" width="130" height="60"/><text x="40" y="95" font-size="20" fill="white">Client</text></g><g data-node-id="b" opacity="0"><rect x="400" y="60" width="130" height="60"/><text x="420" y="95" font-size="20">Server</text></g><path data-edge-from="a" data-edge-to="b" d="M150 90L400 90" stroke="black"/></svg>`);
  const graph = { nodes: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }], edges: [{ from: 'a', to: 'b' }] };
  const o = await observeArtifact({ artifactPath: file, graph, chromePath: process.env.ARCHIFY_CHROME });
  assert.equal(o.nodes.find(n => n.id === 'a').label, 'Client');
  assert.equal(o.nodes.find(n => n.id === 'b').visible, false);
  assert.equal(o.method, 'chrome-dom-independent');
  assert.equal(fs.existsSync(o.browserProfile), false);
});

test('one score command exports matching Chinese HTML, CSV and unrounded numeric JSON',async t=>{
  if(!process.env.ARCHIFY_CHROME) return t.skip('Run through test:browser');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-cli-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const {receipt,manifest}=fixture();
  fs.writeFileSync(path.join(dir,'receipts.jsonl'),JSON.stringify(receipt)+'\n');
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(manifest));
  const output=path.join(dir,'out');
  const result=await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',output,'--corpus',corpusPath]);
  const card=JSON.parse(fs.readFileSync(path.join(output,'scorecard.json')));
  assert.ok(Number.isFinite(card.methods[0].automatic));
  assert.equal(card.methods[0].comprehensive,null);
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/自动|总分/);
  assert.match(fs.readFileSync(path.join(output,'scores.csv'),'utf8'),/内容|content/);
  assert.ok(result.scorecard || result.methods);
  const optimizer=await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',path.join(dir,'optimizer'),'--corpus',corpusPath,'--score-only','true']);
  assert.equal(optimizer.optimizerScore,card.methods[0].automatic);
  // A review update changes only the comprehensive score, never automatic scoring.
  const ratings={readability:4,hierarchy:4,layout:4,style:4,aesthetics:4};
  const reviews=['a','b'].map(reviewerId=>({taskId:receipt.taskId,artifactHash:receipt.artifactHash,reviewerId,rubricVersion:'diagram-quality-human-v1',status:'completed',independent:true,ratings}));
  fs.writeFileSync(path.join(dir,'reviews.json'),JSON.stringify({reviews}));
  await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',path.join(dir,'reviewed'),'--corpus',corpusPath,'--reviews',path.join(dir,'reviews.json'),'--track','full']);
  const updated=JSON.parse(fs.readFileSync(path.join(dir,'reviewed','scorecard.json')));
  assert.equal(updated.methods[0].automatic,card.methods[0].automatic);
  assert.equal(updated.methods[0].scores.human,75);
  assert.ok(Number.isFinite(updated.methods[0].comprehensive));
});
test('batch rerender preserves recorded generation completion instead of charging offline grader time',async t=>{
  if(!process.env.ARCHIFY_CHROME)return t.skip('Set ARCHIFY_CHROME for actual rerender');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-timing-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const {receipt}=fixture();
  const run={runId:'recorded-generation',taskId:receipt.taskId,arm:receipt.arm,model:receipt.model,repeat:1,status:'completed',startedAt:receipt.startedAt,completedAt:receipt.completedAt,usage:{inputTokens:100,outputTokens:50,costUsd:.05},identity:{budget:{maxCandidates:1,maxDurationMs:60000,maxCostUsd:.25}}};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusPath,entries:[{taskId:run.taskId,source:path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'),format:'archify',run}]}));
  const result=await main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out'),'--chrome',process.env.ARCHIFY_CHROME]);
  assert.equal(result.scorecard.rows[0].raw.durationMs,20000);
  assert.equal(result.scorecard.rows[0].scores.speed,80);
  const artifactHash=result.scorecard.rows[0].artifactHash;
  const multi={...run,runId:'multiple-candidate-generation',candidates:[{artifactHash:'b'.repeat(64),submittedAt:'2026-10-21T00:00:10Z',objectivePassed:true},{artifactHash,submittedAt:run.completedAt}],identity:{budget:{maxCandidates:2,maxDurationMs:60000,maxCostUsd:.25}}};
  fs.writeFileSync(path.join(dir,'multiple.json'),JSON.stringify({corpus:corpusPath,entries:[{taskId:run.taskId,source:path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'),format:'archify',artifact:path.join(dir,'out','artifacts',artifactHash+'.html'),run:multi}]}));
  const repaired=await main(['run','--experiment',path.join(dir,'multiple.json'),'--output',path.join(dir,'repaired'),'--chrome',process.env.ARCHIFY_CHROME]);
  assert.equal(repaired.scorecard.rows[0].scores.speed,80,'unknown earlier drafts cannot block final-delivery timing');
  assert.ok(Number.isFinite(repaired.scorecard.methods[0].automatic));
});
test('real Chrome demo exports a numerical example and separate truthful offline C/L measurements',async t=>{
  if(!process.env.ARCHIFY_CHROME) return t.skip('Set ARCHIFY_CHROME for real browser E2E');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-e2e-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await main(['demo','--output',path.join(dir,'demo'),'--chrome',process.env.ARCHIFY_CHROME]);
  const example=JSON.parse(fs.readFileSync(path.join(dir,'demo','scorecard.json')));
  assert.equal(example.dataKind,'synthetic-arithmetic');
  assert.deepEqual(example.methods.map(m=>+m.comprehensive.toFixed(1)),[90.2,82.5]);
  assert.ok(example.rows.every(r=>r.artifactHash==null),'fictional arithmetic cannot inherit a real diagram identity');
  const actual=JSON.parse(fs.readFileSync(path.join(dir,'demo','offline','scorecard.json')));
  assert.equal(actual.rows.length,2);
  assert.ok(actual.rows.every(r=>r.scores.content===100 && r.scores.layout>0 && r.scores.layout<=100));
  assert.ok(actual.rows.every(r=>r.automatic===null && r.scores.cost===null));
  const receipts=fs.readFileSync(path.join(dir,'demo','offline','receipts.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(receipts[0].sourceHash,sha256(fs.readFileSync(path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'))));
  for(const file of ['index.html','scores.csv','scorecard.json','scores.png','review.html','offline/index.html','offline/scores.png']) assert.ok(fs.existsSync(path.join(dir,'demo',file)),file);
  if(process.env.ARCHIFY_SCORE_EXPORT) {fs.mkdirSync(process.env.ARCHIFY_SCORE_EXPORT,{recursive:true});fs.cpSync(path.join(dir,'demo'),process.env.ARCHIFY_SCORE_EXPORT,{recursive:true});}
});
test('standalone run entry point completes and prints the same score plus raw units',t=>{
  if(!process.env.ARCHIFY_CHROME) return t.skip('Run through test:browser');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-process-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const run={runId:'process-fixture',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'no_candidate',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z'};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusPath,entries:[{taskId:run.taskId,run}]}));
  const result=spawnSync(process.execPath,[path.join(root,'benchmarks/diagram-quality/benchmark.mjs'),'run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/0\.0 分/);
  assert.match(result.stdout,/秒/);assert.match(result.stdout,/tokens/);assert.match(result.stdout,/费用未测|USD/);
  assert.ok(fs.existsSync(path.join(dir,'out','scorecard.json')));
});
test('invalid generated JSON is a known zero-scoring task failure, not a missing experiment',async t=>{
  if(!process.env.ARCHIFY_CHROME) return t.skip('Run through test:browser');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-invalid-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'bad.json'),'{');
  const run={runId:'invalid-json-fixture',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'completed',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z'};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusPath,entries:[{taskId:run.taskId,source:'bad.json',format:'archify',run}]}));
  const result=await main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')]);
  assert.equal(result.scorecard.methods[0].automatic,0);
  assert.equal(result.scorecard.rows[0].knownFailure,true);
  fs.writeFileSync(path.join(dir,'existing.html'),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  fs.writeFileSync(path.join(dir,'with-artifact.json'),JSON.stringify({corpus:corpusPath,entries:[{taskId:run.taskId,source:'bad.json',format:'archify',artifact:'existing.html',run}]}));
  const withArtifact=await main(['run','--experiment',path.join(dir,'with-artifact.json'),'--output',path.join(dir,'existing-out')]);
  assert.equal(withArtifact.scorecard.methods[0].automatic,0);
});
