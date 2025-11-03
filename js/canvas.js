import { AXIS_STYLE, DOUBLE_CLICK_MS } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { cellsEqual, clampAlpha, clampCellSize, computeAxisPadding, pickTextColor } from './utils.js';
import { applyBaseScale, fitBaseImageToCanvas, getNearestColorFromBase, updateBaseImageDisplay, updateCanvasCursorState } from './base-image.js';
import { updatePaletteSelection, updateCurrentColorInfo, isColorEnabled } from './palette.js';
import { renderSelectionLayers } from './selection-layer.js';
import { resetSelection, isCellSelected, addSelectionRect, subtractSelectionRect, invertSelection, clearSelection, shiftSelectionMask, cloneSelectionState, restoreSelectionState } from './selection.js';
import { TEXT } from './language.js';
const MAX_HISTORY_SIZE = 50;
export function validateCanvasSize(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width <= 2048 && height <= 2048;
}
export function createCanvas(width, height, options = {}) {
  state.width = width;
  state.height = height;
  state.grid = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  state.panX = state.panY = 0;
  const explicitCellSize = Number.isFinite(options?.cellSize) ? options.cellSize : null;
  const rawRequestedSize = explicitCellSize ?? Number(elements.zoomRange?.value);
  const initialSize = clampCellSize(Number.isFinite(rawRequestedSize) && rawRequestedSize > 0 ? rawRequestedSize : state.defaultCellSize);
  state.cellSize = initialSize;
  state.defaultCellSize = initialSize;
  if (Number.isFinite(explicitCellSize)) {
    state.pixelRatio = initialSize;
  }
  else if (!Number.isFinite(state.pixelRatio) || state.pixelRatio <= 0) {
    state.pixelRatio = initialSize;
  }
  elements.zoomRange && (elements.zoomRange.value = String(initialSize));
  elements.resolutionInput && (elements.resolutionInput.value = String(state.pixelRatio));
  state.baseImage && fitBaseImageToCanvas();
  resizeCanvas();
  updateStageTransform();
  redrawCanvas();
  updateStatusSize();
  updateBaseImageDisplay();
  resetSelection({ suppressRender: true });
  resetSelectionPointerState();
  state.history = [];
  state.historyIndex = -1;
  saveHistory();
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
  const clamped = clampCellSize(size);
  if (clamped === state.cellSize) return;
  state.cellSize = clamped;
  elements.zoomRange && (elements.zoomRange.value = String(clamped));
  resizeCanvas();
}
export function resizeCanvas() {
  if (!state.width || !state.height) return;
  state.axisPadding = computeAxisPadding(state.cellSize, state.width, state.height);
  const contentWidth = state.width * state.cellSize, contentHeight = state.height * state.cellSize;
  const pixelWidth = contentWidth + state.axisPadding.left + state.axisPadding.right;
  const pixelHeight = contentHeight + state.axisPadding.top + state.axisPadding.bottom;
  const layeredCanvases = [elements.baseCanvas, elements.canvas, elements.selectionMaskCanvas, elements.selectionContentCanvas, elements.selectionOutlineCanvas].filter(Boolean);
  layeredCanvases.forEach((canvas) => {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${pixelWidth}px`;
    canvas.style.height = `${pixelHeight}px`;
  });
  elements.stage && (elements.stage.style.width = `${pixelWidth}px`, elements.stage.style.height = `${pixelHeight}px`);
  renderSelectionLayers();
  updateStageTransform();
  updateBaseImageDisplay();
  redrawCanvas();
}
export function updateStageTransform() {
  elements.stage && (elements.stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`);
}
function resetView() {
  state.cellSize = clampCellSize(state.defaultCellSize);
  elements.zoomRange && (elements.zoomRange.value = String(state.cellSize));
  state.panX = state.panY = 0;
  resizeCanvas();
}
export function redrawCanvas() {
  const { ctx, canvas } = elements;
  if (!ctx || !canvas) return;
  if (!state.width || !state.height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    typeof document !== 'undefined' && document.dispatchEvent(new CustomEvent('grid:updated'));
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bgAlpha = clampAlpha(state.backgroundOpacity);
  if (bgAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${bgAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } const padding = state.axisPadding;
  const originX = padding.left, originY = padding.top;
  const cellSize = state.cellSize;
  ctx.save();
  ctx.translate(originX, originY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, Math.floor(cellSize * 0.45))}px ${AXIS_STYLE.fontFamily}`;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      const px = x * cellSize, py = y * cellSize;
      if (cell) {
        ctx.fillStyle = cell.color;
        ctx.fillRect(px, py, cellSize, cellSize);
        if (state.showCodes) {
          ctx.fillStyle = pickTextColor(cell.rgb);
          ctx.fillText(cell.code, px + cellSize / 2, py + cellSize / 2);
        }
      }
    }
  } ctx.restore();
  ctx.save();
  ctx.translate(originX, originY);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= state.width; gx++) {
    const x = gx * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height * cellSize);
    ctx.stroke();
  }
  for (let gy = 0; gy <= state.height; gy++) {
    const y = gy * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width * cellSize, y);
    ctx.stroke();
  } ctx.restore();
  drawAxisLabels();
}
function drawAxisLabels() {
  if (!state.width || !state.height || !elements.ctx) return;
  const padding = state.axisPadding;
  const cellSize = state.cellSize;
  const originX = padding.left, originY = padding.top;
  renderAxisLabels(elements.ctx, { originX, originY, cellSize, widthCells: state.width, heightCells: state.height, textColor: 'rgba(0,0,0,0.65)', tickColor: 'rgba(0,0,0,0.3)' });
}
export function renderAxisLabels(ctx, options = {}) {
  const { originX = 0, originY = 0, cellSize = 10, widthCells = 0, heightCells = 0, textColor = 'rgba(0,0,0,0.65)', tickColor = 'rgba(0,0,0,0.3)', fontSize = Math.max(AXIS_STYLE.minFont, Math.floor(cellSize * 0.4)), tickLength = Math.max(AXIS_STYLE.minTick, Math.floor(fontSize * 0.6)), gap = Math.max(AXIS_STYLE.minGap, Math.floor(fontSize * 0.3)) } = options;
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
  } ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const leftX = originX - gap;
  for (let y = 0; y < heightCells; y++) {
    const centerY = originY + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(originX - 0.5, centerY);
    ctx.lineTo(originX - tickLength - 0.5, centerY);
    ctx.stroke();
    ctx.fillText(String(y + 1), leftX, centerY);
  } ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const bottomY = originY + heightCells * cellSize + gap + tickLength;
  for (let x = 0; x < widthCells; x++) {
    const centerX = originX + x * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, originY + heightCells * cellSize + 0.5);
    ctx.lineTo(centerX, originY + heightCells * cellSize + tickLength + 0.5);
    ctx.stroke();
    ctx.fillText(String(x + 1), centerX, bottomY);
  } ctx.textAlign = 'left';
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
  typeof document !== 'undefined' && document.dispatchEvent(new CustomEvent('grid:updated'));
}
function isMiddleDoubleClick(timeStamp) {
  const diff = timeStamp - state.lastMiddleClickTime;
  if (diff > 0 && diff <= DOUBLE_CLICK_MS) {
    state.lastMiddleClickTime = 0;
    return true;
  } state.lastMiddleClickTime = timeStamp;
  return false;
} const selectionPointerState = { mode: 'idle', pointerId: null, startX: 0, startY: 0, currentX: 0, currentY: 0, offsetX: 0, offsetY: 0 };
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
  elements.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  elements.canvas.addEventListener('pointerdown', (ev) => {
    if (!state.width || !state.height) return;
    if (!state.baseEditing && state.currentTool === 'selection' && handleSelectionPointerDown(ev)) return;
    if (ev.button === 1 && ev.pointerType === 'mouse') {
      if (isMiddleDoubleClick(ev.timeStamp)) {
        resetView();
        return;
      }
    } if (state.baseEditing && state.baseImage && ev.button === 0) {
      ev.preventDefault();
      pointerState = { type: 'baseMove', pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, originOffsetX: state.baseOffsetX, originOffsetY: state.baseOffsetY };
      elements.canvas.setPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-base-dragging');
      return;
    } if (ev.button === 1) {
      ev.preventDefault();
      pointerState = { type: 'pan', pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, originPanX: state.panX, originPanY: state.panY };
      elements.canvas.setPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-panning');
      return;
    } if (state.baseEditing || state.currentTool === 'selection') return;
    if (ev.button !== 0 && ev.button !== 2) return;
    pointerState = { type: 'paint', pointerId: ev.pointerId, button: ev.button };
    elements.canvas.setPointerCapture(ev.pointerId);
    paintAtPointer(ev, ev.button);
  });
  elements.canvas.addEventListener('pointermove', (ev) => {
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
    } if (pointerState.type === 'paint') paintAtPointer(ev, pointerState.button);
  });
  const releasePointer = (ev) => {
    if (handleSelectionPointerRelease(ev)) return;
    if (!pointerState || pointerState.pointerId !== ev.pointerId) return;
    if (pointerState.type === 'pan') elements.canvas.classList.remove('is-panning');
    if (pointerState.type === 'baseMove') elements.canvas.classList.remove('is-base-dragging');
    pointerState = null;
    try {
      elements.canvas.releasePointerCapture(ev.pointerId);
    } catch (error) { }
  };
  elements.canvas.addEventListener('pointerup', releasePointer);
  elements.canvas.addEventListener('pointercancel', releasePointer);
}
function handleSelectionPointerDown(ev) {
  const coords = getCanvasCoordinates(ev);
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
    elements.canvas.setPointerCapture(ev.pointerId);
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
    elements.canvas.setPointerCapture(ev.pointerId);
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
    elements.canvas.setPointerCapture(ev.pointerId);
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
  const newSize = clampCellSize(state.cellSize * factor);
  if (newSize === state.cellSize) return;
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
  if (state.currentTool === 'eyedropper' && button === 0) {
    const cell = state.grid[y][x];
    if (cell?.code) {
      state.selectedColorKey = cell.code;
      updatePaletteSelection();
      updateCurrentColorInfo();
      setTool(state.previousTool && state.previousTool !== 'eyedropper' ? state.previousTool : 'pencil');
      return;
    }
  } if (state.currentTool === 'bucket') {
    if (!isCellEditable(x, y)) return;
    if (button === 0) {
      const colorEntry = resolvePaintColor(x, y);
      colorEntry && bucketFill(x, y, colorEntry);
      return;
    } if (button === 2) {
      bucketFill(x, y, null);
      return;
    }
  } if (button === 2) {
    if (!isCellEditable(x, y)) return;
    if (state.grid[y][x]) {
      state.grid[y][x] = null;
      redrawCanvas();
      refreshSelectionOverlay();
      saveHistory();
    } return;
  } if (!isCellEditable(x, y)) return;
  const colorEntry = resolvePaintColor(x, y);
  if (!colorEntry) return;
  const cell = state.grid[y][x];
  if (!cell || cell.code !== colorEntry.code) {
    state.grid[y][x] = colorEntry;
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
export function updateCanvasOpacityLabel() {
  if (!elements.canvasOpacityValue) return;
  const percent = Math.round(clampAlpha(state.backgroundOpacity) * 100);
  elements.canvasOpacityValue.textContent = `${percent}%`;
}
function updateStatusSize() {
  if (!elements.statusSize) return;
  elements.statusSize.textContent = state.width && state.height ? `${state.width} × ${state.height}` : TEXT.status.canvasNotCreated;
}
export function setTool(tool) {
  if (state.currentTool === tool) return;
  if (state.currentTool !== 'eyedropper') state.previousTool = state.currentTool;
  state.currentTool = tool;
  updateToolButtons();
  updateCanvasCursorState();
}
export function updateToolButtons() {
  if (!elements.toolPencilBtn || !elements.toolBucketBtn || !elements.toolEyedropperBtn || !elements.toolSelectionBtn) return;
  const mapping = { pencil: elements.toolPencilBtn, bucket: elements.toolBucketBtn, eyedropper: elements.toolEyedropperBtn, selection: elements.toolSelectionBtn };
  Object.entries(mapping).forEach(([key, btn]) => {
    const active = state.currentTool === key;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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
