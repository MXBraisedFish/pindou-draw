import { AXIS_STYLE, DOUBLE_CLICK_MS } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import {
  cellsEqual,
  clampAlpha,
  clampCellSize,
  computeAxisPadding,
  pickTextColor
} from './utils.js';
import {
  applyBaseScale,
  fitBaseImageToCanvas,
  getNearestColorFromBase,
  updateBaseImageDisplay,
  updateCanvasCursorState
} from './base-image.js';

export function validateCanvasSize(width, height) {
  return (
    Number.isFinite(width)
    && Number.isFinite(height)
    && width >= 1
    && height >= 1
    && width <= 256
    && height <= 256
  );
}

export function createCanvas(width, height) {
  state.width = width;
  state.height = height;
  state.grid = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  state.panX = 0;
  state.panY = 0;
  const initialSize = clampCellSize(Number(elements.zoomRange?.value) || state.defaultCellSize);
  state.cellSize = initialSize;
  state.defaultCellSize = initialSize;
  if (elements.zoomRange) {
    elements.zoomRange.value = initialSize;
  }
  if (state.baseImage) {
    fitBaseImageToCanvas();
  }
  resizeCanvas();
  updateStageTransform();
  redrawCanvas();
  updateStatusSize();
  updateBaseImageDisplay();
}

export function setCellSize(size) {
  const clamped = clampCellSize(size);
  if (clamped === state.cellSize) return;
  state.cellSize = clamped;
  if (elements.zoomRange) {
    elements.zoomRange.value = clamped;
  }
  resizeCanvas();
}

function resizeCanvas() {
  if (!state.width || !state.height) return;
  state.axisPadding = computeAxisPadding(state.cellSize, state.width, state.height);
  const contentWidth = state.width * state.cellSize;
  const contentHeight = state.height * state.cellSize;
  const pixelWidth = contentWidth + state.axisPadding.left + state.axisPadding.right;
  const pixelHeight = contentHeight + state.axisPadding.top + state.axisPadding.bottom;
  if (elements.canvas) {
    elements.canvas.width = pixelWidth;
    elements.canvas.height = pixelHeight;
    elements.canvas.style.width = `${pixelWidth}px`;
    elements.canvas.style.height = `${pixelHeight}px`;
  }
  if (elements.baseCanvas) {
    elements.baseCanvas.width = pixelWidth;
    elements.baseCanvas.height = pixelHeight;
    elements.baseCanvas.style.width = `${pixelWidth}px`;
    elements.baseCanvas.style.height = `${pixelHeight}px`;
  }
  if (elements.stage) {
    elements.stage.style.width = `${pixelWidth}px`;
    elements.stage.style.height = `${pixelHeight}px`;
  }
  updateStageTransform();
  updateBaseImageDisplay();
  redrawCanvas();
}

function updateStageTransform() {
  if (!elements.stage) return;
  elements.stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
}

function resetView() {
  state.cellSize = clampCellSize(state.defaultCellSize);
  if (elements.zoomRange) {
    elements.zoomRange.value = state.cellSize;
  }
  state.panX = 0;
  state.panY = 0;
  resizeCanvas();
}

export function redrawCanvas() {
  const { ctx, canvas } = elements;
  if (!ctx || !canvas) return;
  if (!state.width || !state.height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      if (cell) {
        ctx.fillStyle = cell.color;
        ctx.fillRect(px, py, cellSize, cellSize);
        if (state.showCodes) {
          ctx.fillStyle = pickTextColor(cell.rgb);
          ctx.fillText(cell.code, px + cellSize / 2, py + cellSize / 2);
        }
      }
    }
  }
  ctx.restore();
  ctx.save();
  ctx.translate(originX, originY);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= state.width; gx += 1) {
    const x = gx * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height * cellSize);
    ctx.stroke();
  }
  for (let gy = 0; gy <= state.height; gy += 1) {
    const y = gy * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width * cellSize, y);
    ctx.stroke();
  }
  ctx.restore();
  drawAxisLabels();
}

