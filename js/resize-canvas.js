import { elements } from './elements.js';
import { state } from './state.js';
import { saveHistory, resizeCanvas, validateCanvasSize } from './canvas.js';
import { resetSelection } from './selection.js';
import { renderSelectionLayers } from './selection-layer.js';
const SIDE_LABELS = { top: '上', right: '右', bottom: '下', left: '左' };
const SIDE_TOOLTIP_ADD = { top: '向上扩展', right: '向右扩展', bottom: '向下扩展', left: '向左扩展' };
const SIDE_TOOLTIP_SUB = { top: '向上裁剪', right: '向右裁剪', bottom: '向下裁剪', left: '向左裁剪' };
const resizeState = { mode: 'expand', values: { top: 0, right: 0, bottom: 0, left: 0 }, isOpen: false };
let escapeListener = null;
const editValueMap = new Map();
const edgeInputs = new Map();
let previewFrameHandle = null;
let pendingPreviewResult = null;
const PREVIEW_CONFIG = { cellSize: 12, padding: 24, axisBand: 28, backgroundLight: '#f8f9ff', backgroundDark: '#ebeefb', gridColor: 'rgba(0,0,0,0.12)', axisColor: 'rgba(0,0,0,0.3)', labelColor: 'rgba(0,0,0,0.7)', fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif' };
export function initializeResizeCanvas() {
  if (!elements.resizeCanvasBtn || !elements.resizeCanvasOverlay) return;
  elements.resizeEditValues?.forEach?.((el) => {
    const side = el.dataset.valueFor;
    if (side) editValueMap.set(side, el);
  });
  buildEdgeControls();
  elements.resizeCanvasBtn.addEventListener('click', handleOpenRequest);
  elements.resizeCancelBtn?.addEventListener('click', closeOverlay);
  elements.resizeCloseBtn?.addEventListener('click', closeOverlay);
  elements.resizeConfirmBtn?.addEventListener('click', commitResize);
  elements.resizeModeExpandBtn?.addEventListener('click', () => setMode('expand'));
  elements.resizeModeCropBtn?.addEventListener('click', () => setMode('crop'));
  elements.resizeCanvasOverlay.addEventListener('click', (ev) => {
    if (ev.target === elements.resizeCanvasOverlay) {
      closeOverlay();
    }
  });
  updateEditButtonTooltips();
}
function buildEdgeControls() {
  if (!elements.resizeCanvasOverlay) return;
  const cards = elements.resizeCanvasOverlay.querySelectorAll('.resize-edge-card');
  cards.forEach((card) => {
    const button = card.querySelector('.resize-edit-btn');
    if (!button) return;
    const side = button.dataset.side;
    if (!side) return;
    let control = card.querySelector('.resize-edge-control');
    if (!control) {
      control = document.createElement('div');
      control.className = 'resize-edge-control';
      const steps = [-1, 'input', 1];
      steps.forEach((step) => {
        if (step === 'input') {
          const input = document.createElement('input');
          input.type = 'number';
          input.min = '0';
          input.step = '1';
          input.className = 'resize-value-input';
          input.dataset.side = side;
          control.appendChild(input);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'resize-step-btn';
          btn.dataset.side = side;
          btn.dataset.step = String(step);
          btn.textContent = step > 0 ? '+1' : '-1';
          control.appendChild(btn);
        }
      });
      const valueHint = card.querySelector('.resize-edit-value');
      if (valueHint) {
        card.insertBefore(control, valueHint);
      } else {
        card.appendChild(control);
      }
    }
    const input = control.querySelector('input');
    if (!input) return;
    edgeInputs.set(side, input);
    input.value = String(resizeState.values[side] || 0);
    input.addEventListener('input', () => handleInputChange(side, input.value));
    input.addEventListener('change', () => handleInputChange(side, input.value));
    control.querySelectorAll('.resize-step-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const baseStep = Number(btn.dataset.step) || 0;
        const multiplier = event.shiftKey ? 10 : 1;
        adjustValue(side, baseStep * multiplier);
      });
    });
    button.addEventListener('click', () => handleEditButton(side));
  });
}
function handleOpenRequest() {
  if (!state.width || !state.height) {
    window.alert('请先创建画布后再进行扩图或裁剪。');
    return;
  }
  openOverlay();
}
function openOverlay() {
  resizeState.mode = 'expand';
  resizeState.values = { top: 0, right: 0, bottom: 0, left: 0 };
  resizeState.isOpen = true;
  document.body.classList.add('resize-modal-open');
  elements.resizeCanvasOverlay.classList.add('is-visible');
  elements.resizeCanvasOverlay.setAttribute('aria-hidden', 'false');
  setMode('expand');
  updateUI();
  schedulePreviewRender();
  if (elements.resizeModeExpandBtn) {
    elements.resizeModeExpandBtn.focus();
  }
  escapeListener = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeOverlay();
    }
  };
  document.addEventListener('keydown', escapeListener, true);
}
function closeOverlay() {
  if (!resizeState.isOpen) return;
  resizeState.isOpen = false;
  document.body.classList.remove('resize-modal-open');
  elements.resizeCanvasOverlay.classList.remove('is-visible');
  elements.resizeCanvasOverlay.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', escapeListener, true);
  escapeListener = null;
  if (previewFrameHandle) {
    cancelAnimationFrame(previewFrameHandle);
    previewFrameHandle = null;
  }
  pendingPreviewResult = null;
  clearPreview();
}
function setMode(newMode) {
  if (newMode !== 'expand' && newMode !== 'crop') return;
  resizeState.mode = newMode;
  elements.resizeModeExpandBtn?.classList.toggle('active', newMode === 'expand');
  elements.resizeModeCropBtn?.classList.toggle('active', newMode === 'crop');
  elements.resizeModeExpandBtn?.setAttribute('aria-pressed', newMode === 'expand' ? 'true' : 'false');
  elements.resizeModeCropBtn?.setAttribute('aria-pressed', newMode === 'crop' ? 'true' : 'false');
  updateEditButtonTooltips();
  updateUI();
}
function handleEditButton(side) {
  const input = edgeInputs.get(side);
  if (!input) return;
  input.focus();
  if (typeof input.select === 'function') {
    input.select();
  }
}
function handleInputChange(side, rawValue) {
  if (!side || !(side in resizeState.values)) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  const safe = Math.max(0, Math.round(value));
  if (resizeState.values[side] === safe) return;
  resizeState.values[side] = safe;
  updateUI();
}
function adjustValue(side, delta) {
  if (!side || !(side in resizeState.values)) return;
  const next = Math.max(0, (resizeState.values[side] ?? 0) + Number(delta || 0));
  resizeState.values[side] = next;
  const input = edgeInputs.get(side);
  if (input) {
    input.value = String(next);
  }
  updateUI();
}
function updateUI() {
  const result = computeResultSize();
  updateValueLabels();
  updateModeMessage(result);
  updateSizeSummary(result);
  schedulePreviewRender(result);
}
function updateValueLabels() {
  editValueMap.forEach((el, side) => {
    const value = resizeState.values[side] ?? 0;
    el.textContent = `${value} 格`;
    const input = edgeInputs.get(side);
    if (input && input.value !== String(value)) {
      input.value = String(value);
    }
  });
}
function updateEditButtonTooltips() {
  const action = resizeState.mode === 'expand' ? '扩图' : '裁图';
  let SIDE_TOOLTIP_PREFIX
  if (action === '鎵╁浘') {
    SIDE_TOOLTIP_PREFIX = SIDE_TOOLTIP_ADD;
  } else {
    SIDE_TOOLTIP_PREFIX = SIDE_TOOLTIP_SUB;
  }
  elements.resizeEditButtons?.forEach?.((btn) => {
    const side = btn.dataset.side;
    const prefix = side ? SIDE_TOOLTIP_PREFIX[side] : null;
    if (!prefix) return;
    const text = `${prefix}${action}`;
    btn.title = text;
    btn.setAttribute('aria-label', text);
  });
}
function updateModeMessage(result = computeResultSize()) {
  if (!elements.resizeMessage) return;
  elements.resizeMessage.textContent = '';
  elements.resizeMessage.classList.remove('error', 'warning');
  if (!state.width || !state.height) {
    elements.resizeMessage.textContent = '当前暂无可编辑画布';
    elements.resizeMessage.classList.add('error');
    return;
  }
  const { width: previewWidth, height: previewHeight, valid } = result;
  if (!valid) {
    elements.resizeMessage.textContent = '输入值导致画布尺寸无效，请重新输入。';
    elements.resizeMessage.classList.add('error');
    return;
  }
  if (!validateCanvasSize(previewWidth, previewHeight)) {
    elements.resizeMessage.textContent = '画布尺寸需在 1 - 1024 格之间。';
    elements.resizeMessage.classList.add('error');
    return;
  }
  if (resizeState.mode === 'crop' && willCropRemovePixels()) {
    elements.resizeMessage.textContent = '裁剪会删除画布边缘的像素，请谨慎操作。';
    elements.resizeMessage.classList.add('warning');
  } else {
    elements.resizeMessage.textContent = resizeState.mode === 'expand'
      ? '本次扩展会向画布四周添加空白区域。'
      : '本次裁剪会移除画布边缘的指定区域。';
  }
}
function updateSizeSummary(result = computeResultSize()) {
  if (elements.resizeCurrentSize) {
    elements.resizeCurrentSize.textContent = `当前尺寸：${state.width} × ${state.height}`;
  }
  const { width: previewWidth, height: previewHeight, valid } = result;
  if (elements.resizeResultSize) {
    if (!valid) {
      elements.resizeResultSize.textContent = '目标尺寸：-- × --';
    } else {
      elements.resizeResultSize.textContent = `目标尺寸：${previewWidth} × ${previewHeight}`;
    }
  }
  const confirmDisabled = !valid || !validateCanvasSize(previewWidth, previewHeight);
  if (elements.resizeConfirmBtn) {
    elements.resizeConfirmBtn.disabled = confirmDisabled;
  }
}
function schedulePreviewRender(result = computeResultSize()) {
  pendingPreviewResult = result;
  if (previewFrameHandle) return;
  previewFrameHandle = requestAnimationFrame(() => {
    previewFrameHandle = null;
    const nextResult = pendingPreviewResult ?? computeResultSize();
    pendingPreviewResult = null;
    renderPreview(nextResult);
  });
}
function renderPreview(result = computeResultSize()) {
  const drawingCanvas = elements.resizePreviewDrawingCanvas;
  const stage = elements.resizePreviewStage;
  const wrapper = elements.resizePreviewWrapper;
  if (!drawingCanvas || !stage || !wrapper) return;
  const { width, height, valid }
    = result;
  if (!valid || width <= 0 || height <= 0) {
    clearPreview();
    return;
  }
  const previewWidth = Math.max(1, Math.floor(width));
  const previewHeight = Math.max(1, Math.floor(height));
  if (!validateCanvasSize(previewWidth, previewHeight)) {
    clearPreview();
    return;
  }
  const layout = computePreviewLayout(previewWidth, previewHeight);
  if (drawingCanvas.width !== layout.canvasWidth || drawingCanvas.height !== layout.canvasHeight) {
    drawingCanvas.width = layout.canvasWidth;
    drawingCanvas.height = layout.canvasHeight;
  }
  const drawingCtx = drawingCanvas.getContext('2d');
  if (!drawingCtx) return;
  const stageRect = stage.getBoundingClientRect();
  let availableWidth = stageRect.width;
  let availableHeight = stageRect.height;
  if (availableWidth <= 0 || availableHeight <= 0) {
    schedulePreviewRender(result);
    return;
  }
  const stageStyle = getComputedStyle(stage);
  const paddingX = parseFloat(stageStyle.paddingLeft || '0') + parseFloat(stageStyle.paddingRight || '0');
  const paddingY = parseFloat(stageStyle.paddingTop || '0') + parseFloat(stageStyle.paddingBottom || '0');
  availableWidth = Math.max(availableWidth - paddingX, 1);
  availableHeight = Math.max(availableHeight - paddingY, 1);
  drawingCtx.save();
  drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  drawingCtx.imageSmoothingEnabled = false;
  drawPreviewBackground(drawingCtx, layout);
  drawPreviewGrid(drawingCtx, layout, previewWidth, previewHeight);
  drawPreviewPixels(drawingCtx, layout, previewWidth, previewHeight);
  drawPreviewAxes(drawingCtx, layout, previewWidth, previewHeight);
  drawingCtx.restore();
  let scale = Math.min(availableWidth / layout.canvasWidth, availableHeight / layout.canvasHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  } else {
    scale = Math.min(scale, 16);
  }

  const displayWidth = Math.max(Math.round(layout.canvasWidth * scale), 1);
  const displayHeight = Math.max(Math.round(layout.canvasHeight * scale), 1);
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  if (stage) {
    stage.style.width = '100%';
    stage.style.height = '100%';
  }
  drawingCanvas.style.width = `${displayWidth}px`;
  drawingCanvas.style.height = `${displayHeight}px`;
  drawingCanvas.style.maxWidth = '100%';
  drawingCanvas.style.maxHeight = '100%';
}
function clearPreview() {
  const wrapper = elements.resizePreviewWrapper;
  const drawingCanvas = elements.resizePreviewDrawingCanvas;
  const stage = elements.resizePreviewStage;
  if (previewFrameHandle) {
    cancelAnimationFrame(previewFrameHandle);
    previewFrameHandle = null;
  }
  pendingPreviewResult = null;
  if (wrapper) {
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.aspectRatio = '1 / 1';
  }
  if (stage) {
    stage.style.width = '100%';
    stage.style.height = '100%';
  }
  if (drawingCanvas) {
    drawingCanvas.width = 0;
    drawingCanvas.height = 0;
    drawingCanvas.style.width = '0px';
    drawingCanvas.style.height = '0px';
  }
}
function computePreviewLayout(widthCells, heightCells) {
  const cellSize = PREVIEW_CONFIG.cellSize;
  const canvasWidth = widthCells * cellSize + PREVIEW_CONFIG.padding * 2 + PREVIEW_CONFIG.axisBand * 2;
  const canvasHeight = heightCells * cellSize + PREVIEW_CONFIG.padding * 2 + PREVIEW_CONFIG.axisBand * 2;
  const originX = PREVIEW_CONFIG.padding + PREVIEW_CONFIG.axisBand;
  const originY = PREVIEW_CONFIG.padding + PREVIEW_CONFIG.axisBand;
  return { cellSize, canvasWidth, canvasHeight, originX, originY, widthCells, heightCells };
}
function drawPreviewBackground(ctx, layout) {
  ctx.fillStyle = PREVIEW_CONFIG.backgroundLight;
  ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(PREVIEW_CONFIG.padding, PREVIEW_CONFIG.padding, layout.canvasWidth - PREVIEW_CONFIG.padding * 2, PREVIEW_CONFIG.axisBand);
  ctx.fillRect(PREVIEW_CONFIG.padding, layout.canvasHeight - PREVIEW_CONFIG.padding - PREVIEW_CONFIG.axisBand, layout.canvasWidth - PREVIEW_CONFIG.padding * 2, PREVIEW_CONFIG.axisBand);
  ctx.fillRect(PREVIEW_CONFIG.padding, PREVIEW_CONFIG.padding + PREVIEW_CONFIG.axisBand, PREVIEW_CONFIG.axisBand, layout.canvasHeight - PREVIEW_CONFIG.padding * 2 - PREVIEW_CONFIG.axisBand * 2);
  ctx.fillRect(layout.canvasWidth - PREVIEW_CONFIG.padding - PREVIEW_CONFIG.axisBand, PREVIEW_CONFIG.padding + PREVIEW_CONFIG.axisBand, PREVIEW_CONFIG.axisBand, layout.canvasHeight - PREVIEW_CONFIG.padding * 2 - PREVIEW_CONFIG.axisBand * 2);
  const checkSize = PREVIEW_CONFIG.cellSize;
  ctx.fillStyle = PREVIEW_CONFIG.backgroundDark;
  for (let y = layout.originY; y < layout.originY + layout.heightCells * checkSize; y += checkSize) {
    for (let x = layout.originX; x < layout.originX + layout.widthCells * checkSize; x += checkSize) {
      if (((x / checkSize) + (y / checkSize)) % 2 === 0) {
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }
  }
}
function drawPreviewGrid(ctx, layout, widthCells, heightCells) {
  ctx.strokeStyle = PREVIEW_CONFIG.gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= widthCells; x++) {
    const px = layout.originX + x * layout.cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, layout.originY);
    ctx.lineTo(px, layout.originY + heightCells * layout.cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= heightCells; y++) {
    const py = layout.originY + y * layout.cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(layout.originX, py);
    ctx.lineTo(layout.originX + widthCells * layout.cellSize, py);
    ctx.stroke();
  }
}
function drawPreviewPixels(ctx, layout, previewWidth, previewHeight) {
  if (!state.grid || !state.grid.length) return;
  ctx.globalAlpha = 1;
  if (resizeState.mode === 'expand') {
    const offsetX = resizeState.values.left;
    const offsetY = resizeState.values.top;
    for (let y = 0; y < state.height; y++) {
      const row = state.grid[y];
      if (!row) continue;
      const targetY = y + offsetY;
      if (targetY < 0 || targetY >= previewHeight) continue;
      for (let x = 0; x < state.width; x++) {
        const cell = row[x];
        if (!cell || !cell.color) continue;
        const targetX = x + offsetX;
        if (targetX < 0 || targetX >= previewWidth) continue;
        ctx.fillStyle = cell.color;
        ctx.fillRect(layout.originX + targetX * layout.cellSize, layout.originY + targetY * layout.cellSize, layout.cellSize, layout.cellSize);
      }
    }
    return;
  }
  const startY = resizeState.values.top;
  const endY = state.height - resizeState.values.bottom;
  const startX = resizeState.values.left;
  const endX = state.width - resizeState.values.right;
  for (let y = startY; y < endY; y++) {
    const row = state.grid[y];
    if (!row) continue;
    const targetY = y - startY;
    if (targetY < 0 || targetY >= previewHeight) continue;
    for (let x = startX; x < endX; x++) {
      const cell = row[x];
      if (!cell || !cell.color) continue;
      const targetX = x - startX;
      if (targetX < 0 || targetX >= previewWidth) continue;
      ctx.fillStyle = cell.color;
      ctx.fillRect(layout.originX + targetX * layout.cellSize, layout.originY + targetY * layout.cellSize, layout.cellSize, layout.cellSize);
    }
  }
}
function drawPreviewAxes(ctx, layout, widthCells, heightCells) {
  ctx.save();
  ctx.fillStyle = PREVIEW_CONFIG.labelColor;
  ctx.strokeStyle = PREVIEW_CONFIG.axisColor;
  ctx.lineWidth = 1;
  const fontSize = Math.max(10, Math.floor(PREVIEW_CONFIG.cellSize * 0.6));
  ctx.font = `${fontSize}px ${PREVIEW_CONFIG.fontFamily}`;
  const tick = Math.max(6, Math.floor(PREVIEW_CONFIG.cellSize * 0.7));
  const gap = Math.max(4, Math.floor(PREVIEW_CONFIG.cellSize * 0.4));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const topY = layout.originY - gap;
  for (let x = 0; x < widthCells; x++) {
    const cx = layout.originX + x * layout.cellSize + layout.cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(cx, layout.originY);
    ctx.lineTo(cx, layout.originY - tick);
    ctx.stroke();
    ctx.fillText(String(x + 1), cx, topY);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const bottomY = layout.originY + heightCells * layout.cellSize + gap + tick / 2;
  for (let x = 0; x < widthCells; x++) {
    const cx = layout.originX + x * layout.cellSize + layout.cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(cx, layout.originY + heightCells * layout.cellSize);
    ctx.lineTo(cx, layout.originY + heightCells * layout.cellSize + tick);
    ctx.stroke();
    ctx.fillText(String(x + 1), cx, bottomY);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const leftX = layout.originX - gap;
  for (let y = 0; y < heightCells; y++) {
    const cy = layout.originY + y * layout.cellSize + layout.cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(layout.originX, cy);
    ctx.lineTo(layout.originX - tick, cy);
    ctx.stroke();
    ctx.fillText(String(y + 1), leftX, cy);
  }
  ctx.textAlign = 'left';
  const rightX = layout.originX + widthCells * layout.cellSize + gap;
  for (let y = 0; y < heightCells; y++) {
    const cy = layout.originY + y * layout.cellSize + layout.cellSize / 2;
    ctx.beginPath();
    ctx.moveTo(layout.originX + widthCells * layout.cellSize, cy);
    ctx.lineTo(layout.originX + widthCells * layout.cellSize + tick, cy);
    ctx.stroke();
    ctx.fillText(String(y + 1), rightX, cy);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(layout.originX, layout.originY, widthCells * layout.cellSize, heightCells * layout.cellSize);
  ctx.restore();
}
function computeResultSize() {
  if (!state.width || !state.height) {
    return { width: 0, height: 0, valid: false };
  }
  const { top, right, bottom, left }
    = resizeState.values;
  if (resizeState.mode === 'expand') {
    const width = state.width + left + right;
    const height = state.height + top + bottom;
    const valid = width >= 1 && height >= 1;
    return { width, height, valid };
  }
  const width = state.width - left - right;
  const height = state.height - top - bottom;
  const valid = width >= 1 && height >= 1 && left + right <= state.width && top + bottom <= state.height;
  return { width, height, valid };
}
function commitResize() {
  if (!resizeState.isOpen) return;
  if (!state.width || !state.height) return;
  const { width: newWidth, height: newHeight, valid }
    = computeResultSize();
  if (!valid || !validateCanvasSize(newWidth, newHeight)) {
    updateUI();
    return;
  }
  const totalAdjustment = resizeState.values.top + resizeState.values.right + resizeState.values.bottom + resizeState.values.left;
  if (totalAdjustment === 0) {
    closeOverlay();
    return;
  }
  if (resizeState.mode === 'crop' && willCropRemovePixels()) {
    if (resizeState.mode === 'crop' && willCropRemovePixels()) {
      const confirmed = window.confirm('裁剪将删除画布边缘的像素，确定继续吗？');
    }
    if (resizeState.mode === 'expand') {
      applyExpand(newWidth, newHeight);
    }
    else {
      applyCrop(newWidth, newHeight);
    }
    resetSelection({ suppressRender: true });
    renderSelectionLayers();
    resizeCanvas();
    updateStatusSizeLabel();
    saveHistory();
    closeOverlay();
  }
}
function applyExpand(newWidth, newHeight) {
  const { top, right, bottom, left }
    = resizeState.values;
  const newGrid = Array.from({ length: newHeight }, () => Array.from({ length: newWidth }, () => null));
  const offsetX = left;
  const offsetY = top;
  const copyHeight = Math.min(state.height, newHeight - bottom);
  const copyWidth = Math.min(state.width, newWidth - left - right);
  for (let y = 0; y < copyHeight; y++) {
    const sourceRow = state.grid[y];
    const targetRow = newGrid[y + offsetY];
    if (!Array.isArray(sourceRow) || !Array.isArray(targetRow)) continue;
    for (let x = 0; x < copyWidth; x++) {
      targetRow[x + offsetX] = sourceRow[x];
    }
  }
  state.grid = newGrid;
  state.width = newWidth;
  state.height = newHeight;
  state.baseOffsetX += left;
  state.baseOffsetY += top;
}
function applyCrop(newWidth, newHeight) {
  const { top, right, bottom, left }
    = resizeState.values;
  const newGrid = Array.from({ length: newHeight }, () => Array.from({ length: newWidth }, () => null));
  const startY = top;
  const endY = state.height - bottom;
  const startX = left;
  const endX = state.width - right;
  let targetY = 0;
  for (let y = startY; y < endY; y++, targetY++) {
    const sourceRow = state.grid[y];
    const targetRow = newGrid[targetY];
    if (!Array.isArray(sourceRow) || !Array.isArray(targetRow)) continue;
    let targetX = 0;
    for (let x = startX; x < endX; x++, targetX++) {
      targetRow[targetX] = sourceRow[x];
    }
  }
  state.grid = newGrid;
  state.width = newWidth;
  state.height = newHeight;
  state.baseOffsetX -= left;
  state.baseOffsetY -= top;
}
function willCropRemovePixels() {
  if (resizeState.mode !== 'crop') return false;
  const { top, right, bottom, left }
    = resizeState.values;
  if (top + bottom >= state.height || left + right >= state.width) return false;
  for (let y = 0; y < top; y++) {
    const row = state.grid[y];
    if (row?.some?.((cell) => Boolean(cell))) return true;
  }
  for (let y = state.height - bottom; y < state.height; y++) {
    const row = state.grid[y];
    if (row?.some?.((cell) => Boolean(cell))) return true;
  }
  const middleStart = Math.max(top, 0);
  const middleEnd = Math.max(state.height - bottom, middleStart);
  for (let y = middleStart; y < middleEnd; y++) {
    const row = state.grid[y];
    if (!Array.isArray(row)) continue;
    for (let x = 0; x < left; x++) {
      if (row[x]) return true;
    }
    for (let x = state.width - right; x < state.width; x++) {
      if (row[x]) return true;
    }
  }
  return false;
}
function updateStatusSizeLabel() {
  if (!elements.statusSize) return;
  if (!elements.statusSize) return;
  elements.statusSize.textContent = state.width && state.height ? `${state.width} × ${state.height}` : '未创建';
}