import { STORAGE_KEYS } from './constants.js';
import { elements, builtinPaletteNode } from './elements.js';
import { state } from './state.js';
import { parseColor, hasLocalStorage } from './utils.js';
import { clearDrawingGrid, isCanvasDirty } from './canvas.js';

const DEFAULT_PALETTE_SOURCES = buildDefaultPaletteSources();

function buildDefaultPaletteSources() {
  let builtin = {};
  if (builtinPaletteNode) {
    try {
      const raw = (builtinPaletteNode.textContent || '').trim();
      builtin = raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.warn('Failed to parse bundled DMC palette:', error);
    }
  }
  return [
    { id: 'builtin-dmc', name: 'DMC（内置）', data: builtin, prepend: true },
    { id: 'output-coco', file: 'Coco.json', name: 'Coco' },
    { id: 'output-mard-24', file: 'MARD-24.json', name: 'MARD 24' },
    { id: 'output-mard-48', file: 'MARD-48.json', name: 'MARD 48' },
    { id: 'output-mard-72', file: 'MARD-72.json', name: 'MARD 72' },
    { id: 'output-mard-96', file: 'MARD-96.json', name: 'MARD 96' },
    { id: 'output-mard-120', file: 'MARD-120.json', name: 'MARD 120' },
    { id: 'output-mard-144', file: 'MARD-144.json', name: 'MARD 144' },
    { id: 'output-mard-221', file: 'MARD-221.json', name: 'MARD 221' }
  ];
}

export function getActivePaletteLabel() {
  const label = (state.currentPaletteLabel || '').trim();
  if (label) return label;
  if (state.currentPaletteId && state.paletteLibrary.has(state.currentPaletteId)) {
    const entry = state.paletteLibrary.get(state.currentPaletteId);
    if (entry && entry.name) return entry.name;
  }
  return '未选择色卡';
}

export function collectUsedColors() {
  const usage = new Map();
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y][x];
      if (!cell) continue;
      if (!usage.has(cell.code)) {
        usage.set(cell.code, { code: cell.code, color: cell.color, rgb: cell.rgb, count: 0 });
      }
      const entry = usage.get(cell.code);
      entry.count += 1;
    }
  }
  const list = Array.from(usage.values());
  list.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-u-nu-latn', { numeric: true }));
  return list;
}

export function ensurePaletteSwitchAllowed() {
  if (!isCanvasDirty()) return true;
  const confirmed = window.confirm('切换色卡会导致画布颜色被清空，是否继续？');
  if (!confirmed) return false;
  clearDrawingGrid();
  return true;
}

