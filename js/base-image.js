import { BASE_SCALE_LIMITS } from './constants.js';
import { elements, fullscreenBaseEditBtn } from './elements.js';
import { hiddenBaseCanvas, hiddenBaseCtx, state } from './state.js';
import { clampBaseScale } from './utils.js';

const TEXT_BASE_NOT_LOADED = '\u672A\u52A0\u8F7D';
const TEXT_EXIT_EDIT = '\u9000\u51FA\u5E95\u56FE\u7F16\u8F91';
const TEXT_ENTER_EDIT = '\u7F16\u8F91\u5E95\u56FE';

const BASE_ANCHORS = [
  { id: 'center', label: '\u5C45\u4E2D', apply: recenterBaseImage },
  {
    id: 'top-left',
    label: '\u5DE6\u4E0A',
    apply: () => {
      if (!state.baseImage) return;
      state.baseOffsetX = 0;
      state.baseOffsetY = 0;
      updateBaseImageDisplay();
    }
  },
  {
    id: 'top-right',
    label: '\u53F3\u4E0A',
    apply: () => {
      if (!state.baseImage) return;
      const drawWidthCells = state.baseImage.width * state.baseScale;
      state.baseOffsetX = state.width - drawWidthCells;
      state.baseOffsetY = 0;
      updateBaseImageDisplay();
    }
  },
  {
    id: 'bottom-left',
    label: '\u5DE6\u4E0B',
    apply: () => {
      if (!state.baseImage) return;
      const drawHeightCells = state.baseImage.height * state.baseScale;
      state.baseOffsetX = 0;
      state.baseOffsetY = state.height - drawHeightCells;
      updateBaseImageDisplay();
    }
  },
  {
    id: 'bottom-right',
    label: '\u53F3\u4E0B',
    apply: () => {
      if (!state.baseImage) return;
      const drawWidthCells = state.baseImage.width * state.baseScale;
      const drawHeightCells = state.baseImage.height * state.baseScale;
      state.baseOffsetX = state.width - drawWidthCells;
      state.baseOffsetY = state.height - drawHeightCells;
      updateBaseImageDisplay();
    }
  }
];

let baseAnchorIndex = 0;

function syncFullscreenEditButton() {
  if (!fullscreenBaseEditBtn) return;
  fullscreenBaseEditBtn.disabled = !state.baseImage;
}

function refreshAnchorButtonLabel() {
  if (!elements.snapBaseToCanvasBtn) return;
  const anchor = BASE_ANCHORS[baseAnchorIndex];
  elements.snapBaseToCanvasBtn.textContent = `\u5B9A\u4F4D: ${anchor.label}`;
}

function updateBaseScaleControls() {
  if (!elements.baseScaleRange || !elements.baseScaleValue) return;
  const clamped = clampBaseScale(state.baseScale);
  elements.baseScaleRange.value = String(clamped);
  elements.baseScaleRange.disabled = !state.baseImage;
  const percent = Math.round(clamped * 100) || 100;
  elements.baseScaleValue.textContent = `${percent}%`;
}

export function updateStatusBase() {
  if (state.baseImageName) {
    elements.statusBase.textContent = state.baseImageName;
  } else {
    elements.statusBase.textContent = TEXT_BASE_NOT_LOADED;
  }
}

export function getNearestColorFromBase(x, y) {
  if (!state.baseImageData) return null;
  const index = (y * state.width + x) * 4;
  const data = state.baseImageData.data;
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return findNearestPaletteColor(r, g, b);
}

