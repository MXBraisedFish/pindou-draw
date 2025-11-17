import { STORAGE_KEYS } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { clampAlpha, parseColor, hasLocalStorage, rgbToLab, deltaELab } from './utils.js';
import { clearDrawingGrid, isCanvasDirty, redrawCanvas, saveHistory } from './canvas.js';
import { requestPaletteSwitchDecision } from './palette-switch-dialog.js';
const OUTPUT_BASE_PATH_CANDIDATES = ['../output', './output'];
const LEGACY_DEFAULT_FILES = ['DMC.json', 'Coco.json', 'MARD-24.json', 'MARD-48.json', 'MARD-72.json', 'MARD-96.json', 'MARD-120.json', 'MARD-144.json', 'MARD-221.json'];
const BUILTIN_NAME_SUFFIX = ' (默认)';
const COLOR_TYPE_LABELS = { normal: '普通', transparent: '透明', light: '光变', temperatrue: '温变', glow: '夜光', pearlescent: '珠光' };
const SPECIAL_COLOR_TYPES = new Set(['transparent', 'light', 'temperatrue', 'glow', 'pearlescent']);
const TRANSITION_COLOR_TYPES = new Set(['light', 'temperatrue']);
const paletteViewState = {
  activeTab: 'normal',
  specialFilter: 'all'
};
const PALETTE_LIBRARY_EVENT = 'palette-library-changed';
let defaultPaletteSourcesPromise = null;

function announcePaletteLibraryChange(detail = {}) {
  if (typeof document === 'undefined') return;
  try {
    document.dispatchEvent(new CustomEvent(PALETTE_LIBRARY_EVENT, { detail }));
  } catch {
    
  }
}
function ensureDefaultPaletteSources() {
  return defaultPaletteSourcesPromise || (defaultPaletteSourcesPromise = discoverDefaultPaletteSources());
}
function normalizeHexColor(color) {
  if (typeof color !== 'string') return null;
  let value = color.trim();
  if (!value) return null;
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value.split('').map((char) => char + char).join('');
  }
  if (value.length !== 6 || /[^0-9a-fA-F]/.test(value)) return null;
  return `#${value.toLowerCase()}`;
}
function hexToRgb(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;
  const value = normalized.slice(1);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}
