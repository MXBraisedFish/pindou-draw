import { AXIS_STYLE, DOUBLE_CLICK_MS, SIZE_LIMITS, CANVAS_SIZE_LIMIT, MAX_SAFE_CANVAS_DIMENSION } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { cellsEqual, clampAlpha, clampCellSize, computeAxisPadding, pickTextColor } from './utils.js';
import { applyBaseScale, fitBaseImageToCanvas, getNearestColorFromBase, updateBaseImageDisplay, updateCanvasCursorState } from './base-image.js';
import { updatePaletteSelection, updateCurrentColorInfo, isColorEnabled } from './palette.js';
import { renderSelectionLayers } from './selection-layer.js';
import { resetSelection, isCellSelected, addSelectionRect, subtractSelectionRect, invertSelection, clearSelection, shiftSelectionMask, cloneSelectionState, restoreSelectionState } from './selection.js';
import { TEXT } from './language.js';
import { renderAxisLabels, renderGridLines } from './grid-overlay.js';
import { computeSymmetryTargets, getSymmetryMode } from './symmetry.js';
const MAX_HISTORY_SIZE = 50;
const CREATED_AT_FORMATTER = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('zh-Hans', { dateStyle: 'medium', timeStyle: 'short' })
  : null;
let globalMiddleResetBound = false;
const DISPLAY_MODE_ANIMATION_MS = 300;
const COLOR_TRANSITION_MODES = new Set(['standard', 'light', 'temperature', 'special', 'night']);
const TRANSITIONAL_COLOR_TYPES = new Set(['light', 'temperatrue']);
const DISPLAY_MODE_HINTS = {
  night: '画布光效：夜光模式',
  temperature: '画布光效：温变预览',
  light: '画布光效：光变预览',
  special: '画布光效：多效联动'
};
let displayModeAnimation = null;
const LARGE_CANVAS_AREA = 512 * 512;
const LARGE_CANVAS_ZOOM_FACTOR = 1.5;
let spacePanModifierActive = false;
let spacePanBindingInitialized = false;
export function validateCanvasSize(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width <= CANVAS_SIZE_LIMIT && height <= CANVAS_SIZE_LIMIT;
}
export function createCanvas(width, height, options = {}) {
  state.width = width;
  state.height = height;
  state.grid = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  state.panX = state.panY = 0;
  const providedCreatedAt = options?.createdAt ?? null;
  const parsedCreatedAt = providedCreatedAt ? new Date(providedCreatedAt) : new Date();
  state.createdAt = Number.isNaN(parsedCreatedAt.getTime()) ? new Date() : parsedCreatedAt;
  const explicitCellSize = Number.isFinite(options?.cellSize) ? options.cellSize : null;
  const rawRequestedSize = explicitCellSize ?? Number(elements.zoomRange?.value);
  const initialRaw = Number.isFinite(rawRequestedSize) && rawRequestedSize > 0 ? rawRequestedSize : state.defaultCellSize;
  const clampedInitialSize = clampCellSize(initialRaw);
  const maxCellSize = resolveMaxCellSize();
  const initialRequested = Math.min(clampedInitialSize, maxCellSize);
  const { safeCellSize, cssScale } = computeZoomTargets(initialRequested, maxCellSize);
  state.cellSize = safeCellSize;
  state.defaultCellSize = safeCellSize;
  state.zoomValue = initialRequested;
  state.zoomScale = cssScale;
  if (Number.isFinite(explicitCellSize)) {
    state.pixelRatio = initialRequested;
  }
  else if (!Number.isFinite(state.pixelRatio) || state.pixelRatio <= 0) {
    state.pixelRatio = initialRequested;
  }
  applyDynamicZoomLimit();
  elements.zoomRange && (elements.zoomRange.value = String(state.zoomValue));
  elements.resolutionInput && (elements.resolutionInput.value = String(state.pixelRatio));
  state.baseImage && fitBaseImageToCanvas();
  resizeCanvas();
  updateStageTransform();
  redrawCanvas();
  updateStatusSize();
  updateStatusCreated();
  updateBaseImageDisplay();
  resetSelection({ suppressRender: true });
  resetSelectionPointerState();
  state.history = [];
  state.historyIndex = -1;
  saveHistory();
  updateZoomIndicator();
  updateStatusCreated();
  updateCanvasOpacityLabel();
}
function cloneGrid(grid) {
  if (!Array.isArray(grid)) return [];
  return grid.map(row => Array.isArray(row) ? row.map(cell => (cell ? { ...cell } : cell)) : []);
}
function cloneSelectionSnapshot(selection) {
  if (!selection || !selection.mask) {
    return { active: false, bounds: null, mask: null };
  } const maskCopy = selection.mask.map(row => row ? [...row] : null);
  const boundsCopy = selection.bounds ? { ...selection.bounds } : null;
  return { active: Boolean(selection.active && boundsCopy), bounds: boundsCopy, mask: maskCopy };
}
function createHistorySnapshot() {
  return { width: state.width, height: state.height, baseOffsetX: state.baseOffsetX, baseOffsetY: state.baseOffsetY, grid: cloneGrid(state.grid), selection: cloneSelectionState() };
}
function normalizeSnapshot(snapshot) {
  if (!snapshot) return null;
  if (Array.isArray(snapshot)) {
    const height = snapshot.length;
    const width = height ? (snapshot[0]?.length ?? 0) : 0;
    return { width, height, baseOffsetX: 0, baseOffsetY: 0, grid: cloneGrid(snapshot), selection: { active: false, bounds: null, mask: null } };
  } if (typeof snapshot === 'object') {
    const gridData = Array.isArray(snapshot.grid) ? snapshot.grid : [];
    const height = Number.isFinite(snapshot.height) ? snapshot.height : gridData.length;
    const width = Number.isFinite(snapshot.width) ? snapshot.width : (gridData[0]?.length ?? 0);
    return { width, height, baseOffsetX: Number.isFinite(snapshot.baseOffsetX) ? snapshot.baseOffsetX : 0, baseOffsetY: Number.isFinite(snapshot.baseOffsetY) ? snapshot.baseOffsetY : 0, grid: cloneGrid(gridData), selection: snapshot.selection ? cloneSelectionSnapshot(snapshot.selection) : { active: false, bounds: null, mask: null } };
  } return null;
}
function snapshotKey(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return null;
  return JSON.stringify({ width: normalized.width, height: normalized.height, baseOffsetX: normalized.baseOffsetX, baseOffsetY: normalized.baseOffsetY, grid: normalized.grid, selection: normalized.selection });
}
function snapshotsEqual(a, b) {
  const keyA = snapshotKey(a);
  const keyB = snapshotKey(b);
  return keyA !== null && keyA === keyB;
}
function applyHistorySnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return;
  state.width = normalized.width;
  state.height = normalized.height;
  state.baseOffsetX = normalized.baseOffsetX;
  state.baseOffsetY = normalized.baseOffsetY;
  state.grid = cloneGrid(normalized.grid);
  restoreSelectionState(normalized.selection, { suppressRender: true });
  resizeCanvas();
  updateStatusSize();
  renderSelectionLayers();
}
export function saveHistory() {
  const snapshot = createHistorySnapshot();
  const lastSnapshot = state.history.length > 0 ? state.history[state.historyIndex] : null;
  if (snapshotsEqual(lastSnapshot, snapshot)) return;
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  } if (state.history.length >= MAX_HISTORY_SIZE) {
    state.history.shift();
    state.historyIndex--;
  } state.history.push(snapshot);
  state.historyIndex = state.history.length - 1;
}
export function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    applyHistorySnapshot(state.history[state.historyIndex]);
    return true;
  } return false;
}
export function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    applyHistorySnapshot(state.history[state.historyIndex]);
    return true;
  } return false;
}