function normalizePalette(rawPalette) {
  const palette = {};
  const keys = [];
  if (!rawPalette || typeof rawPalette !== 'object') {
    return { map: palette, keys };
  }
  for (const [code, value] of Object.entries(rawPalette)) {
    const rgb = parseColor(value);
    if (!rgb) continue;
    const normalizedCode = String(code).trim();
    if (!normalizedCode) continue;
    palette[normalizedCode] = {
      code: normalizedCode,
      color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      rgb
    };
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
  renderPalette();
  renderFullscreenPalette();
  updatePaletteSelection();
  updateCurrentColorInfo();
  updateStatusPalette(label);
  if (options.libraryId) {
    state.currentPaletteId = options.libraryId;
    if (options.persistSelection) {
      persistSelectedPalette(options.libraryId);
    }
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
    if (filterText) {
      const matchCode = code.toLowerCase().includes(filterText);
      const matchColor = entry.color.toLowerCase().includes(filterText);
      if (!matchCode && !matchColor) continue;
    }
    count += 1;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'palette-item';
    item.dataset.code = code;
    if (state.selectedColorKey === code) {
      item.classList.add('active');
    }
    item.innerHTML =
      `<span class="palette-swatch" style="background:${entry.color}"></span>` +
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

function updatePaletteSelection() {
  if (!elements.paletteContainer) return;
  const items = elements.paletteContainer.querySelectorAll('.palette-item');
  items.forEach((item) => {
    if (item.dataset.code === state.selectedColorKey) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
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
  state.paletteKeys.forEach((code) => {
    const entry = state.palette[code];
    if (!entry) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.code = code;
    btn.innerHTML = `<span class="fullscreen-swatch" style="background:${entry.color}"></span>`;
    if (state.selectedColorKey === code) {
      btn.classList.add('active');
    }
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
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.code === state.selectedColorKey);
  });
}

export function updateCurrentColorInfo() {
  if (!elements.currentColorInfo) return;
  const codeSpan = elements.currentColorInfo.querySelector('.code');
  if (!codeSpan) return;
  if (!state.selectedColorKey || !state.palette[state.selectedColorKey]) {
    codeSpan.textContent = '—';
    return;
  }
  codeSpan.textContent = state.selectedColorKey;
}

export function handlePaletteFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const paletteId = generatePaletteId(file.name);
      addPaletteToLibrary(paletteId, file.name, raw, { persist: true });
      applyPalette(raw, file.name, { libraryId: paletteId, persistSelection: true });
    } catch (error) {
      window.alert('色卡文件解析失败，请确认格式正确的 JSON。');
    }
  };
  reader.readAsText(file, 'utf-8');
  ev.target.value = '';
}

export function handleDeletePalette() {
  const id = elements.paletteHistorySelect?.value;
  if (!id || id === '__none') return;
  if (id === 'builtin-dmc') {
    window.alert('内置 DMC 色卡不能删除。');
    return;
  }
  const entry = state.paletteLibrary.get(id);
  if (!entry) {
    window.alert('未找到该色卡。');
    return;
  }
  if (!window.confirm(`确认删除色卡「${entry.name}」吗？此操作不可撤销。`)) return;
  state.paletteLibrary.delete(id);
  state.paletteOrder = state.paletteOrder.filter((x) => x !== id);
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
  if (elements.paletteHistorySelect) {
    elements.paletteHistorySelect.value = '__none';
  }
  persistPaletteLibrary();
}

export function handlePaletteSelectionChange(ev) {
  const id = ev.target.value;
  if (id === '__none') return;
  if (id === state.currentPaletteId) return;
  const entry = state.paletteLibrary.get(id);
  if (!entry) {
    ev.target.value = state.currentPaletteId || '__none';
    return;
  }
  if (!ensurePaletteSwitchAllowed()) {
    ev.target.value = state.currentPaletteId || '__none';
    return;
  }
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
  for (const source of DEFAULT_PALETTE_SOURCES) {
    if (state.paletteLibrary.has(source.id)) continue;
    if (source.data && Object.keys(source.data).length) {
      addPaletteToLibrary(source.id, source.name, source.data, {
        persist: false,
        prepend: Boolean(source.prepend)
      });
      continue;
    }
    if (!source.file) continue;
    try {
      const response = await fetch(`./output/${source.file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      addPaletteToLibrary(source.id, source.name, data, { persist: false });
    } catch (error) {
      console.warn('Failed to load palette from', source.file, error);
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
    list.forEach((entry) => {
      if (!entry || !entry.id || !entry.name || !entry.data) return;
      addPaletteToLibrary(entry.id, entry.name, entry.data, { persist: false });
    });
  } catch (error) {
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
      if (elements.paletteHistorySelect) {
        elements.paletteHistorySelect.value = selectedId;
      }
      applied = true;
    }
  }
  if (!applied && state.paletteLibrary.has('builtin-dmc')) {
    const entry = state.paletteLibrary.get('builtin-dmc');
    applyPalette(entry.data, entry.name, { libraryId: 'builtin-dmc', persistSelection: false });
    if (elements.paletteHistorySelect) {
      elements.paletteHistorySelect.value = 'builtin-dmc';
    }
  } else if (!applied) {
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
  if (state.paletteLibrary.has(id)) {
    return;
  }
  const { persist = true, prepend = false } = options;
  state.paletteLibrary.set(id, { name, data });
  const existingIndex = state.paletteOrder.indexOf(id);
  if (existingIndex === -1) {
    if (prepend) {
      state.paletteOrder.unshift(id);
    } else {
      state.paletteOrder.push(id);
    }
  }
  updatePaletteHistorySelect();
  if (persist) {
    persistPaletteLibrary();
  }
}

function persistPaletteLibrary() {
  if (!hasLocalStorage()) return;
  try {
    const payload = state.paletteOrder
      .filter((id) => id !== 'builtin-dmc' && !id.startsWith('output-'))
      .map((id) => {
        const entry = state.paletteLibrary.get(id);
        if (!entry) return null;
        return { id, name: entry.name, data: entry.data };
      })
      .filter(Boolean);
    localStorage.setItem(STORAGE_KEYS.paletteLibrary, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist palette library:', error);
  }
}

function persistSelectedPalette(id) {
  if (!hasLocalStorage()) return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.paletteSelection, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.paletteSelection);
    }
  } catch (error) {
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
  state.paletteOrder.forEach((id) => {
    const entry = state.paletteLibrary.get(id);
    if (!entry) return;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${entry.name} (${Object.keys(entry.data || {}).length} 色)`;
    if (currentValue === id || (!currentValue && existingValue === id)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  if (currentValue && state.paletteLibrary.has(currentValue)) {
    select.value = currentValue;
  } else if (existingValue && select.querySelector(`option[value="${existingValue}"]`)) {
    select.value = existingValue;
  } else {
    select.value = '__none';
  }
}

function generatePaletteId(name = 'palette') {
  const safeName = name.replace(/\.[^/.\\]+$/, '').replace(/\s+/g, '_').slice(0, 40);
  return `user-${safeName}-${Date.now()}`;
}