async function discoverDefaultPaletteSources() {
  for (const basePath of OUTPUT_BASE_PATH_CANDIDATES) {
    const manifest = await fetchOutputManifest(basePath);
    if (manifest?.length) return manifestToSources(manifest, basePath);
    const listing = await fetchDirectoryListing(basePath);
    if (listing?.length) return manifestToSources(listing, basePath);
  }
  console.warn('Falling back to legacy palette list;automatic discovery failed.');
  return manifestToSources(LEGACY_DEFAULT_FILES, OUTPUT_BASE_PATH_CANDIDATES[0]);
}
async function fetchOutputManifest(basePath) {
  const url = `${basePath}/manifest.json`;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    return response.ok ? await response.json() : null;
  }
  catch (error) {
    return null;
  }
}
async function fetchDirectoryListing(basePath) {
  const url = `${basePath}/`;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text')) return null;
    const text = await response.text();
    const matches = Array.from(text.matchAll(/href=["']([^"']+\.json)["']/gi));
    const files = matches.map(match => {
      const href = match[1] || '';
      const parts = href.split('/');
      const name = parts[parts.length - 1];
      return name ? decodeURIComponent(name) : '';
    }).filter(Boolean);
    return normalizeManifestFiles(files);
  }
  catch (error) {
    return null;
  }
}
function manifestToSources(files, basePath) {
  const normalizedFiles = normalizeManifestFiles(files);
  if (!normalizedFiles.length) return [];
  normalizedFiles.sort((a, b) => {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    if (al === 'dmc.json') return -1;
    if (bl === 'dmc.json') return 1;
    return al.localeCompare(bl, 'zh-Hans-u-nu-latn', { numeric: true });
  });
  const seenIds = new Set();
  return normalizedFiles.map(file => {
    const id = createBuiltinIdFromFile(file);
    if (seenIds.has(id)) return null;
    seenIds.add(id);
    return { id, file, name: `${derivePaletteName(file)}${BUILTIN_NAME_SUFFIX}`, basePath, prepend: file.toLowerCase() === 'dmc.json' };
  }).filter(Boolean);
}
function normalizeManifestFiles(files) {
  if (!Array.isArray(files)) return [];
  const list = [], seen = new Set();
  files.forEach(raw => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (!lower.endsWith('.json') || lower === 'manifest.json' || seen.has(lower)) return;
    seen.add(lower);
    list.push(trimmed);
  });
  return list;
}
function createBuiltinIdFromFile(file) {
  const base = String(file).replace(/\.json$/i, '').trim() || `builtin-${Date.now()}`;
  const normalized = base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u4e00-\u9fa5-]/gi, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `builtin-${normalized || base}`;
}
async function fetchPaletteSourceData(source) {
  if (source.data && typeof source.data === 'object') return source.data;
  if (!source.file) throw new Error('Palette source is missing file path.');
  const basePath = source.basePath || OUTPUT_BASE_PATH_CANDIDATES[0];
  const encodedFile = String(source.file).split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = `${basePath}/${encodedFile}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
export function getActivePaletteLabel() {
  const label = (state.currentPaletteLabel || '').trim();
  if (label) return label;
  if (state.currentPaletteId && state.paletteLibrary.has(state.currentPaletteId)) {
    const entry = state.paletteLibrary.get(state.currentPaletteId);
    if (entry?.name) return entry.name;
  }
  return '未选择色卡';
}
export function collectUsedColors() {
  const usage = new Map();
  for (let y = 0;
    y < state.height;
    y++) {
    for (let x = 0;
      x < state.width;
      x++) {
      const cell = state.grid[y][x];
      if (!cell) continue;
      if (!usage.has(cell.code)) {
        usage.set(cell.code, {
          code: cell.code,
          color: cell.color,
          color1: cell.color ?? '',
          color2: cell.color2 ?? cell.transition?.to?.color ?? null,
          type: cell.type ?? 'normal',
          rgb: cell.rgb,
          count: 0
        });
      }
      usage.get(cell.code).count++;
    }
  }
  const list = Array.from(usage.values());
  list.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-u-nu-latn', { numeric: true }));
  return list;
}
function updatePaletteHistoryValue(id) {
  if (elements.paletteHistorySelect) {
    const value = id ?? '__none';
    elements.paletteHistorySelect.value = value;
    elements.paletteHistorySelect.dataset.activePaletteId = value;
  }
}
function computeColorDistance(a, b) {
  const labA = rgbToLab(a);
  const labB = rgbToLab(b);
  return deltaELab(labA, labB);
}
function findNearestPaletteEntry(rgb, entries, cache) {
  if (!rgb) return null;
  const cacheKey = `${rgb.r},${rgb.g},${rgb.b}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  let nearest = null;
  let minDistance = Infinity;
  for (const entry of entries) {
    const distance = computeColorDistance(rgb, entry.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = entry;
      if (distance === 0) break;
    }
  }
  cache.set(cacheKey, nearest);
  return nearest;
}
function remapCanvasToActivePalette() {
  if (!state.width || !state.height) return 0;
  const entries = state.paletteKeys.map(code => state.palette[code]).filter(Boolean);
  if (!entries.length) return 0;
  const cache = new Map();
  let changed = 0;
  for (let y = 0;
    y < state.height;
    y += 1) {
    for (let x = 0;
      x < state.width;
      x += 1) {
      const cell = state.grid[y]?.[x];
      if (!cell) continue;
      const target = findNearestPaletteEntry(cell.rgb, entries, cache);
      if (!target) continue;
      if (cell.code !== target.code) {
        changed += 1;
      }
      state.grid[y][x] = target;
    }
  }
  return changed;
}
function canvasHasSpecialColors() {
  if (!state.width || !state.height) return false;
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y]?.[x];
      if (cell && SPECIAL_COLOR_TYPES.has(cell.type)) {
        return true;
      }
    }
  }
  return false;
}
function removeSpecialColorsFromCanvas() {
  if (!state.width || !state.height) return 0;
  let removed = 0;
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y]?.[x];
      if (cell && SPECIAL_COLOR_TYPES.has(cell.type)) {
        state.grid[y][x] = null;
        removed += 1;
      }
    }
  }
  return removed;
}
async function performPaletteSwitch(entry, id, options = {}) {
  const { revertOnCancel }
    = options;
  if (!entry) {
    revertOnCancel?.();
    return false;
  }
  const fallbackLabel = state.currentPaletteId && state.paletteLibrary.has(state.currentPaletteId) ? derivePaletteName(state.paletteLibrary.get(state.currentPaletteId)?.name || '') : '';
  const fromLabel = (state.currentPaletteLabel || fallbackLabel || "当前色卡").trim();
  const hasDrawing = isCanvasDirty();
  if (!hasDrawing) {
    applyPalette(entry.data, entry.name, { libraryId: id, persistSelection: true });
    updatePaletteHistoryValue(id);
    return true;
  }
  const hasSpecialColors = canvasHasSpecialColors();
  const decision = await requestPaletteSwitchDecision({
    paletteName: entry.name || id || "目标色卡",
    fromPaletteName: fromLabel || "当前色卡",
    hasDrawing,
    hasSpecialColors
  });
  if (decision === 'cancel') {
    revertOnCancel?.();
    return false;
  }
  if (decision === 'new') {
    clearDrawingGrid();
    saveHistory();
    applyPalette(entry.data, entry.name, { libraryId: id, persistSelection: true });
    updatePaletteHistoryValue(id);
    return true;
  }
  if (decision === 'convert') {
    const removedSpecial = hasSpecialColors ? removeSpecialColorsFromCanvas() : 0;
    applyPalette(entry.data, entry.name, { libraryId: id, persistSelection: true });
    const changed = remapCanvasToActivePalette();
    redrawCanvas();
    if (removedSpecial > 0 || changed > 0) {
      saveHistory();
    }
    updatePaletteHistoryValue(id);
    return true;
  }
  revertOnCancel?.();
  return false;
}
function normalizePalette(rawPalette) {
  const palette = {};
  const normalKeys = [];
  const specialKeys = [];
  const sourceEntries = extractPaletteEntries(rawPalette);
  const recordEntry = (entry, options = {}) => {
    const normalized = normalizePaletteEntry(entry, options);
    if (!normalized || palette[normalized.code]) return;
    palette[normalized.code] = normalized;
    const bucket = SPECIAL_COLOR_TYPES.has(normalized.type) ? specialKeys : normalKeys;
    bucket.push(normalized.code);
  };
  sourceEntries.forEach((entry) => recordEntry(entry));
  normalKeys.sort(sortColorCodes);
  specialKeys.sort(sortColorCodes);
  const keys = [...normalKeys, ...specialKeys];
  return { map: palette, keys, normalKeys, specialKeys };
}
function sortColorCodes(a, b) {
  return a.localeCompare(b, 'zh-Hans-u-nu-latn', { numeric: true });
}
function extractPaletteEntries(rawPalette) {
  if (!rawPalette) return [];
  if (Array.isArray(rawPalette)) return rawPalette.filter(Boolean);
  if (rawPalette instanceof Map) {
    return Array.from(rawPalette.entries()).map(([code, value]) => ({ ...(value || {}), num: value?.num ?? code }));
  }
  if (typeof rawPalette === 'object') {
    return Object.entries(rawPalette).map(([code, value]) => {
      if (value && typeof value === 'object') {
        return { ...value, num: value.num ?? code };
      }
      return { num: code, color: value };
    });
  }
  return [];
}
function normalizePaletteEntry(rawEntry, options = {}) {
  if (!rawEntry) return null;
  const primaryColorValue = rawEntry.color1 ?? rawEntry.color ?? rawEntry.value ?? rawEntry.hex ?? rawEntry.rgb ?? null;
  if (!primaryColorValue) return null;
  const parsedPrimary = parseColor(primaryColorValue);
  if (!parsedPrimary) return null;
  const code = sanitizeColorCode(rawEntry.code ?? rawEntry.num ?? rawEntry.label);
  const type = normalizeColorType(rawEntry.type);
  const defaultAlpha = type === 'transparent' ? 0.2 : 1;
  const alpha1 = clampAlpha(rawEntry.alpha ?? parsedPrimary.a ?? defaultAlpha);
  const forceRgba = SPECIAL_COLOR_TYPES.has(type);
  const stagePrimary = createColorStage(parsedPrimary, alpha1, { forceRgba });
  const color2Value = rawEntry.color2 ?? null;
  const parsedSecondary = color2Value ? parseColor(color2Value) : null;
  const alpha2 = parsedSecondary ? clampAlpha(parsedSecondary.a ?? defaultAlpha) : stagePrimary.alpha;
  const stageSecondary = parsedSecondary ? createColorStage(parsedSecondary, alpha2, { forceRgba }) : null;
  const transition = buildTransitionStage(type, stagePrimary, stageSecondary);
  return {
    code,
    num: rawEntry.num ?? code,
    color: stagePrimary.color,
    color1: stagePrimary.color,
    color2: stageSecondary?.color ?? null,
    rgb: stagePrimary.rgb,
    rgb2: stageSecondary?.rgb ?? null,
    alpha: stagePrimary.alpha,
    alpha2: stageSecondary?.alpha ?? stagePrimary.alpha,
    type,
    label: rawEntry.label ?? code,
    isPreset: Boolean(options.markPreset),
    transition
  };
}
function sanitizeColorCode(value) {
  const normalized = String(value ?? '').trim();
  if (normalized) return normalized;
  return `C-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function normalizeColorType(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (SPECIAL_COLOR_TYPES.has(normalized)) return normalized;
  if (normalized.includes('pear')) return 'pearlescent';
  if (normalized === 'temperature' || normalized === 'temp' || normalized.includes('temper')) return 'temperatrue';
  if (normalized.includes('glow')) return 'glow';
  if (normalized === 'light' || normalized === 'lighting' || normalized.includes('光')) return 'light';
  if (normalized === 'transparent' || normalized === 'alpha' || normalized === 'trans' || normalized.includes('ransparent')) {
    return 'transparent';
  }
  return 'normal';
}
function formatColorFromRgb(rgb, alpha = 1, options = {}) {
  const safeAlpha = clampAlpha(alpha);
  const { r, g, b } = rgb;
  const forceRgba = Boolean(options.forceRgba);
  if (!forceRgba && safeAlpha >= 1) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  const rounded = Math.round(safeAlpha * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${rounded})`;
}
function createColorStage(parsedColor, alphaOverride, options = {}) {
  if (!parsedColor) return null;
  const safeAlpha = clampAlpha(alphaOverride ?? parsedColor.a ?? 1);
  const rgb = { r: parsedColor.r, g: parsedColor.g, b: parsedColor.b };
  return {
    color: formatColorFromRgb(rgb, safeAlpha, options),
    rgb,
    alpha: safeAlpha
  };
}
function createTransparentStageFromColor(stage) {
  if (!stage) {
    return { color: 'rgba(0,0,0,0)', rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  }
  const { r, g, b } = stage.rgb;
  return { color: `rgba(${r}, ${g}, ${b}, 0)`, rgb: { r, g, b }, alpha: 0 };
}
function buildTransitionStage(type, primaryStage, secondaryStage) {
  if (!TRANSITION_COLOR_TYPES.has(type) || !primaryStage) return null;
  const fromStage = secondaryStage ? primaryStage : createTransparentStageFromColor(primaryStage);
  const toStage = secondaryStage ?? primaryStage;
  return { from: fromStage, to: toStage };
}
export function applyPalette(rawPalette, label = '自定义', options = {}) {
  const normalized = normalizePalette(rawPalette);
  if (!normalized.keys.length) {
    window.alert('色卡为空或格式不正确。');
    return;
  }
  state.palette = normalized.map;
  state.paletteKeys = normalized.keys;
  state.normalColorKeys = normalized.normalKeys ?? [...state.paletteKeys];
  state.specialColorKeys = normalized.specialKeys ?? [];
  state.selectedColorKey = state.paletteKeys[0] || null;
  colorManagementState.enabledColors.clear();
  state.paletteKeys.forEach(code => {
    colorManagementState.enabledColors.add(code);
  });
  renderPalette();
  renderFullscreenPalette();
  updatePaletteSelection();
  updateCurrentColorInfo();
  updateStatusPalette(label);
  if (options.libraryId) {
    state.currentPaletteId = options.libraryId;
    if (options.persistSelection) persistSelectedPalette(options.libraryId);
  }
  else {
    state.currentPaletteId = null;
    persistSelectedPalette(null);
  }
  updatePaletteHistorySelect();

  if (options.convertCanvas === true && state.width && state.height) {
    const changed = remapCanvasToActivePalette();
    if (changed > 0) {
      redrawCanvas();
      saveHistory();
    }
  }
}
function rgbComponentToHex(value) {
  const safe = Math.max(0, Math.min(255, Number(value) || 0));
  return safe.toString(16).padStart(2, '0');
}
function getColorTypeLabel(type) {
  const normalized = String(type ?? 'normal').toLowerCase();
  return COLOR_TYPE_LABELS[normalized] ?? COLOR_TYPE_LABELS.normal;
}
function formatPaletteDisplayColor(entry) {
  if (!entry) return '--';
  if (entry.transition && TRANSITION_COLOR_TYPES.has(entry.type)) {
    const fromLabel = formatStageLabel(entry.transition.from);
    const toLabel = formatStageLabel(entry.transition.to);
    if (fromLabel && toLabel) {
      if (fromLabel === toLabel) return toLabel;
      return `${fromLabel} → ${toLabel}`;
    }
  }
  const alpha = Number.isFinite(entry?.alpha) ? clampAlpha(entry.alpha) : 1;
  if (entry.rgb) {
    const { r, g, b } = entry.rgb;
    if (alpha < 1) {
      return `RGBA(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
    }
    return `#${rgbComponentToHex(r)}${rgbComponentToHex(g)}${rgbComponentToHex(b)}`.toUpperCase();
  }
  const colorStr = entry.color ?? '';
  if (alpha < 1 && /^rgba/i.test(colorStr)) {
    return colorStr.toUpperCase();
  }
  if (colorStr.startsWith('#')) return colorStr.toUpperCase();
  const match = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(colorStr);
  if (match) {
    return `#${rgbComponentToHex(match[1])}${rgbComponentToHex(match[2])}${rgbComponentToHex(match[3])}`.toUpperCase();
  }
  return colorStr || '--';
}
function formatStageLabel(stage) {
  if (!stage || !stage.rgb) return null;
  const alpha = Number.isFinite(stage.alpha) ? clampAlpha(stage.alpha) : 1;
  if (alpha <= 0) return '透明';
  const { r, g, b } = stage.rgb;
  if (alpha < 1) {
    return `RGBA(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  }
  return `#${rgbComponentToHex(r)}${rgbComponentToHex(g)}${rgbComponentToHex(b)}`.toUpperCase();
}
function getEntryStageColor(entry, stage) {
  if (!entry) return null;
  if (stage === 'start') {
    return entry.transition?.from?.color ?? entry.color1 ?? entry.color;
  }
  if (stage === 'end') {
    return entry.transition?.to?.color ?? entry.color1 ?? entry.color;
  }
  return entry.color1 ?? entry.color;
}
function buildSwatchBackground(entry) {
  if (entry?.type === 'pearlescent') {
    const base = getEntryStageColor(entry, 'end') || getEntryStageColor(entry, 'start') || entry?.color || '#f5f6ff';
    return `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${base} 45%, ${base} 100%)`;
  }
  const start = getEntryStageColor(entry, 'start');
  const end = getEntryStageColor(entry, 'end');
  if (start && end && start !== end) {
    return `linear-gradient(135deg, ${start}, ${end})`;
  }
  return end || start || 'transparent';
}
function applySwatchBackground(element, entry) {
  if (!element) return;
  const background = buildSwatchBackground(entry);
  const isPearlescent = entry?.type === 'pearlescent';
  const hasTransparentStart = !isPearlescent && Boolean(entry?.transition) && clampAlpha(entry.transition.from?.alpha ?? 1) === 0;
  element.classList.toggle('swatch--pearlescent', isPearlescent);
  if (hasTransparentStart) {
    const patternA = 'linear-gradient(45deg, rgba(255,255,255,0.45) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.45) 75%)';
    const patternB = 'linear-gradient(45deg, rgba(0,0,0,0.08) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.08) 75%)';
    element.style.background = `${background}, ${patternA}, ${patternB}`;
    element.style.backgroundSize = '100% 100%, 12px 12px, 12px 12px';
    element.style.backgroundPosition = '0 0, 0 0, 6px 6px';
  } else {
    element.style.background = background;
    element.style.backgroundSize = '';
    element.style.backgroundPosition = '';
  }
}
function resolveEntryHexColor(entry) {
  if (!entry) return null;
  if (entry.rgb) {
    const { r, g, b }
      = entry.rgb;
    return `#${rgbComponentToHex(r)}${rgbComponentToHex(g)}${rgbComponentToHex(b)}`.toUpperCase();
  }
  const normalized = normalizeHexColor(entry.color ?? '');
  if (normalized) return normalized.toUpperCase();
  const match = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(entry.color ?? '');
  if (match) {
    return `#${rgbComponentToHex(match[1])}${rgbComponentToHex(match[2])}${rgbComponentToHex(match[3])}`.toUpperCase();
  }
  return null;
}
function resolveEntryRgb(entry) {
  if (!entry) return null;
  if (entry.rgb && Number.isFinite(entry.rgb.r) && Number.isFinite(entry.rgb.g) && Number.isFinite(entry.rgb.b)) {
    return entry.rgb;
  }
  const normalized = normalizeHexColor(entry.color ?? '');
  if (normalized) {
    const values = hexToRgb(normalized);
    return values ? { r: values[0], g: values[1], b: values[2] }
      : null;
  }
  const match = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(entry.color ?? '');
  if (match) {
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  }
  return null;
}
export function renderPalette() {
  if (!elements.paletteContainer) return;
  const filterText = elements.paletteFilter?.value.trim().toLowerCase() ?? '';
  const normalKeys = state.normalColorKeys?.length ? state.normalColorKeys : state.paletteKeys;
  const specialKeys = state.specialColorKeys ?? [];

  const normalResult = renderPaletteSection({
    keys: normalKeys,
    container: elements.paletteNormalContainer,
    filterText
  });

  const specialResult = renderPaletteSection({
    keys: specialKeys,
    container: elements.paletteSpecialContainer,
    filterText,
    typeFilter: paletteViewState.specialFilter
  });

  if (specialResult.total > 0 && specialResult.rendered === 0 && paletteViewState.specialFilter !== 'all') {
    paletteViewState.specialFilter = 'all';
    updateSpecialFilterButtons();
    renderPalette();
    return;
  }

  updatePaletteTabCounts(normalResult.total, specialResult.total);
  updatePaletteTabAvailability(normalResult.total, specialResult.total);
  updateSpecialFilterAvailability(specialResult.total);
  updateSpecialFilterButtons();
  updatePaletteTabState();
}
function renderPaletteSection({ keys, container, filterText, typeFilter = 'all' }) {
  if (!container) {
    return { total: 0, rendered: 0 };
  }
  container.innerHTML = '';
  const normalizedFilter = filterText || '';
  const normalizedType = typeFilter === 'all' ? null : typeFilter;
  const fragment = document.createDocumentFragment();
  let total = 0;
  let rendered = 0;

  keys.forEach((code) => {
    if (!isColorEnabled(code)) return;
    const entry = state.palette[code];
    if (!entry) return;
    total++;
    if (normalizedType && entry.type !== normalizedType) return;
    if (normalizedFilter && !paletteEntryMatches(entry, code, normalizedFilter)) return;
    fragment.appendChild(createPaletteItem(entry));
    rendered++;
  });

  if (!rendered) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    const label = normalizedType ? getColorTypeLabel(normalizedType) : '';
    empty.textContent = normalizedType ? `暂无${label}颜色` : '暂无可用颜色';
    container.appendChild(empty);
  } else {
    container.appendChild(fragment);
  }

  return { total, rendered };
}

function createPaletteItem(entry) {
  const code = entry.code;
  const displayColor = formatPaletteDisplayColor(entry);
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'palette-item';
  item.dataset.code = code;
  item.dataset.type = entry.type ?? 'normal';
  if (state.selectedColorKey === code) item.classList.add('active');
  item.title = `${code} · ${displayColor}`;
  const swatch = document.createElement('span');
  swatch.className = 'palette-item__swatch';
  applySwatchBackground(swatch, entry);
  const codeEl = document.createElement('span');
  codeEl.className = 'palette-item__code';
  codeEl.textContent = code;
  const rgbEl = document.createElement('span');
  rgbEl.className = 'palette-item__rgb';
  rgbEl.textContent = displayColor;
  item.appendChild(swatch);
  item.appendChild(codeEl);
  item.appendChild(rgbEl);
  item.addEventListener('click', () => {
    state.selectedColorKey = code;
    updatePaletteSelection();
    updateCurrentColorInfo();
  });
  return item;
}

function paletteEntryMatches(entry, code, filterText) {
  const tokens = [
    code.toLowerCase(),
    entry.color?.toLowerCase() ?? '',
    entry.color2?.toLowerCase() ?? '',
    formatPaletteDisplayColor(entry).toLowerCase(),
    (entry.label ?? '').toLowerCase(),
    getColorTypeLabel(entry.type).toLowerCase()
  ];
  return tokens.some((value) => value.includes(filterText));
}

function updatePaletteTabCounts(normalTotal, specialTotal) {
  if (elements.paletteNormalCount) {
    elements.paletteNormalCount.textContent = String(normalTotal ?? 0);
  }
  if (elements.paletteSpecialCount) {
    elements.paletteSpecialCount.textContent = String(specialTotal ?? 0);
  }
}

function updatePaletteTabAvailability(normalTotal, specialTotal) {
  const specialButton = getPaletteTabButtons().find((btn) => btn.dataset.paletteTab === 'special');
  if (specialButton) {
    specialButton.disabled = specialTotal === 0;
  }
  if (paletteViewState.activeTab === 'special' && specialTotal === 0) {
    paletteViewState.activeTab = 'normal';
  } else if (paletteViewState.activeTab === 'normal' && normalTotal === 0 && specialTotal > 0) {
    paletteViewState.activeTab = 'special';
  }
}

function setPaletteTab(tab) {
  if (!tab || paletteViewState.activeTab === tab) return false;
  const button = getPaletteTabButtons().find((btn) => btn.dataset.paletteTab === tab);
  if (button?.disabled) return false;
  paletteViewState.activeTab = tab;
  updatePaletteTabState();
  return true;
}

function setSpecialFilter(filter) {
  const normalized = filter || 'all';
  if (paletteViewState.specialFilter === normalized) return;
  paletteViewState.specialFilter = normalized;
  updateSpecialFilterButtons();
  renderPalette();
}

function updatePaletteTabState() {
  const activeTab = paletteViewState.activeTab;
  getPaletteTabButtons().forEach((btn) => {
    const isActive = btn.dataset.paletteTab === activeTab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  getPaletteTabPanels().forEach((panel) => {
    const isActive = panel.dataset.palettePanel === activeTab;
    panel.classList.toggle('is-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

function updateSpecialFilterButtons() {
  const current = paletteViewState.specialFilter || 'all';
  getSpecialFilterButtons().forEach((button) => {
    const isActive = (button.dataset.specialFilter || 'all') === current;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
  });
}

function updateSpecialFilterAvailability(total) {
  const disabled = total === 0;
  getSpecialFilterButtons().forEach((button) => {
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  });
  if (disabled && paletteViewState.specialFilter !== 'all') {
    paletteViewState.specialFilter = 'all';
    updateSpecialFilterButtons();
  }
}

function initializePaletteTabs() {
  const tabButtons = getPaletteTabButtons();
  const specialButtons = getSpecialFilterButtons();
  if (!tabButtons.length && !specialButtons.length) return;
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const changed = setPaletteTab(button.dataset.paletteTab || 'normal');
      if (changed) {
        renderPalette();
      }
    });
  });
  specialButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setSpecialFilter(button.dataset.specialFilter || 'all');
    });
  });
  updatePaletteTabState();
  updateSpecialFilterButtons();
}

