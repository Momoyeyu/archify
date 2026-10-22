import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser } from '../archify/bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = '../benchmarks/diagram-quality/pilot-render.mjs';
const runtimeRoot = process.env.ARCHIFY_PILOT_RUNTIME_ROOT || path.resolve(root, '../deliverables/benchmark-real-pilot-20261021/runtime');
const chromePath = process.env.ARCHIFY_CHROME;
const realMermaid = chromePath && fs.existsSync(path.join(runtimeRoot, 'node_modules/mermaid/dist/mermaid.min.js'));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><marker id="arrow" orient="auto" markerWidth="10" markerHeight="7" refX="10" refY="3.5"><polygon points="0,0 10,3.5 0,7"/></marker></defs><path d="M 300 200 L 100 200" stroke="black" fill="none" marker-end="url(#arrow)"/><text x="160" y="180">retry</text></svg>';
const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}svg{display:block}</style></head><body>' + svg + '</body></html>\n';

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-pilot-render-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const renderer = await import(modulePath).catch(error => { assert.fail(`Pilot renderer module must be available: ${error.message}`); });
  return {
    dir,
    render: renderer.renderPilotSource,
    source(name, content) { const file = path.join(dir, name); fs.writeFileSync(file, content); return file; },
    output: path.join(dir, 'artifact.html'),
  };
}

test('SVG delivery preserves authored reverse route, styles and labels literally', async t => {
  const f = await fixture(t);
  const source = f.source('source.svg', svg);
  const result = await f.render({ format: 'svg', source, output: f.output });
  assert.equal(result.artifactPath, f.output);
  assert.ok(result.renderer);
  assert.ok(result.version);
  const artifact = fs.readFileSync(f.output, 'utf8');
  assert.ok(artifact.includes(svg));
  assert.doesNotMatch(artifact, /<script\b|data-node-id|data-edge-from/i);
  assert.equal(fs.readFileSync(source, 'utf8'), svg);
});

test('HTML delivery is the exact authored static document', async t => {
  const f = await fixture(t);
  const source = f.source('source.html', html);
  await f.render({ format: 'html', source, output: f.output });
  assert.equal(fs.readFileSync(f.output, 'utf8'), html);
});

test('delivery never overwrites an existing output or symlink target', async t => {
  const f = await fixture(t);
  const source = f.source('source.svg', svg);
  fs.writeFileSync(f.output, 'existing');
  await assert.rejects(f.render({ format: 'svg', source, output: f.output }), /exist|overwrite/i);
  assert.equal(fs.readFileSync(f.output, 'utf8'), 'existing');
  fs.unlinkSync(f.output);
  fs.symlinkSync(path.join(f.dir, 'missing-target'), f.output);
  await assert.rejects(f.render({ format: 'svg', source, output: f.output }), /exist|overwrite/i);
  assert.equal(fs.existsSync(path.join(f.dir, 'missing-target')), false);
});

