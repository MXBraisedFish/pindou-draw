import { EXPORT_SCALE, PIXEL_FONT_FAMILY } from './constants.js';
import { state } from './state.js';
import { computeAxisPadding, pickTextColor, clampAlpha, parseColor } from './utils.js';
import { renderAxisLabels, renderGridLines } from './grid-overlay.js';
import { collectUsedColors, getActivePaletteLabel } from './palette.js';
import { exportHighlightManager } from './export-highlight.js';
import { TEXT } from './language.js';
const DEFAULT_STAGE_RGB = { r: 0, g: 0, b: 0 };
const TRANSPARENT_BG_LIGHT = '#f4f6fb';
const TRANSPARENT_BG_DARK = '#d9deec';
const EXPORT_INFO_BASE_CELLS = 32;
const EXPORT_INFO_MIN_SCALE = 1;
const EXPORT_INFO_MAX_SCALE = 4.5;

function shouldActivateTransition(type, options = {}) {
  if (type === 'light') return options.includeLightColors !== false;
  if (type === 'temperatrue') return options.includeTemperatureColors !== false;
  return null;
}

function createStageFromEntry(entry) {
  if (!entry) {
    return { color: '#000000', rgb: { ...DEFAULT_STAGE_RGB }, alpha: 1 };
  }
  const color = entry.color ?? entry.color1 ?? '#000000';
  const parsed = parseColor(color);
  const rgbSource = entry.rgb ?? parsed ?? null;
  const alpha = clampAlpha(Number.isFinite(entry.alpha) ? entry.alpha : 1);
  const rgb = rgbSource && typeof rgbSource === 'object'
    ? { r: rgbSource.r ?? 0, g: rgbSource.g ?? 0, b: rgbSource.b ?? 0 }
    : { ...DEFAULT_STAGE_RGB };
  return { color, rgb, alpha };
}

export function resolveExportCellStage(source, options = {}) {
  if (!source) return null;
  const type = source.type ?? 'normal';
  const transition = source.transition;
  const preference = shouldActivateTransition(type, options);
  if (preference === null || !transition) {
    return createStageFromEntry(source);
  }
  const stage = preference ? transition.to : transition.from;
  if (stage?.color && stage?.rgb) {
    return stage;
  }
  return createStageFromEntry({
    ...source,
    color: stage?.color ?? source.color,
    rgb: stage?.rgb ?? source.rgb,
    alpha: stage?.alpha ?? source.alpha
  });
}

export function resolveExportColorForCode(code, fallbackEntry = null, options = {}) {
  const paletteEntry = code && state.palette ? state.palette[code] : null;
  const stage = resolveExportCellStage(paletteEntry ?? fallbackEntry, options);
  if (stage) return stage;
  return createStageFromEntry(fallbackEntry ?? paletteEntry ?? null);
}

export function drawExportPixel(ctx, cell, stage, x, y, size, backgroundColor = '#ffffff') {
  if (!ctx || !stage) return;
  const type = cell?.type ?? 'normal';
  const alpha = stage.alpha ?? 1;
  if (type === 'transparent') {
    if (backgroundColor === 'transparent') {
      drawTransparentCellBackground(ctx, x, y, size);
    }
    return;
  }
  if (alpha < 1) {
    drawTransparentCellBackground(ctx, x, y, size);
  }
  ctx.fillStyle = stage.color;
  ctx.fillRect(x, y, size, size);
  if (type === 'pearlescent') {
    applyExportPearlescentGloss(ctx, x, y, size);
  }
}

function parseSvgColor(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return { color: '#000000', opacity: 1 };
  }
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'transparent') {
    return { color: '#000000', opacity: 0 };
  }
  const rgbaMatch = trimmed.match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    const r = Math.max(0, Math.min(255, Number(parts[0]) || 0));
    const g = Math.max(0, Math.min(255, Number(parts[1]) || 0));
    const b = Math.max(0, Math.min(255, Number(parts[2]) || 0));
    const a = parts.length > 3 ? Math.max(0, Math.min(1, Number(parts[3]) || 0)) : 1;
    return { color: `rgb(${r}, ${g}, ${b})`, opacity: a };
  }
  return { color: trimmed, opacity: 1 };
}

