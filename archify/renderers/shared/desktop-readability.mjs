export const DESKTOP_READABILITY_VIEWPORT = Object.freeze({ width: 1440, height: 900 });
export const DESKTOP_READER_MIN_WIDTH = 960;
export const DESKTOP_READER_HORIZONTAL_CHROME = 30;
export const DESKTOP_READER_DIAGRAM_WIDTH = DESKTOP_READER_MIN_WIDTH - DESKTOP_READER_HORIZONTAL_CHROME;
export const MIN_PROJECTED_NODE_TEXT_PX = 6;
export const DECLARED_WIDE_READER_CONTRACT = 'declared-wide-v1';
export const DECLARED_WIDE_READER_RATIO = 1.55;
export const DECLARED_WIDE_READER_MAX_WIDTH = 1920;
export const DECLARED_WIDE_REFERENCE_BODY_HORIZONTAL_PX = 64;
export const DECLARED_WIDE_REFERENCE_DIAGRAM_HORIZONTAL_PX = 30;

export function projectedNodeTextPx(sourceFontPx, viewBoxWidth, diagramWidth = DESKTOP_READER_DIAGRAM_WIDTH) {
  if (![sourceFontPx, viewBoxWidth, diagramWidth].every(Number.isFinite) || viewBoxWidth <= 0 || diagramWidth <= 0) {
    return Number.NaN;
  }
  return sourceFontPx * Math.min(1, diagramWidth / viewBoxWidth);
}

export function minimumReadableSourceTextPx(
  viewBoxWidth,
  diagramWidth = DESKTOP_READER_DIAGRAM_WIDTH,
  minimumProjectedPx = MIN_PROJECTED_NODE_TEXT_PX,
) {
  if (![viewBoxWidth, diagramWidth, minimumProjectedPx].every(Number.isFinite)
    || viewBoxWidth <= 0
    || diagramWidth <= 0
    || minimumProjectedPx <= 0) {
    return Number.NaN;
  }
  return minimumProjectedPx / Math.min(1, diagramWidth / viewBoxWidth);
}

// This is deliberately separate from the legacy 930px projection. Architecture
// boundary convergence depends on that legacy default, while only a recognized
// v2 wide Reader may use this declared-width proof.
export function declaredWideReadabilityBudget({
  viewBoxWidth,
  viewBoxHeight,
  minimumSourceTextPx,
  requestedMinimumTextPx,
  viewportWidth = DESKTOP_READABILITY_VIEWPORT.width,
  bodyHorizontalPx = DECLARED_WIDE_REFERENCE_BODY_HORIZONTAL_PX,
  diagramHorizontalPx = DECLARED_WIDE_REFERENCE_DIAGRAM_HORIZONTAL_PX,
  minimumReaderWidth = DESKTOP_READER_MIN_WIDTH,
  maximumReaderWidth = DECLARED_WIDE_READER_MAX_WIDTH,
} = {}) {
  const values = [
    viewBoxWidth, viewBoxHeight, minimumSourceTextPx, requestedMinimumTextPx,
    viewportWidth, bodyHorizontalPx, diagramHorizontalPx, minimumReaderWidth, maximumReaderWidth,
  ];
  if (!values.every(Number.isFinite) || viewBoxWidth <= 0 || viewBoxHeight <= 0
    || minimumSourceTextPx <= 0 || requestedMinimumTextPx <= 0 || viewportWidth <= 0
    || bodyHorizontalPx < 0 || diagramHorizontalPx < 0 || minimumReaderWidth <= 0
    || maximumReaderWidth < minimumReaderWidth || viewBoxWidth / viewBoxHeight < DECLARED_WIDE_READER_RATIO) {
    return null;
  }
  const requestedTargetPx = Math.max(MIN_PROJECTED_NODE_TEXT_PX, requestedMinimumTextPx);
  const requestedScale = Math.min(1, requestedTargetPx / minimumSourceTextPx);
  const desiredReaderWidth = Math.max(minimumReaderWidth, viewBoxWidth * requestedScale + diagramHorizontalPx);
  const viewportCap = Math.max(0, viewportWidth - bodyHorizontalPx);
  const cap = Math.min(maximumReaderWidth, viewportCap);
  const actualReaderWidth = Math.min(desiredReaderWidth, cap);
  const guaranteedSvgWidth = Math.max(0, actualReaderWidth - diagramHorizontalPx);
  const projectedMinimumTextPx = projectedNodeTextPx(minimumSourceTextPx, viewBoxWidth, guaranteedSvgWidth);
  const limit = actualReaderWidth < desiredReaderWidth
    ? (viewportCap <= maximumReaderWidth ? 'viewport-cap' : 'reader-cap')
    : 'source-size';
  return {
    requestedTargetPx,
    requestedScale,
    desiredReaderWidth,
    viewportCap,
    maximumReaderWidth,
    actualReaderWidth,
    guaranteedSvgWidth,
    projectedMinimumTextPx,
    hardFloorPx: MIN_PROJECTED_NODE_TEXT_PX,
    hardFloorMet: projectedMinimumTextPx >= MIN_PROJECTED_NODE_TEXT_PX,
    requestedTargetMet: projectedMinimumTextPx >= requestedMinimumTextPx,
    limit,
  };
}