function drawAxisLabels() {
  if (!state.width || !state.height) return;
  const padding = state.axisPadding;
  const cellSize = state.cellSize;
  const originX = padding.left;
  const originY = padding.top;
  if (!elements.ctx) return;
  renderAxisLabels(elements.ctx, {
    originX,
    originY,
    cellSize,
    widthCells: state.width,
    heightCells: state.height,
    textColor: 'rgba(0,0,0,0.65)',
    tickColor: 'rgba(0,0,0,0.3)'
  });
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
  const topY = originY - gap - tickLength;
  for (let x = 0; x < widthCells; x += 1) {
    const centerX = originX + x * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, originY - 0.5);
    ctx.lineTo(centerX, originY - tickLength - 0.5);
    ctx.stroke();
    ctx.fillText(String(x), centerX, topY);
  }

  ctx.textAlign = 'left';
  const leftX = originX - gap - tickLength;
  for (let y = 0; y < heightCells; y += 1) {
    const centerY = originY + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(originX - 0.5, centerY);
    ctx.lineTo(originX - tickLength - 0.5, centerY);
    ctx.stroke();
    ctx.fillText(String(y), leftX, centerY);
  }

  ctx.textAlign = 'center';
  const bottomY = originY + heightCells * cellSize + gap;
  for (let x = 0; x < widthCells; x += 1) {
    const centerX = originX + x * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, originY + heightCells * cellSize + 0.5);
    ctx.lineTo(centerX, originY + heightCells * cellSize + tickLength + 0.5);
    ctx.stroke();
    ctx.fillText(String(x), centerX, bottomY + fontSize * 0.1);
  }

  ctx.textAlign = 'left';
  const rightEdge = originX + widthCells * cellSize + 0.5;
  const rightLabelX = rightEdge + tickLength + gap;
  for (let y = 0; y < heightCells; y += 1) {
    const centerY = originY + y * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(rightEdge, centerY);
    ctx.lineTo(rightEdge + tickLength, centerY);
    ctx.stroke();
    ctx.fillText(String(y), rightLabelX, centerY);
  }
  ctx.restore();
}

function isMiddleDoubleClick(timeStamp) {
  const diff = timeStamp - state.lastMiddleClickTime;
  if (diff > 0 && diff <= DOUBLE_CLICK_MS) {
    state.lastMiddleClickTime = 0;
    return true;
  }
  state.lastMiddleClickTime = timeStamp;
  return false;
}

export function prepareCanvasInteractions() {
  let pointerState = null;
  if (!elements.canvas) return;
  elements.canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  elements.canvas.addEventListener('pointerdown', (ev) => {
    if (!state.width || !state.height) return;
    if (ev.button === 1 && ev.pointerType === 'mouse') {
      if (isMiddleDoubleClick(ev.timeStamp)) {
        resetView();
        return;
      }
    }
    if (state.baseEditing && state.baseImage && ev.button === 0) {
      ev.preventDefault();
      pointerState = {
        type: 'baseMove',
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        originOffsetX: state.baseOffsetX,
        originOffsetY: state.baseOffsetY
      };
      elements.canvas.setPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-base-dragging');
      return;
    }
    if (ev.button === 1) {
      ev.preventDefault();
      pointerState = {
        type: 'pan',
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        originPanX: state.panX,
        originPanY: state.panY
      };
      elements.canvas.setPointerCapture(ev.pointerId);
      elements.canvas.classList.add('is-panning');
      return;
    }
    if (state.baseEditing) {
      return;
    }
    if (ev.button !== 0 && ev.button !== 2) return;
    pointerState = {
      type: 'paint',
      pointerId: ev.pointerId,
      button: ev.button
    };
    elements.canvas.setPointerCapture(ev.pointerId);
    paintAtPointer(ev, ev.button);
  });

  elements.canvas.addEventListener('pointermove', (ev) => {
    if (!pointerState || pointerState.pointerId !== ev.pointerId) return;
    if (pointerState.type === 'pan') {
      const dx = ev.clientX - pointerState.startX;
      const dy = ev.clientY - pointerState.startY;
      state.panX = pointerState.originPanX + dx;
      state.panY = pointerState.originPanY + dy;
      updateStageTransform();
      return;
    }
    if (pointerState.type === 'baseMove') {
      const rect = elements.canvas.getBoundingClientRect();
      const scaleX = elements.canvas.width / rect.width;
      const scaleY = elements.canvas.height / rect.height;
      const dxCells = ((ev.clientX - pointerState.startX) * scaleX) / state.cellSize;
      const dyCells = ((ev.clientY - pointerState.startY) * scaleY) / state.cellSize;
      state.baseOffsetX = pointerState.originOffsetX + dxCells;
      state.baseOffsetY = pointerState.originOffsetY + dyCells;
      updateBaseImageDisplay();
      return;
    }
    if (pointerState.type === 'paint') {
      paintAtPointer(ev, pointerState.button);
    }
  });

  const releasePointer = (ev) => {
    if (!pointerState || pointerState.pointerId !== ev.pointerId) return;
    if (pointerState.type === 'pan') {
      elements.canvas.classList.remove('is-panning');
    }
    if (pointerState.type === 'baseMove') {
      elements.canvas.classList.remove('is-base-dragging');
    }
    pointerState = null;
    try {
      elements.canvas.releasePointerCapture(ev.pointerId);
    } catch (error) {
      // ignore
    }
  };

  elements.canvas.addEventListener('pointerup', releasePointer);
  elements.canvas.addEventListener('pointercancel', releasePointer);
}