export function setCellSize(size) {
  const maxCellSize = resolveMaxCellSize();
  syncZoomRangeBounds(maxCellSize);
  const target = Number.isFinite(size) ? size : state.zoomValue;
  const requestedSize = Math.min(clampCellSize(target), maxCellSize);
  const { safeCellSize, cssScale } = computeZoomTargets(requestedSize, maxCellSize);
  const previousCellSize = state.cellSize;
  state.zoomValue = requestedSize;
  state.zoomScale = cssScale;
  elements.zoomRange && (elements.zoomRange.value = String(requestedSize));
  if (safeCellSize !== previousCellSize) {
    state.cellSize = safeCellSize;
    resizeCanvas();
  } else {
    applyZoomTransform();
  }
  updateZoomIndicator(requestedSize);
}

function applyZoomTransform() {
  const scale = Number.isFinite(state.zoomScale) && state.zoomScale > 0 ? state.zoomScale : 1;
  if (!elements.canvasViewport) return;
  elements.canvasViewport.style.transform = `scale(${scale})`;
}

export function resizeCanvas() {
  if (!state.width || !state.height) return;
  applyDynamicZoomLimit();
  state.axisPadding = computeAxisPadding(state.cellSize, state.width, state.height);
  const contentWidth = state.width * state.cellSize, contentHeight = state.height * state.cellSize;
  const pixelWidth = contentWidth + state.axisPadding.left + state.axisPadding.right;
  const pixelHeight = contentHeight + state.axisPadding.top + state.axisPadding.bottom;
  const layeredCanvases = [elements.baseCanvas, elements.canvas, elements.gridCanvas, elements.selectionMaskCanvas, elements.selectionContentCanvas, elements.selectionOutlineCanvas].filter(Boolean);
  layeredCanvases.forEach((canvas) => {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${pixelWidth}px`;
    canvas.style.height = `${pixelHeight}px`;
  });
  if (elements.canvasViewport) {
    elements.canvasViewport.style.width = `${pixelWidth}px`;
    elements.canvasViewport.style.height = `${pixelHeight}px`;
  }
  if (elements.stage) {
    elements.stage.style.width = `${pixelWidth}px`;
    elements.stage.style.height = `${pixelHeight}px`;
  }
  renderSelectionLayers();
  applyZoomTransform();
  updateStageTransform();
  updateBaseImageDisplay();
  redrawCanvas();
}
export function updateStageTransform() {
  elements.stage && (elements.stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`);
}
function resetView() {
  const baseSize = clampCellSize(state.defaultCellSize);
  state.zoomValue = baseSize;
  applyZoomTransform();
  elements.zoomRange && (elements.zoomRange.value = String(baseSize));
  state.panX = state.panY = 0;
  updateStageTransform();
  updateZoomIndicator();
}
export function redrawCanvas() {
  const { ctx, canvas } = elements;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.width || !state.height) {
    renderGridLayer();
    return;
  }
  const bgAlpha = clampAlpha(state.backgroundOpacity);
  if (bgAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const padding = state.axisPadding;
  const originX = padding.left;
  const originY = padding.top;
  const cellSize = state.cellSize;
  ctx.save();
  ctx.translate(originX, originY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, Math.floor(cellSize * 0.45))}px ${AXIS_STYLE.fontFamily}`;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      if (!cell) continue;
      const fillColor = resolveCellFill(cell);
      if (!fillColor) continue;
      drawCell(ctx, cell, px, py, cellSize, fillColor);
    }
  }
  ctx.restore();
  renderGridLayer();
}

export function renderGridLayer() {
  const { gridCtx, gridCanvas } = elements;
  if (!gridCtx || !gridCanvas) return;
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  if (!state.width || !state.height) {
    typeof document !== 'undefined' && document.dispatchEvent(new CustomEvent('grid:updated'));
    return;
  }
  const padding = state.axisPadding;
  const originX = padding.left;
  const originY = padding.top;
  const cellSize = state.cellSize;
  gridCtx.save();
  gridCtx.imageSmoothingEnabled = false;
  renderGridLines(gridCtx, {
    originX,
    originY,
    cellSize,
    widthCells: state.width,
    heightCells: state.height,
    gridOptions: state.gridOverlay
  });
  const axisAlpha = clampAlpha(state.axisOpacity ?? 1);
  if (axisAlpha > 0) {
    const textColor = `rgba(0,0,0,${0.65 * axisAlpha})`;
    const tickColor = `rgba(0,0,0,${0.3 * axisAlpha})`;
    renderAxisLabels(gridCtx, {
      originX,
      originY,
      cellSize,
      widthCells: state.width,
      heightCells: state.height,
      textColor,
      tickColor
    });
  }
  drawSymmetryGuides(gridCtx, originX, originY, cellSize);
  gridCtx.restore();
  typeof document !== 'undefined' && document.dispatchEvent(new CustomEvent('grid:updated'));
}

function drawSymmetryGuides(ctx, originX, originY, cellSize) {
  if (!ctx || !state.width || !state.height) return;
  const mode = typeof getSymmetryMode === 'function' ? getSymmetryMode() : state.symmetryMode;
  if (!mode || mode === 'none') return;
  const widthPx = state.width * cellSize;
  const heightPx = state.height * cellSize;
  ctx.save();
  ctx.strokeStyle = 'rgba(32, 142, 255, 0.65)';
  ctx.lineWidth = Math.max(1, cellSize * 0.08);
  ctx.setLineDash([Math.max(6, cellSize * 0.9), Math.max(3, cellSize * 0.6)]);
  ctx.lineCap = 'round';

  const drawVertical = () => {
    const axisX = originX + widthPx / 2;
    ctx.beginPath();
    ctx.moveTo(axisX, originY);
    ctx.lineTo(axisX, originY + heightPx);
    ctx.stroke();
  };
  const drawHorizontal = () => {
    const axisY = originY + heightPx / 2;
    ctx.beginPath();
    ctx.moveTo(originX, axisY);
    ctx.lineTo(originX + widthPx, axisY);
    ctx.stroke();
  };
  const drawDiagonalTLBR = () => {
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + widthPx, originY + heightPx);
    ctx.stroke();
  };
  const drawDiagonalTRBL = () => {
    ctx.beginPath();
    ctx.moveTo(originX + widthPx, originY);
    ctx.lineTo(originX, originY + heightPx);
    ctx.stroke();
  };

  const drawCenterMarker = () => {
    const centerX = originX + widthPx / 2;
    const centerY = originY + heightPx / 2;
    const radius = Math.max(4, cellSize * 0.65);
    ctx.save();
    ctx.fillStyle = 'rgba(32, 142, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const includeVertical = mode === 'vertical' || mode === 'cross' || mode === 'octagonal';
  const includeHorizontal = mode === 'horizontal' || mode === 'cross' || mode === 'octagonal';
  const includeDiag45 = mode === 'diagonal-45' || mode === 'diagonal-cross' || mode === 'octagonal';
  const includeDiag135 = mode === 'diagonal-135' || mode === 'diagonal-cross' || mode === 'octagonal';
  const includeCenter = mode === 'center';

  if (includeVertical) drawVertical();
  if (includeHorizontal) drawHorizontal();
  if (includeDiag45) drawDiagonalTLBR();
  if (includeDiag135) drawDiagonalTRBL();
  if (includeCenter) drawCenterMarker();
  ctx.restore();
}
function isMiddleDoubleClick(timeStamp) {
  const diff = timeStamp - state.lastMiddleClickTime;
  if (diff > 0 && diff <= DOUBLE_CLICK_MS) {
    state.lastMiddleClickTime = 0;
    return true;
  } state.lastMiddleClickTime = timeStamp;
  return false;
}

function ensureGlobalMiddleResetHandler() {
  if (globalMiddleResetBound || typeof window === 'undefined') return;
  const handlePointerDown = (ev) => {
    if (ev.button !== 1) return;
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    if (!state.width || !state.height) return;
    if (elements.canvas?.contains(ev.target)) return;
    if (isMiddleDoubleClick(ev.timeStamp)) {
      ev.preventDefault();
      resetView();
    }
  };
  window.addEventListener('pointerdown', handlePointerDown);
  globalMiddleResetBound = true;
}

const TABLET_DOUBLE_TAP_DISTANCE = 28;
const TABLET_LONG_PRESS_MS = 420;
const TABLET_MOVE_TOLERANCE = 8;
const tabletGestureState = {
  pointers: new Map(),
  pinchActive: false,
  startDistance: 0,
  startZoomValue: 0,
  startBaseScale: 1,
  lastTapTime: 0,
  lastTapPos: null
};
const selectionPointerState = { mode: 'idle', pointerId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, offsetX: 0, offsetY: 0 };
const selectionDoubleClickTime = { left: 0, right: 0 };
function getCanvasCoordinates(ev) {
  if (!elements.canvas) return null;
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width, scaleY = elements.canvas.height / rect.height;
  const localX = (ev.clientX - rect.left) * scaleX - state.axisPadding.left;
  const localY = (ev.clientY - rect.top) * scaleY - state.axisPadding.top;
  const cellX = Math.floor(localX / state.cellSize);
  const cellY = Math.floor(localY / state.cellSize);
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY) || cellX < 0 || cellY < 0 || cellX >= state.width || cellY >= state.height) {
    return null;
  } return { cellX, cellY };
}
function updateSelectionPreview() {
  let preview = null;
  if (selectionPointerState.mode === 'add' || selectionPointerState.mode === 'subtract') {
    const { startX, startY, currentX, currentY } = selectionPointerState;
    preview = { type: selectionPointerState.mode, rect: { x1: startX, y1: startY, x2: currentX, y2: currentY } };
  }
  else if (selectionPointerState.mode === 'move') {
    preview = { type: 'move', offsetX: selectionPointerState.offsetX, offsetY: selectionPointerState.offsetY };
  } state.selection.preview = preview;
  renderSelectionLayers();
}
function refreshSelectionOverlay() {
  renderSelectionLayers();
}
function resetSelectionPointerState() {
  selectionPointerState.mode = 'idle';
  selectionPointerState.pointerId = null;
  selectionPointerState.offsetX = 0;
  selectionPointerState.offsetY = 0;
  selectionPointerState.startX = 0;
  selectionPointerState.startY = 0;
  selectionPointerState.currentX = 0;
  selectionPointerState.currentY = 0;
  state.selection.preview = null;
  renderSelectionLayers();
}
function resolveMaxCellSize() {
  if (!state.width || !state.height) return SIZE_LIMITS.maxCell;
  const area = state.width * state.height;
  if (area >= LARGE_CANVAS_AREA) {
    const base = state.defaultCellSize || SIZE_LIMITS.minCell;
    const scaled = Math.round(base * LARGE_CANVAS_ZOOM_FACTOR);
    return Math.max(SIZE_LIMITS.minCell, Math.min(SIZE_LIMITS.maxCell, scaled));
  }
  return SIZE_LIMITS.maxCell;
}

function computeCanvasDimensionCap() {
  if (!state.width || !state.height) return SIZE_LIMITS.maxCell;
  const widthLimit = Math.max(1, Math.floor(MAX_SAFE_CANVAS_DIMENSION / Math.max(state.width, 1)));
  const heightLimit = Math.max(1, Math.floor(MAX_SAFE_CANVAS_DIMENSION / Math.max(state.height, 1)));
  const dimensionLimit = Math.max(SIZE_LIMITS.minCell, Math.min(widthLimit, heightLimit));
  return Math.min(SIZE_LIMITS.maxCell, dimensionLimit);
}

function computeZoomTargets(requestedSize, maxCellSize) {
  const safeCap = Math.min(maxCellSize, computeCanvasDimensionCap());
  const safeCellSize = Math.max(SIZE_LIMITS.minCell, Math.min(safeCap, requestedSize));
  const cssScale = safeCellSize > 0 ? requestedSize / safeCellSize : 1;
  return { safeCellSize, cssScale };
}
function syncZoomRangeBounds(maxCellSize) {
  if (!elements.zoomRange) return;
  elements.zoomRange.min = String(SIZE_LIMITS.minCell);
  elements.zoomRange.max = String(maxCellSize);
}
function applyDynamicZoomLimit() {
  const maxCellSize = resolveMaxCellSize();
  syncZoomRangeBounds(maxCellSize);
  if (state.zoomValue > maxCellSize) {
    state.zoomValue = maxCellSize;
    if (elements.zoomRange) {
      elements.zoomRange.value = String(maxCellSize);
    }
    const { safeCellSize, cssScale } = computeZoomTargets(maxCellSize, maxCellSize);
    state.cellSize = safeCellSize;
    state.zoomScale = cssScale;
    updateZoomIndicator(maxCellSize);
  }
  return maxCellSize;
}
function isSelectionDoubleClick(button, timeStamp) {
  const last = selectionDoubleClickTime[button] || 0;
  if (timeStamp - last > 0 && timeStamp - last <= DOUBLE_CLICK_MS) {
    selectionDoubleClickTime[button] = 0;
    return true;
  } selectionDoubleClickTime[button] = timeStamp;
  return false;
}
export function prepareCanvasInteractions() {
  let pointerState = null;
  if (!elements.canvas) return;
  ensureGlobalMiddleResetHandler();
  ensureSpacePanBinding();
  const trySetPointerCapture = (pointerId) => {
    try {
      elements.canvas?.setPointerCapture?.(pointerId);
    } catch (_) { }
  };
  const isTabletTouchPointer = (ev) => state.isTabletMode && ev.pointerType === 'touch';
  const isTabletDirectPointer = (ev) => state.isTabletMode && (ev.pointerType === 'touch' || ev.pointerType === 'pen');
  const recordTabletPointer = (ev) => {
    if (!isTabletTouchPointer(ev)) return;
    tabletGestureState.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  };
  const clearTabletPointer = (ev) => {
    if (!isTabletTouchPointer(ev)) return;
    tabletGestureState.pointers.delete(ev.pointerId);
    if (tabletGestureState.pinchActive && tabletGestureState.pointers.size < 2) {
      tabletGestureState.pinchActive = false;
      tabletGestureState.startDistance = 0;
    }
  };
  const computePinchDistance = () => {
    const points = Array.from(tabletGestureState.pointers.values());
    if (points.length < 2) return 0;
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const computePinchCenter = () => {
    const points = Array.from(tabletGestureState.pointers.values());
    if (points.length < 2) return null;
    const [a, b] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const resetTabletTapState = () => {
    tabletGestureState.lastTapTime = 0;
    tabletGestureState.lastTapPos = null;
  };
  const startTabletPinch = () => {
    tabletGestureState.pinchActive = true;
    tabletGestureState.startDistance = computePinchDistance();
    tabletGestureState.startZoomValue = state.zoomValue;
    tabletGestureState.startBaseScale = state.baseScale;
    resetSelectionPointerState();
    if (pointerState?.type === 'pending' && pointerState.timer) {
      clearTimeout(pointerState.timer);
    }
    if (pointerState?.type === 'pan') elements.canvas.classList.remove('is-panning');
    if (pointerState?.type === 'baseMove') elements.canvas.classList.remove('is-base-dragging');
    pointerState = null;
    resetTabletTapState();
  };
  const applyTabletPinchZoom = () => {
    if (!tabletGestureState.pinchActive) return;
    const distance = computePinchDistance();
    if (!distance || !tabletGestureState.startDistance) return;
    const factor = distance / tabletGestureState.startDistance;
    if (state.baseEditing && state.baseImage) {
      const center = computePinchCenter();
      if (!center || !elements.canvas) return;
      const rect = elements.canvas.getBoundingClientRect();
      const scaleX = elements.canvas.width / rect.width, scaleY = elements.canvas.height / rect.height;
      const canvasX = (center.x - rect.left) * scaleX - state.axisPadding.left;
      const canvasY = (center.y - rect.top) * scaleY - state.axisPadding.top;
      const pointerCellX = canvasX / state.cellSize;
      const pointerCellY = canvasY / state.cellSize;
      applyBaseScale(tabletGestureState.startBaseScale * factor, pointerCellX, pointerCellY);
      return;
    }
    const nextSize = clampCellSize(tabletGestureState.startZoomValue * factor);
    if (nextSize !== state.zoomValue) setCellSize(nextSize);
  };
  const handleTabletDoubleTap = (ev) => {
    if (!isTabletTouchPointer(ev) || tabletGestureState.pinchActive) return false;
    if (state.currentTool === 'selection' && !state.moveModeEnabled) return false;
    const now = ev.timeStamp;
    const lastTime = tabletGestureState.lastTapTime || 0;
    const lastPos = tabletGestureState.lastTapPos;
    const distance = lastPos ? Math.hypot(ev.clientX - lastPos.x, ev.clientY - lastPos.y) : Infinity;
    if (lastPos && now - lastTime > 0 && now - lastTime <= DOUBLE_CLICK_MS && distance <= TABLET_DOUBLE_TAP_DISTANCE) {
      resetView();
      resetTabletTapState();
      tabletGestureState.pointers.clear();
      return true;
    }
    tabletGestureState.lastTapTime = now;
    tabletGestureState.lastTapPos = { x: ev.clientX, y: ev.clientY };
    return false;
  };
  elements.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  elements.canvas.addEventListener('pointerdown', (ev) => {
    if (!state.width || !state.height) return;
    if (isTabletTouchPointer(ev)) {
      if (handleTabletDoubleTap(ev)) return;
      recordTabletPointer(ev);
      // 触控捏合时确保能收到 pointerup/cancel 来正确清理状态。
      trySetPointerCapture(ev.pointerId);
      if (tabletGestureState.pointers.size >= 2) {
        startTabletPinch();
        return;
      }
    }
    const isTabletDirect = isTabletDirectPointer(ev);
    if (state.moveModeEnabled && state.isTabletMode && isTabletDirect) {
      pointerState = {
        type: 'pending',
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        button: ev.button,
        timer: setTimeout(() => {
          if (!pointerState || pointerState.pointerId !== ev.pointerId || pointerState.type !== 'pending') return;
          const baseMove = state.baseEditing && state.baseImage;
          pointerState = {
            type: baseMove ? 'baseMove' : 'pan',
            pointerId: ev.pointerId,
            startX: ev.clientX,
            startY: ev.clientY,
            originOffsetX: state.baseOffsetX,
            originOffsetY: state.baseOffsetY,
            originPanX: state.panX,
            originPanY: state.panY
          };
          if (baseMove) elements.canvas.classList.add('is-base-dragging');
          else elements.canvas.classList.add('is-panning');
        }, TABLET_LONG_PRESS_MS)
      };
      trySetPointerCapture(ev.pointerId);
      return;
    }
    if (!state.baseEditing && state.currentTool === 'selection' && handleSelectionPointerDown(ev)) return;
    if (ev.button === 1 && ev.pointerType === 'mouse') {
      if (isMiddleDoubleClick(ev.timeStamp)) {
        resetView();
        return;
      }
    }
    const isSpacePan = ev.button === 0 && spacePanModifierActive;
    if (state.baseEditing && state.baseImage && ev.button === 0) {
      ev.preventDefault();
      pointerState = { type: 'baseMove', pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, originOffsetX: state.baseOffsetX, originOffsetY: state.baseOffsetY };
      trySetPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-base-dragging');
      return;
    }
    if (ev.button === 1 || isSpacePan) {
      ev.preventDefault();
      pointerState = { type: 'pan', pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, originPanX: state.panX, originPanY: state.panY };
      trySetPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-panning');
      return;
    }
    if (state.baseEditing || state.currentTool === 'selection') return;
    if (ev.button !== 0 && ev.button !== 2) return;
    ev.preventDefault();
    pointerState = { type: 'paint', pointerId: ev.pointerId, button: ev.button };
    trySetPointerCapture(ev.pointerId);
    paintAtPointer(ev, ev.button);
  });
  elements.canvas.addEventListener('pointermove', (ev) => {
    const isTabletTouch = isTabletTouchPointer(ev);
    if (isTabletTouch) {
      recordTabletPointer(ev);
      if (tabletGestureState.pinchActive) {
        applyTabletPinchZoom();
        return;
      }
    }
    if (selectionPointerState.mode !== 'idle' && selectionPointerState.pointerId === ev.pointerId) {
      const coords = getCanvasCoordinates(ev);
      if (coords) {
        selectionPointerState.currentX = coords.cellX;
        selectionPointerState.currentY = coords.cellY;
        if (selectionPointerState.mode === 'move') {
          selectionPointerState.offsetX = coords.cellX - selectionPointerState.startX;
          selectionPointerState.offsetY = coords.cellY - selectionPointerState.startY;
        } updateSelectionPreview();
      } return;
    } if (!pointerState || pointerState.pointerId !== ev.pointerId) return;
    if (pointerState.type === 'pan') {
      const dx = ev.clientX - pointerState.startX, dy = ev.clientY - pointerState.startY;
      state.panX = pointerState.originPanX + dx;
      state.panY = pointerState.originPanY + dy;
      updateStageTransform();
      return;
    } if (pointerState.type === 'baseMove') {
      const rect = elements.canvas.getBoundingClientRect();
      const scaleX = elements.canvas.width / rect.width, scaleY = elements.canvas.height / rect.height;
      const dxCells = ((ev.clientX - pointerState.startX) * scaleX) / state.cellSize;
      const dyCells = ((ev.clientY - pointerState.startY) * scaleY) / state.cellSize;
      state.baseOffsetX = pointerState.originOffsetX + dxCells;
      state.baseOffsetY = pointerState.originOffsetY + dyCells;
      updateBaseImageDisplay();
      return;
    } if (pointerState.type === 'pending') {
      const dx = ev.clientX - pointerState.startX;
      const dy = ev.clientY - pointerState.startY;
      const distance = Math.hypot(dx, dy);
      if (distance > TABLET_MOVE_TOLERANCE) {
        clearTimeout(pointerState.timer);
        const baseMove = state.baseEditing && state.baseImage;
        pointerState = {
          type: baseMove ? 'baseMove' : 'pan',
          pointerId: pointerState.pointerId,
          startX: pointerState.startX,
          startY: pointerState.startY,
          originOffsetX: state.baseOffsetX,
          originOffsetY: state.baseOffsetY,
          originPanX: state.panX,
          originPanY: state.panY
        };
        if (baseMove) {
          elements.canvas.classList.add('is-base-dragging');
        } else {
          elements.canvas.classList.add('is-panning');
        }
      }
    } else if (pointerState.type === 'paint') {
      paintAtPointer(ev, pointerState.button);
    }
  });
  const releasePointer = (ev) => {
    const isTabletTouch = isTabletTouchPointer(ev);
    if (isTabletTouch) {
      clearTabletPointer(ev);
      try {
        elements.canvas.releasePointerCapture(ev.pointerId);
      } catch (error) { }
      if (tabletGestureState.pinchActive) return;
    }
    if (handleSelectionPointerRelease(ev)) return;
    if (!pointerState || pointerState.pointerId !== ev.pointerId) return;
    if (pointerState.type === 'pan') elements.canvas.classList.remove('is-panning');
    if (pointerState.type === 'baseMove') elements.canvas.classList.remove('is-base-dragging');
    if (pointerState.type === 'pending') {
      clearTimeout(pointerState.timer);
    }
    pointerState = null;
    try {
      elements.canvas.releasePointerCapture(ev.pointerId);
    } catch (error) { }
  };
  elements.canvas.addEventListener('pointerup', releasePointer);
  elements.canvas.addEventListener('pointercancel', releasePointer);
}
function handleSelectionPointerDown(ev) {
  if (state.isTabletMode && state.moveModeEnabled) return false;
  const coords = getCanvasCoordinates(ev);
  const isTabletSelection = state.isTabletMode && (ev.pointerType === 'touch' || ev.pointerType === 'pen');
  if (isTabletSelection) {
    if (!coords) return true;
    if (state.selectionToolMode === 'add') {
      if (isSelectionDoubleClick('left', ev.timeStamp)) {
        state.selection.preview = null;
        invertSelection();
        saveHistory();
        return true;
      }
       ev.preventDefault();
       selectionPointerState.mode = 'add';
       selectionPointerState.pointerId = ev.pointerId;
       selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
       selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
       try {
         elements.canvas?.setPointerCapture?.(ev.pointerId);
       } catch (_) { }
       updateSelectionPreview();
       return true;
     }
     if (state.selectionToolMode === 'delete') {
      if (isSelectionDoubleClick('right', ev.timeStamp)) {
        state.selection.preview = null;
        clearSelection();
        saveHistory();
        return true;
      }
       ev.preventDefault();
       selectionPointerState.mode = 'subtract';
       selectionPointerState.pointerId = ev.pointerId;
       selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
       selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
       try {
         elements.canvas?.setPointerCapture?.(ev.pointerId);
       } catch (_) { }
       updateSelectionPreview();
       return true;
     }
     if (state.selectionToolMode === 'move' && state.selection.active) {
      ev.preventDefault();
      selectionPointerState.mode = 'move';
       selectionPointerState.pointerId = ev.pointerId;
       selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
       selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
       selectionPointerState.offsetX = 0;
       selectionPointerState.offsetY = 0;
       try {
         elements.canvas?.setPointerCapture?.(ev.pointerId);
       } catch (_) { }
       updateSelectionPreview();
       return true;
     }
   }
   if (ev.button === 0) {
    if (isSelectionDoubleClick('left', ev.timeStamp)) {
      state.selection.preview = null;
      invertSelection();
      saveHistory();
      return true;
    } if (!coords) return true;
     ev.preventDefault();
     selectionPointerState.mode = 'add';
     selectionPointerState.pointerId = ev.pointerId;
     selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
     selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
     try {
       elements.canvas?.setPointerCapture?.(ev.pointerId);
     } catch (_) { }
     updateSelectionPreview();
     return true;
   } if (ev.button === 2) {
     ev.preventDefault();
    if (isSelectionDoubleClick('right', ev.timeStamp)) {
      state.selection.preview = null;
      clearSelection();
      saveHistory();
      return true;
    } if (!coords) return true;
     selectionPointerState.mode = 'subtract';
     selectionPointerState.pointerId = ev.pointerId;
     selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
     selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
     try {
       elements.canvas?.setPointerCapture?.(ev.pointerId);
     } catch (_) { }
     updateSelectionPreview();
     return true;
   } if (ev.button === 1 && state.selection.active) {
     if (!coords) return true;
     ev.preventDefault();
    selectionPointerState.mode = 'move';
     selectionPointerState.pointerId = ev.pointerId;
     selectionPointerState.startX = selectionPointerState.currentX = coords.cellX;
     selectionPointerState.startY = selectionPointerState.currentY = coords.cellY;
     selectionPointerState.offsetX = 0;
     selectionPointerState.offsetY = 0;
     try {
       elements.canvas?.setPointerCapture?.(ev.pointerId);
     } catch (_) { }
     updateSelectionPreview();
     return true;
   } return false;
 }
function handleSelectionPointerRelease(ev) {
  if (selectionPointerState.mode === 'idle' || selectionPointerState.pointerId !== ev.pointerId) return false;
  if (selectionPointerState.mode === 'add') {
    const { startX, startY, currentX, currentY } = selectionPointerState;
    addSelectionRect(startX, startY, currentX, currentY);
    saveHistory();
  }
  else if (selectionPointerState.mode === 'subtract') {
    const { startX, startY, currentX, currentY } = selectionPointerState;
    subtractSelectionRect(startX, startY, currentX, currentY);
    saveHistory();
  }
  else if (selectionPointerState.mode === 'move') {
    const { offsetX, offsetY } = selectionPointerState;
    if (offsetX || offsetY) commitSelectionMove(offsetX, offsetY);
  } try {
    elements.canvas.releasePointerCapture(ev.pointerId);
  } catch (_) { } resetSelectionPointerState();
  return true;
}
function commitSelectionMove(offsetX, offsetY) {
  if (!state.selection?.mask) return;
  const mask = state.selection.mask;
  const movedCells = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!mask[y]?.[x]) continue;
      movedCells.push({ x, y, cell: state.grid[y][x] });
      state.grid[y][x] = null;
    }
  } movedCells.forEach(({ x, y, cell }) => {
    if (!cell) return;
    const targetX = x + offsetX;
    const targetY = y + offsetY;
    if (targetX < 0 || targetX >= state.width || targetY < 0 || targetY >= state.height) return;
    state.grid[targetY][targetX] = cell;
  });
  shiftSelectionMask(offsetX, offsetY);
  redrawCanvas();
  refreshSelectionOverlay();
  saveHistory();
}
export function handleWheelEvent(ev) {
  if (!state.width || !state.height) return;
  if (state.isTabletMode) {
    ev.preventDefault();
    return;
  }
  ev.preventDefault();
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width, scaleY = elements.canvas.height / rect.height;
  const canvasX = (ev.clientX - rect.left) * scaleX - state.axisPadding.left;
  const canvasY = (ev.clientY - rect.top) * scaleY - state.axisPadding.top;
  const pointerCellX = canvasX / state.cellSize, pointerCellY = canvasY / state.cellSize;
  if (state.baseEditing && state.baseImage) {
    const sensitivity = ev.ctrlKey ? 800 : 500;
    const factor = Math.exp(-ev.deltaY / sensitivity);
    applyBaseScale(state.baseScale * factor, pointerCellX, pointerCellY);
    return;
  } const factor = ev.deltaY < 0 ? 1.1 : 0.9;
  const newSize = clampCellSize(state.zoomValue * factor);
  if (newSize === state.zoomValue) return;
  setCellSize(newSize);
}
function paintAtPointer(ev, button) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width, scaleY = elements.canvas.height / rect.height;
  const localX = (ev.clientX - rect.left) * scaleX - state.axisPadding.left;
  const localY = (ev.clientY - rect.top) * scaleY - state.axisPadding.top;
  const x = Math.floor(localX / state.cellSize), y = Math.floor(localY / state.cellSize);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) return;
  if (!isCellEditable(x, y)) return;
  const effectiveButton = state.isTabletMode && state.tabletEraserActive && (state.currentTool === 'pencil' || state.currentTool === 'bucket')
    ? 2
    : button;
  if (state.currentTool === 'eyedropper' && effectiveButton === 0) {
    const cell = state.grid[y][x];
    if (cell?.code) {
      state.selectedColorKey = cell.code;
      updatePaletteSelection();
      updateCurrentColorInfo();
      setTool(state.previousTool && state.previousTool !== 'eyedropper' ? state.previousTool : 'pencil');
      return;
    }
  }
  if (state.currentTool === 'bucket') {
    if (!isCellEditable(x, y)) return;
    if (effectiveButton === 0) {
      const colorEntry = resolvePaintColor(x, y);
      colorEntry && bucketFill(x, y, colorEntry);
      return;
    }
    if (effectiveButton === 2) {
      bucketFill(x, y, null);
      return;
    }
  }
  const targets = computeSymmetryTargets(x, y);
  if (!targets.length) return;
  if (effectiveButton === 2) {
    let cleared = false;
    targets.forEach(({ x: tx, y: ty }) => {
      if (!isCellEditable(tx, ty)) return;
      if (state.grid[ty][tx]) {
        state.grid[ty][tx] = null;
        cleared = true;
      }
    });
    if (cleared) {
      redrawCanvas();
      refreshSelectionOverlay();
      saveHistory();
    }
    return;
  }
  if (effectiveButton !== 0) return;
  const colorEntry = resolvePaintColor(x, y);
  if (!colorEntry) return;
  let painted = false;
  targets.forEach(({ x: tx, y: ty }) => {
    if (!isCellEditable(tx, ty)) return;
    const cell = state.grid[ty][tx];
    if (!cell || cell.code !== colorEntry.code) {
      state.grid[ty][tx] = colorEntry;
      painted = true;
    }
  });
  if (painted) {
    redrawCanvas();
    refreshSelectionOverlay();
    saveHistory();
  }
  function isCellEditable(cellX, cellY) {
    return !state.selection.active || isCellSelected(cellX, cellY);
  }
}
function bucketFill(x, y, newCell) {
  if (state.selection.active && !isCellSelected(x, y)) return;
  const targetCell = state.grid[y][x];
  if (cellsEqual(targetCell, newCell)) return;
  const enforceSelection = state.selection.active;
  const queue = [[x, y]];
  const visited = new Set([`${x},${y}`]);
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) continue;
    if (enforceSelection && !isCellSelected(cx, cy)) continue;
    if (!cellsEqual(state.grid[cy][cx], targetCell)) continue;
    state.grid[cy][cx] = newCell;
    const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    neighbors.forEach(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return;
      if (enforceSelection && !isCellSelected(nx, ny)) return;
      const key = `${nx},${ny}`;
      if (visited.has(key)) return;
      if (!cellsEqual(state.grid[ny][nx], targetCell)) return;
      visited.add(key);
      queue.push([nx, ny]);
    });
  } redrawCanvas();
  refreshSelectionOverlay();
  saveHistory();
}
function resolvePaintColor(x, y) {
  if (state.autoSnap && state.baseImageData) {
    const snap = getNearestColorFromBase(x, y);
    if (snap && isColorEnabled(snap.code)) return snap;
  } if (state.selectedColorKey && state.palette[state.selectedColorKey] && isColorEnabled(state.selectedColorKey)) {
    return state.palette[state.selectedColorKey];
  } const firstEnabled = state.paletteKeys.find(code => isColorEnabled(code));
  if (firstEnabled && state.palette[firstEnabled]) {
    return state.palette[firstEnabled];
  } return null;
}

function resolveCellFill(cell) {
  const color = resolveCellColor(cell);
  if (!color) return null;
  const finalAlpha = clampAlpha(color.alpha);
  if (finalAlpha >= 1) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${finalAlpha})`;
}

