import { state } from './state.js';

const DEFAULT_MODE = 'none';
const SYMMETRY_MODE_TRANSFORMS = {
  none: [],
  center: [mirrorCenter],
  vertical: [mirrorVertical],
  horizontal: [mirrorHorizontal],
  'diagonal-45': [mirrorDiagonalPositive],
  'diagonal-135': [mirrorDiagonalNegative],
  cross: [mirrorVertical, mirrorHorizontal],
  'diagonal-cross': [mirrorDiagonalPositive, mirrorDiagonalNegative],
  octagonal: [mirrorVertical, mirrorHorizontal, mirrorDiagonalPositive, mirrorDiagonalNegative]
};

export function getSymmetryMode() {
  const mode = typeof state.symmetryMode === 'string' ? state.symmetryMode : DEFAULT_MODE;
  return SYMMETRY_MODE_TRANSFORMS[mode] ? mode : DEFAULT_MODE;
}

export function setSymmetryMode(mode) {
  const normalized = normalizeMode(mode);
  if (getSymmetryMode() === normalized) return;
  state.symmetryMode = normalized;
  dispatchSymmetryChange(normalized);
}

export function toggleSymmetryMode(mode) {
  const normalized = normalizeMode(mode);
  const current = getSymmetryMode();
  if (current === normalized && current !== DEFAULT_MODE) {
    state.symmetryMode = DEFAULT_MODE;
    dispatchSymmetryChange(DEFAULT_MODE);
    return;
  }
  setSymmetryMode(normalized);
}

export function computeSymmetryTargets(x, y, mode = getSymmetryMode()) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
  if (!state.width || !state.height) return [];
  const width = state.width;
  const height = state.height;
  const transforms = SYMMETRY_MODE_TRANSFORMS[normalizeMode(mode)] ?? [];
  const seen = new Map();
  const queue = [{ x, y }];

  while (queue.length) {
    const point = queue.pop();
    if (!isWithinBounds(point.x, point.y, width, height)) continue;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.set(key, point);
    for (const transform of transforms) {
      const mirrored = transform(point.x, point.y, width, height);
      if (!mirrored) continue;
      const nextKey = `${mirrored.x},${mirrored.y}`;
      if (!seen.has(nextKey)) queue.push(mirrored);
    }
  }

  return seen.size ? Array.from(seen.values()) : [{ x, y }];
}

function normalizeMode(mode) {
  const value = typeof mode === 'string' ? mode : DEFAULT_MODE;
  return SYMMETRY_MODE_TRANSFORMS[value] ? value : DEFAULT_MODE;
}

function mirrorVertical(x, y, width) {
  return { x: clampCoord(width - 1 - x, width), y };
}

function mirrorHorizontal(x, y, _width, height) {
  return { x, y: clampCoord(height - 1 - y, height) };
}

function mirrorCenter(x, y, width, height) {
  return {
    x: clampCoord(width - 1 - x, width),
    y: clampCoord(height - 1 - y, height)
  };
}

function mirrorDiagonalPositive(x, y, width, height) {
  const denomX = Math.max(1, width - 1);
  const denomY = Math.max(1, height - 1);
  const nx = denomX ? x / denomX : 0;
  const ny = denomY ? y / denomY : 0;
  const mirroredX = Math.round(ny * denomX);
  const mirroredY = Math.round(nx * denomY);
  return {
    x: clampCoord(mirroredX, width),
    y: clampCoord(mirroredY, height)
  };
}

function mirrorDiagonalNegative(x, y, width, height) {
  const denomX = Math.max(1, width - 1);
  const denomY = Math.max(1, height - 1);
  const nx = denomX ? x / denomX : 0;
  const ny = denomY ? y / denomY : 0;
  const mirroredX = Math.round((1 - ny) * denomX);
  const mirroredY = Math.round((1 - nx) * denomY);
  return {
    x: clampCoord(mirroredX, width),
    y: clampCoord(mirroredY, height)
  };
}

function clampCoord(value, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, value), Math.max(0, max - 1));
}

function isWithinBounds(x, y, width, height) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function dispatchSymmetryChange(mode) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('symmetry:change', { detail: { mode } }));
}

