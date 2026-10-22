import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateGeometry } from '../benchmarks/diagram-quality/metrics.mjs';

const chromePath = process.env.ARCHIFY_CHROME;
const modulePath = '../benchmarks/diagram-quality/portable-browser.mjs';
const runtimeRoot = process.env.ARCHIFY_PILOT_RUNTIME_ROOT || path.resolve('..', 'deliverables/benchmark-real-pilot-20261021/runtime');
const nativeMermaid = chromePath && fs.existsSync(path.join(runtimeRoot, 'node_modules/mermaid/dist/mermaid.min.js'));
const node = (x, y, label, attrs = '') => `<g ${attrs}><rect x="${x}" y="${y}" width="120" height="60" fill="white" stroke="black"/><text x="${x + 60}" y="${y + 35}" text-anchor="middle">${label}</text></g>`;
const marker = (shape = '<path d="M0,0 L10,5 L0,10 Z"/>') => `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto">${shape}</marker></defs>`;
const route = (attrs = '', d = 'M160 110 L360 110') => `<path d="${d}" fill="none" stroke="black" marker-end="url(#arrow)" ${attrs}/>`;
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><style>text{font:18px sans-serif}</style>${body}</svg>`;
async function observe(t, source, extension = 'svg') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-portable-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const artifactPath = path.join(dir, `fixture.${extension}`), screenshotPath = path.join(dir, 'capture.png');
  fs.writeFileSync(artifactPath, source);
  const { observePortableArtifact } = await import(modulePath);
  const result = await observePortableArtifact({ artifactPath, chromePath, screenshotPath });
  assert.equal(fs.existsSync(result.observation.browserProfile), false, 'observer must close its Chrome profile');
  assert.ok(fs.statSync(screenshotPath).size > 1000);
  return result;
}
const labels = result => result.graph.edges.map(e => [result.graph.nodes.find(n => n.id === e.from)?.label, result.graph.nodes.find(n => n.id === e.to)?.label, e.label]);

test('portable observer exposes a gold-independent artifact entry point', async () => {
  const loaded = await import(modulePath).catch(() => ({}));
  assert.equal(typeof loaded.observePortableArtifact, 'function');
});

test('portable SVG observes arbitrary labels, disconnected nodes and geometry despite false metadata', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(marker() + node(40, 80, 'α intake', 'data-node-id="fake-Z"') + node(360, 80, 'Queue β') + node(600, 330, 'Disconnected Ω') + route('data-edge-from="fake-Z" data-edge-to="lies"') + '<text x="250" y="96">publish ζ</text>' + '<g style="display:none" data-node-id="hidden"><rect x="0" y="0" width="20" height="20"/><text>Invented</text></g>'));
  assert.equal(result.graph.status, 'verified', JSON.stringify(result.graph.unknownReasons));
  assert.deepEqual(result.graph.nodes.map(n => n.label), ['α intake', 'Queue β', 'Disconnected Ω']);
  assert.deepEqual(labels(result), [['α intake', 'Queue β', 'publish ζ']]);
  assert.deepEqual(result.observation.bounds, { x: 80, y: 90, width: 1280, height: 720 });
  assert.ok(result.observation.nodes.every(n => n.rect.width > 0 && n.visible));
});

test('portable routes bind geometric endpoints through branches and two opposite arrows', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(marker() + node(40, 80, 'Left') + node(360, 80, 'Right') + node(360, 300, 'Lower') + route('', 'M160 95 L360 95') + route('', 'M360 125 L160 125') + route('', 'M100 140 L100 330 L360 330') + '<text x="240" y="83">forward</text><text x="240" y="150">return</text><text x="210" y="318">branch</text>'));
  assert.equal(result.graph.status, 'verified', JSON.stringify(result.graph.unknownReasons));
  assert.deepEqual(labels(result), [['Left', 'Right', 'forward'], ['Right', 'Left', 'return'], ['Left', 'Lower', 'branch']]);
});

test('portable reversed local arrow paint is unverified despite correct claimed direction', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(marker('<polygon points="10,0 0,5 10,10"/>') + node(40, 80, 'First') + node(360, 80, 'Second') + route('data-edge-from="First" data-edge-to="Second"')));
  assert.equal(result.graph.status, 'unverified');
  assert.match(result.graph.unknownReasons.join(' '), /arrowhead/i);
});

test('portable hidden route is a visible omission rather than an adapter skip', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(marker() + node(40, 80, 'First') + node(360, 80, 'Second') + route('style="display:none"')));
  assert.equal(result.graph.status, 'verified', JSON.stringify(result.graph.unknownReasons));
  assert.deepEqual(result.graph.edges, []);
});

test('portable later opaque fill cannot grant credit for a covered label even with pointer-events none', { skip: !chromePath }, async t => {
  for (const pointerEvents of ['auto', 'none']) {
    const result = await observe(t, svg(node(40, 80, 'Secret label') + node(360, 80, 'Visible label') + `<rect x="45" y="90" width="110" height="45" fill="white" pointer-events="${pointerEvents}"/>`));
    assert.equal(result.graph.status, 'unverified');
    assert.ok(!result.graph.nodes.some(n => n.label === 'Secret label'), 'covered paint must not be a semantic node');
    assert.match(result.graph.unknownReasons.join(' '), /cover|occlu/i);
  }
});

test('portable unsupported arrow paint stays unverified even with known dangling endpoints', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(node(40, 80, 'First') + node(360, 80, 'Second') + '<path d="M220 220 L320 220" fill="none" stroke="black"/>'));
  assert.equal(result.graph.status, 'unverified');
  assert.equal(result.observation.edges[0].from, null);
  assert.equal(result.observation.edges[0].to, null);
  assert.match(result.graph.unknownReasons.join(' '), /arrowhead/i);
});

test('portable overlapping boxes remain observed and trigger measured geometry failure', { skip: !chromePath }, async t => {
  const result = await observe(t, svg(node(40, 80, 'Upper') + node(130, 120, 'Lower')));
  assert.equal(result.observation.status, 'verified', JSON.stringify(result.observation.unknownReasons));
  assert.ok(evaluateGeometry(result.observation).metrics.counts.node_overlap > 0);
});

test('portable HTML observes painted bordered div nodes and overlay connectors', { skip: !chromePath }, async t => {
  const result = await observe(t, `<html><body style="margin:0"><main style="position:relative;width:800px;height:500px"><svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" style="position:absolute">${marker()}${route()}<text x="250" y="96">send</text></svg><div style="position:absolute;box-sizing:border-box;left:40px;top:80px;width:120px;height:60px;border:1px solid black;display:grid;place-items:center">Browser</div><div style="position:absolute;box-sizing:border-box;left:360px;top:80px;width:120px;height:60px;border:1px solid black;display:grid;place-items:center">Worker</div></main></body></html>`, 'html');
  assert.equal(result.graph.status, 'verified', JSON.stringify(result.graph.unknownReasons));
  assert.deepEqual(labels(result), [['Browser', 'Worker', 'send']]);
});

