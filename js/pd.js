import { state } from './state.js';
import {
  createCanvas,
  isCanvasDirty,
  redrawCanvas,
  resizeCanvas,
  saveHistory,
  validateCanvasSize
} from './canvas.js';
import { applyPalette, ensurePaletteInLibraryFromPd, updateCurrentColorInfo } from './palette.js';
import { resetSelection } from './selection.js';
import { parseColor, rgbToLab, deltaELab } from './utils.js';
import { TEXT } from './language.js';
import { elements } from './elements.js';
import { requestProjectImportDecision } from './project-import-dialog.js';

const PROJECT_VERSION = 2;
const EXTEND_DIRECTIONS = ['top', 'right', 'bottom', 'left'];

export function exportProject() {
  if (!state.width || !state.height) {
    window.alert('请先创建画布后再导出。');
    return;
  }

  const payload = buildProjectPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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

  let payload;
  try {
    const text = await file.text();
    payload = normalizeProjectPayload(JSON.parse(text));
  } catch (error) {
    console.error('Failed to parse PD file', error);
    window.alert('PD 文件解析失败，请确认文件格式。');
    return;
  }

  if (!payload) {
    window.alert('PD 文件内容为空或格式不正确。');
    return;
  }

  if (!validateCanvasSize(payload.canvas.width, payload.canvas.height)) {
    window.alert('PD 文件中的画布尺寸超出限制。');
    return;
  }

  const ensureResult = ensurePaletteInLibraryFromPd(payload.palette);
  if (ensureResult?.id) {
    payload.palette.id = ensureResult.id;
  }

  const paletteInfo = buildPaletteInfo(payload);
  const extendOptions = buildExtendOptions(payload);

  const decision = await requestProjectImportDecision({
    fileName: file.name || '未命名项目.pd',
    importSize: { width: payload.canvas.width, height: payload.canvas.height },
    palette: paletteInfo,
    extend: extendOptions,
    defaultMode: 'new',
    defaultPaletteStrategy: paletteInfo.hasFilePalette && paletteInfo.hasLibraryMatch ? 'pd' : 'current',
    defaultDirection: extendOptions.defaultDirection
  });

  if (!decision) return;

  const effectivePaletteStrategy = paletteInfo.hasFilePalette ? decision.paletteStrategy : 'current';

  if (decision.mode === 'new') {
    if (isCanvasDirty() && !window.confirm('导入新的 .pd 项目会覆盖当前画布，确定继续吗？')) {
      return;
    }
    const label = paletteInfo.label || TEXT.importer.defaultPaletteLabel;
    if (effectivePaletteStrategy === 'pd' && paletteInfo.hasFilePalette) {
      if (!window.confirm(TEXT.importer.pdApplyConfirm(label))) {
        return;
      }
      applyProjectPayload(payload);
      window.alert(TEXT.importer.pdPaletteApplied(label));
      return;
    }
    if (!window.confirm(TEXT.importer.pdConvertConfirm)) {
      return;
    }
    const success = applyProjectWithCurrentPalette(payload);
    if (success) {
      window.alert(TEXT.importer.pdConvertedNotice(label));
    }
    return;
  }

  if (decision.mode === 'extend') {
    if (paletteInfo.hasFilePalette) {
      const shouldUsePdPalette = ensureResult?.created
        ? true
        : window.confirm('检测到 .pd 文件包含色卡。\n\n确定：使用 .pd 文件色卡后再扩展（会将当前画布颜色转换到该色卡）。\n取消：使用当前色卡直接扩展（.pd 内容会转换到当前色卡）。');
      if (shouldUsePdPalette && ensureResult?.id) {
        const entry = state.paletteLibrary.get(ensureResult.id);
        if (entry?.data) {
          applyPalette(entry.data, entry.name, { libraryId: ensureResult.id, persistSelection: true, convertCanvas: true });
        }
      }
    }
    const success = extendCanvasWithPayload(payload, decision.extendDirection);
    if (success) {
      window.alert('.pd 内容已扩展到当前画布。');
    }
  }
}

