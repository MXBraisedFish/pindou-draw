import { state } from './state.js';

let cachedHistoryIndex = null;
let cachedColors = [];

export function getUsedColors() {
  const revision = state.historyIndex;
  if (cachedHistoryIndex === revision && cachedColors) {
    return cachedColors;
  }

  if (!state.width || !state.height) {
    cachedHistoryIndex = revision;
    cachedColors = [];
    return cachedColors;
  }

  const usage = new Map();
  for (let y = 0; y < state.height; y += 1) {
    const row = state.grid[y];
    if (!row) continue;
    for (let x = 0; x < state.width; x += 1) {
      const cell = row[x];
      if (!cell) continue;
      if (!usage.has(cell.code)) {
        usage.set(cell.code, {
          code: cell.code,
          color: cell.color,
          rgb: cell.rgb,
          count: 0
        });
      }
      usage.get(cell.code).count += 1;
    }
  }

  const colors = Array.from(usage.values());
  colors.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-u-nu-latn', { numeric: true }));

  cachedHistoryIndex = revision;
  cachedColors = colors;
  return cachedColors;
}

export function resetUsedColorsCache() {
  cachedHistoryIndex = null;
  cachedColors = [];
}

if (typeof document !== 'undefined') {
  document.addEventListener('grid:updated', () => {
    resetUsedColorsCache();
  });
}