test('portable native Mermaid observes its rectangles, local shadow, markers and opposite routes without metadata authority', { skip: !nativeMermaid }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-portable-mermaid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source.mmd'), artifactPath = path.join(dir, 'artifact.html');
  fs.writeFileSync(source, 'flowchart LR\nA["Strange α"]\nB["Other β"]\nC["Branch Ω"]\nA -->|forward| B\nB -->|return| A\nB -->|branch| C\n');
  const { renderPilotSource } = await import('../benchmarks/diagram-quality/pilot-render.mjs');
  await renderPilotSource({ format: 'mermaid', source, output: artifactPath, chromePath, runtimeRoot });
  const { observePortableArtifact } = await import(modulePath);
  const result = await observePortableArtifact({ artifactPath, chromePath });
  assert.equal(result.graph.status, 'verified', JSON.stringify(result.graph.unknownReasons));
  assert.deepEqual(result.graph.nodes.map(n => n.label), ['Strange α', 'Other β', 'Branch Ω']);
  assert.deepEqual(labels(result), [['Strange α', 'Other β', 'forward'], ['Other β', 'Strange α', 'return'], ['Other β', 'Branch Ω', 'branch']]);
  assert.equal(fs.existsSync(result.observation.browserProfile), false);
});

test('portable measured dangling endpoint is a known missing relation',{skip:!chromePath},async t=>{
 const result=await observe(t,svg(marker()+node(40,80,'Origin')+node(360,80,'Destination')+route('','M160 110 L260 230')+'<text x="235" y="200">deliver</text>'));
 assert.equal(result.graph.status,'verified',JSON.stringify(result.graph.unknownReasons));assert.deepEqual(result.graph.edges,[]);assert.equal(result.observation.edges.length,1);assert.equal(result.observation.edges[0].to,null);assert.equal(result.observation.edges[0].visible,false);
});
test('portable competing endpoint boxes remain uncertain',{skip:!chromePath},async t=>{
 const result=await observe(t,svg(marker()+node(40,80,'Origin')+node(360,80,'Upper')+node(360,150,'Lower')+route('','M160 110 L200 110 L200 145 L360 145')));
 assert.equal(result.graph.status,'unverified');assert.match(result.graph.unknownReasons.join(' '),/ambiguous/i);
});