function buildProjectPayload() {
  const sourceCreatedAt = state.createdAt instanceof Date
    ? state.createdAt
    : (state.createdAt ? new Date(state.createdAt) : null);
  const createdAt = sourceCreatedAt && !Number.isNaN(sourceCreatedAt.getTime())
    ? sourceCreatedAt.toISOString()
    : new Date().toISOString();
  return {
    version: PROJECT_VERSION,
    createdAt,
    canvas: {
      width: state.width,
      height: state.height,
      pixelRatio: state.pixelRatio,
      cellSize: state.cellSize
    },
    palette: {
      id: state.currentPaletteId || null,
      label: state.currentPaletteLabel || '当前色卡',
      entries: state.paletteKeys
        .map((code) => {
          const entry = state.palette[code];
          if (!entry) return null;
          return {
            code: entry.code,
            type: entry.type,
            color: entry.color,
            color1: entry.color1 ?? entry.color,
            color2: entry.color2 ?? null
          };
        })
        .filter(Boolean)
    },
    grid: state.grid.map((row) => row.map((cell) => cell?.code || null))
  };
}

function normalizeProjectPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const canvas = raw.canvas || {};
  const width = Number(canvas.width);
  const height = Number(canvas.height);
  const pixelRatio = Number(canvas.pixelRatio);
  const cellSize = Number(canvas.cellSize);

  const normalizedPixelRatio =
    Number.isFinite(pixelRatio) && pixelRatio > 0
      ? pixelRatio
      : Number.isFinite(cellSize) && cellSize > 0
        ? cellSize
        : null;

  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;

  const paletteEntries = Array.isArray(raw.palette?.entries) ? raw.palette.entries : [];
  const normalizedEntries = paletteEntries
    .map((entry) => {
      if (!entry || typeof entry.code !== 'string') return null;
      const code = entry.code.trim();
      const primary = typeof entry.color1 === 'string' && entry.color1.trim()
        ? entry.color1.trim()
        : (typeof entry.color === 'string' ? entry.color.trim() : '');
      if (!code || !primary) return null;
      const secondary = typeof entry.color2 === 'string' && entry.color2.trim() ? entry.color2.trim() : '';
      const type = typeof entry.type === 'string' ? entry.type : null;
      return { code, color: primary, color1: primary, color2: secondary, type };
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

  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim()
    ? raw.createdAt.trim()
    : null;

  return {
    version: Number(raw.version) || PROJECT_VERSION,
    canvas: {
      width,
      height,
      pixelRatio: normalizedPixelRatio
    },
    palette: {
      id: typeof raw.palette?.id === 'string' ? raw.palette.id : null,
      label:
        typeof raw.palette?.label === 'string' && raw.palette.label.trim()
          ? raw.palette.label.trim()
          : '导入色卡',
      entries: normalizedEntries
    },
    grid: sanitizedGrid,
    createdAt
  };
}

function applyProjectPayload(payload) {
  const paletteEntries = Array.isArray(payload.palette.entries) ? payload.palette.entries : [];
  const paletteMap = {};

  paletteEntries.forEach((entry) => {
    if (!entry || typeof entry.code !== 'string') return;
    const code = entry.code;
    const primary = entry.color1 || entry.color;
    if (!primary) return;
    const mapped = {
      num: code,
      type: entry.type,
      color1: primary,
      color: entry.color || primary
    };
    if (entry.color2) {
      mapped.color2 = entry.color2;
    }
    paletteMap[code] = mapped;
  });

  if (!Object.keys(paletteMap).length) {
    window.alert('PD 文件中未包含有效的色卡数据。');
    return;
  }

  applyPalette(
    paletteMap,
    payload.palette.label || '导入色卡',
    {
      libraryId:
        payload.palette.id && state.paletteLibrary.has(payload.palette.id)
          ? payload.palette.id
          : null,
      persistSelection: false
    }
  );

  const cellSize = Number(payload.canvas.pixelRatio);
  const creationOptions = { createdAt: payload.createdAt };
  if (Number.isFinite(cellSize) && cellSize > 0) {
    creationOptions.cellSize = cellSize;
  }
  createCanvas(payload.canvas.width, payload.canvas.height, creationOptions);

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

    redrawCanvas();
    updateCurrentColorInfo();

    if (missingCodes.size) {
      window.alert(`以下色号在当前色卡中不存在：${Array.from(missingCodes).join(', ')}`);
    }
  }
}
function applyProjectWithCurrentPalette(payload) {
  const resolver = createPaletteResolver(payload.palette.entries);
  if (!resolver) {
    window.alert('当前色卡无法匹配 PD 文件中的色卡，请检查配置。');
    return false;
  }

  const cellSize = Number(payload.canvas.pixelRatio);
  const creationOptions = { createdAt: payload.createdAt };
  if (Number.isFinite(cellSize) && cellSize > 0) {
    creationOptions.cellSize = cellSize;
  }
  createCanvas(payload.canvas.width, payload.canvas.height, creationOptions);

  copyGridWithResolver({
    targetGrid: state.grid,
    sourceGrid: payload.grid,
    offsetX: 0,
    offsetY: 0,
    resolver: resolver.resolve
  });

  redrawCanvas();
  updateCurrentColorInfo();

  if (resolver.missing.size) {
    window.alert(`以下颜色无法匹配当前色卡：${Array.from(resolver.missing).join(', ')}`);
  }
  return true;
}