function resolveCellColor(cell) {
  if (!cell?.rgb) return null;
  const animation = getDisplayModeAnimationState();
  if (animation) {
    const fromColor = resolveCellColorForMode(cell, animation.fromMode);
    const toColor = resolveCellColorForMode(cell, animation.toMode);
    return interpolateCellColor(fromColor, toColor, animation.progress);
  }
  return resolveCellColorForMode(cell, state.displayMode ?? 'standard');
}

function resolveCellColorForMode(cell, mode) {
  const type = cell.type ?? 'normal';
  const baseAlpha = Number.isFinite(cell.alpha) ? cell.alpha : 1;
  let r = cell.rgb?.r ?? 0;
  let g = cell.rgb?.g ?? 0;
  let b = cell.rgb?.b ?? 0;
  let alpha = baseAlpha;
  if (TRANSITIONAL_COLOR_TYPES.has(type) && cell.transition) {
    const stage = getSpecialColorStage(type, mode);
    const source = stage === 'activated' ? cell.transition.to : cell.transition.from;
    if (source?.rgb) {
      ({ r, g, b } = source.rgb);
      alpha = Number.isFinite(source.alpha) ? source.alpha : alpha;
    }
  }
  if (mode === 'night' && type !== 'glow') {
    ({ r, g, b } = applyNightTone(r, g, b));
  }
  return { r, g, b, alpha };
}