test('malformed and active or externally dependent SVG/HTML fail without publishing', async t => {
  const f = await fixture(t);
  const cases = [
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>'],
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>'],
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><style>text{fill:url(https://example.com/x)}</style></svg>'],
    ['html', '<!doctype html><html><head></head><body><script>1</script></body></html>'],
    ['html', '<!doctype html><html><head><style>@import "https://example.com/x";</style></head><body></body></html>'],
    ['html', '<!doctype html><html><head></head><body><img src="file:///etc/passwd"></body></html>'],
    ['html', '<!doctype html><html><head></head><body><svg><foreignObject><iframe srcdoc="x"></iframe></foreignObject></svg></body></html>'],
    ['html', '<!doctype html><html><head></head><body><div title="broken></div></body></html>'],
  ];
  for (const [format, content] of cases) {
    const source = f.source(`source.${format}`, content);
    await assert.rejects(f.render({ format, source, output: f.output }), error => error.code === 'PILOT_SOURCE_INVALID', content);
    assert.equal(fs.existsSync(f.output), false);
  }
});

test('Archify invokes its native CLI with the unmodified original source', async t => {
  const f = await fixture(t);
  const source = path.join(root, 'archify/examples/agent-tool-call.workflow.json');
  const before = fs.readFileSync(source);
  const result = await f.render({ format: 'archify', type: 'workflow', source, output: f.output });
  assert.equal(result.renderer, 'archify-native-cli');
  assert.equal(result.version, JSON.parse(fs.readFileSync(path.join(root, 'archify/package.json'))).version);
  assert.ok(fs.statSync(f.output).size > 10000);
  assert.deepEqual(fs.readFileSync(source), before);
  const bad = f.source('bad.json', '{invalid}');
  await assert.rejects(f.render({ format: 'archify', type: 'workflow', source: bad, output: path.join(f.dir, 'bad.html') }), error => error.code === 'PILOT_SOURCE_INVALID');
  assert.equal(fs.existsSync(path.join(f.dir, 'bad.html')), false);
});

test('runtime and filesystem failures cannot be counted as invalid model source', async t => {
  const f = await fixture(t);
  const source = f.source('source.mmd', 'flowchart LR\nA[Start]\nB[End]\nA --> B');
  await assert.rejects(f.render({ format: 'mermaid', source, output: f.output, runtimeRoot: path.join(f.dir, 'missing') }), error => error.code !== 'PILOT_SOURCE_INVALID');
  await assert.rejects(f.render({ format: 'archify', type: 'workflow', source: path.join(f.dir, 'missing.json'), output: f.output }), error => error.code !== 'PILOT_SOURCE_INVALID');
  const invalid = f.source('bad.svg', '<svg>');
  await assert.rejects(f.render({ format: 'svg', source: invalid, output: f.output }), error => error.code === 'PILOT_SOURCE_INVALID');
});

function transientDirectories() {
  return new Set(fs.readdirSync(os.tmpdir()).filter(name => /^(archify-pilot-render-|archify-visual-check-profile-)/.test(name) && !name.startsWith('archify-pilot-render-test-')));
}

test('real Mermaid preserves reverse edges and branch labels as native scriptless SVG, cleaning profiles on success and failure', { skip: realMermaid ? false : 'Requires external pinned Mermaid runtime and Chrome' }, async t => {
  const f = await fixture(t);
  // Isolate the temporary-profile census from concurrent browser test files.
  const previousTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = f.dir;
  t.after(() => { if (previousTmpdir === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmpdir; });
  const original = 'flowchart LR\nA[Start]\nB{Approved}\nC[Finish]\nA --> B\nB -->|yes| C\nB -->|retry| A\n';
  const source = f.source('source.mmd', original);
  const before = transientDirectories();
  const result = await f.render({ format: 'mermaid', source, output: f.output, runtimeRoot, chromePath });
  assert.equal(result.version, '12.2.0');
  const artifact = fs.readFileSync(f.output, 'utf8');
  assert.match(artifact, /<svg\b/);
  assert.match(artifact, /L_B_A_/);
  assert.match(artifact, /L_B_C_/);
  assert.match(artifact, />retry</);
  assert.match(artifact, />yes</);
  assert.doesNotMatch(artifact, /<script\b|<foreignObject\b|data-node-id|data-edge-from/i);
  assert.equal(fs.readFileSync(source, 'utf8'), original);
  const browser = new ChromeVisualBrowser(chromePath);
  try {
    const session = await browser.sessionPromise;
    await browser.cdp.send('Network.enable', {}, session);
    await browser.cdp.send('Network.setBlockedURLs', { urls: ['*'] }, session);
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session); loaded.catch(() => {});
    await browser.cdp.send('Page.navigate', { url: pathToFileURL(f.output).href }, session);
    await loaded;
    const observed = await browser.cdp.send('Runtime.evaluate', { expression: `JSON.stringify({scripts:document.scripts.length,text:document.querySelector('svg').textContent,edges:[...document.querySelectorAll('path.flowchart-link')].map(p=>({id:p.id,end:p.getAttribute('marker-end'),length:p.getTotalLength()}))})`, returnByValue: true }, session);
    const measured = JSON.parse(observed.result.value);
    assert.equal(measured.scripts, 0);
    assert.match(measured.text, /retry/);
    assert.equal(measured.edges.length, 3);
    assert.ok(measured.edges.every(edge => edge.length > 0 && edge.end));
  } finally { await browser.close(); }
  const invalid = f.source('invalid.mmd', 'flowchart LR\nA[unterminated\nA --> B');
  await assert.rejects(f.render({ format: 'mermaid', source: invalid, output: path.join(f.dir, 'invalid.html'), runtimeRoot, chromePath }), error => error.code === 'PILOT_SOURCE_INVALID');
  assert.equal(fs.existsSync(path.join(f.dir, 'invalid.html')), false);
  // The small source parser accepts this reserved identifier; actual Mermaid
  // rejects it after Chrome starts, exercising cleanup on native parse failure.
  const reserved = f.source('reserved.mmd', 'flowchart LR\nend[End]\nA --> end');
  await assert.rejects(f.render({ format: 'mermaid', source: reserved, output: path.join(f.dir, 'reserved.html'), runtimeRoot, chromePath }), error => error.code === 'PILOT_SOURCE_INVALID');
  assert.equal(fs.existsSync(path.join(f.dir, 'reserved.html')), false);
  assert.deepEqual(transientDirectories(), before);
});
