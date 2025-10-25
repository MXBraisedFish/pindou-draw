import { STORAGE_KEYS } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { parseColor, hasLocalStorage } from './utils.js';
import { clearDrawingGrid, isCanvasDirty } from './canvas.js';

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
  } catch (error) { return null; }
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
  } catch (error) { return null; }
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

export function ensurePaletteSwitchAllowed() {
  return !isCanvasDirty() || window.confirm('切换色卡会导致画布颜色被清空，是否继续？');
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
  if (!normalized.keys.length) { window.alert('色卡为空或格式不正确。'); return; }

  state.palette = normalized.map;
  state.paletteKeys = normalized.keys;
  state.selectedColorKey = state.paletteKeys[0] || null;

  renderPalette();
  renderFullscreenPalette();
  updatePaletteSelection();
  updateCurrentColorInfo();
  updateStatusPalette(label);

  if (options.libraryId) {
    state.currentPaletteId = options.libraryId;
    options.persistSelection && persistSelectedPalette(options.libraryId);
  } else {
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
    const entry = state.palette[code];
    if (!entry) continue;
    if (filterText && !code.toLowerCase().includes(filterText) && !entry.color.toLowerCase().includes(filterText)) continue;

    count++;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'palette-item';
    item.dataset.code = code;
    if (state.selectedColorKey === code) item.classList.add('active');

    item.innerHTML = `<span class="palette-swatch" style="background:${entry.color}"></span>` +
      '<span class="palette-meta">' +
      `<strong>${code}</strong>` +
      `<span>${entry.color}</span>` +
      '</span>';

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
    } catch (error) { window.alert('色卡文件解析失败，请确认格式正确为 JSON。'); }
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
  if (!entry) { window.alert('未找到该色卡。'); return; }
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

export function handlePaletteSelectionChange(ev) {
  const id = ev.target.value;
  if (id === '__none' || id === state.currentPaletteId) return;

  const entry = state.paletteLibrary.get(id);
  if (!entry) { ev.target.value = state.currentPaletteId || '__none'; return; }
  if (!ensurePaletteSwitchAllowed()) { ev.target.value = state.currentPaletteId || '__none'; return; }

  // 清空画布
  clearDrawingGrid();
  applyPalette(entry.data, entry.name, { libraryId: id, persistSelection: true });
}

export function updateStatusPalette(label) {
  if (!elements.statusPalette) return;
  const title = label || '自定义';
  const count = state.paletteKeys.length;
  elements.statusPalette.textContent = `${title} · ${count} 色`;
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
    } catch (error) { console.warn('Failed to load palette from', source?.file ?? source?.id, error); }
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
      if (!entry.id.startsWith('builtin-')) { console.warn('Ignoring invalid palette ID in library:', entry.id); return; }
      addPaletteToLibrary(entry.id, entry.name, entry.data, { persist: false });
    });
  } catch (error) { console.warn('Failed to load palette library from storage:', error); }
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
  }
}

function addPaletteToLibrary(id, name, data, options = {}) {
  const { persist = true, prepend = false } = options;
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
    const payload = state.paletteOrder
      .filter(id => !id.startsWith('builtin-'))
      .map(id => {
        const entry = state.paletteLibrary.get(id);
        return entry ? { id, name: entry.name, data: entry.data } : null;
      })
      .filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.paletteLibrary, JSON.stringify(payload));
  } catch (error) { console.warn('Failed to persist palette library:', error); }
}

function persistSelectedPalette(id) {
  if (!hasLocalStorage()) return;
  try {
    id ? localStorage.setItem(STORAGE_KEYS.paletteSelection, id) : localStorage.removeItem(STORAGE_KEYS.paletteSelection);
  } catch (error) { console.warn('Failed to persist palette selection:', error); }
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
    option.textContent = `${entry.name} (${Object.keys(entry.data || {}).length} 色)`;
    if (currentValue === id || (!currentValue && existingValue === id)) option.selected = true;
    select.appendChild(option);
  });

  select.value = currentValue && state.paletteLibrary.has(currentValue) ? currentValue :
    (existingValue && select.querySelector(`option[value="${existingValue}"]`) ? existingValue : '__none');
}

function generatePaletteId(name = 'palette') {
  const safeName = name.replace(/\.[^/.\\]+$/, '').replace(/\s+/g, '_').slice(0, 40);
  return `user-${safeName}-${Date.now()}`;
}