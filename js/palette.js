import { STORAGE_KEYS } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { parseColor, hasLocalStorage } from './utils.js';
import { clearDrawingGrid, isCanvasDirty, redrawCanvas, saveHistory } from './canvas.js';
import { requestPaletteSwitchDecision } from './palette-switch-dialog.js';
const OUTPUT_BASE_PATH_CANDIDATES = ['../output', './output'];
const LEGACY_DEFAULT_FILES = ['DMC.json', 'Coco.json', 'MARD-24.json', 'MARD-48.json', 'MARD-72.json', 'MARD-96.json', 'MARD-120.json', 'MARD-144.json', 'MARD-221.json'];
const BUILTIN_NAME_SUFFIX = '（内置）';
let defaultPaletteSourcesPromise = null;
function ensureDefaultPaletteSources() {
  return defaultPaletteSourcesPromise || (defaultPaletteSourcesPromise = discoverDefaultPaletteSources());
}
async function discoverDefaultPaletteSources() {
  for (const basePath of OUTPUT_BASE_PATH_CANDIDATES) {
    const manifest = await fetchOutputManifest(basePath);
    if (manifest?.length) return manifestToSources(manifest, basePath);
    const listing = await fetchDirectoryListing(basePath);
    if (listing?.length) return manifestToSources(listing, basePath);
  }
  console.warn('Falling back to legacy palette list; automatic discovery failed.');
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
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      if (!cell) continue;
      if (!usage.has(cell.code)) usage.set(cell.code, { code: cell.code, color: cell.color, rgb: cell.rgb, count: 0 });
      usage.get(cell.code).count++;
    }
  }
  const list = Array.from(usage.values());
  list.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-u-nu-latn', { numeric: true }));
  return list;
}
function updatePaletteHistoryValue(id) {
  if (elements.paletteHistorySelect) {
    elements.paletteHistorySelect.value = id ?? '__none';
  }
}