export function remapCanvasToPaletteEntries(targetEntries = [], options = {}) {
  const overrideSource = Array.isArray(options.sourceEntries) ? options.sourceEntries : null;
  if (!state.width || !state.height || !targetEntries.length) {
    return { changed: 0, missing: [] };
  }
  const sourceEntries = overrideSource && overrideSource.length
    ? overrideSource
    : state.paletteKeys.map((code) => state.palette[code]).filter(Boolean);
  if (!sourceEntries.length) {
    return { changed: 0, missing: [] };
  }
  const resolver = createPaletteResolver(sourceEntries, { targetEntries });
  if (!resolver) {
    return { changed: 0, missing: [] };
  }
  let changed = 0;
  const missing = new Set();
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y]?.[x];
      if (!cell) continue;
      const resolved = resolver.resolve(cell.code ?? cell.num ?? '');
      if (resolved) {
        if (resolved !== cell) {
          changed += 1;
          state.grid[y][x] = resolved;
        }
      } else {
        const code = cell.code ?? cell.num ?? '';
        if (code) missing.add(code);
      }
    }
  }
  return { changed, missing: Array.from(missing) };
}

function extendCanvasWithPayload(payload, direction) {
  if (!state.width || !state.height) {
    window.alert('请先创建画布后再扩展。');
    return false;
  }

  const plan = computeExtendPlan(direction, payload);
  if (!plan) {
    window.alert('无法根据所选方向扩展画布。');
    return false;
  }

  if (!validateCanvasSize(plan.width, plan.height)) {
    window.alert('拓展后的画布尺寸超出 1024 限制。');
    return false;
  }

  const targetGrid = Array.from({ length: plan.height }, () => Array.from({ length: plan.width }, () => null));

  
  copyGrid({
    sourceGrid: state.grid,
    targetGrid,
    offsetX: plan.currentOffsetX,
    offsetY: plan.currentOffsetY
  });

  const samePalette = isPayloadPaletteSameAsCurrent(payload);
  let resolver = null;
  if (!samePalette) {
    resolver = createPaletteResolver(payload.palette.entries);
    if (!resolver) {
      window.alert('当前色卡无法匹配 PD 文件中的色卡，请检查配置。');
      return false;
    }
  }

  copyGridWithResolver({
    sourceGrid: payload.grid,
    targetGrid,
    offsetX: plan.importOffsetX,
    offsetY: plan.importOffsetY,
    resolver: samePalette
      ? (code) => state.palette[code] || null
      : resolver.resolve
  });

  state.grid = targetGrid;
  state.width = plan.width;
  state.height = plan.height;
  if (direction === 'top') state.baseOffsetY += payload.canvas.height;
  if (direction === 'left') state.baseOffsetX += payload.canvas.width;

  resetSelection({ suppressRender: true });
  resizeCanvas();
  redrawCanvas();
  updateCurrentColorInfo();
  updateStatusSizeLabel();
  saveHistory();

  if (resolver?.missing?.size) {
    window.alert(`以下颜色无法匹配当前色卡：${Array.from(resolver.missing).join(', ')}`);
  }
  return true;
}
function copyGrid({ sourceGrid, targetGrid, offsetX, offsetY }) {
  for (let y = 0; y < sourceGrid.length; y += 1) {
    for (let x = 0; x < sourceGrid[y].length; x += 1) {
      const targetY = y + offsetY;
      const targetX = x + offsetX;
      if (!targetGrid[targetY] || targetX < 0 || targetX >= targetGrid[targetY].length) continue;
      targetGrid[targetY][targetX] = sourceGrid[y][x];
    }
  }
}