function getPaletteTabButtons() {
  return Array.from(elements.paletteTabButtons ?? []);
}

function getPaletteTabPanels() {
  return Array.from(elements.paletteTabPanels ?? []);
}

function getSpecialFilterButtons() {
  return Array.from(elements.paletteSpecialFilterButtons ?? []);
}

initializePaletteTabs();
export function updatePaletteSelection() {
  if (!elements.paletteContainer) return;
  const items = elements.paletteContainer.querySelectorAll('.palette-item');
  items.forEach(item => item.classList.toggle('active', item.dataset.code === state.selectedColorKey));
  updateFullscreenPaletteSelection();
}
export function renderFullscreenPalette() {
  const container = elements.fullscreenPalette;
  if (!container) return;
  container.innerHTML = '';
  if (!state.paletteKeys.length) {
    const empty = document.createElement('div');
    empty.className = 'fullscreen-palette-empty';
    empty.textContent = '尚未加载色卡';
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.paletteKeys.forEach(code => {
    if (!isColorEnabled(code)) return;
    const entry = state.palette[code];
    if (!entry) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.code = code;
    const swatch = document.createElement('span');
    swatch.className = 'fullscreen-swatch';
    applySwatchBackground(swatch, entry);
    btn.appendChild(swatch);
    if (state.selectedColorKey === code) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.selectedColorKey = code;
      updatePaletteSelection();
      updateCurrentColorInfo();
    });
    fragment.appendChild(btn);
  });
  container.appendChild(fragment);
}
export function updateFullscreenPaletteSelection() {
  const container = elements.fullscreenPalette;
  if (!container) return;
  const buttons = container.querySelectorAll('button[data-code]');
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.code === state.selectedColorKey));
}
export function updateCurrentColorInfo() {
  const code = state.selectedColorKey ?? null;
  const entry = code ? state.palette[code] : null;
  const hexColor = resolveEntryHexColor(entry);
  const rgbObject = resolveEntryRgb(entry);
  const swatchBackground = buildSwatchBackground(entry);
  const alphaValue = clampAlpha(Number.isFinite(entry?.alpha) ? entry.alpha : 1);
  const useRgba = alphaValue < 1 || entry?.type === 'transparent';
  const rgbaSuffix = useRgba ? `, ${alphaValue.toFixed(2)}` : '';
  const rgbLabel = useRgba ? 'RGBA' : 'RGB';
  const rgbText = rgbObject
    ? `${rgbLabel}: (${rgbObject.r}, ${rgbObject.g}, ${rgbObject.b}${rgbaSuffix})`
    : `${rgbLabel}: --`;
  const displayCode = code ?? '未选中';
  const hexText = hexColor ?? '--';
  const typeText = getColorTypeLabel(entry?.type);
  if (elements.currentColorSwatch) {
    elements.currentColorSwatch.style.background = swatchBackground;
    elements.currentColorSwatch.title = hexText !== '--' ? hexText : '';
  }
  if (elements.currentColorCode) {
    elements.currentColorCode.textContent = displayCode;
  }
  if (elements.currentColorRgb) {
    elements.currentColorRgb.textContent = rgbText;
  }
  if (elements.currentColorType) {
    elements.currentColorType.textContent = `类型：${typeText}`;
  }
  if (elements.currentColorInfo) {
    elements.currentColorInfo.dataset.code = code ?? '';
    elements.currentColorInfo.dataset.color = hexColor ?? entry?.color ?? '';
    if (rgbObject) {
      elements.currentColorInfo.dataset.rgb = useRgba
        ? `${rgbObject.r},${rgbObject.g},${rgbObject.b},${alphaValue.toFixed(2)}`
        : `${rgbObject.r},${rgbObject.g},${rgbObject.b}`;
    } else {
      elements.currentColorInfo.dataset.rgb = '';
    }
    elements.currentColorInfo.dataset.type = entry?.type ?? '';
  }
  if (elements.statusColorPreview) {
    elements.statusColorPreview.style.background = swatchBackground;
    elements.statusColorPreview.title = hexText !== '--' ? hexText : '';
  }
  if (elements.statusColorCode) {
    elements.statusColorCode.textContent = displayCode;
  }
  if (elements.statusColorHex) {
    elements.statusColorHex.textContent = hexText;
  }
  if (elements.statusColorRgb) {
    elements.statusColorRgb.textContent = rgbText;
  }
  if (elements.colorManageCurrentSwatch) {
    elements.colorManageCurrentSwatch.style.background = swatchBackground;
    elements.colorManageCurrentSwatch.title = hexText !== '--' ? hexText : '';
  }
  if (elements.colorManageCurrentCode) {
    elements.colorManageCurrentCode.textContent = displayCode;
  }
  if (elements.colorManageCurrentRgb) {
    elements.colorManageCurrentRgb.textContent = rgbText;
  }
  if (elements.colorManageModalSwatch) {
    elements.colorManageModalSwatch.style.background = swatchBackground;
    elements.colorManageModalSwatch.title = hexText !== '--' ? hexText : '';
  }
  if (elements.colorManageModalCode) {
    elements.colorManageModalCode.textContent = displayCode;
  }
  if (elements.colorManageModalRgb) {
    elements.colorManageModalRgb.textContent = rgbText;
  }
}
export function handleDeletePalette() {
  const id = elements.paletteHistorySelect?.value;
  if (!id || id === '__none') return;
  if (id === 'builtin-dmc' || id.startsWith('builtin-')) {
    window.alert('内置色卡不能删除。');
    return;
  }
  const entry = state.paletteLibrary.get(id);
  if (!entry) {
    window.alert('未找到该色卡。');
    return;
  }
  if (!window.confirm(`确认删除色卡「${entry.name}」吗？此操作不可撤销。`)) return;
  state.paletteLibrary.delete(id);
  state.paletteOrder = state.paletteOrder.filter(x => x !== id);
  if (state.currentPaletteId === id) {
    state.currentPaletteId = null;
    state.palette = {};
    state.paletteKeys = [];
    state.selectedColorKey = null;
    renderPalette();
    renderFullscreenPalette();
    updateCurrentColorInfo();
    updateStatusPalette('未加载');
  }
  updatePaletteHistorySelect();
  elements.paletteHistorySelect && (elements.paletteHistorySelect.value = '__none');
  persistPaletteLibrary();
  announcePaletteLibraryChange({ action: 'delete', id });
}
export async function handlePaletteSelectionChange(ev) {
  const select = ev.target;
  const id = select.value;
  const activeValue = select.dataset.activePaletteId ?? state.currentPaletteId ?? '__none';
  if (id === '__none') {
    select.value = activeValue;
    return;
  }
  if (id === activeValue || id === state.currentPaletteId) {
    select.value = activeValue;
    return;
  }
  const entry = state.paletteLibrary.get(id);
  if (!entry) {
    select.value = activeValue;
    return;
  }
  const previousValue = activeValue;
  const applied = await performPaletteSwitch(entry, id, {
    revertOnCancel: () => {
      select.value = previousValue;
    }
  });
  if (!applied) {
    select.value = previousValue;
    return;
  }
  select.dataset.activePaletteId = id;
}
export function handlePaletteFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  const extension = (file.name?.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const textContent = String(reader.result ?? '').trim();
      if (!textContent) {
        window.alert('文件内容为空。');
        return;
      }
      const paletteName = derivePaletteName(file.name || '导入色卡');
      const parsed = extension === 'csv' ? parseCsvPalette(textContent) : parseJsonPalette(textContent);
      if (!parsed || typeof parsed !== 'object') {
        window.alert('色卡文件格式不正确，请检查 JSON/CSV。');
        return;
      }
      const paletteId = generatePaletteId(paletteName || 'palette');
      addPaletteToLibrary(paletteId, paletteName, parsed, { persist: true, prepend: true });
      applyPalette(parsed, paletteName, { libraryId: paletteId, persistSelection: true, convertCanvas: true });
      if (elements.paletteHistorySelect) {
        elements.paletteHistorySelect.value = paletteId;
      }
    }
    catch (error) {
      console.error('Failed to import palette', error);
      window.alert('无法导入色卡文件，请确认 JSON/CSV 格式。');
    }
    finally {
      if (input) input.value = '';
    }
  };
  reader.onerror = () => {
    window.alert('读取色卡文件时出现问题，请重试。');
    if (input) input.value = '';
  };
  reader.readAsText(file, 'utf-8');
}
export async function handleBuiltinPaletteLoad() {
  const entry = state.paletteLibrary.get('builtin-dmc');
  if (!entry) {
    window.alert('内置 DMC 色卡尚未准备好，请先导入 JSON。');
    return;
  }
  await performPaletteSwitch(entry, 'builtin-dmc');
}
export function updateStatusPalette(label) {
  if (!elements.statusPalette) return;
  const displayLabel = derivePaletteName(label);
  const title = label || '自定义';
  const count = state.paletteKeys.length;
  elements.statusPalette.textContent = `${displayLabel}
· ${count}色`;
  state.currentPaletteLabel = title;
}
export async function loadDefaultPalettes() {
  const sources = await ensureDefaultPaletteSources();
  for (const source of sources) {
    if (!source?.id || state.paletteLibrary.has(source.id)) continue;
    try {
      const data = await fetchPaletteSourceData(source);
      if (!data || typeof data !== 'object') continue;
      addPaletteToLibrary(source.id, source.name, data, { persist: false, prepend: Boolean(source.prepend) });
    }
    catch (error) {
      console.warn('Failed to load palette from', source?.file ?? source?.id, error);
    }
  }
  updatePaletteHistorySelect();
}
export function parseJsonPalette(text) {
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : null;
  }
  catch (error) {
    return null;
  }
}
function parseCsvPalette(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const headers = (lines.shift() || '').split(',').map((cell) => cell.trim().toLowerCase());
  if (headers[0] !== 'num' || headers[1] !== 'type') return null;
  const color1Index = headers.indexOf('color1');
  const color2Index = headers.indexOf('color2');
  const legacyColorIndex = headers.indexOf('color');
  if (color1Index === -1 && legacyColorIndex === -1) return null;
  const payload = {};
  lines.forEach((line) => {
    if (!line) return;
    const cells = line.split(',');
    if (cells.length < 3) return;
    const num = cells[0].trim();
    const type = cells[1].trim();
    const primaryIndex = color1Index !== -1 ? color1Index : 2;
    const primary = cells[primaryIndex]?.trim() ?? '';
    const fallbackColor = legacyColorIndex !== -1 ? (cells[legacyColorIndex]?.trim() ?? '') : '';
    const color1 = primary || fallbackColor;
    const color2 = color2Index !== -1 ? (cells[color2Index]?.trim() ?? '') : '';
    if (!num || !color1) return;
    const entry = { num, type, color1, color: color1 };
    if (color2) {
      entry.color2 = color2;
    }
    payload[num] = entry;
  });
  return payload;
}
function derivePaletteName(file) {
  if (!file) return '未命名';
  const base = file.replace(/\.json$/i, '');
  return base.replace(/[_-]+/g, ' ').trim() || base;
}
export function loadPaletteLibrary() {
  if (!hasLocalStorage()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.paletteLibrary);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    list.forEach(entry => {
      if (!entry?.id || !entry.name || !entry.data) return;
      if (!entry.id.startsWith('builtin-')) {
        console.warn('Ignoring invalid palette ID in library:', entry.id);
        return;
      }
      addPaletteToLibrary(entry.id, entry.name, entry.data, { persist: false });
    });
  }
  catch (error) {
    console.warn('Failed to load palette library from storage:', error);
  }
}
export function restoreLastPalette() {
  let applied = false;
  if (hasLocalStorage()) {
    const selectedId = localStorage.getItem(STORAGE_KEYS.paletteSelection);
    if (selectedId && state.paletteLibrary.has(selectedId)) {
      const entry = state.paletteLibrary.get(selectedId);
      applyPalette(entry.data, entry.name, { libraryId: selectedId, persistSelection: false });
      elements.paletteHistorySelect && (elements.paletteHistorySelect.value = selectedId);
      applied = true;
    }
  }
  if (!applied && state.paletteLibrary.has('builtin-dmc')) {
    const entry = state.paletteLibrary.get('builtin-dmc');
    applyPalette(entry.data, entry.name, { libraryId: 'builtin-dmc', persistSelection: false });
    elements.paletteHistorySelect && (elements.paletteHistorySelect.value = 'builtin-dmc');
    applied = true;
  }
  if (!applied && state.paletteOrder.length) {
    const firstId = state.paletteOrder[0];
    const entry = state.paletteLibrary.get(firstId);
    if (entry) {
      applyPalette(entry.data, entry.name, { libraryId: firstId, persistSelection: false });
      elements.paletteHistorySelect && (elements.paletteHistorySelect.value = firstId);
      applied = true;
    }
  }
  if (!applied) {
    state.palette = {};
    state.paletteKeys = [];
    state.selectedColorKey = null;
    renderPalette();
    renderFullscreenPalette();
    updateCurrentColorInfo();
    updateStatusPalette('自定义');
    updatePaletteHistorySelect();
    initColorManagement();
  }
}
function addPaletteToLibrary(id, name, data, options = {}) {
  const { persist = true, prepend = false }
    = options;
  const existing = state.paletteLibrary.get(id);
  state.paletteLibrary.set(id, { name, data });
  const existingIndex = state.paletteOrder.indexOf(id);
  if (existingIndex === -1) {
    prepend ? state.paletteOrder.unshift(id) : state.paletteOrder.push(id);
  }
  updatePaletteHistorySelect();
  announcePaletteLibraryChange({ action: 'add', id, name });
  persist && !id.startsWith('builtin-') && persistPaletteLibrary();
}
function persistPaletteLibrary() {
  if (!hasLocalStorage()) return;
  try {
    const payload = state.paletteOrder.filter(id => !id.startsWith('builtin-')).map(id => {
      const entry = state.paletteLibrary.get(id);
      return entry ? { id, name: entry.name, data: entry.data }
        : null;
    }).filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.paletteLibrary, JSON.stringify(payload));
  }
  catch (error) {
    console.warn('Failed to persist palette library:', error);
  }
}
function persistSelectedPalette(id) {
  if (!hasLocalStorage()) return;
  try {
    id ? localStorage.setItem(STORAGE_KEYS.paletteSelection, id) : localStorage.removeItem(STORAGE_KEYS.paletteSelection);
  }
  catch (error) {
    console.warn('Failed to persist palette selection:', error);
  }
}
function updatePaletteHistorySelect() {
  const select = elements.paletteHistorySelect;
  if (!select) return;
  const currentValue = state.currentPaletteId;
  const existingValue = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '__none';
  placeholder.textContent = '选择色卡';
  select.appendChild(placeholder);
  state.paletteOrder.forEach(id => {
    const entry = state.paletteLibrary.get(id);
    if (!entry) return;
    const option = document.createElement('option');
    option.value = id;
    const displayName = derivePaletteName(entry.name);
    option.textContent = `${displayName}(${Object.keys(entry.data || {}).length}色)`;
    if (currentValue === id || (!currentValue && existingValue === id)) option.selected = true;
    select.appendChild(option);
  });
  select.value = currentValue && state.paletteLibrary.has(currentValue) ? currentValue : (existingValue && select.querySelector(`option[value="${existingValue}"]`) ? existingValue : '__none');
  select.dataset.activePaletteId = select.value;
}
function generatePaletteId(name = 'palette') {
  const safeName = name.replace(/\.[^/.\\]+$/, '').replace(/\s+/g, '_').slice(0, 40);
  return `user-${safeName}-${Date.now()}`;
}
const colorManagementState = { enabledColors: new Set(), tempEnabledColors: new Set(), isVisible: false, renderJob: null, renderedItems: new Map(), renderedSignature: '', filterText: '', rawFilterText: '' };
export function initializeColorManagement() {
  bindColorManagementEvents();
  if (state.paletteKeys.length > 0) {
    state.paletteKeys.forEach(code => {
      colorManagementState.enabledColors.add(code);
    });
  }
}
window.openColorManagement = openColorManagement;
window._toggleColorManagement = toggleColorManagement;
window._confirmColorManagement = confirmColorManagement;
window._cancelColorManagement = cancelColorManagement;
window._selectAllColors = selectAllColors;
window._deselectAllColors = deselectAllColors;
function bindColorManagementEvents() {
  elements.colorManageBtn?.addEventListener('click', openColorManagement);
  elements.colorManageCloseBtn?.addEventListener('click', () => toggleColorManagement(false));
  elements.colorManageCancelBtn?.addEventListener('click', cancelColorManagement);
  elements.colorManageConfirmBtn?.addEventListener('click', confirmColorManagement);
  elements.selectAllColorsBtn?.addEventListener('click', selectAllColors);
  elements.deselectAllColorsBtn?.addEventListener('click', deselectAllColors);
  elements.colorManageList?.addEventListener('click', handleColorListInteraction);
  elements.colorManageList?.addEventListener('keydown', handleColorListKeydown);
  elements.colorManageSearchInput?.addEventListener('input', handleColorManageSearchInput);
  document.addEventListener('click', (e) => {
    if (colorManagementState.isVisible && !elements.colorManageWindow.contains(e.target) && e.target !== elements.colorManageBtn) {
      toggleColorManagement(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && colorManagementState.isVisible) {
      toggleColorManagement(false);
    }
  });
}
function handleColorListInteraction(event) {
  const target = event.target.closest('.color-manage-checkbox, .color-manage-item');
  if (!target || !elements.colorManageList?.contains(target)) return;
  const checkbox = target.classList.contains('color-manage-item') ? target.querySelector('.color-manage-checkbox') : target;
  if (!checkbox) return;
  handleColorToggle(checkbox);
}
function handleColorListKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const item = event.target.closest('.color-manage-item');
  if (!item || !elements.colorManageList?.contains(item)) return;
  event.preventDefault();
  const checkbox = item.querySelector('.color-manage-checkbox');
  if (!checkbox) return;
  handleColorToggle(checkbox);
}
function handleColorManageSearchInput(event) {
  const rawValue = event?.target?.value ?? '';
  const normalized = rawValue.trim().toLowerCase();
  if (colorManagementState.rawFilterText === rawValue && colorManagementState.filterText === normalized) {
    return;
  }
  colorManagementState.rawFilterText = rawValue;
  colorManagementState.filterText = normalized;
  renderColorManagementList(true);
}
function prepareColorManagementContent() {
  if (!state.paletteKeys.length) {
    window.alert('请先加载色卡');
    return false;
  }
  colorManagementState.tempEnabledColors = new Set(colorManagementState.enabledColors);
  renderColorManagementList();
  updateColorCount();
  if (elements.colorManageSearchInput) {
    elements.colorManageSearchInput.value = colorManagementState.rawFilterText ?? '';
  }
  return true;
}
export function openColorManagement() {
  if (!prepareColorManagementContent()) return;
  toggleColorManagement(true, { skipPrepare: true });
}
export function toggleColorManagement(force, options = {}) {
  const next = typeof force === 'boolean' ? force : !colorManagementState.isVisible;
  const skipPrepare = Boolean(options.skipPrepare);
  if (colorManagementState.isVisible === next) return;
  if (next && !colorManagementState.isVisible && !skipPrepare) {
    if (!prepareColorManagementContent()) return;
  }
  colorManagementState.isVisible = next;
  if (!next) {
    cancelColorManagementRenderJob();
  }
  syncColorManagementWindow();
}
function syncColorManagementWindow() {
  if (!elements.colorManageWindow) return;
  const visible = colorManagementState.isVisible;
  elements.colorManageWindow.classList.toggle('is-visible', visible);
  elements.colorManageWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (visible) {
    elements.colorManageWindow.focus();
    updateColorCount();
    if (elements.colorManageSearchInput) {
      elements.colorManageSearchInput.value = colorManagementState.rawFilterText ?? '';
      elements.colorManageSearchInput.focus({ preventScroll: true });
    }
  }
}
function cancelColorManagementRenderJob() {
  if (colorManagementState.renderJob !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(colorManagementState.renderJob);
  }
  colorManagementState.renderJob = null;
}
function renderColorManagementList(force = false) {
  if (!elements.colorManageList) return;
  cancelColorManagementRenderJob();
  const container = elements.colorManageList;
  const filterText = colorManagementState.filterText ?? '';
  const normalizedFilter = filterText.trim().toLowerCase();
  const sourceKeys = state.paletteKeys.slice();
  const filteredKeys = normalizedFilter ? sourceKeys.filter((code) => {
    const entry = state.palette[code];
    if (!entry) return false;
    const displayColor = (formatPaletteDisplayColor(entry) || '').toLowerCase();
    const colorValue = entry.color?.toLowerCase() ?? '';
    const colorValue2 = entry.color2?.toLowerCase() ?? '';
    return [code.toLowerCase(), colorValue, colorValue2, displayColor].some((value) => value.includes(normalizedFilter));
  }) : sourceKeys;
  const signature = `${normalizedFilter}|${filteredKeys.join('|')}`;
  if (!force && colorManagementState.renderedSignature === signature && colorManagementState.renderedItems.size === filteredKeys.length) {
    syncColorManagementItems();
    return;
  }
  colorManagementState.renderedSignature = signature;
  colorManagementState.renderedItems.clear();
  if (!filteredKeys.length) {
    container.innerHTML = `<div class="color-manage-empty">${normalizedFilter ? '未找到匹配的颜色，请调整搜索条件' : '暂无可管理的颜色'}</div>`;
    return;
  }
  container.innerHTML = '';
  let index = 0;
  const chunkSize = 120;
  const renderChunk = () => {
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + chunkSize, filteredKeys.length);
    for (;
      index < end;
      index += 1) {
      const code = filteredKeys[index];
      const entry = state.palette[code];
      if (!entry) continue;
      const displayColor = formatPaletteDisplayColor(entry);
      const item = document.createElement('div');
      item.className = 'color-manage-item';
      item.dataset.code = code;
      item.tabIndex = 0;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-label', `${code}
${displayColor}`);
      const isEnabled = colorManagementState.enabledColors.has(code);
      if (!isEnabled) {
        item.classList.add('disabled');
      }
      item.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
      item.setAttribute('aria-selected', isEnabled ? 'true' : 'false');
      const checkbox = document.createElement('div');
      checkbox.className = 'color-manage-checkbox';
      checkbox.dataset.code = code;
      checkbox.setAttribute('role', 'checkbox');
      checkbox.setAttribute('aria-checked', isEnabled ? 'true' : 'false');
      checkbox.classList.toggle('checked', isEnabled);
      const swatch = document.createElement('div');
      swatch.className = 'color-manage-swatch';
      applySwatchBackground(swatch, entry);
      const infoWrap = document.createElement('div');
      infoWrap.className = 'color-manage-info';
      const codeEl = document.createElement('div');
      codeEl.className = 'color-manage-code';
      codeEl.textContent = code;
      const colorEl = document.createElement('div');
      colorEl.className = 'color-manage-color';
      colorEl.textContent = displayColor;
      infoWrap.appendChild(codeEl);
      infoWrap.appendChild(colorEl);
      item.appendChild(swatch);
      item.appendChild(infoWrap);
      item.appendChild(checkbox);
      colorManagementState.renderedItems.set(code, { item, checkbox });
      fragment.appendChild(item);
    }
    container.appendChild(fragment);
    if (index < filteredKeys.length && typeof window !== 'undefined') {
      colorManagementState.renderJob = window.requestAnimationFrame(renderChunk);
    }
    else {
      colorManagementState.renderJob = null;
    }
  };
  renderChunk();
}
function syncColorManagementItems() {
  if (!colorManagementState.renderedItems.size) return;
  colorManagementState.renderedItems.forEach(({ item, checkbox }, code) => {
    if (!item || !checkbox) return;
    const enabled = colorManagementState.enabledColors.has(code);
    checkbox.classList.toggle('checked', enabled);
    checkbox.setAttribute('aria-checked', enabled ? 'true' : 'false');
    item.classList.toggle('disabled', !enabled);
    item.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    item.setAttribute('aria-selected', enabled ? 'true' : 'false');
  });
}
function handleColorToggle(checkbox) {
  if (!checkbox) return;
  const code = checkbox.dataset.code;
  const isCurrentlyEnabled = checkbox.classList.contains('checked');
  if (isCurrentlyEnabled && colorManagementState.enabledColors.size <= 1) {
    showColorManagementMessage('至少需要启用一个颜色', 'error');
    return;
  }
  if (isCurrentlyEnabled) {
    checkbox.classList.remove('checked');
    checkbox.setAttribute('aria-checked', 'false');
    colorManagementState.enabledColors.delete(code);
  }
  else {
    checkbox.classList.add('checked');
    checkbox.setAttribute('aria-checked', 'true');
    colorManagementState.enabledColors.add(code);
  }
  const item = checkbox.closest('.color-manage-item');
  if (item) {
    const enabled = colorManagementState.enabledColors.has(code);
    item.classList.toggle('disabled', !enabled);
    item.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    item.setAttribute('aria-selected', enabled ? 'true' : 'false');
  }
  updateColorCount();
  clearColorManagementMessage();
}
function selectAllColors() {
  state.paletteKeys.forEach(code => {
    colorManagementState.enabledColors.add(code);
  });
  syncColorManagementItems();
  updateColorCount();
  clearColorManagementMessage();
}
function deselectAllColors() {
  if (state.paletteKeys.length > 0) {
    const firstCode = state.paletteKeys[0];
    colorManagementState.enabledColors.clear();
    colorManagementState.enabledColors.add(firstCode);
  }
  syncColorManagementItems();
  updateColorCount();
  showColorManagementMessage('已保留至少一个颜色', 'info');
}
function updateColorCount() {
  if (!elements.enabledColorCount) return;
  const total = state.paletteKeys.length;
  const enabled = colorManagementState.enabledColors.size;
  elements.enabledColorCount.textContent = `已启用： ${enabled}/${total}`;
  if (enabled <= 3 && total > 5) {
    showColorManagementMessage('启用的颜色较少，可能会影响绘制', 'warning');
  }
}
function showColorManagementMessage(message, type = 'info') {
  if (!elements.colorManageMessage) return;
  elements.colorManageMessage.textContent = message;
  elements.colorManageMessage.className = `color-manage-message ${type}`;
}
function clearColorManagementMessage() {
  if (!elements.colorManageMessage) return;
  elements.colorManageMessage.textContent = '';
  elements.colorManageMessage.className = 'color-manage-message';
}
function cancelColorManagement() {
  colorManagementState.enabledColors = new Set(colorManagementState.tempEnabledColors);
  toggleColorManagement(false);
}
function confirmColorManagement() {
  if (colorManagementState.enabledColors.size === 0) {
    showColorManagementMessage('必须至少启用一个颜色', 'error');
    return;
  }
  if (state.selectedColorKey && !colorManagementState.enabledColors.has(state.selectedColorKey)) {
    const firstEnabled = state.paletteKeys.find(code => colorManagementState.enabledColors.has(code));
    state.selectedColorKey = firstEnabled || null;
    updatePaletteSelection();
  }
  renderPalette();
  renderFullscreenPalette();
  redrawCanvas();
  toggleColorManagement(false);
  showColorManagementMessage('颜色设置已更新', 'info');
  colorManagementState.tempEnabledColors.clear();
}
export function isColorEnabled(code) {
  return colorManagementState.enabledColors.has(code);
}
export function getEnabledColors() {
  return Array.from(colorManagementState.enabledColors);
}
export function findNearestEnabledColor(r, g, b) {
  let bestCode = null;
  let bestDist = Infinity;
  for (const code of getEnabledColors()) {
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
export function findNearestEnabledNormalColor(r, g, b) {
  let bestCode = null;
  let bestDist = Infinity;
  for (const code of getEnabledColors()) {
    const entry = state.palette[code];
    if (!entry || (entry.type && entry.type !== 'normal')) {
      continue;
    }
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
export function initColorManagement() {
  bindColorManagementEvents();
  if (state.paletteKeys.length > 0) {
    state.paletteKeys.forEach(code => {
      colorManagementState.enabledColors.add(code);
    });
  }
  renderPalette();
  renderFullscreenPalette();
}