function getSpecialColorStage(type, mode) {
  if (type === 'light') {
    return mode === 'light' || mode === 'special' ? 'activated' : 'base';
  }
  if (type === 'temperatrue') {
    return mode === 'temperature' || mode === 'special' ? 'activated' : 'base';
  }
  return 'base';
}

function interpolateCellColor(fromColor, toColor, progress) {
  const start = fromColor || toColor;
  const end = toColor || fromColor;
  if (!start || !end) return start || end;
  const t = Math.min(1, Math.max(0, progress ?? 0));
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  const alpha = start.alpha + (end.alpha - start.alpha) * t;
  return { r, g, b, alpha };
}

function getDisplayModeAnimationState() {
  if (!displayModeAnimation) return null;
  if (!shouldAnimateDisplayMode(displayModeAnimation.fromMode, displayModeAnimation.toMode)) {
    return null;
  }
  return displayModeAnimation;
}

function shouldAnimateDisplayMode(fromMode, toMode) {
  if (fromMode === toMode) return false;
  return COLOR_TRANSITION_MODES.has(fromMode) || COLOR_TRANSITION_MODES.has(toMode);
}

function startDisplayModeAnimation(fromMode, toMode) {
  cancelDisplayModeAnimation();
  if (typeof window === 'undefined') {
    redrawCanvas();
    return;
  }
  const startTime = window.performance?.now?.() ?? Date.now();
  const step = (timestamp) => {
    if (!displayModeAnimation) return;
    const elapsed = timestamp - displayModeAnimation.startTime;
    const progress = Math.min(1, DISPLAY_MODE_ANIMATION_MS > 0 ? elapsed / DISPLAY_MODE_ANIMATION_MS : 1);
    displayModeAnimation.progress = progress;
    redrawCanvas();
    if (progress < 1) {
      displayModeAnimation.raf = window.requestAnimationFrame(step);
    } else {
      cancelDisplayModeAnimation();
      redrawCanvas();
    }
  };
  displayModeAnimation = { fromMode, toMode, startTime, progress: 0, raf: window.requestAnimationFrame(step) };
}