function copyGridWithResolver({ sourceGrid, targetGrid, offsetX, offsetY, resolver }) {
  for (let y = 0; y < sourceGrid.length; y += 1) {
    for (let x = 0; x < sourceGrid[y].length; x += 1) {
      const code = sourceGrid[y][x];
      if (!code) continue;
      const entry = resolver(code);
      const targetY = y + offsetY;
      const targetX = x + offsetX;
      if (!entry || !targetGrid[targetY] || targetX < 0 || targetX >= targetGrid[targetY].length) continue;
      targetGrid[targetY][targetX] = entry;
    }
  }
}

function buildPaletteInfo(payload) {
  const hasEntries = Array.isArray(payload.palette.entries) && payload.palette.entries.length > 0;
  const sameAsCurrent = hasEntries && isPayloadPaletteSameAsCurrent(payload);
  const hasLibraryMatch = Boolean(payload.palette.id && state.paletteLibrary.has(payload.palette.id));
  return {
    hasFilePalette: hasEntries,
    sameAsCurrent,
    hasLibraryMatch,
    label: payload.palette.label || '鏂囦欢鑹插崱'
  };
}

function isPayloadPaletteSameAsCurrent(payload) {
  const payloadEntries = Array.isArray(payload.palette.entries) ? payload.palette.entries : [];
  if (!payloadEntries.length) return false;
  if (!state.paletteKeys.length) return false;
  if (payload.palette.id && payload.palette.id === state.currentPaletteId) return true;
  if (payloadEntries.length !== state.paletteKeys.length) return false;
  return payloadEntries.every((entry) => {
    const current = state.palette[entry.code];
    if (!current) return false;
    const currentColor = (current.color1 || current.color || '').toLowerCase();
    const payloadColor = (entry.color1 || entry.color || '').toLowerCase();
    return currentColor === payloadColor;
  });
}

function buildExtendOptions(payload) {
  if (!state.width || !state.height) {
    return { available: false, directions: {}, defaultDirection: 'right' };
  }
  const directions = {};
  let available = false;
  let defaultDirection = 'right';
  for (const dir of EXTEND_DIRECTIONS) {
    const plan = computeExtendPlan(dir, payload);
    if (!plan) {
      directions[dir] = { valid: false, reason: '超出 1024 限制' };
      directions[dir] = { valid: false, reason: '无法计算扩展方案' };
    }
    const valid = validateCanvasSize(plan.width, plan.height);
    directions[dir] = valid
      ? { valid: true, width: plan.width, height: plan.height }
      : { valid: false, reason: '超出 1024 限制' };
    if (valid && !available) {
      available = true;
      defaultDirection = dir;
    }
  }
  return { available, directions, defaultDirection };
}

