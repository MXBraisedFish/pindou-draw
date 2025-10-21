import { state } from './state.js';
import {
  createCanvas,
  isCanvasDirty,
  redrawCanvas,
  validateCanvasSize
} from './canvas.js';
import { applyPalette, updateCurrentColorInfo } from './palette.js';

const PROJECT_VERSION = 1;

export function exportProject() {
  if (!state.width || !state.height) {
    window.alert('请先创建画布后再导出。');
    return;
  }
  const payload = buildProjectPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeLabel = (state.currentPaletteLabel || 'palette').replace(/[\\/:*?"<>|]+/g, '-');
  link.download = `pixel-${state.width}x${state.height}-${safeLabel}.pd`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const payload = normalizeProjectPayload(raw);
    if (!payload) {
      window.alert('PD 文件内容无效或已损坏。');
      return;
    }
    if (!validateCanvasSize(payload.canvas.width, payload.canvas.height)) {
      window.alert('PD 文件中的画布尺寸超出限制。');
      return;
    }
    if (isCanvasDirty()) {
      const confirmed = window.confirm('导入 PD 文件会覆盖当前画布内容，是否继续？');
      if (!confirmed) return;
    }
    applyProjectPayload(payload);
    window.alert('PD 文件导入完成。');
  } catch (error) {
    console.error('Failed to import PD file', error);
    window.alert('无法导入 PD 文件，请确认文件格式正确。');
  }
}

function buildProjectPayload() {
  return {
    version: PROJECT_VERSION,
    createdAt: new Date().toISOString(),
    canvas: {
      width: state.width,
      height: state.height
    },
    palette: {
      id: state.currentPaletteId || null,
      label: state.currentPaletteLabel || '自定义',
      entries: state.paletteKeys
        .map((code) => {
          const entry = state.palette[code];
          if (!entry) return null;
          return { code: entry.code, color: entry.color };
        })
        .filter(Boolean)
    },
    grid: state.grid.map((row) =>
      row.map((cell) => (cell && cell.code ? cell.code : null))
    )
  };
}

function normalizeProjectPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const canvas = raw.canvas || {};
  const width = Number(canvas.width);
  const height = Number(canvas.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  const paletteEntries = Array.isArray(raw.palette?.entries) ? raw.palette.entries : [];
  const normalizedEntries = paletteEntries
    .map((entry) => {
      if (!entry || typeof entry.code !== 'string' || typeof entry.color !== 'string') {
        return null;
      }
      const code = entry.code.trim();
      const color = entry.color.trim();
      if (!code || !color) return null;
      return { code, color };
    })
    .filter(Boolean);

  const rawGrid = Array.isArray(raw.grid) ? raw.grid : [];
  const sanitizedGrid = [];
  for (let y = 0; y < height; y += 1) {
    const row = Array.isArray(rawGrid[y]) ? rawGrid[y] : [];
    const sanitizedRow = [];
    for (let x = 0; x < width; x += 1) {
      const value = row[x];
      sanitizedRow.push(typeof value === 'string' && value.trim() ? value.trim() : null);
    }
    sanitizedGrid.push(sanitizedRow);
  }

  return {
    version: Number(raw.version) || PROJECT_VERSION,
    canvas: { width, height },
    palette: {
      id: typeof raw.palette?.id === 'string' ? raw.palette.id : null,
      label:
        typeof raw.palette?.label === 'string' && raw.palette.label.trim()
          ? raw.palette.label.trim()
          : '导入色卡',
      entries: normalizedEntries
    },
    grid: sanitizedGrid
  };
}

function applyProjectPayload(payload) {
  const paletteMap = {};
  payload.palette.entries.forEach((entry) => {
    paletteMap[entry.code] = entry.color;
  });
  if (!Object.keys(paletteMap).length) {
    window.alert('PD 文件内的色卡为空，无法导入。');
    return;
  }
  applyPalette(paletteMap, payload.palette.label || '导入色卡', {
    libraryId: payload.palette.id && state.paletteLibrary.has(payload.palette.id)
      ? payload.palette.id
      : null,
    persistSelection: false
  });
  createCanvas(payload.canvas.width, payload.canvas.height);

  const missingCodes = new Set();
  for (let y = 0; y < payload.canvas.height; y += 1) {
    for (let x = 0; x < payload.canvas.width; x += 1) {
      const code = payload.grid[y]?.[x] ?? null;
      if (!code) {
        state.grid[y][x] = null;
        continue;
      }
      const paletteEntry = state.palette[code];
      if (paletteEntry) {
        state.grid[y][x] = paletteEntry;
      } else {
        state.grid[y][x] = null;
        missingCodes.add(code);
      }
    }
  }
  redrawCanvas();
  updateCurrentColorInfo();
  if (missingCodes.size) {
    window.alert(`部分色号在当前色卡中缺失，已自动忽略：${Array.from(missingCodes).join(', ')}`);
  }
}
