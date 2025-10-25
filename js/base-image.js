// base-image.js (优化后)
import { BASE_SCALE_LIMITS } from './constants.js';
import { elements, fullscreenBaseEditBtn } from './elements.js';
import { hiddenBaseCanvas, hiddenBaseCtx, state } from './state.js';
import { clampBaseScale } from './utils.js';

const TEXT_BASE_NOT_LOADED = '未加载';
const TEXT_EXIT_EDIT = '退出底图编辑';
const TEXT_ENTER_EDIT = '编辑底图';

const BASE_ANCHORS = [
  { id: 'center', label: '居中', apply: recenterBaseImage },
  { id: 'top-left', label: '左上', apply: () => setBasePosition(0, 0) },
  { id: 'top-right', label: '右上', apply: () => setBasePosition(state.width - getDrawWidth(), 0) },
  { id: 'bottom-left', label: '左下', apply: () => setBasePosition(0, state.height - getDrawHeight()) },
  { id: 'bottom-right', label: '右下', apply: () => setBasePosition(state.width - getDrawWidth(), state.height - getDrawHeight()) }
];

let baseAnchorIndex = 0;

function getDrawWidth() { return state.baseImage.width * state.baseScale; }
function getDrawHeight() { return state.baseImage.height * state.baseScale; }
function setBasePosition(x, y) { state.baseOffsetX = x; state.baseOffsetY = y; updateBaseImageDisplay(); }

function syncFullscreenEditButton() { fullscreenBaseEditBtn && (fullscreenBaseEditBtn.disabled = !state.baseImage); }

function refreshAnchorButtonLabel() {
  elements.snapBaseToCanvasBtn && (elements.snapBaseToCanvasBtn.textContent = `定位: ${BASE_ANCHORS[baseAnchorIndex].label}`);
}

export function updateStatusBase() {
  elements.statusBase.textContent = state.baseImageName || TEXT_BASE_NOT_LOADED;
}

export function getNearestColorFromBase(x, y) {
  if (!state.baseImageData) return null;
  const index = (y * state.width + x) * 4;
  const data = state.baseImageData.data;
  return findNearestPaletteColor(data[index], data[index + 1], data[index + 2]);
}

function findNearestPaletteColor(r, g, b) {
  let bestCode = null, bestDist = Infinity;

  for (const code of state.paletteKeys) {
    const entry = state.palette[code];
    if (!entry) continue;

    const dr = entry.rgb.r - r, dg = entry.rgb.g - g, db = entry.rgb.b - b;
    const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;

    if (dist < bestDist) {
      bestDist = dist;
      bestCode = code;
    }
  }

  return bestCode ? state.palette[bestCode] : null;
}

export function applyBaseScale(targetScale, anchorCellX, anchorCellY) {
  if (!state.baseImage) return false;

  const clamped = clampBaseScale(targetScale);
  if (clamped === state.baseScale) return false;

  const anchorX = Number.isFinite(anchorCellX) ? anchorCellX : state.width / 2;
  const anchorY = Number.isFinite(anchorCellY) ? anchorCellY : state.height / 2;
  const relX = anchorX - state.baseOffsetX, relY = anchorY - state.baseOffsetY;
  const imageCoordX = relX / state.baseScale, imageCoordY = relY / state.baseScale;

  state.baseScale = clamped;
  state.baseOffsetX = anchorX - imageCoordX * clamped;
  state.baseOffsetY = anchorY - imageCoordY * clamped;

  updateBaseImageDisplay();
  return true;
}

export function fitBaseImageToCanvas() {
  if (!state.baseImage || !state.width || !state.height) return;

  const fitScale = Math.min(state.width / state.baseImage.width, state.height / state.baseImage.height);
  state.baseScale = clampBaseScale(fitScale);
  recenterBaseImage();
  updateBaseScaleControls();
}

export function clearBaseImage() {
  state.baseImage = state.baseImageName = state.baseImageData = null;
  state.baseScale = 1;
  state.baseOffsetX = state.baseOffsetY = 0;
  state.baseEditing = false;

  elements.baseCtx?.clearRect(0, 0, elements.baseCanvas.width, elements.baseCanvas.height);

  updateStatusBase();
  syncBaseControlsAvailability();
  updateBaseEditButton();
  updateCanvasCursorState();
  applyBaseLayerPosition();
  disableBaseControls();

  // 触发全屏状态更新
  setTimeout(() => document.dispatchEvent(new CustomEvent('updateFullscreenOverlay')), 0);
}

