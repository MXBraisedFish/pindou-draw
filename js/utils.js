import { AXIS_STYLE, BASE_SCALE_LIMITS, SIZE_LIMITS } from './constants.js';
export function computeAxisPadding(cellSize, widthCells, heightCells) {
  const fontSize = Math.max(AXIS_STYLE.minFont, Math.floor(cellSize * 0.35));
  const tickLength = Math.max(AXIS_STYLE.minTick, Math.floor(fontSize * 0.5));
  const gap = Math.max(AXIS_STYLE.minGap, Math.floor(fontSize * 0.4));
  const approxCharWidth = Math.max(6, Math.floor(fontSize * 0.6));

  const maxDigitsX = Math.max(1, String(widthCells).length);
  const maxDigitsY = Math.max(1, String(heightCells).length);

  const verticalPadding = Math.round(tickLength + gap + fontSize + fontSize * 0.5);
  const horizontalPaddingY = Math.round(tickLength + gap + maxDigitsY * approxCharWidth + fontSize * 0.5);
  const horizontalPaddingX = Math.round(tickLength + gap + maxDigitsX * approxCharWidth + fontSize * 0.5);

  return {
    top: Math.max(verticalPadding, Math.round(cellSize * 0.8)),
    bottom: Math.max(verticalPadding, Math.round(cellSize * 0.8)),
    left: Math.max(horizontalPaddingY, Math.round(cellSize * 1.2)),
    right: Math.max(horizontalPaddingX, Math.round(cellSize * 1.2))
  };
}
export function clampCellSize(size) {
  return Math.max(SIZE_LIMITS.minCell, Math.min(SIZE_LIMITS.maxCell, Math.round(size)));
}
export function clampBaseScale(scale) {
  return Math.max(BASE_SCALE_LIMITS.min, Math.min(BASE_SCALE_LIMITS.max, scale));
}
export function clampAlpha(alpha) {
  return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
}
export function parseColor(value) {
  if (typeof value === 'string') {
    const rgbMatch = value.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgbMatch) return {
      r: clampChannel(Number(rgbMatch[1])),
      g: clampChannel(Number(rgbMatch[2])),
      b: clampChannel(Number(rgbMatch[3]))
    };
    const hexMatch = value.trim().match(/^#?([0-9a-f]{6})$/i);
    if (hexMatch) {
      const num = parseInt(hexMatch[1], 16);
      return {
        r: clampChannel((num >> 16) & 0xff),
        g: clampChannel((num >> 8) & 0xff),
        b: clampChannel(num & 0xff)
      };
    }
    return null;
  }
  if (Array.isArray(value) && value.length >= 3) return {
    r: clampChannel(Number(value[0])),
    g: clampChannel(Number(value[1])),
    b: clampChannel(Number(value[2]))
  };
  if (value && typeof value === 'object') {
    const r = channelFromObject(value, ['r', 'red', 'R']);
    const g = channelFromObject(value, ['g', 'green', 'G']);
    const b = channelFromObject(value, ['b', 'blue', 'B']);

    if ([r, g, b].every(channel => channel !== null)) return {
      r: clampChannel(r), g: clampChannel(g), b: clampChannel(b)
    };
  }

  return null;
}
export function channelFromObject(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const num = Number(obj[key]);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}
export function clampChannel(channel) {
  return Number.isFinite(channel) ? Math.max(0, Math.min(255, Math.round(channel))) : 0;
}
export function pickTextColor({ r, g, b }) {
  const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return lum > 0.55 ? '#1f1f1f' : '#ffffff';
}
export function cellsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.code === b.code;
}
export function hasLocalStorage() {
  try {
    const testKey = '__pixel-palette-test';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}