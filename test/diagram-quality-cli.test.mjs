import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

test('invalid options cannot silently become a valid measurement', () => {
  const r = run(['check', '--invented', 'true']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).error.code, 'USAGE');
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
