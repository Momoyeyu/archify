import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../../archify/bin/visual-check.mjs';

// Deliberately bounded: static rectangular SVG/HTML flow diagrams. No source
// metadata, expected graph, renderer identity or label vocabulary is consulted.
export async function observePortableArtifact({ artifactPath, chromePath, screenshotPath }) {
  const artifact = path.resolve(artifactPath);
  if (!fs.statSync(artifact).isFile()) throw new Error('artifact must be a regular file');
  const chrome = chromePath || findChrome();
  if (!chrome) throw new Error('Chrome is required for independent rendered observations');
  const browser = new ChromeVisualBrowser(chrome);
  try {
    const session = await browser.sessionPromise;
    const send = (method, params = {}) => browser.cdp.send(method, params, session);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    loaded.catch(() => {});
    await send('Page.navigate', { url: pathToFileURL(artifact).href });
    await loaded;
    const result = await send('Runtime.evaluate', { expression: `(${inspectPortable.toString()})()`, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Portable DOM inspection failed');
    const { graph, observation } = result.result.value;
    if (screenshotPath) {
      const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(screenshotPath, Buffer.from(capture.data, 'base64'), { flag: 'wx' });
    }
    return { graph, observation: { ...observation, method: 'chrome-dom-portable-independent', browserProfile: browser.profileRoot } };
  } finally {
    await browser.close();
  }
}

async function inspectPortable() {
  await document.fonts.ready;
  const unknownReasons = [];
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const localReference = value => {
    const ref = value.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1];
    if (!ref) return null;
    const url = new URL(ref, location.href);
    return url.href.split('#')[0] === location.href.split('#')[0] ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
  };
  const sourcePreservingFilter = value => {
    if (value === 'none') return true;
    const filter = localReference(value);
    if (filter?.tagName !== 'filter' || filter.children.length !== 1) return false;
    const shadow = filter.children[0];
    if (shadow.tagName !== 'feDropShadow' || (shadow.hasAttribute('in') && shadow.getAttribute('in') !== 'SourceGraphic')) return false;
    // Native Mermaid's simple local drop shadow adds paint while retaining its
    // source. A reduced filter region could still crop the rectangle itself.
    return ['x', 'y', 'width', 'height'].every(key => {
      const attribute = filter.getAttribute(key);
      if (attribute === null) return true;
      if (!/^-?[\d.]+%$/.test(attribute)) return false;
      return ['x', 'y'].includes(key) ? parseFloat(attribute) <= 0 : parseFloat(attribute) >= 100;
    });
  };
  const color = value => value && !['none', 'transparent'].includes(value) && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(value);
  const painted = e => {
    const s = getComputedStyle(e);
    return (color(s.fill) && Number(s.fillOpacity) > 0) || (color(s.stroke) && Number(s.strokeOpacity) > 0 && parseFloat(s.strokeWidth) > 0);
  };
  const visible = (e, route = false) => {
    for (let p = e; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) <= 0) return false;
      if (s.clipPath !== 'none' || s.maskImage !== 'none' || !sourcePreservingFilter(s.filter)) {
        unknownReasons.push('Clipped, masked or filtered paint is outside the portable contract');
        return false;
      }
    }
    const r = e.getBoundingClientRect();
    return route ? e.getTotalLength() > 0 : r.width > 0 && r.height > 0;
  };
  const rect = e => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const contains = (r, p, tolerance = 0) => p.x >= r.x - tolerance && p.x <= r.x + r.width + tolerance && p.y >= r.y - tolerance && p.y <= r.y + r.height + tolerance;
  const center = r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const svg = document.querySelector('svg');
  const textVisible = element => {
    if (!visible(element) || !painted(element)) return false;
    if ([...element.querySelectorAll('tspan')].some(t => !visible(t) || !painted(t))) return false;
    const r = rect(element);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const p = { x: r.x + r.width * fraction, y: r.y + r.height / 2 };
      const top = document.elementsFromPoint(p.x, p.y)[0];
      if (top && top !== element && !element.contains(top) && !top.contains(element)) {
        unknownReasons.push('Rendered text may be occluded: ' + norm(element.textContent));
        return false;
      }
      // Hit testing omits pointer-events:none paint. Check later SVG fills too.
      for (const overlay of document.querySelectorAll('svg rect,svg ellipse,svg circle,svg polygon,svg path')) {
        if (overlay.closest('defs,marker') || !(element.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING) || !painted(overlay) || !visible(overlay, typeof overlay.getTotalLength === 'function')) continue;
        const style = getComputedStyle(overlay);
        if (!color(style.fill) || !(Number(style.fillOpacity) > 0) || typeof overlay.isPointInFill !== 'function') continue;
        const matrix = overlay.getScreenCTM();
        if (matrix && overlay.isPointInFill(new DOMPoint(p.x, p.y).matrixTransform(matrix.inverse()))) {
          unknownReasons.push('Rendered text is covered by a later SVG fill: ' + norm(element.textContent));
          return false;
        }
      }
    }
    return true;
  };
  const svgTexts = [...document.querySelectorAll('svg text')].filter(e => !e.closest('defs,marker') && textVisible(e));
  const shapes = [...document.querySelectorAll('svg rect')].filter(e => !e.closest('defs,marker,.edgeLabel,.edgeLabels') && visible(e) && painted(e));
  const htmlNodes = [...document.querySelectorAll('div')].filter(e => {
    if (e.closest('svg') || !visible(e) || !norm(e.innerText)) return false;
    const s = getComputedStyle(e);
    return ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(s[`border${side}Width`]) > 0 && color(s[`border${side}Color`]) && !['none', 'hidden'].includes(s[`border${side}Style`]));
  });
  // Nested bordered containers are unsupported rather than silently flattened.
  if (htmlNodes.some(a => htmlNodes.some(b => a !== b && a.contains(b)))) unknownReasons.push('Nested bordered HTML nodes require independent review');
  if ([...document.querySelectorAll('svg foreignObject')].some(e => visible(e))) unknownReasons.push('foreignObject labels are outside the portable contract; use htmlLabels=false');
  if ([...document.querySelectorAll('svg ellipse,svg circle,svg polygon,svg image,svg use')].some(e => !e.closest('defs,marker,.edgeLabel,.edgeLabels') && visible(e))) unknownReasons.push('Unsupported visible SVG shape');
  const owners = new Map();
  const nodes = [];
  for (const shape of [...shapes, ...htmlNodes]) {
    const box = rect(shape);
    const texts = shape.namespaceURI === 'http://www.w3.org/2000/svg'
      ? svgTexts.filter(t => contains(box, center(rect(t)))) : [shape];
    const label = norm(texts.map(t => t.namespaceURI === 'http://www.w3.org/2000/svg' ? t.textContent : t.innerText).join(' '));
    if (!label) { unknownReasons.push('Visible node rectangle has no observable label'); continue; }
    const id = `observed-node-${nodes.length + 1}`;
    for (const text of texts) {
      if (owners.has(text)) unknownReasons.push('Rendered text belongs to multiple node boxes');
      owners.set(text, id);
    }
    nodes.push({ id, label, visible: true, rect: box, fontSize: Math.min(...texts.map(t => {
      const m = t.getScreenCTM?.();
      return parseFloat(getComputedStyle(t).fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
    })) });
  }
  if (!nodes.length) unknownReasons.push('No independently observable node rectangles');
  // Scope only the rendered board, including positioned HTML nodes where present.
  let boardElement = svg || document.body;
  if (htmlNodes.length) {
    boardElement = htmlNodes[0].parentElement;
    while (boardElement.parentElement && ![...htmlNodes, ...(svg ? [svg] : [])].every(e => boardElement.contains(e))) boardElement = boardElement.parentElement;
  }
  const board = rect(boardElement);
  if (!(board.width > 0 && board.height > 0)) unknownReasons.push('Board has no rendered area');
  const scale = Math.min(1280 / (board.width || 1280), 720 / (board.height || 720));
  const offset = { x: 80 + (1280 - board.width * scale) / 2, y: 90 + (720 - board.height * scale) / 2 };
  const point = p => ({ x: offset.x + (p.x - board.x) * scale, y: offset.y + (p.y - board.y) * scale });
  const normalizedRect = r => ({ ...point(r), width: r.width * scale, height: r.height * scale });
  const endpointDistance = (p, r) => {
    if (!contains(r, p)) return Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.width), Math.max(r.y - p.y, 0, p.y - r.y - r.height));
    return Math.min(p.x - r.x, r.x + r.width - p.x, p.y - r.y, r.y + r.height - p.y);
  };
  const bind = p => {
    const candidates = nodes.map(n => ({ id: n.id, distance: endpointDistance(p, n.rect) })).filter(n => n.distance <= 10).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return { status: 'none', id: null };
    return candidates.length === 1 || candidates[1].distance - candidates[0].distance > 2
      ? { status: 'unique', id: candidates[0].id } : { status: 'ambiguous', id: null };
  };
  const triangle = e => {
    if (!painted(e) || e.hasAttribute('transform')) return false;
    let vertices;
    if (e.tagName.toLowerCase() === 'polygon') vertices = [...e.points].map(p => ({ x: p.x, y: p.y }));
    else if (e.tagName.toLowerCase() === 'path') {
      // Read the painted path geometry, allowing the ordinary M/L closed triangle.
      const d = e.getAttribute('d') || '';
      if (!/^\s*M\s*[-+\d. ,]+(?:L\s*[-+\d. ,]+){2}\s*[zZ]\s*$/.test(d)) return false;
      const numbers = d.match(/[-+]?(?:\d*\.)?\d+/g)?.map(Number) || [];
      if (numbers.length !== 6) return false;
      vertices = [0, 2, 4].map(i => ({ x: numbers[i], y: numbers[i + 1] }));
    } else return false;
    if (vertices.length !== 3) return false;
    const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const tip = vertices.filter(p => Math.abs(p.x - maxX) < 0.001), base = vertices.filter(p => Math.abs(p.x - minX) < 0.001);
    return maxX > minX && maxY > minY && tip.length === 1 && base.length === 2 && Math.abs(tip[0].y - (minY + maxY) / 2) < (maxY - minY) / 4;
  };
  const arrow = route => {
    const s = getComputedStyle(route);
    const marker = localReference(s.markerEnd);
    if (s.markerStart !== 'none' || marker?.tagName.toLowerCase() !== 'marker' || !['auto', 'auto-start-reverse'].includes(marker.getAttribute('orient')) || !(marker.markerWidth.baseVal.value > 0 && marker.markerHeight.baseVal.value > 0)) return false;
    if (marker.children.length !== 1 || !triangle(marker.children[0])) return false;
    for (let p = marker.children[0]; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= 0 || style.clipPath !== 'none' || style.maskImage !== 'none' || style.filter !== 'none' || p.hasAttribute('transform')) return false;
      if (p === svg) break;
    }
    return true;
  };
  const routes = [...document.querySelectorAll('svg path,svg line,svg polyline')].filter(e => {
    if (e.closest('defs,marker,.node,.edgeLabel,.edgeLabels') || !visible(e, true)) return false;
    const s = getComputedStyle(e);
    if (!color(s.stroke) || !(Number(s.strokeOpacity) > 0) || !(parseFloat(s.strokeWidth) > 0)) return false;
    if (color(s.fill) && Number(s.fillOpacity) > 0) unknownReasons.push('Filled connector path is outside the portable contract');
    return true;
  });
  const edges = routes.map((e, i) => {
    const length = e.getTotalLength(), samples = Math.min(512, Math.max(2, Math.ceil(length / 5)));
    const m = e.getScreenCTM();
    const points = Array.from({ length: samples + 1 }, (_, j) => {
      const p = e.getPointAtLength(length * j / samples), q = new DOMPoint(p.x, p.y).matrixTransform(m);
      return { x: q.x, y: q.y };
    });
    const start = bind(points[0]), end = bind(points.at(-1)), from = start.id, to = end.id;
    const directed = arrow(e);
    // No nearby owner is a known visible omission, not uncertain evidence.
    if (start.status === 'ambiguous' || end.status === 'ambiguous' || (from && from === to)) unknownReasons.push(`Route ${i + 1} endpoint binding is ambiguous`);
    if (!directed) unknownReasons.push(`Route ${i + 1} arrowhead paint cannot establish direction`);
    return { id: `observed-edge-${i + 1}`, from, to, label: '', visible: !!from && !!to && from !== to && directed, points };
  });
  const texts = [...svgTexts, ...htmlNodes].map(e => {
    const m = e.getScreenCTM?.();
    return { element: e, text: norm(e.namespaceURI === 'http://www.w3.org/2000/svg' ? e.textContent : e.innerText), rect: rect(e), fontSize: parseFloat(getComputedStyle(e).fontSize) * (m ? Math.hypot(m.a, m.b) : 1), visible: true, nodeId: owners.get(e) || null, edgeFrom: null, edgeTo: null };
  });
  for (const t of texts.filter(t => !t.nodeId && t.text)) {
    const p = center(t.rect);
    const distances = edges.map((e, index) => ({ index, distance: Math.min(...e.points.map(q => Math.hypot(p.x - q.x, p.y - q.y))) })).sort((a, b) => a.distance - b.distance);
    if (!distances.length || distances[0].distance > 60 || (distances[1] && distances[1].distance - distances[0].distance < 3)) {
      unknownReasons.push('Visible text cannot be uniquely associated with a node or route: ' + t.text);
      continue;
    }
    const edge = edges[distances[0].index];
    edge.label = norm([edge.label, t.text].join(' '));
    t.edgeFrom = edge.from;
    t.edgeTo = edge.to;
  }
  const reasons = [...new Set(unknownReasons)], status = reasons.length ? 'unverified' : 'verified';
  return {
    graph: { status, unknownReasons: reasons, nodes: nodes.map(({ id, label }) => ({ id, label })), edges: edges.filter(e => e.visible).map(({ id, from, to, label }) => ({ id, from, to, label })) },
    observation: { status, unknownReasons: reasons, nodes: nodes.map(n => ({ ...n, rect: normalizedRect(n.rect), fontSize: n.fontSize * scale })), edges: edges.map(e => ({ ...e, points: e.points.map(point) })), texts: texts.map(({ element, ...t }) => ({ ...t, rect: normalizedRect(t.rect), fontSize: t.fontSize * scale })), bounds: { x: 80, y: 90, width: 1280, height: 720 }, profile: 'desktop-single-page-v1', scale },
  };
}
