import { normalizeRoutePoints, rectsOverlap, segmentRectClearance } from '../shared/geometry.mjs';

// A bounded fallback for an unpinned label whose usual position collides.
// It never routes an edge, moves a node, expands the canvas, or rewrites input.
export function placeAutomaticLabels({ labels, routes, components, titles, viewBox, placementBottom = viewBox[1] }) {
  const placed = [...labels];
  const obstacles = [...components, ...titles];
  const segments = routes.flatMap(({ relationIndex, points }) => {
    const normalized = normalizeRoutePoints(points);
    return normalized.slice(1).map((end, index) => ({ relationIndex, start: normalized[index], end }));
  });
  const inside = rect => (
    rect.x >= 0 && rect.y >= 0
    && rect.x + rect.width <= viewBox[0] && rect.y + rect.height <= viewBox[1]
  );
  const masksRoute = rect => segments.some(segment => segment.relationIndex !== rect.relationIndex
    && segmentRectClearance(segment, rect) + 0.0001 < 4);
  const overlapsLabel = (rect, index, gap = 0) => placed.some((other, otherIndex) => (
    otherIndex !== index && rectsOverlap(rect, other, gap)
  ));
  const clear = (rect, index) => (
    inside(rect) && rect.y + rect.height <= placementBottom
    && !obstacles.some(obstacle => rectsOverlap(rect, obstacle, 2))
    && !overlapsLabel(rect, index, 2) && !masksRoute(rect)
  );

  for (const [index, label] of placed.entries()) {
    const relation = label.relation;
    if (['labelAt', 'labelDx', 'labelDy', 'labelSegment'].some(key => relation[key] !== undefined)) continue;
    // Match actual defect thresholds before searching; a valid placement is
    // not a reason to restyle the diagram. New placements leave extra space.
    if (inside(label) && !components.some(component => rectsOverlap(label, component, -2))
        && !titles.some(title => rectsOverlap(label, title))
        && !overlapsLabel(label, index) && !masksRoute(label)) continue;
    for (const segment of segments.filter(segment => segment.relationIndex === label.relationIndex)) {
      const [a, b] = [segment.start, segment.end];
      let candidates = [];
      if (Math.abs(a[1] - b[1]) < 0.0001 && Math.abs(a[0] - b[0]) >= label.width + 16) {
        candidates = [0.5, 0.25, 0.75].flatMap(fraction => {
          const x = a[0] + (b[0] - a[0]) * fraction;
          if (Math.min(Math.abs(x - a[0]), Math.abs(x - b[0])) < label.width / 2 + 8) return [];
          return [[x, a[1] - 10], [x, a[1] + 20]];
        });
      } else if (Math.abs(a[0] - b[0]) < 0.0001 && Math.abs(a[1] - b[1]) >= label.height + 16) {
        candidates = [0.5, 0.25, 0.75].flatMap(fraction => {
          const y = a[1] + (b[1] - a[1]) * fraction;
          if (Math.min(Math.abs(y - a[1]), Math.abs(y - b[1])) < label.height / 2 + 8) return [];
          return [[a[0] - label.width / 2 - 6, y + 3], [a[0] + label.width / 2 + 6, y + 3]];
        });
      }
      const replacement = candidates.map(([lx, ly]) => ({
        ...label, lx, ly, x: lx - label.width / 2, y: ly - 10,
      })).find(rect => clear(rect, index));
      if (replacement) {
        placed[index] = replacement;
        break;
      }
    }
  }
  return placed;
}