function svgColorAttrs(name, parsed) {
  const base = `${name}="${escapeAttr(parsed.color)}"`;
  return parsed.opacity < 1
    ? `${base} ${name}-opacity="${formatNumber(parsed.opacity)}"`
    : base;
}

export function renderExportCanvas(exportCanvas, options = {}) {
  const layout = buildExportLayoutData(options);
  if (!layout) return exportCanvas;
  exportCanvas.width = layout.canvasWidth;
  exportCanvas.height = layout.canvasHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return exportCanvas;
  paintExportScene(ctx, layout);
  return exportCanvas;
}

export function exportToSVG(options = {}) {
  const layout = buildExportLayoutData(options);
  if (!layout) throw new Error(TEXT.exporter.noCanvasAlert);
  const svgMarkup = renderLayoutToSvg(layout);
  if (!svgMarkup) throw new Error(TEXT.exporter.svgUnavailable || 'SVG 导出暂不可用');
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || `pixel-canvas-${state.width}x${state.height}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildExportLayoutData(options = {}) {
  if (!state.width || !state.height) return null;
  const includeCodes = Boolean(options.includeCodes);
  const includeAxes = Boolean(options.includeAxes);
  const includeLightColors = options.includeLightColors !== false;
  const includeTemperatureColors = options.includeTemperatureColors !== false;
  const backgroundColor = options.backgroundColor ?? '#ffffff';
  const factor = EXPORT_SCALE;
  const widthCells = state.width;
  const heightCells = state.height;
  const layoutScale = computeExportInfoScale(widthCells, heightCells);
  const spacingScale = Math.min(layoutScale, 3.2);
  const axisPadding = includeAxes
    ? computeAxisPadding(factor, widthCells, heightCells)
    : { top: 0, right: 0, bottom: 0, left: 0 };
  const contentWidth = widthCells * factor;
  const contentHeight = heightCells * factor;
  const drawingWidth = contentWidth + axisPadding.left + axisPadding.right;
  const drawingHeight = contentHeight + axisPadding.top + axisPadding.bottom;
  const rawUsedColors = collectUsedColors();
  const totalUsedCells = rawUsedColors.reduce((sum, entry) => sum + entry.count, 0);
  const usedColors = rawUsedColors.map((entry) => {
    const stage = resolveExportColorForCode(entry.code, entry, { includeLightColors, includeTemperatureColors });
    return {
      ...entry,
      color: stage?.color ?? entry.color,
      rgb: stage?.rgb ?? entry.rgb ?? { ...DEFAULT_STAGE_RGB },
      alpha: stage?.alpha ?? entry.alpha
    };
  });
  const paletteLabel = getActivePaletteLabel();
  const pagePaddingX = Math.max(40, Math.round(factor * 0.8 * spacingScale));
  const pagePaddingY = Math.max(40, Math.round(factor * 0.8 * spacingScale));
  const headingGap = Math.max(16, Math.round(factor * 0.32 * spacingScale));
  const sectionGap = Math.max(28, Math.round(factor * 0.56 * spacingScale));
  const swatchGapX = Math.max(28, Math.round(factor * 0.56 * spacingScale));
  const swatchGapY = Math.max(32, Math.round(factor * 0.64 * spacingScale));
  const swatchTextGap = Math.max(14, Math.round(factor * 0.28 * layoutScale));
  const headingFont = Math.max(28, Math.round(factor * 0.65 * layoutScale));
  const totalFont = Math.max(24, Math.round(factor * 0.55 * layoutScale));
  const sectionTitleFont = Math.max(26, Math.round(factor * 0.6 * layoutScale));
  const swatchLabelFont = Math.max(22, Math.round(factor * 0.5 * layoutScale));
  const swatchCountFont = Math.max(20, Math.round(factor * 0.46 * layoutScale));
  const paletteFont = Math.max(24, Math.round(factor * 0.55 * layoutScale));
  const emptyFont = Math.max(20, Math.round(factor * 0.46 * layoutScale));
  const swatchWidth = Math.max(96, Math.round(factor * 1.6 * spacingScale));
  const swatchHeight = Math.max(64, Math.round(factor * 1.2 * spacingScale));
  const swatchRadius = Math.round(Math.min(swatchWidth, swatchHeight) * 0.35);
  const availableWidth = drawingWidth;
  const maxColumns = Math.max(1, Math.floor((availableWidth + swatchGapX) / (swatchWidth + swatchGapX)));
  const columns = usedColors.length ? Math.min(usedColors.length, Math.max(1, maxColumns)) : 1;
  const rows = usedColors.length ? Math.ceil(usedColors.length / columns) : 1;
  const itemHeight = swatchLabelFont + swatchTextGap + swatchHeight + swatchTextGap + swatchCountFont;
  const swatchAreaHeight = usedColors.length ? rows * itemHeight + (rows - 1) * swatchGapY : swatchHeight + swatchLabelFont;
  const swatchContentWidth = usedColors.length ? columns * swatchWidth + (columns - 1) * swatchGapX : swatchWidth;
  const totalWidth = drawingWidth + pagePaddingX * 2;
  const totalHeight = pagePaddingY +
    headingFont + headingGap +
    drawingHeight + sectionGap +
    totalFont + sectionGap +
    sectionTitleFont + headingGap +
    swatchAreaHeight + sectionGap +
    paletteFont + pagePaddingY;
  const drawingLeft = pagePaddingX;
  const drawingTop = pagePaddingY + headingFont + headingGap;
  const originX = drawingLeft + axisPadding.left;
  const originY = drawingTop + axisPadding.top;

  return {
    includeCodes,
    includeAxes,
    includeLightColors,
    includeTemperatureColors,
    includeLightColors,
    includeTemperatureColors,
    backgroundColor,
    factor,
    axisPadding,
    widthCells,
    heightCells,
    drawingWidth,
    drawingHeight,
    usedColors,
    totalUsedCells,
    paletteLabel,
    pagePaddingY,
    headingFont,
    headingGap,
    sectionGap,
    swatchGapX,
    swatchGapY,
    swatchTextGap,
    swatchLabelFont,
    swatchCountFont,
    totalFont,
    sectionTitleFont,
    paletteFont,
    emptyFont,
    swatchWidth,
    swatchHeight,
    swatchRadius,
    columns,
    rows,
    itemHeight,
    swatchAreaHeight,
    swatchContentWidth,
    canvasWidth: Math.ceil(totalWidth),
    canvasHeight: Math.ceil(totalHeight),
    centerX: totalWidth / 2,
    drawingLeft,
    drawingTop,
    originX,
    originY,
    swatchAreaTop: drawingTop + drawingHeight + sectionGap + totalFont + sectionGap + sectionTitleFont + headingGap,
    swatchStartX: pagePaddingX + (availableWidth - swatchContentWidth) / 2,
    hasHighlight: Boolean(options?.hasHighlight)
  };
}

function paintExportScene(ctx, layout) {
  const {
    canvasWidth,
    canvasHeight,
    backgroundColor,
    pagePaddingY,
    headingFont,
    headingGap,
    centerX,
    drawingLeft,
    drawingTop,
    drawingWidth,
    drawingHeight,
    originX,
    originY,
    includeCodes,
    includeAxes,
    includeLightColors,
    includeTemperatureColors,
    factor,
    widthCells,
    heightCells,
    usedColors,
    totalUsedCells,
    sectionGap,
    totalFont,
    sectionTitleFont,
    swatchAreaTop,
    swatchAreaHeight,
    swatchStartX,
    swatchWidth,
    swatchHeight,
    swatchLabelFont,
    swatchCountFont,
    swatchTextGap,
    swatchGapX,
    swatchGapY,
    columns,
    itemHeight,
    swatchRadius,
    emptyFont,
    paletteFont,
    paletteLabel
  } = layout;
  const colorOptions = { includeLightColors, includeTemperatureColors };
  const codeStageCache = includeCodes ? Array.from({ length: heightCells }, () => Array(widthCells)) : null;

  if (typeof ctx.clearRect === 'function') {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  }
  if (backgroundColor === 'transparent') {
    drawCheckerboard(ctx, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  if ('imageSmoothingEnabled' in ctx) {
    ctx.imageSmoothingEnabled = false;
  }

  let cursorY = pagePaddingY;
  ctx.fillStyle = '#1f1f1f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${headingFont}px ${PIXEL_FONT_FAMILY}`;
  const filename = (state.exportSettings?.filename || 'pixel-art').trim() || 'pixel-art';
  const headingText = layout.hasHighlight
    ? `${filename}-高亮图`
    : filename;
  ctx.fillText(headingText, centerX, cursorY);
  cursorY += headingFont + headingGap;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(drawingLeft, drawingTop, drawingWidth, drawingHeight);
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.lineWidth = 1;
  if (typeof ctx.strokeRect === 'function') {
    ctx.strokeRect(drawingLeft + 0.5, drawingTop + 0.5, drawingWidth - 1, drawingHeight - 1);
  } else {
    ctx.beginPath();
    ctx.rect(drawingLeft + 0.5, drawingTop + 0.5, drawingWidth - 1, drawingHeight - 1);
    ctx.stroke();
  }
  ctx.restore();

  for (let y = 0; y < heightCells; y++) {
    const row = state.grid[y] || [];
    for (let x = 0; x < widthCells; x++) {
      const cell = row[x];
      if (!cell) continue;
      const stage = resolveExportCellStage(cell, colorOptions);
      if (!stage) continue;
      const pixelX = originX + x * factor;
      const pixelY = originY + y * factor;
      drawExportPixel(ctx, cell, stage, pixelX, pixelY, factor, backgroundColor);
      if (codeStageCache) {
        codeStageCache[y][x] = stage;
      }
    }
  }

  if (includeCodes) {
    const fontPx = Math.max(10, Math.floor(factor * 0.3));
    ctx.save();
    ctx.font = `${fontPx}px ${PIXEL_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < heightCells; y++) {
      const row = state.grid[y] || [];
      for (let x = 0; x < widthCells; x++) {
        const cell = row[x];
        if (!cell?.code) continue;
        const stage = codeStageCache?.[y]?.[x] ?? resolveExportCellStage(cell, colorOptions);
        if (!stage) continue;
        const rgb = stage.rgb ?? cell.rgb ?? DEFAULT_STAGE_RGB;
        ctx.fillStyle = pickTextColor(rgb);
        ctx.fillText(cell.code, originX + x * factor + factor / 2, originY + y * factor + factor / 2);
      }
    }
    ctx.restore();
  }

  if (includeAxes) {
    ctx.save();
    const thinWidth = Math.max(1, Math.round(factor * 0.02));
    const boldWidth = Math.max(thinWidth + 1, Math.round(factor * 0.08));
    renderGridLines(ctx, {
      originX,
      originY,
      cellSize: factor,
      widthCells,
      heightCells,
      thinColor: 'rgba(0, 0, 0, 0.12)',
      boldColor: 'rgba(0, 0, 0, 0.35)',
      thinLineWidth: thinWidth,
      boldLineWidth: boldWidth,
      gridOptions: state.gridOverlay
    });
    renderAxisLabels(ctx, {
      originX,
      originY,
      cellSize: factor,
      widthCells,
      heightCells,
      textColor: 'rgba(0,0,0,0.75)',
      tickColor: 'rgba(0,0,0,0.35)',
      fontSize: Math.max(12, Math.floor(factor * 0.28)),
      tickLength: Math.max(6, Math.floor(factor * 0.25)),
      gap: Math.max(6, Math.floor(factor * 0.2))
    });
    ctx.restore();
  }

  cursorY = drawingTop + drawingHeight + sectionGap;
  ctx.font = `${totalFont}px ${PIXEL_FONT_FAMILY}`;
  ctx.fillStyle = '#1f1f1f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(TEXT.exporter.total(totalUsedCells), centerX, cursorY);
  cursorY += totalFont + sectionGap;
  ctx.font = `${sectionTitleFont}px ${PIXEL_FONT_FAMILY}`;
  ctx.fillText(TEXT.exporter.sectionTitle, centerX, cursorY);
  ctx.textAlign = 'center';
  cursorY += sectionTitleFont + headingGap;

  if (!usedColors.length) {
    ctx.save();
    ctx.font = `${emptyFont}px ${PIXEL_FONT_FAMILY}`;
    ctx.fillStyle = '#6f7285';
    ctx.textBaseline = 'middle';
    ctx.fillText(TEXT.exporter.empty, centerX, swatchAreaTop + swatchAreaHeight / 2);
    ctx.restore();
  } else {
    ctx.textBaseline = 'top';
    usedColors.forEach((entry, index) => {
      const columnIndex = index % columns;
      const rowIndex = Math.floor(index / columns);
      const itemLeft = swatchStartX + columnIndex * (swatchWidth + swatchGapX);
      const itemTop = swatchAreaTop + rowIndex * (itemHeight + swatchGapY);
      const itemCenterX = itemLeft + swatchWidth / 2;
      ctx.font = `${swatchLabelFont}px ${PIXEL_FONT_FAMILY}`;
      ctx.fillStyle = '#1f1f1f';
      ctx.fillText(entry.code, itemCenterX, itemTop);
      const swatchTop = itemTop + swatchLabelFont + swatchTextGap;
      ctx.save();
      beginRoundedRectPath(ctx, itemLeft, swatchTop, swatchWidth, swatchHeight, swatchRadius);
      ctx.fillStyle = entry.color;
      ctx.fill();
      ctx.lineWidth = Math.max(2, Math.round(factor * 0.06));
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.stroke();
      ctx.restore();
      const countTop = swatchTop + swatchHeight + swatchTextGap;
      ctx.font = `${swatchCountFont}px ${PIXEL_FONT_FAMILY}`;
      ctx.fillStyle = '#3f4255';
      ctx.fillText(String(entry.count), itemCenterX, countTop);
    });
  }

  cursorY = swatchAreaTop + swatchAreaHeight + sectionGap;
  ctx.font = `${paletteFont}px ${PIXEL_FONT_FAMILY}`;
  ctx.fillStyle = '#1f1f1f';
  ctx.textBaseline = 'top';
  ctx.fillText(TEXT.exporter.paletteLabel(paletteLabel), centerX, cursorY);
}

function applyExportPearlescentGloss(ctx, px, py, size) {
  ctx.save();
  const gradient = ctx.createLinearGradient(px, py, px + size, py + size);
  gradient.addColorStop(0, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
}

function drawTransparentCellBackground(ctx, px, py, size) {
  ctx.save();
  ctx.fillStyle = TRANSPARENT_BG_LIGHT;
  ctx.fillRect(px, py, size, size);
  const tile = Math.max(2, Math.floor(size / 4));
  ctx.fillStyle = TRANSPARENT_BG_DARK;
  for (let row = 0; row < size; row += tile) {
    const rowIndex = Math.floor(row / tile);
    const offset = (rowIndex % 2) * tile;
    for (let col = 0; col < size; col += tile * 2) {
      const cx = px + col + offset;
      const cy = py + row;
      const width = Math.max(0, Math.min(tile, px + size - cx));
      const height = Math.max(0, Math.min(tile, py + size - cy));
      if (width <= 0 || height <= 0) continue;
      ctx.fillRect(cx, cy, width, height);
    }
  }
  ctx.restore();
}

function renderLayoutToSvg(layout) {
  const svgCtx = new SvgContext(layout.canvasWidth, layout.canvasHeight);
  paintExportScene(svgCtx, layout);
  return svgCtx.toString();
}

class SvgContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.elements = [];
    this.state = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      lineJoin: 'miter',
      lineCap: 'butt'
    };
    this.stateStack = [];
    this.currentPath = null;
    this.currentPoint = null;
    this.pathClosed = false;
    this._imageSmoothingEnabled = true;
    this.__isSvgContext = true;
  }

  get fillStyle() { return this.state.fillStyle; }
  set fillStyle(value) { this.state.fillStyle = value; }

  get strokeStyle() { return this.state.strokeStyle; }
  set strokeStyle(value) { this.state.strokeStyle = value; }

  get lineWidth() { return this.state.lineWidth; }
  set lineWidth(value) { this.state.lineWidth = Number(value) || 0; }

  get font() { return this.state.font; }
  set font(value) { this.state.font = value; }

  get textAlign() { return this.state.textAlign; }
  set textAlign(value) { this.state.textAlign = value; }

  get textBaseline() { return this.state.textBaseline; }
  set textBaseline(value) { this.state.textBaseline = value; }

  get lineJoin() { return this.state.lineJoin; }
  set lineJoin(value) { this.state.lineJoin = value || 'miter'; }

  get lineCap() { return this.state.lineCap; }
  set lineCap(value) { this.state.lineCap = value || 'butt'; }

  get imageSmoothingEnabled() { return this._imageSmoothingEnabled; }
  set imageSmoothingEnabled(value) { this._imageSmoothingEnabled = Boolean(value); }

  save() {
    this.stateStack.push({ ...this.state });
  }

  restore() {
    const prev = this.stateStack.pop();
    if (prev) this.state = { ...prev };
  }

  clearRect() {
    
  }

  beginPath() {
    this.currentPath = [];
    this.currentPoint = null;
    this.pathClosed = false;
  }

  closePath() {
    this.pathClosed = true;
  }

  moveTo(x, y) {
    const cmd = `M ${formatNumber(x)} ${formatNumber(y)}`;
    if (!this.currentPath) this.beginPath();
    this.currentPath.push(cmd);
    this.currentPoint = { x, y };
  }

  lineTo(x, y) {
    if (!this.currentPath) this.moveTo(x, y);
    else {
      this.currentPath.push(`L ${formatNumber(x)} ${formatNumber(y)}`);
      this.currentPoint = { x, y };
    }
  }

  rect(x, y, width, height) {
    if (!this.currentPath) this.beginPath();
    const x2 = x + width;
    const y2 = y + height;
    this.currentPath.push(`M ${formatNumber(x)} ${formatNumber(y)}`);
    this.currentPath.push(`L ${formatNumber(x2)} ${formatNumber(y)}`);
    this.currentPath.push(`L ${formatNumber(x2)} ${formatNumber(y2)}`);
    this.currentPath.push(`L ${formatNumber(x)} ${formatNumber(y2)}`);
    this.pathClosed = true;
    this.currentPoint = { x, y };
  }

  arcTo(x1, y1, x2, y2, radius) {
    if (!this.currentPoint) {
      this.moveTo(x1, y1);
      return;
    }
    if (!radius) {
      this.lineTo(x1, y1);
      return;
    }
    const p0 = this.currentPoint;
    const p1 = { x: x1, y: y1 };
    const p2 = { x: x2, y: y2 };
    const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    if (!len1 || !len2) {
      this.lineTo(x1, y1);
      return;
    }
    const v1n = { x: v1.x / len1, y: v1.y / len1 };
    const v2n = { x: v2.x / len2, y: v2.y / len2 };
    const dot = Math.max(-1, Math.min(1, v1n.x * v2n.x + v1n.y * v2n.y));
    const angle = Math.acos(dot);
    if (!angle) {
      this.lineTo(x1, y1);
      return;
    }
    const tan = Math.tan(angle / 2);
    const dist = radius / tan;
    const start = { x: p1.x + v1n.x * dist, y: p1.y + v1n.y * dist };
    const end = { x: p1.x + v2n.x * dist, y: p1.y + v2n.y * dist };
    this.lineTo(start.x, start.y);
    const sweep = (v1n.x * v2n.y - v1n.y * v2n.x) < 0 ? 0 : 1;
    this.currentPath.push(`A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 ${sweep} ${formatNumber(end.x)} ${formatNumber(end.y)}`);
    this.currentPoint = { ...end };
  }

  stroke() {
    this._emitPath({ stroke: true });
  }

  fill() {
    this._emitPath({ fill: true, close: this.pathClosed });
  }

  fillRect(x, y, width, height) {
    const fill = parseSvgColor(this.state.fillStyle);
    const fillAttr = svgColorAttrs('fill', fill);
    this.elements.push(`<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" ${fillAttr} stroke="none"/>`);
  }

  strokeRect(x, y, width, height) {
    const stroke = parseSvgColor(this.state.strokeStyle);
    const strokeAttr = svgColorAttrs('stroke', stroke);
    this.elements.push(`<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="none" ${strokeAttr} stroke-width="${formatNumber(this.state.lineWidth)}" stroke-linejoin="${escapeAttr(this.state.lineJoin)}" stroke-linecap="${escapeAttr(this.state.lineCap)}"/>`);
  }

  fillText(text, x, y) {
    const anchorMap = { center: 'middle', left: 'start', right: 'end', start: 'start', end: 'end' };
    const baselineMap = {
      top: 'text-before-edge',
      hanging: 'hanging',
      middle: 'middle',
      alphabetic: 'alphabetic',
      ideographic: 'ideographic',
      bottom: 'text-after-edge'
    };
    const anchor = anchorMap[this.state.textAlign] || 'start';
    const baseline = baselineMap[this.state.textBaseline] || 'alphabetic';
    const parsedFont = parseFont(this.state.font);
    const content = escapeText(text);
    const fill = parseSvgColor(this.state.fillStyle);
    const fillAttr = svgColorAttrs('fill', fill);
    this.elements.push(
      `<text x="${formatNumber(x)}" y="${formatNumber(y)}" ${fillAttr} font-size="${escapeAttr(parsedFont.size)}" font-family="${escapeAttr(parsedFont.family)}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="font:${escapeAttr(this.state.font)}">${content}</text>`
    );
  }

  toString() {
    const body = this.elements.join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(this.width)}" height="${formatNumber(this.height)}" viewBox="0 0 ${formatNumber(this.width)} ${formatNumber(this.height)}">\n  ${body}\n</svg>`;
  }

  _emitPath({ fill = false, stroke = false, close = false } = {}) {
    if (!this.currentPath || !this.currentPath.length) return;
    const commands = [...this.currentPath];
    if (close) commands.push('Z');
    const d = commands.join(' ');
    const fillColor = fill ? parseSvgColor(this.state.fillStyle) : null;
    const strokeColor = stroke ? parseSvgColor(this.state.strokeStyle) : null;
    const fillAttr = fillColor ? svgColorAttrs('fill', fillColor) : 'fill="none"';
    const strokeAttr = strokeColor ? svgColorAttrs('stroke', strokeColor) : 'stroke="none"';
    const strokeExtras = strokeColor
      ? ` stroke-width="${formatNumber(this.state.lineWidth)}" stroke-linejoin="${escapeAttr(this.state.lineJoin)}" stroke-linecap="${escapeAttr(this.state.lineCap)}"`
      : '';
    this.elements.push(`<path d="${escapeAttr(d)}" ${fillAttr} ${strokeAttr}${strokeExtras}/>`);
    this.currentPath = null;
    this.currentPoint = null;
    this.pathClosed = false;
  }

  addRoundedRectPath(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    const right = x + width;
    const bottom = y + height;
    this.beginPath();
    const cmds = [
      `M ${formatNumber(x + r)} ${formatNumber(y)}`,
      `L ${formatNumber(right - r)} ${formatNumber(y)}`,
      `A ${formatNumber(r)} ${formatNumber(r)} 0 0 1 ${formatNumber(right)} ${formatNumber(y + r)}`,
      `L ${formatNumber(right)} ${formatNumber(bottom - r)}`,
      `A ${formatNumber(r)} ${formatNumber(r)} 0 0 1 ${formatNumber(right - r)} ${formatNumber(bottom)}`,
      `L ${formatNumber(x + r)} ${formatNumber(bottom)}`,
      `A ${formatNumber(r)} ${formatNumber(r)} 0 0 1 ${formatNumber(x)} ${formatNumber(bottom - r)}`,
      `L ${formatNumber(x)} ${formatNumber(y + r)}`,
      `A ${formatNumber(r)} ${formatNumber(r)} 0 0 1 ${formatNumber(x + r)} ${formatNumber(y)}`
    ];
    this.currentPath = cmds;
    this.pathClosed = true;
    this.currentPoint = { x: x + r, y };
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseFont(font) {
  if (typeof font !== 'string' || !font.trim()) {
    return { size: '12px', family: 'sans-serif' };
  }
  const parts = font.split(/\s+/);
  const sizePart = parts.find((part) => /px$/.test(part)) || '12px';
  const sizeIndex = parts.indexOf(sizePart);
  const family = parts.slice(sizeIndex + 1).join(' ') || 'sans-serif';
  return { size: sizePart, family: family };
}

function drawCheckerboard(ctx, width, height) {
  const size = 8;
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e0e0e0';
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size * 2) {
      if ((y / size) % 2 === 0) ctx.fillRect(x + size, y, size, size);
      else ctx.fillRect(x, y, size, size);
    }
  }
}