function cancelDisplayModeAnimation() {
  if (displayModeAnimation?.raf && typeof window !== 'undefined') {
    window.cancelAnimationFrame(displayModeAnimation.raf);
  }
  displayModeAnimation = null;
}

function drawCell(ctx, cell, px, py, cellSize, fillColor) {
  if (state.pixelShape === 'circle') {
    const lineWidth = Math.max(1, cellSize * 0.25);
    const radius = Math.max(1, (cellSize - lineWidth) / 2);
    ctx.strokeStyle = fillColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (cell.type === 'pearlescent') {
      applyPearlescentGloss(ctx, px, py, cellSize, true);
    }
  } else {
    ctx.fillStyle = fillColor;
    ctx.fillRect(px, py, cellSize, cellSize);
    if (cell.type === 'pearlescent') {
      applyPearlescentGloss(ctx, px, py, cellSize, false);
    }
  }
  if (state.showCodes) {
    ctx.fillStyle = resolveCellLabelColor(cell);
    ctx.fillText(cell.code, px + cellSize / 2, py + cellSize / 2);
  }
}

function resolveCellLabelColor(cell) {
  if (state.pixelShape === 'circle') {
    return state.displayMode === 'night' ? '#ffffff' : '#1f1f1f';
  }
  return pickTextColor(cell?.rgb ?? { r: 0, g: 0, b: 0 });
}