function findNearestPaletteColor(r, g, b) {
  let bestCode = null;
  let bestDist = Infinity;
  for (const code of state.paletteKeys) {
    const entry = state.palette[code];
    if (!entry) continue;
    const dr = entry.rgb.r - r;
    const dg = entry.rgb.g - g;
    const db = entry.rgb.b - b;
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
  const relX = anchorX - state.baseOffsetX;
  const relY = anchorY - state.baseOffsetY;
  const imageCoordX = relX / state.baseScale;
  const imageCoordY = relY / state.baseScale;
  state.baseScale = clamped;
  state.baseOffsetX = anchorX - imageCoordX * clamped;
  state.baseOffsetY = anchorY - imageCoordY * clamped;
  updateBaseImageDisplay();
  return true;
}

export function fitBaseImageToCanvas() {
  if (!state.baseImage || !state.width || !state.height) return;
  const fitScale = Math.min(
    state.width / state.baseImage.width,
    state.height / state.baseImage.height
  );
  state.baseScale = clampBaseScale(fitScale);
  recenterBaseImage();
  updateBaseScaleControls();
}

export function clearBaseImage() {
  state.baseImage = null;
  state.baseImageName = null;
  state.baseImageData = null;
  state.baseScale = 1;
  state.baseOffsetX = 0;
  state.baseOffsetY = 0;
  state.baseEditing = false;
  if (elements.baseCtx) {
    elements.baseCtx.clearRect(0, 0, elements.baseCanvas.width, elements.baseCanvas.height);
  }
  updateStatusBase();
  syncBaseControlsAvailability();
  updateBaseEditButton();
  updateCanvasCursorState();
  applyBaseLayerPosition();
  disableBaseControls();
  syncFullscreenEditButton();
}

export function updateBaseImageDisplay() {
  if (!elements.baseCtx) return;
  elements.baseCtx.clearRect(0, 0, elements.baseCanvas.width, elements.baseCanvas.height);
  if (!state.baseImage || !state.width || !state.height) {
    state.baseImageData = null;
    updateBaseEditButton();
    return;
  }
  const drawWidthCells = state.baseImage.width * state.baseScale;
  const drawHeightCells = state.baseImage.height * state.baseScale;
  const offsetXCells = state.baseOffsetX;
  const offsetYCells = state.baseOffsetY;
  const drawWidthPx = drawWidthCells * state.cellSize;
  const drawHeightPx = drawHeightCells * state.cellSize;
  const originX = state.axisPadding.left;
  const originY = state.axisPadding.top;
  const offsetXPx = originX + offsetXCells * state.cellSize;
  const offsetYPx = originY + offsetYCells * state.cellSize;
  elements.baseCtx.save();
  elements.baseCtx.imageSmoothingEnabled = true;
  elements.baseCtx.drawImage(
    state.baseImage,
    0,
    0,
    state.baseImage.width,
    state.baseImage.height,
    offsetXPx,
    offsetYPx,
    drawWidthPx,
    drawHeightPx
  );
  elements.baseCtx.restore();

  hiddenBaseCanvas.width = state.width;
  hiddenBaseCanvas.height = state.height;
  hiddenBaseCtx.clearRect(0, 0, hiddenBaseCanvas.width, hiddenBaseCanvas.height);
  hiddenBaseCtx.imageSmoothingEnabled = true;
  hiddenBaseCtx.drawImage(
    state.baseImage,
    0,
    0,
    state.baseImage.width,
    state.baseImage.height,
    offsetXCells,
    offsetYCells,
    drawWidthCells,
    drawHeightCells
  );
  state.baseImageData = hiddenBaseCtx.getImageData(
    0,
    0,
    hiddenBaseCanvas.width,
    hiddenBaseCanvas.height
  );
  updateBaseEditButton();
}

export function handleBaseImageChange(ev) {
  const file = ev.target.files && ev.target.files[0];
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
      syncFullscreenEditButton();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

export function toggleBaseEditMode(force) {
  if (!state.baseImage) return;
  if (typeof force === 'boolean') {
    state.baseEditing = force;
  } else {
    state.baseEditing = !state.baseEditing;
  }
  updateBaseEditButton();
  updateCanvasCursorState();
}

export function updateBaseEditButton() {
  if (!elements.toggleBaseEditBtn) return;
  const percent = Math.round(clampBaseScale(state.baseScale) * 100) || 100;
  const label = state.baseEditing
    ? `${TEXT_EXIT_EDIT} (${percent}%)`
    : `${TEXT_ENTER_EDIT} (${percent}%)`;
  elements.toggleBaseEditBtn.textContent = label;
  elements.toggleBaseEditBtn.setAttribute('aria-pressed', state.baseEditing ? 'true' : 'false');
  elements.toggleBaseEditBtn.disabled = !state.baseImage;
  if (fullscreenBaseEditBtn) {
    const fullscreenLabel = state.baseEditing ? TEXT_EXIT_EDIT : TEXT_ENTER_EDIT;
    fullscreenBaseEditBtn.textContent = fullscreenLabel;
    fullscreenBaseEditBtn.setAttribute('aria-pressed', state.baseEditing ? 'true' : 'false');
    fullscreenBaseEditBtn.classList.toggle('is-editing', state.baseEditing);
  }
  updateBaseScaleControls();
  syncFullscreenEditButton();
}

export function updateCanvasCursorState() {
  if (!elements.canvas) return;
  elements.canvas.classList.toggle('base-edit-mode', state.baseEditing);
  elements.canvas.classList.toggle(
    'bucket-tool',
    state.currentTool === 'bucket' && !state.baseEditing
  );
  if (!state.baseEditing) {
    elements.canvas.classList.remove('is-base-dragging');
  }
}

export function syncBaseControlsAvailability() {
  const hasBase = Boolean(state.baseImage);
  if (elements.baseLayerSelect) {
    elements.baseLayerSelect.disabled = !hasBase;
  }
  if (elements.toggleBaseEditBtn) {
    elements.toggleBaseEditBtn.disabled = !hasBase;
  }
  if (elements.baseScaleRange) {
    elements.baseScaleRange.disabled = !hasBase;
  }
  if (!hasBase) {
    state.baseLayerPosition = 'under';
    if (elements.baseLayerSelect) {
      elements.baseLayerSelect.value = 'under';
    }
    state.baseEditing = false;
  }
  updateBaseEditButton();
  updateCanvasCursorState();
  if (hasBase) {
    enableBaseControls();
  } else {
    disableBaseControls();
  }
  syncFullscreenEditButton();
}

export function applyBaseLayerPosition() {
  if (!elements.baseCanvas || !elements.canvas) return;
  const visible = Boolean(state.baseImage) && state.baseLayerPosition !== 'hidden';
  elements.baseCanvas.style.display = visible ? 'block' : 'none';
  if (!visible) {
    if (state.baseEditing) {
      state.baseEditing = false;
      updateBaseEditButton();
    }
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
  if (!state.baseImageName && elements.statusBase) {
    elements.statusBase.textContent = TEXT_BASE_NOT_LOADED;
  }
  initializeBaseAnchorButton();
  syncFullscreenEditButton();
}

export function recenterBaseImage() {
  if (!state.baseImage || !state.width || !state.height) return;
  const drawWidthCells = state.baseImage.width * state.baseScale;
  const drawHeightCells = state.baseImage.height * state.baseScale;
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

export function snapBaseToCanvas() {
  cycleBaseAnchor();
}

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
