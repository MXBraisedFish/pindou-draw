// web/js/selection.js
import { state } from './state.js';
import { renderSelectionLayers } from './selection-layer.js';

const createEmptyMask = (width, height) =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => false));

export function resetSelection({ suppressRender = false } = {}) {
  state.selection = {
    active: false,
    mask: null,
    bounds: null,
    preview: null
  };
  if (!suppressRender) renderSelectionLayers();
}

export function ensureSelectionMask(width = state.width, height = state.height) {
  if (!state.selection.mask || state.selection.mask.length !== height || state.selection.mask[0]?.length !== width) {
    state.selection.mask = createEmptyMask(width, height);
  }
  return state.selection.mask;
}

export function setSelectionRect(x1, y1, x2, y2) {
  applyRectToMask(x1, y1, x2, y2, 'replace');
}

export function addSelectionRect(x1, y1, x2, y2) {
  applyRectToMask(x1, y1, x2, y2, 'add');
}

export function subtractSelectionRect(x1, y1, x2, y2) {
  applyRectToMask(x1, y1, x2, y2, 'subtract');
}

export function invertSelection() {
  if (!state.width || !state.height) return;
  const mask = ensureSelectionMask();
  let hasSelection = false;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      mask[y][x] = !mask[y][x];
      hasSelection = hasSelection || mask[y][x];
    }
  }

  state.selection.active = hasSelection;
  state.selection.bounds = hasSelection ? computeBounds(mask) : null;
  renderSelectionLayers();
}

export function clearSelection() {
  if (!state.selection.mask) return resetSelection();
  for (let y = 0; y < state.height; y++) {
    state.selection.mask[y]?.fill(false);
  }
  state.selection.active = false;
  state.selection.bounds = null;
  renderSelectionLayers();
}

export function shiftSelectionMask(dx, dy) {
  if (!state.selection.mask || (!dx && !dy)) return;
  const mask = ensureSelectionMask();
  const newMask = createEmptyMask(state.width, state.height);
  let hasSelection = false;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!mask[y][x]) continue;
      const targetX = x + dx;
      const targetY = y + dy;
      if (targetX < 0 || targetX >= state.width || targetY < 0 || targetY >= state.height) continue;
      newMask[targetY][targetX] = true;
      hasSelection = true;
    }
  }

  state.selection.mask = newMask;
  state.selection.active = hasSelection;
  state.selection.bounds = hasSelection ? computeBounds(newMask) : null;
  renderSelectionLayers();
}

export function isCellSelected(x, y) {
  return Boolean(
    state.selection.active &&
    state.selection.mask &&
    state.selection.mask[y]?.[x]
  );
}

export function forEachSelectedCell(callback) {
  if (!state.selection.active || !state.selection.mask) return;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.selection.mask[y]?.[x]) callback(x, y);
    }
  }
}

export function cloneSelectionState() {
  const selection = state.selection;
  if (!selection || !selection.mask) {
    return { active: false, bounds: null, mask: null };
  }

  const maskCopy = selection.mask.map(row => row ? [...row] : null);

  return {
    active: Boolean(selection.active),
    bounds: selection.bounds ? { ...selection.bounds } : null,
    mask: maskCopy
  };
}

export function restoreSelectionState(snapshot, { suppressRender = false } = {}) {
  if (!snapshot || !snapshot.active || !snapshot.mask) {
    resetSelection({ suppressRender: true });
    if (!suppressRender) renderSelectionLayers();
    return;
  }

  const width = state.width;
  const height = state.height;
  const mask = createEmptyMask(width, height);

  for (let y = 0; y < height; y++) {
    const sourceRow = snapshot.mask[y] || [];
    for (let x = 0; x < width; x++) {
      mask[y][x] = Boolean(sourceRow[x]);
    }
  }

  state.selection.active = true;
  state.selection.mask = mask;
  state.selection.bounds = snapshot.bounds
    ? { ...snapshot.bounds }
    : computeBounds(mask);
  state.selection.preview = null;

  if (!state.selection.bounds) state.selection.active = false;

  if (!suppressRender) renderSelectionLayers();
}

function applyRectToMask(x1, y1, x2, y2, mode) {
  if (!state.width || !state.height) return;

  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(state.width - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(state.height - 1, Math.max(y1, y2));

  if (minX > maxX || minY > maxY) return;

  const mask = ensureSelectionMask();
  if (mode === 'replace') {
    for (let y = 0; y < state.height; y++) {
      mask[y]?.fill(false);
    }
  }

  const setValue = mode !== 'subtract';
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      mask[y][x] = setValue;
    }
  }

  updateSelectionMetadata();
  renderSelectionLayers();
}

function updateSelectionMetadata() {
  if (!state.selection.mask) {
    state.selection.active = false;
    state.selection.bounds = null;
    return;
  }

  const bounds = computeBounds(state.selection.mask);
  state.selection.active = Boolean(bounds);
  state.selection.bounds = bounds;
}

function computeBounds(mask) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = 0; y < mask.length; y++) {
    const row = mask[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (minX === Infinity) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}