export function updateBaseImageDisplay() {
  if (!elements.baseCtx || !state.baseImage || !state.width || !state.height) {
    state.baseImageData = null;
    updateBaseEditButton();
    return;
  }

  elements.baseCtx.clearRect(0, 0, elements.baseCanvas.width, elements.baseCanvas.height);

  const drawWidthCells = getDrawWidth(), drawHeightCells = getDrawHeight();
  const offsetXCells = state.baseOffsetX, offsetYCells = state.baseOffsetY;
  const drawWidthPx = drawWidthCells * state.cellSize, drawHeightPx = drawHeightCells * state.cellSize;
  const originX = state.axisPadding.left, originY = state.axisPadding.top;
  const offsetXPx = originX + offsetXCells * state.cellSize, offsetYPx = originY + offsetYCells * state.cellSize;

  elements.baseCtx.save();
  elements.baseCtx.imageSmoothingEnabled = true;
  elements.baseCtx.drawImage(state.baseImage, 0, 0, state.baseImage.width, state.baseImage.height,
    offsetXPx, offsetYPx, drawWidthPx, drawHeightPx);
  elements.baseCtx.restore();

  // 更新隐藏画布用于颜色采样
  hiddenBaseCanvas.width = state.width;
  hiddenBaseCanvas.height = state.height;
  hiddenBaseCtx.clearRect(0, 0, hiddenBaseCanvas.width, hiddenBaseCanvas.height);
  hiddenBaseCtx.imageSmoothingEnabled = true;
  hiddenBaseCtx.drawImage(state.baseImage, 0, 0, state.baseImage.width, state.baseImage.height,
    offsetXCells, offsetYCells, drawWidthCells, drawHeightCells);

  state.baseImageData = hiddenBaseCtx.getImageData(0, 0, hiddenBaseCanvas.width, hiddenBaseCanvas.height);
  updateBaseEditButton();
}

