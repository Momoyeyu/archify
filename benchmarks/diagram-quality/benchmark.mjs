#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseSource } from './adapters.mjs';
import { evaluateSemantics } from './metrics.mjs';
import { observeArtifact } from './browser.mjs';
import { evaluateRun, aggregateRuns, attachHumanReview } from './records.mjs';
import { renderReport } from './report.mjs';
import { metrics, humanRubric } from './registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hashFile = file => sha256(fs.readFileSync(file));
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function save(file, value) { fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
export function evaluatorHash() {
  return sha256(['adapters.mjs', 'metrics.mjs', 'browser.mjs', 'records.mjs', 'registry.mjs', 'benchmark.mjs'].map(f => `${f}\n${fs.readFileSync(path.join(here, f), 'utf8')}`).join('\n'));
}
export function checkCorpus(corpus) {
  requireValue(corpus.schemaVersion === 2 && Array.isArray(corpus.tasks), 'Expected a v2 corpus');
  const ids = new Set(), splitCounts = {}, core = new Map(), families = new Map(), complexities = new Map(), extensions = new Map();
  for (const t of corpus.tasks) {
    requireValue(typeof t.id === 'string' && !ids.has(t.id), 'Missing/duplicate task id'); ids.add(t.id);
    requireValue(['development', 'calibration', 'holdout', 'extension'].includes(t.split), 'Invalid split');
    requireValue(t.family && t.prompt && ['small', 'medium', 'large'].includes(t.complexity), 'Missing task metadata');
    requireValue(!families.has(t.family) || families.get(t.family) === t.split, 'Task family leaks across splits'); families.set(t.family, t.split);
    requireValue(Array.isArray(t.expected?.nodes) && Array.isArray(t.expected?.edges), 'Missing expected facts');
    const nodeIds = new Set(t.expected.nodes.map(n => n.id));
    requireValue(nodeIds.size === t.expected.nodes.length && t.expected.nodes.every(n => n.id && n.label), 'Missing/duplicate expected node');
    requireValue(t.expected.edges.every(e => nodeIds.has(e.from) && nodeIds.has(e.to)), 'Unbound expected relation');
    splitCounts[t.split] = (splitCounts[t.split] || 0) + 1;
    if (t.split !== 'extension') {
      core.set(t.type, (core.get(t.type) || 0) + 1);
      const key = t.type + ':' + t.complexity; complexities.set(key, (complexities.get(key) || 0) + 1);
    } else extensions.set(t.type, (extensions.get(t.type) || 0) + 1);
  }
  requireValue(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'].every(type => core.get(type) === 6), 'Core must contain six cases of each native type');
  requireValue([...core.keys()].every(type => ['small', 'medium', 'large'].every(level => complexities.get(type + ':' + level) === 2)), 'Each core type needs two cases per complexity');
  requireValue(['erd', 'class', 'tree', 'timeline', 'waterfall'].every(type => extensions.get(type) === 2), 'Extension needs two cases of each declared type');
  requireValue(corpus.tasks.length === 40 && splitCounts.extension === 10, 'Expected 30 core and 10 extension cases');
  return { schemaVersion: 2, coreCases: 30, extensionCases: 10, splitCounts: Object.fromEntries(['development', 'calibration', 'holdout', 'extension'].map(k => [k, splitCounts[k]])), publicPilot: corpus.publicPilot === true, optimizationEligible: corpus.profile?.calibrated === true && corpus.tasks.every(t => t.goldStatus === 'independently-confirmed'), metrics, humanRubric };
}

// This probe operates on a throw-away copy; source declarations of editability are ignored.
export async function probeEditability({ source, format, type, chromePath }) {
  const unknown = reason => ({ status: 'unverified', passed: false, method: null, unknownReasons: [reason] });
  if (format !== 'archify') return unknown('Independent reload/edit/render probe not yet implemented for ' + format);
  const data = JSON.parse(source), graph = parseSource(format, source, { type });
  if (graph.status !== 'verified') return unknown('Source semantics not fully supported for editing probe');
  const collection = { architecture: 'components', workflow: 'nodes', sequence: 'participants', dataflow: 'nodes', lifecycle: 'states' }[type || data.diagram_type];
  if (!collection || !data[collection]?.length) return unknown('No supported editable native collection');
  const copy = structuredClone(data), changed = copy[collection][0];
  const oldLabel = changed.label ?? changed.name;
  if (typeof oldLabel !== 'string') return unknown('No editable label');
  const sentinel = oldLabel + ' EDIT';
  changed[changed.label !== undefined ? 'label' : 'name'] = sentinel;
  const expected = structuredClone(graph); expected.nodes.find(n => n.id === changed.id).label = sentinel;
  const edited = parseSource(format, JSON.stringify(copy), { type });
  const facts = g => JSON.stringify({ nodes: g.nodes.map(n => [n.id, n.label]), edges: g.edges.map(e => [e.from, e.to, e.label]) });
  requireValue(facts(expected) === facts(edited), 'Editing unexpectedly changed native topology');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-quality-edit-'));
  try {
    const artifact = path.join(temp, 'edited.html'), input = path.join(temp, 'source.json');
    copy.meta = { ...copy.meta, output: 'edited.html' };
    fs.writeFileSync(input, JSON.stringify(copy));
    const render = spawnSync(process.execPath, [path.join(root, 'archify/bin/archify.mjs'), 'render', type || data.diagram_type, input, artifact], { cwd: temp, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    if (render.status !== 0 || !fs.existsSync(artifact)) return { status: 'verified', passed: false, method: 'archify-reload-rename-render', unknownReasons: ['Edited source did not render'] };
    const observation = await observeArtifact({ artifactPath: artifact, graph: edited, chromePath });
    const preserved = evaluateSemantics({ nodes: edited.nodes.map(({ id, label }) => ({ id, label })), edges: edited.edges.map(({ from, to, label }) => ({ from, to, label })) }, edited, observation);
    return { status: preserved.status, passed: preserved.status === 'verified' && preserved.passed, method: 'archify-reload-rename-render', editedNode: changed.id, unknownReasons: observation.unknownReasons };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

export async function verifyFiles(options) {
  const corpusFile = path.resolve(options.manifest || path.join(here, 'corpus.json'));
  const corpus = read(corpusFile); checkCorpus(corpus);
  const task = corpus.tasks.find(t => t.id === options.task);
  requireValue(task, 'Task not present in corpus');
  const source = fs.readFileSync(options.source, 'utf8'), artifactHash = hashFile(options.artifact);
  const graph = parseSource(options.format, source, { type: options.type || task.type });
  const raw = read(options.run);
  const identity = { manifestHash: hashFile(corpusFile), evaluatorHash: evaluatorHash(), profileHash: sha256(JSON.stringify(corpus.profile)), budget: raw.identity?.budget || corpus.budget || {} };
  for (const field of ['manifestHash', 'evaluatorHash', 'profileHash']) if (raw.identity?.[field]) requireValue(raw.identity[field] === identity[field], 'Run ' + field + ' differs from current evaluator inputs');
  requireValue(!raw.artifactHash || raw.artifactHash === artifactHash, 'Artifact digest mismatch');
  requireValue(!raw.sourceHash || raw.sourceHash === sha256(source), 'Source digest mismatch');
  const run = { ...raw, identity, artifactHash, sourceHash: sha256(source) };
  // Imported receipts are untrusted. All earlier candidates remain unknown until independently re-evaluated.
  run.candidates = (raw.candidates || []).map(({ verifiedReceipt, ...candidate }) => candidate);
  requireValue(run.candidates.at(-1)?.artifactHash === artifactHash, 'Final candidate must reference actual artifact digest');
  const start = performance.now();
  const observation = options.observation ? { ...read(options.observation), status: 'unverified', method: 'external-unattested', unknownReasons: ['Imported observations cannot establish independent verification'] } : await observeArtifact({ artifactPath: options.artifact, graph, chromePath: options.chrome, screenshotPath: options.screenshot });
  const editability = await probeEditability({ source, format: options.format, type: options.type || task.type, chromePath: options.chrome });
  const receipt = evaluateRun({ task, run, graph, observation, profile: corpus.profile, editability });
  receipt.grader = { durationMs: Math.round(performance.now() - start), method: observation.method, browserProfileCleaned: observation.browserProfile ? !fs.existsSync(observation.browserProfile) : null };
  receipt.observation = observation;
  if (options.output) save(options.output, receipt);
  return receipt;
}

export function ablate(receipt, task, graph, profile) {
  requireValue(receipt.observation, 'A saved independent observation is required');
  const base = { task, run: { ...receipt, candidates: receipt.candidates.map(({ verifiedReceipt, ...c }) => c) }, graph, observation: receipt.observation, profile, editability: receipt.editability };
  const variants = [];
  const add = (name, change) => {
    const input = structuredClone(base); change(input);
    const r = evaluateRun(input);
    variants.push({ name, passed: r.objective.passed, verified: r.objective.status, semantic: r.objective.semantic, geometry: r.objective.geometry });
  };
  add('baseline', () => {});
  add('drop-required-node', x => { const id = x.graph.nodes.shift()?.id; x.graph.edges = x.graph.edges.filter(e => e.from !== id && e.to !== id); });
  add('reverse-first-edge', x => { if (x.graph.edges.length) [x.graph.edges[0].from, x.graph.edges[0].to] = [x.graph.edges[0].to, x.graph.edges[0].from]; });
  add('hide-first-node', x => { if (x.observation.nodes.length) x.observation.nodes[0].visible = false; });
  add('truncate-required-label', x => { if (x.graph.nodes.length) x.graph.nodes[0].label = ''; });
  add('tiny-font', x => { for (const n of x.observation.texts) n.fontSize = 6; });
  add('overlap-first-two-nodes', x => { if (x.observation.nodes.length > 1) x.observation.nodes[1].rect = { ...x.observation.nodes[0].rect }; });
  add('equivalent-translation', x => {
    for (const n of [...x.observation.nodes, ...x.observation.texts]) { n.rect.x += 1; n.rect.y += 1; }
    for (const e of x.observation.edges) for (const p of e.points) { p.x += 1; p.y += 1; }
    x.observation.bounds.x += 1; x.observation.bounds.y += 1;
  });
  add('palette-only-no-geometric-change', () => {});
  for (const min of [10, 12, 14]) add('font-threshold-' + min, x => { x.profile.minFontPx = min; });
  return { schemaVersion: 2, kind: 'evaluator-sensitivity-replay', causalComponentExperiment: false, sourceArtifactHash: receipt.artifactHash, notice: 'In-memory controlled fact/observation interventions; no new rendered artifact or model calls. Palette is an invariant control. Not a component causal ablation or human preference study.', variants };
}

const allowed = { check: ['manifest'], verify: ['manifest', 'task', 'source', 'format', 'type', 'artifact', 'run', 'chrome', 'observation', 'screenshot', 'output'], report: ['manifest', 'results', 'output'], review: ['receipt', 'review', 'output'], ablate: ['receipt', 'manifest', 'source', 'format', 'output'] };
export async function main(argv) {
  const [command, ...args] = argv, options = {};
  if (!allowed[command]) throw Object.assign(new Error('Usage: benchmark.mjs check|verify|report|review|ablate --option value'), { code: 'USAGE' });
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !allowed[command].includes(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw Object.assign(new Error('Unknown, duplicate or missing option: ' + args[i]), { code: 'USAGE' });
    options[key] = args[i + 1];
  }
  const required = { check: [], verify: ['task', 'source', 'format', 'artifact', 'run'], report: ['manifest', 'results', 'output'], review: ['receipt', 'review', 'output'], ablate: ['receipt', 'source', 'format', 'output'] };
  for (const field of required[command]) if (!options[field]) throw Object.assign(new Error('Missing --' + field), { code: 'USAGE' });
  if (command === 'check') return checkCorpus(read(options.manifest || path.join(here, 'corpus.json')));
  if (command === 'verify') return verifyFiles(options);
  if (command === 'review') { const result = attachHumanReview(read(options.receipt), read(options.review)); save(options.output, result); return result; }
  if (command === 'report') {
    const manifest = read(options.manifest), receipts = fs.readFileSync(options.results, 'utf8').split('\n').filter(s => s.trim()).map(s => JSON.parse(s));
    const result = aggregateRuns(receipts, { manifest }); save(options.output, renderReport(result)); return result;
  }
  const corpus = read(options.manifest || path.join(here, 'corpus.json')), receipt = read(options.receipt), task = corpus.tasks.find(t => t.id === receipt.taskId);
  requireValue(task, 'Unknown receipt task');
  requireValue(receipt.sourceHash === hashFile(options.source), 'Ablation source digest mismatch');
  requireValue(receipt.identity.manifestHash === hashFile(options.manifest || path.join(here, 'corpus.json')) && receipt.identity.profileHash === sha256(JSON.stringify(corpus.profile)) && receipt.identity.evaluatorHash === evaluatorHash(), 'Ablation identity mismatch');
  const result = ablate(receipt, task, parseSource(options.format, fs.readFileSync(options.source, 'utf8'), { type: task.type }), corpus.profile); save(options.output, result); return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)))); }
  catch (error) { console.log(JSON.stringify({ error: { code: error.code === 'USAGE' ? 'USAGE' : 'INVALID_MEASUREMENT', message: error.message } })); process.exitCode = 2; }
}