function applyNightTone(r, g, b) {
  const factor = 0.4;
  return {
    r: Math.floor(r * factor),
    g: Math.floor(g * factor),
    b: Math.floor(b * factor)
  };
}

function applyPearlescentGloss(ctx, px, py, size, isCircle) {
  if (isCircle) {
    const gradient = ctx.createLinearGradient(px, py, px + size, py + size);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.lineWidth = Math.max(1, size * 0.18);
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.arc(px + size / 2, py + size / 2, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  const gradient = ctx.createLinearGradient(px, py, px + size, py + size);
  gradient.addColorStop(0, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(px, py, size, size);
  ctx.restore();
}
export function updateCanvasOpacityLabel() {
  const alpha = clampAlpha(state.backgroundOpacity);
  const percent = Math.round(alpha * 100);
  if (elements.canvasOpacityValue) {
    elements.canvasOpacityValue.textContent = `${percent}%`;
  }
}

function updateStatusSize() {
  if (!elements.statusSize) return;
  elements.statusSize.textContent = state.width && state.height ? `${state.width} × ${state.height}` : TEXT.status.canvasNotCreated;
}

export function updateStatusCreated() {
  if (!elements.statusCreated) return;
  const date = state.createdAt instanceof Date
    ? state.createdAt
    : (state.createdAt ? new Date(state.createdAt) : null);
  if (!date || Number.isNaN(date.getTime())) {
    elements.statusCreated.textContent = TEXT.status.canvasNotCreated;
    return;
  }
  try {
    elements.statusCreated.textContent = CREATED_AT_FORMATTER
      ? CREATED_AT_FORMATTER.format(date)
      : date.toLocaleString();
  } catch (error) {
    elements.statusCreated.textContent = date.toLocaleString();
  }
}

export function updateZoomIndicator(customSize = state.zoomValue) {
  if (!elements.zoomValue) return;
  const size = Number.isFinite(customSize) && customSize > 0 ? customSize : state.zoomValue;
  const base = state.defaultCellSize || size || 1;
  const percent = Math.round((size / base) * 100);
  elements.zoomValue.textContent = `${percent}%`;
}
export function setDisplayMode(mode) {
  const nextMode = typeof mode === 'string' && mode ? mode : 'standard';
  const previousMode = state.displayMode ?? 'standard';
  if (previousMode === nextMode) return;
  state.displayMode = nextMode;
  updateDisplayModeToast(nextMode);
  if (shouldAnimateDisplayMode(previousMode, nextMode)) {
    startDisplayModeAnimation(previousMode, nextMode);
  } else {
    cancelDisplayModeAnimation();
    redrawCanvas();
  }
}

function updateDisplayModeToast(mode = state.displayMode ?? 'standard') {
  const toast = elements.displayModeToast;
  if (!toast) return;
  const normalized = typeof mode === 'string' && mode ? mode : 'standard';
  const label = DISPLAY_MODE_HINTS[normalized] || '画布光效：标准/白昼';
  const shouldShow = Boolean(label !== '画布光效：标准/白昼');
  if (shouldShow) {
    toast.textContent = label;
    toast.dataset.mode = normalized;
  } else {
    toast.textContent = '画布光效：标准/白昼';
    toast.removeAttribute('data-mode');
  }
  toast.classList.toggle('is-visible', shouldShow);
  toast.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
}

export function setTool(tool) {
  if (state.currentTool === tool) return;
  if (state.currentTool !== 'eyedropper') state.previousTool = state.currentTool;
  state.currentTool = tool;
  updateToolButtons();
  updateCanvasCursorState();
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('tool:change', { detail: { tool } }));
  }
}
export function updateToolButtons() {
  if (!elements.toolButtons?.length) return;
  elements.toolButtons.forEach((button) => {
    const tool = button.dataset.tool;
    if (!tool) return;
    const isCurrent = state.currentTool === tool;
    button.classList.toggle('tool-button--selected', isCurrent);
    button.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
  });
}
export function isCanvasDirty() {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.grid[y]?.[x]) return true;
    }
  } return false;
}
export function clearDrawingGrid() {
  if (!state.grid || !state.grid.length) return;
  for (let y = 0; y < state.height; y++) {
    state.grid[y]?.fill(null);
  } redrawCanvas();
}

