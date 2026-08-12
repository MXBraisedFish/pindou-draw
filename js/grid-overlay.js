import { AXIS_STYLE, GRID_OVERLAY_DEFAULTS } from './constants.js';

const DEFAULT_THIN_COLOR = 'rgba(0, 0, 0, 0.12)';
const DEFAULT_BOLD_COLOR = 'rgba(0, 0, 0, 0.35)';

function clampInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(512, Math.round(parsed));
}

function normalizeStartMode(value, allowed) {
  const normalized = String(value || '').toLowerCase();
  return allowed.includes(normalized) ? normalized : 'center';
}

function normalizeGridOptions(options = {}) {
  const merged = { ...GRID_OVERLAY_DEFAULTS, ...(options || {}) };
  return {
    xBoldEnabled: Boolean(merged.xBoldEnabled),
    yBoldEnabled: Boolean(merged.yBoldEnabled),
    xBoldInterval: clampInterval(merged.xBoldInterval),
    yBoldInterval: clampInterval(merged.yBoldInterval),
    xStartMode: normalizeStartMode(merged.xStartMode, ['center', 'ltr', 'rtl']),
    yStartMode: normalizeStartMode(merged.yStartMode, ['center', 'ttb', 'btt'])
  };
}

function shouldUseBoldLine(index, lineCount, mode, interval) {
  if (interval <= 0 || !Number.isFinite(index) || lineCount <= 0) return false;
  if (mode === 'center') {
    const leftCenter = Math.floor((lineCount - 1) / 2);
    const rightCenter = Math.ceil((lineCount - 1) / 2);
    const distance = Math.min(Math.abs(index - leftCenter), Math.abs(index - rightCenter));
    return distance % interval === 0;
  }
  const isReverse = mode === 'rtl' || mode === 'btt';
  const normalizedIndex = isReverse ? (lineCount - 1 - index) : index;
  return normalizedIndex % interval === 0;
}

export function renderGridLines(ctx, options = {}) {
  const {
    originX = 0,
    originY = 0,
    cellSize = 10,
    widthCells = 0,
    heightCells = 0,
    thinColor = DEFAULT_THIN_COLOR,
    boldColor = DEFAULT_BOLD_COLOR,
    thinLineWidth = Math.max(1, Math.round(cellSize * 0.04)),
    boldLineWidth = Math.max(thinLineWidth + 1, Math.round(cellSize * 0.12)),
    gridOptions = GRID_OVERLAY_DEFAULTS
  } = options;
  if (!ctx || widthCells < 0 || heightCells < 0) return;
  const normalized = normalizeGridOptions(gridOptions);
  const verticalLines = widthCells + 1;
  const horizontalLines = heightCells + 1;
  const contentWidth = widthCells * cellSize;
  const contentHeight = heightCells * cellSize;

  for (let gx = 0; gx < verticalLines; gx++) {
    const x = originX + gx * cellSize + 0.5;
    const bold = normalized.xBoldEnabled && shouldUseBoldLine(gx, verticalLines, normalized.xStartMode, normalized.xBoldInterval);
    ctx.strokeStyle = bold ? boldColor : thinColor;
    ctx.lineWidth = bold ? boldLineWidth : thinLineWidth;
    ctx.beginPath();
    ctx.moveTo(x, originY);
    ctx.lineTo(x, originY + contentHeight);
    ctx.stroke();
  }

  for (let gy = 0; gy < horizontalLines; gy++) {
    const y = originY + gy * cellSize + 0.5;
    const bold = normalized.yBoldEnabled && shouldUseBoldLine(gy, horizontalLines, normalized.yStartMode, normalized.yBoldInterval);
    ctx.strokeStyle = bold ? boldColor : thinColor;
    ctx.lineWidth = bold ? boldLineWidth : thinLineWidth;
    ctx.beginPath();
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + contentWidth, y);
    ctx.stroke();
  }
}

export function renderAxisLabels(ctx, options = {}) {
  const {
    originX = 0,
    originY = 0,
    cellSize = 10,
    widthCells = 0,
    heightCells = 0,
    textColor = 'rgba(0,0,0,0.65)',
    tickColor = 'rgba(0,0,0,0.3)',
    fontSize = Math.max(AXIS_STYLE.minFont, Math.floor(cellSize * 0.4)),
    tickLength = Math.max(AXIS_STYLE.minTick, Math.floor(fontSize * 0.6)),
    gap = Math.max(AXIS_STYLE.minGap, Math.floor(fontSize * 0.3))
  } = options;
  if (!ctx) return;
  ctx.save();
  ctx.font = `${fontSize}px ${AXIS_STYLE.fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.strokeStyle = tickColor;
  ctx.lineWidth = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const topY = originY - gap - tickLength;
  for (let x = 0; x < widthCells; x++) {
    const centerX = originX + x * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, originY - 0.5);
    ctx.lineTo(centerX, originY - tickLength - 0.5);
    ctx.stroke();
    ctx.fillText(String(x + 1), centerX, topY);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const leftX = originX - gap;
  for (let y = 0; y < heightCells; y++) {
    const centerY = originY + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(originX - 0.5, centerY);
    ctx.lineTo(originX - tickLength - 0.5, centerY);
    ctx.stroke();
    ctx.fillText(String(y + 1), leftX, centerY);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const bottomY = originY + heightCells * cellSize + gap + tickLength;
  for (let x = 0; x < widthCells; x++) {
    const centerX = originX + x * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, originY + heightCells * cellSize + 0.5);
    ctx.lineTo(centerX, originY + heightCells * cellSize + tickLength + 0.5);
    ctx.stroke();
    ctx.fillText(String(x + 1), centerX, bottomY);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const rightEdge = originX + widthCells * cellSize + 0.5;
  const rightLabelX = rightEdge + tickLength + gap;
  for (let y = 0; y < heightCells; y++) {
    const centerY = originY + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(rightEdge, centerY);
    ctx.lineTo(rightEdge + tickLength, centerY);
    ctx.stroke();
    ctx.fillText(String(y + 1), rightLabelX, centerY);
  }

  ctx.restore();
}

export function getNormalizedGridOptions(options) {
  return normalizeGridOptions(options);
}
