import { recordDiagnostic } from './diagnostics.mjs';
import {
  asArray,
  isFinitePoint,
  normalizeRoutePoints,
  segmentIntersectsRect,
} from './geometry.mjs';

const DEFAULTS = Object.freeze({
  clearance: 2,
  minimumDetourRatio: 2.5,
  minimumExcessLengthPx: 200,
  minimumEmptyExcursionPx: 96,
  maximumObstacleCount: 80,
  sharedCorridorMinimumPx: 32,
});

const OUTWARD = Object.freeze({
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
});

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function pointKey(point) {
  return `${point[0]}\u0000${point[1]}`;
}

class MinHeap {
  constructor() {
    this.entries = [];
  }

  push(key, distance) {
    const entry = { key, distance };
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent].distance <= distance) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    if (!this.entries.length) return null;
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!this.entries.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const child = right < this.entries.length
        && this.entries[right].distance < this.entries[left].distance ? right : left;
      if (this.entries[child].distance >= last.distance) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

function orthogonalLength(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    if (x1 !== x2 && y1 !== y2) return null;
    total += Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  return total;
}

function inferredSide(points, endpoint) {
  if (points.length < 2) return null;
  const start = endpoint === 'source' ? points[0] : points.at(-2);
  const end = endpoint === 'source' ? points[1] : points.at(-1);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (endpoint === 'source') {
    if (dx > 0 && dy === 0) return 'right';
    if (dx < 0 && dy === 0) return 'left';
    if (dy > 0 && dx === 0) return 'bottom';
    if (dy < 0 && dx === 0) return 'top';
  } else {
    if (dx > 0 && dy === 0) return 'left';
    if (dx < 0 && dy === 0) return 'right';
    if (dy > 0 && dx === 0) return 'top';
    if (dy < 0 && dx === 0) return 'bottom';
  }
  return null;
}

function moveOutward(point, side, distance) {
  const [dx, dy] = OUTWARD[side] || [0, 0];
  return [point[0] + dx * distance, point[1] + dy * distance];
}

function expandedRect(rect, clearance) {
  return {
    id: rect.id,
    x: rect.x - clearance,
    y: rect.y - clearance,
    width: rect.width + clearance * 2,
    height: rect.height + clearance * 2,
  };
}