function computeColorDistance(a, b) {
  const dr = (a?.r ?? 0) - (b?.r ?? 0);
  const dg = (a?.g ?? 0) - (b?.g ?? 0);
  const db = (a?.b ?? 0) - (b?.b ?? 0);
  return dr * dr + dg * dg + db * db;
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

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
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

async function performPaletteSwitch(entry, id, options = {}) {
  const { revertOnCancel } = options;
  if (!entry) {
    revertOnCancel?.();
    return false;
  }

  const decision = await requestPaletteSwitchDecision({
    paletteName: entry.name || id || '目标色卡',
    hasDrawing: isCanvasDirty()
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
    applyPalette(entry.data, entry.name, { libraryId: id, persistSelection: true });
    const changed = remapCanvasToActivePalette();
    redrawCanvas();
    if (changed > 0) {
      saveHistory();
    }
    updatePaletteHistoryValue(id);
    return true;
  }

  revertOnCancel?.();
  return false;
}
function normalizePalette(rawPalette) {
  const palette = {}, keys = [];
  if (!rawPalette || typeof rawPalette !== 'object') return { map: palette, keys };
  for (const [code, value] of Object.entries(rawPalette)) {
    const rgb = parseColor(value);
    if (!rgb) continue;
    const normalizedCode = String(code).trim();
    if (!normalizedCode) continue;
    palette[normalizedCode] = { code: normalizedCode, color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`, rgb };
    keys.push(normalizedCode);
  }
  keys.sort((a, b) => a.localeCompare(b, 'zh-Hans-u-nu-latn', { numeric: true }));
  return { map: palette, keys };
}
export function applyPalette(rawPalette, label = '自定义', options = {}) {
  const normalized = normalizePalette(rawPalette);
  if (!normalized.keys.length) {
    window.alert('色卡为空或格式不正确。');
    return;
  }
  state.palette = normalized.map;
  state.paletteKeys = normalized.keys;
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
    options.persistSelection && persistSelectedPalette(options.libraryId);
  }
  else {
    state.currentPaletteId = null;
    persistSelectedPalette(null);
  }
  updatePaletteHistorySelect();
}
export function renderPalette() {
  if (!elements.paletteContainer) return;
  const filterText = elements.paletteFilter?.value.trim().toLowerCase() ?? '';
  elements.paletteContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();
  let count = 0;
  for (const code of state.paletteKeys) {
    if (!isColorEnabled(code)) continue;
    const entry = state.palette[code];
    if (!entry) continue;
    if (filterText && !code.toLowerCase().includes(filterText) && !entry.color.toLowerCase().includes(filterText)) continue;
    count++;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'palette-item';
    item.dataset.code = code;
    if (state.selectedColorKey === code) item.classList.add('active');
    item.innerHTML = `<span class="palette-swatch" style="background:${entry.color}"></span>` + '<span class="palette-meta">' + `<strong>${code}</strong>` + `<span>${entry.color}</span>` + '</span>';
    item.addEventListener('click', () => {
      state.selectedColorKey = code;
      updatePaletteSelection();
      updateCurrentColorInfo();
    });
    fragment.appendChild(item);
  }
  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    empty.textContent = '未找到匹配的颜色。';
    fragment.appendChild(empty);
  }
  elements.paletteContainer.appendChild(fragment);
}
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
    btn.innerHTML = `<span class="fullscreen-swatch" style="background:${entry.color}"></span>`;
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
  if (!elements.currentColorInfo) return;
  const codeSpan = elements.currentColorInfo.querySelector('.code');
  if (!codeSpan) return;
  codeSpan.textContent = state.selectedColorKey && state.palette[state.selectedColorKey] ? state.selectedColorKey : '无';
}
export function handlePaletteFile(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const paletteId = generatePaletteId(file.name);
      addPaletteToLibrary(paletteId, file.name, raw, { persist: true });
      applyPalette(raw, file.name, { libraryId: paletteId, persistSelection: true });
    }
    catch (error) {
      window.alert('色卡文件解析失败，请确认格式正确为 JSON。');
    }
  };
  reader.readAsText(file, 'utf-8');
  ev.target.value = '';
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
}
export async function handlePaletteSelectionChange(ev) {
  const id = ev.target.value;
  if (id === '__none' || id === state.currentPaletteId) return;
  const entry = state.paletteLibrary.get(id);
  if (!entry) {
    ev.target.value = state.currentPaletteId || '__none';
    return;
  }
  const previousValue = state.currentPaletteId || '__none';
  const applied = await performPaletteSwitch(entry, id, {
    revertOnCancel: () => {
      ev.target.value = previousValue;
    }
  });
  if (!applied) {
    ev.target.value = previousValue;
  }
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
  elements.statusPalette.textContent = `${displayLabel}· ${count}色`;
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
export function derivePaletteName(file) {
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
}
function generatePaletteId(name = 'palette') {
  const safeName = name.replace(/\.[^/.\\]+$/, '').replace(/\s+/g, '_').slice(0, 40);
  return `user-${safeName}-${Date.now()}`;
}
const colorManagementState = {
  enabledColors: new Set(), // 启用的颜色代码
  tempEnabledColors: new Set(), // 临时状态用于取消操作
  isVisible: false,
  renderJob: null
};

// 初始化颜色管理
export function initializeColorManagement() {
  bindColorManagementEvents();
  // 默认所有颜色都启用
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

// 绑定事件
function bindColorManagementEvents() {
  // 打开颜色管理窗口
  elements.colorManageBtn?.addEventListener('click', openColorManagement);

  // 关闭颜色管理窗口
  elements.colorManageCloseBtn?.addEventListener('click', () => toggleColorManagement(false));
  elements.colorManageCancelBtn?.addEventListener('click', cancelColorManagement);

  // 确认颜色管理更改
  elements.colorManageConfirmBtn?.addEventListener('click', confirmColorManagement);

  // 全选/全不选
  elements.selectAllColorsBtn?.addEventListener('click', selectAllColors);
  elements.deselectAllColorsBtn?.addEventListener('click', deselectAllColors);
  elements.colorManageList?.addEventListener('click', handleColorListInteraction);

  // 点击外部关闭
  document.addEventListener('click', (e) => {
    if (colorManagementState.isVisible &&
      !elements.colorManageWindow.contains(e.target) &&
      e.target !== elements.colorManageBtn) {
      toggleColorManagement(false);
    }
  });

  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && colorManagementState.isVisible) {
      toggleColorManagement(false);
    }
  });
}

function handleColorListInteraction(event) {
  const checkbox = event.target.closest('.color-manage-checkbox');
  if (!checkbox || !elements.colorManageList?.contains(checkbox)) return;
  handleColorToggle(checkbox);
}

// 打开颜色管理窗口
function openColorManagement() {
  if (!state.paletteKeys.length) {
    window.alert('请先加载色卡');
    return;
  }

  // 保存当前状态用于取消操作
  colorManagementState.tempEnabledColors = new Set(colorManagementState.enabledColors);

  // 生成颜色列表
  renderColorManagementList();

  // 更新计数
  updateColorCount();

  // 显示窗口
  toggleColorManagement(true);
}

// 切换颜色管理窗口显示状态
function toggleColorManagement(force) {
  const next = typeof force === 'boolean' ? force : !colorManagementState.isVisible;

  if (colorManagementState.isVisible === next) return;

  colorManagementState.isVisible = next;
  if (!next) {
    cancelColorManagementRenderJob();
  }
  syncColorManagementWindow();
}

// 同步颜色管理窗口状态
function syncColorManagementWindow() {
  if (!elements.colorManageWindow) return;

  const visible = colorManagementState.isVisible;
  elements.colorManageWindow.classList.toggle('is-visible', visible);
  elements.colorManageWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (visible) {
    elements.colorManageWindow.focus();
    updateColorCount();
  }
}

// 渲染颜色管理列表
function cancelColorManagementRenderJob() {
  if (colorManagementState.renderJob !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(colorManagementState.renderJob);
  }
  colorManagementState.renderJob = null;
}

function renderColorManagementList() {
  if (!elements.colorManageList) return;

  cancelColorManagementRenderJob();

  const container = elements.colorManageList;
  const keys = state.paletteKeys.slice();
  if (!keys.length) {
    container.innerHTML = '<div class="color-manage-empty">暂无可用颜色</div>';
    return;
  }

  container.innerHTML = '';

  let index = 0;
  const chunkSize = 120;
  const renderChunk = () => {
    const fragment = document.createDocumentFragment();
    const end = Math.min(index + chunkSize, keys.length);
    for (; index < end; index += 1) {
      const code = keys[index];
      const entry = state.palette[code];
      if (!entry) continue;

      const item = document.createElement('div');
      item.className = 'color-manage-item';
      item.dataset.code = code;

      const isEnabled = colorManagementState.enabledColors.has(code);
      if (!isEnabled) {
        item.classList.add('disabled');
      }

      item.innerHTML = `
             <div class="color-manage-checkbox ${isEnabled ? 'checked' : ''}"
                  data-code="${code}"
                  role="checkbox"
                  aria-checked="${isEnabled}">
             </div>
             <div class="color-manage-swatch" style="background: ${entry.color}"></div>
             <div class="color-manage-info">
                 <div class="color-manage-code">${code}</div>
                 <div class="color-manage-color">${entry.color}</div>
             </div>
         `;

      fragment.appendChild(item);
    }

    container.appendChild(fragment);

    if (index < keys.length && typeof window !== 'undefined') {
      colorManagementState.renderJob = window.requestAnimationFrame(renderChunk);
    } else {
      colorManagementState.renderJob = null;
    }
  };

  renderChunk();
}
function handleColorToggle(checkbox) {
  if (!checkbox) return;
  const code = checkbox.dataset.code;
  const isCurrentlyEnabled = checkbox.classList.contains('checked');

  // 如果是最后一个启用的颜色，不允许禁用
  if (isCurrentlyEnabled && colorManagementState.enabledColors.size <= 1) {
    showColorManagementMessage('至少需要启用一个颜色', 'error');
    return;
  }

  // 切换状态
  if (isCurrentlyEnabled) {
    checkbox.classList.remove('checked');
    checkbox.setAttribute('aria-checked', 'false');
    colorManagementState.enabledColors.delete(code);
  } else {
    checkbox.classList.add('checked');
    checkbox.setAttribute('aria-checked', 'true');
    colorManagementState.enabledColors.add(code);
  }

  // 更新父项的禁用状态
  const item = checkbox.closest('.color-manage-item');
  if (item) {
    item.classList.toggle('disabled', !colorManagementState.enabledColors.has(code));
  }

  // 更新计数和消息
  updateColorCount();
  clearColorManagementMessage();
}

// 全选颜色
function selectAllColors() {
  state.paletteKeys.forEach(code => {
    colorManagementState.enabledColors.add(code);
  });
  renderColorManagementList();
  updateColorCount();
  clearColorManagementMessage();
}

// 全不选颜色
function deselectAllColors() {
  // 确保至少保留一个颜色
  if (state.paletteKeys.length > 0) {
    const firstCode = state.paletteKeys[0];
    colorManagementState.enabledColors.clear();
    colorManagementState.enabledColors.add(firstCode);
  }
  renderColorManagementList();
  updateColorCount();
  showColorManagementMessage('已保留至少一个颜色', 'info');
}

// 更新颜色计数
function updateColorCount() {
  if (!elements.enabledColorCount) return;

  const total = state.paletteKeys.length;
  const enabled = colorManagementState.enabledColors.size;

  elements.enabledColorCount.textContent = `已启用: ${enabled}/${total}`;

  // 如果启用的颜色很少，显示警告
  if (enabled <= 3 && total > 5) {
    showColorManagementMessage('启用的颜色较少，可能会影响绘制', 'warning');
  }
}

// 显示消息
function showColorManagementMessage(message, type = 'info') {
  if (!elements.colorManageMessage) return;

  elements.colorManageMessage.textContent = message;
  elements.colorManageMessage.className = `color-manage-message ${type}`;
}

// 清除消息
function clearColorManagementMessage() {
  if (!elements.colorManageMessage) return;

  elements.colorManageMessage.textContent = '';
  elements.colorManageMessage.className = 'color-manage-message';
}

// 取消颜色管理更改
function cancelColorManagement() {
  // 恢复临时状态
  colorManagementState.enabledColors = new Set(colorManagementState.tempEnabledColors);
  toggleColorManagement(false);
}

// 确认颜色管理更改
function confirmColorManagement() {
  // 验证至少有一个颜色启用
  if (colorManagementState.enabledColors.size === 0) {
    showColorManagementMessage('必须至少启用一个颜色', 'error');
    return;
  }

  // 如果当前选中的颜色被禁用了，需要重新选择
  if (state.selectedColorKey && !colorManagementState.enabledColors.has(state.selectedColorKey)) {
    // 找到第一个启用的颜色
    const firstEnabled = state.paletteKeys.find(code => colorManagementState.enabledColors.has(code));
    state.selectedColorKey = firstEnabled || null;
    updatePaletteSelection();
  }

  // 更新调色板显示
  renderPalette();
  renderFullscreenPalette();

  // 重新绘制画布（为了更新自动贴合底图颜色）
  redrawCanvas();

  toggleColorManagement(false);
  showColorManagementMessage('颜色设置已更新', 'info');

  // 清除临时状态
  colorManagementState.tempEnabledColors.clear();
}

// 检查颜色是否启用
export function isColorEnabled(code) {
  return colorManagementState.enabledColors.has(code);
}

// 获取启用的颜色列表
export function getEnabledColors() {
  return Array.from(colorManagementState.enabledColors);
}

// 在自动贴合底图颜色时，从启用的颜色中寻找最接近的颜色
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

// 初始化颜色管理（在调色板加载后调用）
export function initColorManagement() {
  bindColorManagementEvents();
  // 默认所有颜色都启用
  if (state.paletteKeys.length > 0) {
    state.paletteKeys.forEach(code => {
      colorManagementState.enabledColors.add(code);
    });
  }
  renderPalette();
  renderFullscreenPalette();
}
