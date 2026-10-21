import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SaxesParser } from 'saxes';
import { parse } from 'parse5';
import { ChromeVisualBrowser, findChrome } from '../../archify/bin/visual-check.mjs';
import { parseSource } from './adapters.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PILOT_MERMAID_VERSION = '12.2.0';
const forbiddenElements = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'base', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set', 'audio', 'video', 'source', 'track', 'portal']);
const referenceAttributes = new Set(['href', 'src', 'srcset', 'poster', 'action', 'formaction', 'background', 'data', 'ping']);

function sourceInvalid(message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code: 'PILOT_SOURCE_INVALID' });
}

function validateCss(css, { trustedLibrary = false } = {}) {
  // Restrict resources rather than rewriting CSS: authored paint stays literal.
  if (/\\|@import\b|@font-face\b|expression\s*\(|-moz-binding|behavior\s*:/i.test(css) || (!trustedLibrary && /@keyframes\b|(?:^|[;{])\s*(?:animation|transition)(?:-[\w-]+)?\s*:/i.test(css))) {
    throw new Error('Only static, self-contained CSS is supported');
  }
  for (const match of css.matchAll(/url\s*\(([^)]*)\)/gi)) {
    if (!/^\s*(['"]?)#[\w:.-]+\1\s*$/.test(match[1])) throw new Error('External CSS references are unsupported; source must be self-contained');
  }
}

function validateElement(name, attributes, options) {
  name = name.toLowerCase();
  if (forbiddenElements.has(name)) throw new Error(`Unsupported active element ${name}; source must be static`);
  for (const { name: attributeName, value } of attributes) {
    const local = attributeName.toLowerCase().split(':').at(-1);
    if (/^on/i.test(local) || ['srcdoc', 'http-equiv'].includes(local)) throw new Error(`Unsupported active attribute ${attributeName}; source must be static`);
    if (referenceAttributes.has(local) && value && !/^#[\w:.-]+$/.test(value)) throw new Error(`External reference ${attributeName} is unsupported; source must be self-contained`);
    if (local === 'style' || /url\s*\(/i.test(value)) validateCss(value, options);
  }
}

function validateSvg(source, options) {
  let first = true;
  let inStyle = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { throw new Error('SVG doctypes are unsupported'); });
  parser.on('processinginstruction', () => { throw new Error('SVG processing instructions are unsupported'); });
  parser.on('opentag', node => {
    if (first) {
      if (node.local !== 'svg' || node.uri !== 'http://www.w3.org/2000/svg') throw new Error('Invalid standalone SVG root or namespace');
      first = false;
    }
    validateElement(node.local, Object.values(node.attributes), options);
    if (node.local.toLowerCase() === 'style') inStyle++;
  });
  parser.on('closetag', node => { if (node.local.toLowerCase() === 'style') inStyle--; });
  parser.on('text', text => { if (inStyle) validateCss(text, options); });
  parser.on('cdata', text => { if (inStyle) validateCss(text, options); });
  try { parser.write(source).close(); }
  catch (error) { throw new Error(`Invalid or malformed static SVG: ${error.message}`, { cause: error }); }
  if (first) throw new Error('Invalid empty SVG');
}

function validateHtml(source) {
  const errors = [];
  const document = parse(source, { onParseError: error => errors.push(error.code) });
  if (errors.length || !/^\s*<!doctype\s+html\s*>/i.test(source) || !/<html(?:\s|>)/i.test(source) || !/<body(?:\s|>)/i.test(source) || !/<\/html\s*>\s*$/i.test(source)) {
    throw new Error(`Invalid or malformed complete HTML document${errors.length ? ': ' + errors.join(', ') : ''}`);
  }
  const visit = node => {
    if (node.tagName) {
      validateElement(node.tagName, node.attrs || []);
      if (node.tagName === 'style') validateCss((node.childNodes || []).map(child => child.value || '').join(''));
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
}

function wrapSvg(svg) {
  // No SVG selectors, coordinate changes, semantic annotations or style repair.
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1280, initial-scale=1"><style>html,body{margin:0;width:1280px;height:720px;background:white}</style></head><body>' + svg + '</body></html>\n';
}

async function renderMermaid(source, { runtimeRoot, chromePath }) {
  if (!runtimeRoot) throw new Error('Mermaid requires an external pinned runtimeRoot');
  const packageRoot = path.resolve(runtimeRoot, 'node_modules/mermaid');
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.version !== PILOT_MERMAID_VERSION) throw new Error(`Mermaid runtime must be frozen at ${PILOT_MERMAID_VERSION}; found ${metadata.version}`);
  const graph = parseSource('mermaid', source);
  if (graph.status !== 'verified') throw sourceInvalid(`Mermaid source invalid or unsupported: ${graph.unknownReasons.join('; ')}`);
  // Reject config directives and HTML inside labels even if a parser would tolerate them.
  if (/%%\s*\{|[<>](?!-)/.test(source.replace(/-->/g, ''))) throw sourceInvalid('Mermaid HTML and configuration directives are unsupported');
  const chrome = chromePath || findChrome();
  if (!chrome) throw new Error('Chrome is required for Mermaid rendering');
  const bundle = fs.readFileSync(path.join(packageRoot, 'dist/mermaid.min.js'), 'utf8');
  const browser = new ChromeVisualBrowser(chrome);
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session, 60000);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*'] });
    const initialized = await send('Runtime.evaluate', {
      expression: `${bundle}\n;mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false}});true`,
      returnByValue: true,
    });
    if (initialized.exceptionDetails) throw new Error(initialized.exceptionDetails.exception?.description || 'Mermaid initialization failed');
    const rendered = await send('Runtime.evaluate', {
      expression: `(async()=>{const source=${JSON.stringify(source)};try{await mermaid.parse(source);}catch(error){if(error.hash || /Parse error|Syntax error|No diagram type detected/i.test(error.message||''))return {sourceInvalid:true,message:error.message};throw error;}await document.fonts.ready;const result=await mermaid.render('pilot-diagram',source);return {svg:result.svg};})()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (rendered.exceptionDetails) throw new Error(rendered.exceptionDetails.exception?.description || 'Mermaid rendering failed');
    if (rendered.result?.value?.sourceInvalid) throw sourceInvalid(`Mermaid source invalid: ${rendered.result.value.message}`);
    const svg = rendered.result?.value?.svg;
    if (typeof svg !== 'string') throw new Error('Mermaid returned no native SVG');
    // Mermaid ships unused animation selectors with its default stylesheet.
    // The supported input grammar cannot opt into them. Preserve this trusted
    // native stylesheet verbatim, including those unused rules.
    validateSvg(svg, { trustedLibrary: true });
    return svg;
  } catch (error) {
    const failure = new Error(`Mermaid rendering failed: ${error.message}`, { cause: error });
    if (error.code === 'PILOT_SOURCE_INVALID') failure.code = error.code;
    throw failure;
  } finally {
    await browser.close();
  }
}

/** Render exactly one raw candidate. Never repair sources or replace an artifact. */
export async function renderPilotSource({ format, type, source, output, chromePath, runtimeRoot }) {
  if (!['archify', 'mermaid', 'svg', 'html'].includes(format)) throw new Error(`Unsupported pilot format: ${format}`);
  if (!source || !output) throw new Error('Pilot renderer requires source and output paths');
  const artifactPath = path.resolve(output);
  try {
    fs.lstatSync(artifactPath);
    throw new Error(`Output already exists; refusing to overwrite ${artifactPath}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const input = path.resolve(source);
  if (!fs.statSync(input).isFile()) throw new Error('Source must be a regular file');
  const raw = fs.readFileSync(input, 'utf8');
  let content;
  let renderer;
  let version;
  if (format === 'archify') {
    if (!type) throw new Error('Archify requires its native diagram type');
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-pilot-render-'));
    try {
      const stagedOutput = path.join(staging, 'artifact.html');
      try {
        await execFileAsync(process.execPath, [path.join(root, 'archify/bin/archify.mjs'), 'render', type, input, stagedOutput], { cwd: root, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
      } catch (error) {
        const failure = new Error(`Archify native rendering failed: ${error.stderr || error.message}`, { cause: error });
        // Only structured native validation can prove an authored-input failure.
        // Process, read, dependency and internal errors remain harness failures.
        if (typeof error.code === 'number' && !error.killed && !error.signal) {
          try {
            await execFileAsync(process.execPath, [path.join(root, 'archify/bin/archify.mjs'), 'validate', type, input, '--json'], { cwd: root, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
          } catch (validationError) {
            try {
              const receipt = JSON.parse(validationError.stdout);
              const diagnostics = receipt.diagnostics?.filter(d => d.severity === 'error') || [];
              const authored = code => code === 'input/json-parse' || /^(?:schema|geometry|composition|workflow|architecture)\//.test(code) && !/(?:internal|solver-budget-exhausted|process|read|unavailable)/.test(code);
              if (receipt.ok === false && diagnostics.length && diagnostics.every(d => authored(d.code))) failure.code = 'PILOT_SOURCE_INVALID';
            } catch { /* Unstructured validation failures cannot prove bad source. */ }
          }
        }
        throw failure;
      }
      content = fs.readFileSync(stagedOutput);
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    renderer = 'archify-native-cli';
    version = JSON.parse(fs.readFileSync(path.join(root, 'archify/package.json'), 'utf8')).version;
  } else if (format === 'mermaid') {
    content = wrapSvg(await renderMermaid(raw, { runtimeRoot, chromePath }));
    renderer = 'mermaid-native-svg';
    version = PILOT_MERMAID_VERSION;
  } else if (format === 'svg') {
    try { validateSvg(raw); } catch (error) { throw sourceInvalid(error.message, error); }
    content = wrapSvg(raw);
    renderer = 'literal-svg-wrapper';
    version = '1';
  } else {
    try { validateHtml(raw); } catch (error) { throw sourceInvalid(error.message, error); }
    content = fs.readFileSync(input);
    renderer = 'literal-static-html';
    version = '1';
  }
  fs.writeFileSync(artifactPath, content, { flag: 'wx' });
  return { artifactPath, renderer, version };
}