export function handleWheelEvent(ev) {
  if (!state.width || !state.height) return;
  ev.preventDefault();
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  const canvasX = (ev.clientX - rect.left) * scaleX - state.axisPadding.left;
  const canvasY = (ev.clientY - rect.top) * scaleY - state.axisPadding.top;
  const pointerCellX = canvasX / state.cellSize;
  const pointerCellY = canvasY / state.cellSize;
  if (state.baseEditing && state.baseImage) {
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    applyBaseScale(state.baseScale * factor, pointerCellX, pointerCellY);
    return;
  }
  const factor = ev.deltaY < 0 ? 1.1 : 0.9;
  const newSize = clampCellSize(state.cellSize * factor);
  if (newSize === state.cellSize) return;
  state.cellSize = newSize;
  if (elements.zoomRange) {
    elements.zoomRange.value = newSize;
  }
  resizeCanvas();
}

function paintAtPointer(ev, button) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  const localX = (ev.clientX - rect.left) * scaleX - state.axisPadding.left;
  const localY = (ev.clientY - rect.top) * scaleY - state.axisPadding.top;
  const x = Math.floor(localX / state.cellSize);
  const y = Math.floor(localY / state.cellSize);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
  if (state.currentTool === 'bucket') {
    if (button === 0) {
      const colorEntry = resolvePaintColor(x, y);
      if (!colorEntry) return;
      bucketFill(x, y, colorEntry);
      return;
    }
    if (button === 2) {
      bucketFill(x, y, null);
      return;
    }
  }
  if (button === 2) {
    if (state.grid[y][x]) {
      state.grid[y][x] = null;
      redrawCanvas();
    }
    return;
  }
  const colorEntry = resolvePaintColor(x, y);
  if (!colorEntry) return;
  const cell = state.grid[y][x];
  if (!cell || cell.code !== colorEntry.code) {
    state.grid[y][x] = colorEntry;
    redrawCanvas();
  }
}

function bucketFill(x, y, newCell) {
  const targetCell = state.grid[y][x];
  if (cellsEqual(targetCell, newCell)) return;
  const queue = [[x, y]];
  const visited = new Set([`${x},${y}`]);
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx < 0 || cy < 0 || cx >= state.width || cy >= state.height) continue;
    if (!cellsEqual(state.grid[cy][cx], targetCell)) continue;
    state.grid[cy][cx] = newCell;
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];
    neighbors.forEach(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return;
      const key = `${nx},${ny}`;
      if (visited.has(key)) return;
      if (!cellsEqual(state.grid[ny][nx], targetCell)) return;
      visited.add(key);
      queue.push([nx, ny]);
    });
  }
  redrawCanvas();
}

function resolvePaintColor(x, y) {
  if (state.autoSnap && state.baseImageData) {
    const snap = getNearestColorFromBase(x, y);
    if (snap) return snap;
  }
  if (state.selectedColorKey && state.palette[state.selectedColorKey]) {
    return state.palette[state.selectedColorKey];
  }
  if (state.paletteKeys.length) {
    return state.palette[state.paletteKeys[0]];
  }
  return null;
}

export function updateCanvasOpacityLabel() {
  if (!elements.canvasOpacityValue) return;
  const percent = Math.round(clampAlpha(state.backgroundOpacity) * 100);
  elements.canvasOpacityValue.textContent = `${percent}%`;
}

function updateStatusSize() {
  if (!elements.statusSize) return;
  if (!state.width || !state.height) {
    elements.statusSize.textContent = '未创建';
  } else {
    elements.statusSize.textContent = `${state.width} × ${state.height}`;
  }
}

export function setTool(tool) {
  if (state.currentTool === tool) return;
  state.currentTool = tool;
  updateToolButtons();
  updateCanvasCursorState();
}

export function updateToolButtons() {
  if (!elements.toolPencilBtn || !elements.toolBucketBtn) return;
  const mapping = {
    pencil: elements.toolPencilBtn,
    bucket: elements.toolBucketBtn
  };
  Object.entries(mapping).forEach(([key, btn]) => {
    const active = state.currentTool === key;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function isCanvasDirty() {
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (state.grid[y] && state.grid[y][x]) {
        return true;
      }
    }
  }
  return false;
}

export function clearDrawingGrid() {
  if (!state.grid || !state.grid.length) return;
  for (let y = 0; y < state.height; y += 1) {
    if (state.grid[y]) {
      state.grid[y].fill(null);
    }
  }
  redrawCanvas();
}