function computeExtendPlan(direction, payload) {
  const currentWidth = state.width;
  const currentHeight = state.height;
  const importWidth = payload.canvas.width;
  const importHeight = payload.canvas.height;
  if (!currentWidth || !currentHeight || !importWidth || !importHeight) return null;

  switch (direction) {
    case 'top': {
      const width = Math.max(currentWidth, importWidth);
      const height = currentHeight + importHeight;
      return {
        width,
        height,
        currentOffsetX: 0,
        currentOffsetY: importHeight,
        importOffsetX: 0,
        importOffsetY: 0
      };
    }
    case 'bottom': {
      const width = Math.max(currentWidth, importWidth);
      const height = currentHeight + importHeight;
      return {
        width,
        height,
        currentOffsetX: 0,
        currentOffsetY: 0,
        importOffsetX: 0,
        importOffsetY: currentHeight
      };
    }
    case 'left': {
      const width = currentWidth + importWidth;
      const height = Math.max(currentHeight, importHeight);
      return {
        width,
        height,
        currentOffsetX: importWidth,
        currentOffsetY: 0,
        importOffsetX: 0,
        importOffsetY: 0
      };
    }
    case 'right': {
      const width = currentWidth + importWidth;
      const height = Math.max(currentHeight, importHeight);
      return {
        width,
        height,
        currentOffsetX: 0,
        currentOffsetY: 0,
        importOffsetX: currentWidth,
        importOffsetY: 0
      };
    }
    default:
      return null;
  }
}

function createPaletteResolver(entries = [], options = {}) {
  const overrideTargetEntries = Array.isArray(options.targetEntries)
    ? options.targetEntries.filter(Boolean)
    : null;
  const targetEntries = overrideTargetEntries ?? state.paletteKeys.map((code) => state.palette[code]).filter(Boolean);
  if (!targetEntries.length) return null;
  const targetByCode = new Map(targetEntries.map((entry) => [entry.code, entry]));
  const sourceMap = new Map(entries.map((entry) => [entry.code, entry]));
  const targetWithLab = targetEntries.map((entry) => {
    const rgb = entry.rgb || parseColor(entry.color1 || entry.color || '');
    return { entry, lab: rgb ? rgbToLab(rgb) : null };
  });
  const cache = new Map();
  const missing = new Set();

  const resolve = (code) => {
    if (!code) return null;
    if (cache.has(code)) return cache.get(code);
    let result = targetByCode.get(code);
    if (!result) {
      const sourceEntry = sourceMap.get(code);
      const sourceRgb = sourceEntry
        ? resolveEntryRgb(sourceEntry) ?? parseColor(sourceEntry.color1 || sourceEntry.color || '')
        : null;
      result = sourceRgb ? findNearestEntry(sourceRgb, targetWithLab) : null;
    }
    cache.set(code, result || null);
    if (!result) missing.add(code);
    return result || null;
  };

  return { resolve, missing };
}

function findNearestEntry(rgb, targetList) {
  if (!rgb) return null;
  const sourceLab = rgbToLab(rgb);
  if (!sourceLab) return null;
  let nearest = null;
  let minDistance = Infinity;
  targetList.forEach((target) => {
    if (!target.lab) return;
    const dist = deltaELab(sourceLab, target.lab);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = target.entry;
    }
  });
  if (!nearest && targetList.length) {
    nearest = targetList[0].entry;
  }
  return nearest;
}


function updateStatusSizeLabel() {
  if (elements.statusSize && state.width && state.height) {
    elements.statusSize.textContent = `${state.width} × ${state.height}`;
  }
}