function boundsForRects(rects) {
  const usable = [...rects].filter((rect) => (
    rect && isFinitePoint(rect.x, rect.y, rect.width, rect.height)
      && rect.width >= 0 && rect.height >= 0
  ));
  if (!usable.length) return null;
  const left = Math.min(...usable.map((rect) => rect.x));
  const top = Math.min(...usable.map((rect) => rect.y));
  const right = Math.max(...usable.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...usable.map((rect) => rect.y + rect.height));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function boundsForPoints(points) {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function outsideExcursion(routeBounds, contentBounds) {
  if (!routeBounds || !contentBounds) return null;
  const sides = {
    left: Math.max(0, contentBounds.left - routeBounds.left),
    top: Math.max(0, contentBounds.top - routeBounds.top),
    right: Math.max(0, routeBounds.right - contentBounds.right),
    bottom: Math.max(0, routeBounds.bottom - contentBounds.bottom),
  };
  return { ...sides, maximum: Math.max(...Object.values(sides)) };
}

function pointDistanceFromRect(point, rect) {
  const dx = Math.max(rect.x - point[0], 0, point[0] - (rect.x + rect.width));
  const dy = Math.max(rect.y - point[1], 0, point[1] - (rect.y + rect.height));
  return dx + dy;
}

function emptyControlPointClearance(points, contentRects) {
  const controls = points.slice(1, -1);
  const rects = [...contentRects].filter((rect) => (
    rect && isFinitePoint(rect.x, rect.y, rect.width, rect.height)
      && rect.width >= 0 && rect.height >= 0
  ));
  if (!controls.length || !rects.length) return null;
  const distances = controls.map((point) => Math.min(
    ...rects.map((rect) => pointDistanceFromRect(point, rect)),
  ));
  const maximum = Math.max(...distances);
  return { maximum, point: controls[distances.indexOf(maximum)] };
}

function rectsIntersect(left, right) {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y;
}

function pointBlocked(point, obstacles) {
  return obstacles.some((rect) => (
    point[0] >= rect.x && point[0] <= rect.x + rect.width
      && point[1] >= rect.y && point[1] <= rect.y + rect.height
  ));
}

function segmentBlocked(start, end, obstacles) {
  return obstacles.some((rect) => segmentIntersectsRect({ start, end }, rect));
}

function shortestGridRoute({ start, end, points, obstacles, fromSide, toSide, clearance, maximumObstacleCount }) {
  if (!OUTWARD[fromSide] || !OUTWARD[toSide]) return null;
  const stubDistance = clearance + 2;
  const startStub = moveOutward(start, fromSide, stubDistance);
  const endStub = moveOutward(end, toSide, stubDistance);
  const routeBounds = boundsForPoints([...points, startStub, endStub]);
  const searchRect = {
    x: routeBounds.left - 24,
    y: routeBounds.top - 24,
    width: routeBounds.width + 48,
    height: routeBounds.height + 48,
  };
  const expanded = [...obstacles]
    .filter((rect) => rect && isFinitePoint(rect.x, rect.y, rect.width, rect.height))
    .map((rect) => expandedRect(rect, clearance))
    .filter((rect) => rectsIntersect(rect, searchRect));
  if (expanded.length > maximumObstacleCount) return null;

  const xs = new Set([startStub[0], endStub[0], ...points.map(([x]) => x)]);
  const ys = new Set([startStub[1], endStub[1], ...points.map(([, y]) => y)]);
  for (const rect of expanded) {
    xs.add(rect.x - 1);
    xs.add(rect.x + rect.width + 1);
    ys.add(rect.y - 1);
    ys.add(rect.y + rect.height + 1);
  }
  const orderedX = [...xs].sort((a, b) => a - b);
  const orderedY = [...ys].sort((a, b) => a - b);
  const nodes = new Map();
  for (const x of orderedX) {
    for (const y of orderedY) {
      const point = [x, y];
      if (!pointBlocked(point, expanded)) nodes.set(pointKey(point), point);
    }
  }
  if (!nodes.has(pointKey(startStub)) || !nodes.has(pointKey(endStub))) return null;

  const adjacency = new Map([...nodes.keys()].map((key) => [key, []]));
  const connectLine = (line) => {
    for (let index = 0; index < line.length - 1; index += 1) {
      const left = line[index];
      const right = line[index + 1];
      if (segmentBlocked(left, right, expanded)) continue;
      const distance = Math.abs(right[0] - left[0]) + Math.abs(right[1] - left[1]);
      const leftKey = pointKey(left);
      const rightKey = pointKey(right);
      adjacency.get(leftKey).push([rightKey, distance]);
      adjacency.get(rightKey).push([leftKey, distance]);
    }
  };
  for (const y of orderedY) {
    connectLine(orderedX.map((x) => nodes.get(pointKey([x, y]))).filter(Boolean));
  }
  for (const x of orderedX) {
    connectLine(orderedY.map((y) => nodes.get(pointKey([x, y]))).filter(Boolean));
  }

  const source = pointKey(startStub);
  const target = pointKey(endStub);
  const distances = new Map([[source, 0]]);
  const previous = new Map();
  const queue = new MinHeap();
  queue.push(source, 0);
  while (queue.entries.length) {
    const next = queue.pop();
    const current = next.key;
    const currentDistance = next.distance;
    if (currentDistance !== distances.get(current)) continue;
    if (current === target) break;
    for (const [neighbor, weight] of adjacency.get(current) || []) {
      const candidate = currentDistance + weight;
      if (candidate >= (distances.get(neighbor) ?? Infinity)) continue;
      distances.set(neighbor, candidate);
      previous.set(neighbor, current);
      queue.push(neighbor, candidate);
    }
  }
  if (!distances.has(target)) return null;
  const reversed = [];
  for (let key = target; key; key = previous.get(key)) {
    reversed.push(nodes.get(key));
    if (key === source) break;
  }
  if (pointKey(reversed.at(-1)) !== source) return null;
  const shortestPoints = normalizeRoutePoints([start, ...reversed.reverse(), end]);
  return {
    points: shortestPoints,
    length: orthogonalLength(shortestPoints),
    obstacleCount: expanded.length,
  };
}

function collinearOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (leftStart[0] === leftEnd[0] && rightStart[0] === rightEnd[0]
      && leftStart[0] === rightStart[0]) {
    return Math.max(0, Math.min(Math.max(leftStart[1], leftEnd[1]), Math.max(rightStart[1], rightEnd[1]))
      - Math.max(Math.min(leftStart[1], leftEnd[1]), Math.min(rightStart[1], rightEnd[1])));
  }
  if (leftStart[1] === leftEnd[1] && rightStart[1] === rightEnd[1]
      && leftStart[1] === rightStart[1]) {
    return Math.max(0, Math.min(Math.max(leftStart[0], leftEnd[0]), Math.max(rightStart[0], rightEnd[0]))
      - Math.max(Math.min(leftStart[0], leftEnd[0]), Math.min(rightStart[0], rightEnd[0])));
  }
  return 0;
}

function segmentOutsideContent(start, end, contentBounds) {
  if (!contentBounds) return false;
  const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  return midpoint[0] < contentBounds.left || midpoint[0] > contentBounds.right
    || midpoint[1] < contentBounds.top || midpoint[1] > contentBounds.bottom;
}

function sharesOuterCorridor({ relation, relations, pathFor, points, contentBounds, minimumOverlap }) {
  for (const other of asArray(relations)) {
    if (!other || other === relation) continue;
    const related = relation.from === other.from || relation.from === other.to
      || relation.to === other.from || relation.to === other.to;
    if (!related) continue;
    const otherPoints = normalizeRoutePoints(pathFor(other)?.points || []);
    for (let left = 0; left < points.length - 1; left += 1) {
      if (!segmentOutsideContent(points[left], points[left + 1], contentBounds)) continue;
      for (let right = 0; right < otherPoints.length - 1; right += 1) {
        if (collinearOverlap(points[left], points[left + 1], otherPoints[right], otherPoints[right + 1]) >= minimumOverlap) {
          return true;
        }
      }
    }
  }
  return false;
}

function relationshipSubject(diagramType, relationCollection, relationIndex, relation) {
  return {
    diagramType,
    collection: relationCollection,
    index: relationIndex,
    ...(relation.id ? { id: relation.id } : {}),
    from: relation.from,
    to: relation.to,
  };
}

/**
 * Reject conspicuous authored detours without penalizing routes whose length is
 * explained by opaque-node avoidance or a related shared outer corridor.
 */
export function cleanRouteDetourProblems({
  relations,
  obstacles,
  contentRects = obstacles,
  endpointIds,
  pathFor,
  fromSideFor,
  toSideFor,
  diagramType,
  relationCollection,
  profile,
  thresholds = {},
}) {
  if (profile !== 'showcase') return [];
  const policy = { ...DEFAULTS, ...thresholds };
  const obstacleList = [...obstacles];
  const contentBounds = boundsForRects(contentRects);
  const problems = [];
  for (const [relationIndex, relation] of asArray(relations).entries()) {
    if (!relation || !endpointIds?.has(relation.from) || !endpointIds?.has(relation.to)) continue;
    if (!Array.isArray(relation.via) || relation.via.length === 0) continue;
    const points = normalizeRoutePoints(pathFor(relation)?.points || []);
    if (points.length < 3 || !points.every((point) => Array.isArray(point) && isFinitePoint(...point))) continue;
    const actualLength = orthogonalLength(points);
    if (!Number.isFinite(actualLength)) continue;
    const start = points[0];
    const end = points.at(-1);
    const manhattan = Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]);
    if (actualLength < manhattan * policy.minimumDetourRatio
        || actualLength - manhattan < policy.minimumExcessLengthPx) continue;
    const routeBounds = boundsForPoints(points);
    const excursion = outsideExcursion(routeBounds, contentBounds);
    const emptyClearance = emptyControlPointClearance(points, obstacleList);
    if (Math.max(excursion?.maximum || 0, emptyClearance?.maximum || 0)
        < policy.minimumEmptyExcursionPx) continue;
    if (sharesOuterCorridor({
      relation,
      relations,
      pathFor,
      points,
      contentBounds,
      minimumOverlap: policy.sharedCorridorMinimumPx,
    })) continue;

    const fromSide = fromSideFor?.(relation) || inferredSide(points, 'source');
    const toSide = toSideFor?.(relation) || inferredSide(points, 'target');
    const shortest = shortestGridRoute({
      start,
      end,
      points,
      obstacles: obstacleList,
      fromSide,
      toSide,
      clearance: policy.clearance,
      maximumObstacleCount: policy.maximumObstacleCount,
    });
    if (!shortest || !Number.isFinite(shortest.length) || shortest.length <= 0) continue;
    const detourRatio = actualLength / shortest.length;
    const excessLength = actualLength - shortest.length;
    if (detourRatio < policy.minimumDetourRatio || excessLength < policy.minimumExcessLengthPx) continue;

    const relationId = relation.id ? ` id "${relation.id}"` : '';
    const message = `[composition/excessive-route-detour] ${diagramType} ${relationCollection}[${relationIndex}]${relationId} "${relation.from}" -> "${relation.to}" travels ${Math.round(actualLength)}px, ${rounded(detourRatio)}x the ${Math.round(shortest.length)}px shortest obstacle-clearing orthogonal route, and reaches ${Math.round(excursion.maximum)}px beyond the content bounds — remove the distant via corridor or move it close to the connected content.`;
    const supportedFix = 'remove the distant via points and retry automatic routing, or keep the endpoint sides and move the via corridor near the connected nodes while preserving labels and direction';
    recordDiagnostic({
      code: 'composition/excessive-route-detour',
      severity: 'error',
      message,
      subject: relationshipSubject(diagramType, relationCollection, relationIndex, relation),
      evidence: {
        points,
        actualLengthPx: rounded(actualLength),
        shortestLegalPoints: shortest.points,
        shortestLegalLengthPx: rounded(shortest.length),
        detourRatio: rounded(detourRatio),
        excessLengthPx: rounded(excessLength),
        routeBounds,
        contentBounds,
        emptyExcursionPx: excursion,
        emptyControlPointClearancePx: emptyClearance,
        obstacleCount: shortest.obstacleCount,
        thresholds: {
          minimumDetourRatio: policy.minimumDetourRatio,
          minimumExcessLengthPx: policy.minimumExcessLengthPx,
          minimumEmptyExcursionPx: policy.minimumEmptyExcursionPx,
        },
      },
      supportedFixes: [supportedFix],
    });
    problems.push(message);
  }
  return problems;
}