function ensureSpacePanBinding() {
  if (spacePanBindingInitialized) return;
  spacePanBindingInitialized = true;
  document.addEventListener('keydown', handleSpacePanKeyDown, true);
  document.addEventListener('keyup', handleSpacePanKeyUp, true);
  window.addEventListener('blur', resetSpacePanModifier);
}

function handleSpacePanKeyDown(event) {
  if (event.code !== 'Space' && event.key !== ' ') return;
  if (shouldIgnoreSpacePanTarget(event.target)) return;
  if (!spacePanModifierActive) {
    event.preventDefault();
    setSpacePanModifier(true);
  } else {
    event.preventDefault();
  }
}

function handleSpacePanKeyUp(event) {
  if (event.code !== 'Space' && event.key !== ' ') return;
  setSpacePanModifier(false);
}

function resetSpacePanModifier() {
  setSpacePanModifier(false);
}

function setSpacePanModifier(state) {
  spacePanModifierActive = Boolean(state);
  if (!elements.canvas) return;
  elements.canvas.classList.toggle('pan-modifier', spacePanModifierActive);
}

function shouldIgnoreSpacePanTarget(target) {
  if (!target) return false;
  const tagName = target.tagName || '';
  if (/^(input|textarea|select)$/i.test(tagName)) return true;
  return Boolean(target.isContentEditable);
}

if (typeof window !== 'undefined') {
  updateDisplayModeToast();
}