export function handleBaseImageChange(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.baseImage = img;
      state.baseImageName = file.name;
      state.baseEditing = false;
      fitBaseImageToCanvas();
      updateStatusBase();
      syncBaseControlsAvailability();
      applyBaseLayerPosition();
      enableBaseControls();
      initializeBaseAnchorButton();
      updateBaseImageDisplay();
      setTimeout(() => document.dispatchEvent(new CustomEvent('updateFullscreenOverlay')), 0);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

export function toggleBaseEditMode(force) {
  if (!state.baseImage) return;

  const wasEditing = state.baseEditing;
  state.baseEditing = typeof force === 'boolean' ? force : !state.baseEditing;

  if (wasEditing !== state.baseEditing) showBaseEditModeFeedback(state.baseEditing);

  updateBaseEditButton();
  updateCanvasCursorState();
}

function showBaseEditModeFeedback(isEditing) {
  let feedback = document.getElementById('baseEditModeFeedback');
  if (!feedback) {
    feedback = document.createElement('div');
    feedback.id = 'baseEditModeFeedback';
    feedback.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:white;padding:16px 24px;border-radius:12px;font-size:16px;font-weight:600;z-index:10000;pointer-events:none;opacity:0;transition:opacity 0.3s;white-space:nowrap;box-shadow:0 8px 32px rgba(0,0,0,0.3);`;
    document.body.appendChild(feedback);
  }

  feedback.textContent = isEditing ? '🎯 底图编辑模式已开启' : '❌ 底图编辑模式已关闭';
  feedback.style.border = `2px solid ${isEditing ? '#4CAF50' : '#ff4757'}`;
  feedback.style.opacity = '1';

  setTimeout(() => feedback.style.opacity = '0', 800);
}

export function updateBaseEditButton() {
  if (!elements.toggleBaseEditBtn) return;

  const percent = Math.round(clampBaseScale(state.baseScale) * 100) || 100;
  const label = state.baseEditing ? `${TEXT_EXIT_EDIT} (${percent}%)` : `${TEXT_ENTER_EDIT} (${percent}%)`;
  elements.toggleBaseEditBtn.textContent = label;
  elements.toggleBaseEditBtn.setAttribute('aria-pressed', state.baseEditing ? 'true' : 'false');
  elements.toggleBaseEditBtn.disabled = !state.baseImage;

  if (fullscreenBaseEditBtn) {
    fullscreenBaseEditBtn.textContent = state.baseEditing ? TEXT_EXIT_EDIT : TEXT_ENTER_EDIT;
    fullscreenBaseEditBtn.setAttribute('aria-pressed', state.baseEditing ? 'true' : 'false');
    fullscreenBaseEditBtn.classList.toggle('is-editing', state.baseEditing);
  }

  updateBaseScaleControls();
  syncFullscreenEditButton();
}

function updateBaseScaleControls() {
  if (!elements.baseScaleRange || !elements.baseScaleValue) return;

  const clamped = clampBaseScale(state.baseScale);
  elements.baseScaleRange.value = String(clamped);
  elements.baseScaleRange.disabled = !state.baseImage;

  const percent = Math.round(clamped * 100) || 100;
  elements.baseScaleValue.textContent = `${percent}%`;
}

export function updateCanvasCursorState() {
  if (!elements.canvas) return;

  elements.canvas.classList.toggle('base-edit-mode', state.baseEditing);
  elements.canvas.classList.toggle('bucket-tool', state.currentTool === 'bucket' && !state.baseEditing);
  elements.canvas.classList.toggle('eyedropper-tool', state.currentTool === 'eyedropper' && !state.baseEditing);

  !state.baseEditing && elements.canvas.classList.remove('is-base-dragging');
}

export function syncBaseControlsAvailability() {
  const hasBase = Boolean(state.baseImage);

  [elements.baseLayerSelect, elements.toggleBaseEditBtn, elements.baseScaleRange].forEach(el =>
    el && (el.disabled = !hasBase)
  );

  if (!hasBase) {
    state.baseLayerPosition = 'under';
    elements.baseLayerSelect && (elements.baseLayerSelect.value = 'under');
    state.baseEditing = false;
  }

  updateBaseEditButton();
  updateCanvasCursorState();
  hasBase ? enableBaseControls() : disableBaseControls();
  syncFullscreenEditButton();
}

export function applyBaseLayerPosition() {
  if (!elements.baseCanvas || !elements.canvas) return;

  const visible = Boolean(state.baseImage) && state.baseLayerPosition !== 'hidden';
  elements.baseCanvas.style.display = visible ? 'block' : 'none';

  if (!visible) {
    state.baseEditing && (state.baseEditing = false);
    updateBaseEditButton();
    updateCanvasCursorState();
    return;
  }

  if (state.baseLayerPosition === 'under') {
    elements.baseCanvas.style.zIndex = '0';
    elements.baseCanvas.style.opacity = '1';
    elements.canvas.style.zIndex = '1';
  } else {
    elements.baseCanvas.style.zIndex = '2';
    elements.baseCanvas.style.opacity = '0.75';
    elements.canvas.style.zIndex = '1';
  }

  updateCanvasCursorState();
}

export function initializeBaseScaleRange() {
  if (!elements.baseScaleRange) return;

  elements.baseScaleRange.min = String(BASE_SCALE_LIMITS.min);
  elements.baseScaleRange.max = String(BASE_SCALE_LIMITS.max);
  elements.baseScaleRange.step = '0.01';

  !state.baseImageName && elements.statusBase && (elements.statusBase.textContent = TEXT_BASE_NOT_LOADED);

  initializeBaseAnchorButton();
  syncFullscreenEditButton();
}

export function recenterBaseImage() {
  if (!state.baseImage || !state.width || !state.height) return;

  const drawWidthCells = getDrawWidth(), drawHeightCells = getDrawHeight();
  state.baseOffsetX = (state.width - drawWidthCells) / 2;
  state.baseOffsetY = (state.height - drawHeightCells) / 2;

  updateBaseImageDisplay();
  baseAnchorIndex = 0;
  refreshAnchorButtonLabel();
  syncFullscreenEditButton();
}

export function cycleBaseAnchor() {
  if (!state.baseImage) return;

  baseAnchorIndex = (baseAnchorIndex + 1) % BASE_ANCHORS.length;
  BASE_ANCHORS[baseAnchorIndex].apply();
  refreshAnchorButtonLabel();
  syncFullscreenEditButton();
}

export function snapBaseToCanvas() { cycleBaseAnchor(); }

export function initializeBaseAnchorButton() {
  baseAnchorIndex = 0;
  refreshAnchorButtonLabel();
  syncFullscreenEditButton();
}

export function enableBaseControls() {
  elements.recenterBaseBtn?.removeAttribute('disabled');
  elements.snapBaseToCanvasBtn?.removeAttribute('disabled');
  refreshAnchorButtonLabel();
  syncFullscreenEditButton();
}

export function disableBaseControls() {
  elements.recenterBaseBtn?.setAttribute('disabled', 'true');
  elements.snapBaseToCanvasBtn?.setAttribute('disabled', 'true');
  baseAnchorIndex = 0;
  refreshAnchorButtonLabel();
  syncFullscreenEditButton();
}