export function computeExportInfoScale(widthCells, heightCells) {
  const magnitude = Math.max(1, Math.sqrt(Math.max(1, widthCells) * Math.max(1, heightCells)));
  const normalized = magnitude / EXPORT_INFO_BASE_CELLS;
  const clamped = Math.min(EXPORT_INFO_MAX_SCALE, Math.max(EXPORT_INFO_MIN_SCALE, normalized));
  return Number.isFinite(clamped) ? clamped : EXPORT_INFO_MIN_SCALE;
}
export function exportImage(options = {}) {
  const {
    includeCodes = false,
    includeAxes = false,
    includeLightColors = true,
    includeTemperatureColors = true,
    backgroundColor = '#ffffff',
    filename = null,
    format = 'image/png'
  } = options;
  if (!state.width || !state.height) {
    window.alert(TEXT.exporter.noCanvasAlert);
    return;
  }
  const selectedColors = exportHighlightManager.getSelectedColors();
  const hasHighlight = exportHighlightManager.hasHighlight();
  const effectiveBackground = format === 'image/jpeg' && backgroundColor === 'transparent' ? '#ffffff' : backgroundColor;
  const exportOptions = {
    includeCodes,
    includeAxes,
    includeLightColors,
    includeTemperatureColors,
    backgroundColor: effectiveBackground,
    hasHighlight: false
  };
  let exportCanvas;
  if (hasHighlight) {
    exportCanvas = document.createElement('canvas');
    exportHighlightManager.renderHighlightedCanvas(exportCanvas, selectedColors, { ...exportOptions, hasHighlight: true });
  } else {
    exportCanvas = document.createElement('canvas');
    renderExportCanvas(exportCanvas, exportOptions);
  }
  const mime = format;
  const dataUrl = exportCanvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined);
  const extension = getFileExtension(mime);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename || `pixel-canvas-${state.width}x${state.height}.${extension}`;
  link.click();
}
export async function exportToPDF(options = {}) {
  const {
    includeCodes = false,
    includeAxes = false,
    includeLightColors = true,
    includeTemperatureColors = true,
    backgroundColor = '#ffffff',
    filename = `pixel-canvas-${state.width}x${state.height}.pdf`
  }
    = options;
  if (!state.width || !state.height) throw new Error(TEXT.exporter.noCanvasAlert);
  return new Promise((resolve, reject) => {
    try {
      const exportCanvas = document.createElement('canvas');
      renderExportCanvas(exportCanvas, {
        includeCodes,
        includeAxes,
        includeLightColors,
        includeTemperatureColors,
        backgroundColor,
        hasHighlight: false
      });
      const imageData = exportCanvas.toDataURL('image/png');
      const { jsPDF }
        = window.jspdf;
      const pdf = new jsPDF({ orientation: exportCanvas.width > exportCanvas.height ? 'landscape' : 'portrait', unit: 'px', format: [exportCanvas.width, exportCanvas.height] });
      pdf.addImage({ imageData, format: 'PNG', x: 0, y: 0, width: exportCanvas.width, height: exportCanvas.height });
      pdf.save(filename);
      resolve();
    }
    catch (error) {
      console.error(TEXT.exporter.pdfErrorConsole, error);
      reject(new Error(TEXT.exporter.pdfErrorMessage(error.message)));
    }
  });
}
function getFileExtension(mimeType) {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/svg+xml': return 'svg';
    case 'application/pdf': return 'pdf';
    case 'application/psd': return 'psd';
    default: return 'png';
  }
}
function beginRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  if (ctx instanceof SvgContext && typeof ctx.addRoundedRectPath === 'function') {
    ctx.addRoundedRectPath(x, y, width, height, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
