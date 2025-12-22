import { elements } from './elements.js';
import { state } from './state.js';
import { applyPalette } from './palette.js';
import { createCanvas, redrawCanvas, isCanvasDirty, saveHistory, updateStatusCreated, updateZoomIndicator } from './canvas.js';

const STORAGE_KEY = 'local-save-slots-v1';
const AUTOSAVE_COUNTDOWN_KEY = 'autosave-countdown-visible';
const SLOT_COUNT = 10;
const AUTOSAVE_SLOT = 0;
const AUTOSAVE_INTERVAL_MS = 10 * 1000;
const THUMBNAIL_SIZE = 220;
const EMPTY_ASSET_PATH = 'svg/\u65e0.svg';

let autosaveTimer = null;
let autosaveToastTimer = null;
let autosaveCountdownTimer = null;
let nextAutosaveAt = 0;
let autosaveStatus = 'countdown';
let autosaveCountdownEnabled = true;
let autosaveForceUntil = 0;

function resolveAssetUrl(path) {
  try {
    return new URL(path, document.baseURI).href;
  } catch (_) {
    return path;
  }
}

function getEmptyAssetUrl() {
  return resolveAssetUrl(EMPTY_ASSET_PATH);
}

function safeParseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  try {
    return new Intl.DateTimeFormat('zh-Hans', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch (_) {
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }
}

function loadSlots() {
  const raw = safeParseJson(localStorage.getItem(STORAGE_KEY));
  const slots = Array.isArray(raw?.slots) ? raw.slots : [];
  const normalized = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const slot = slots[i];
    return slot && typeof slot === 'object' ? slot : null;
  });
  return normalized;
}

function saveSlots(slots) {
  const payload = { version: 1, slots };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function buildPalettePayload() {
  const entries = state.paletteKeys
    .map((code) => {
      const entry = state.palette?.[code];
      if (!entry) return null;
      return {
        code: entry.code ?? code,
        type: entry.type ?? 'normal',
        color1: entry.color1 ?? entry.color ?? '#000000',
        color2: entry.color2 ?? null
      };
    })
    .filter(Boolean);

  return {
    id: state.currentPaletteId ?? null,
    label: state.currentPaletteLabel || '当前色卡',
    entries
  };
}

function buildGridRows() {
  return state.grid.map((row) => row.map((cell) => (cell?.code ? String(cell.code) : '')).join(','));
}

function buildThumbnailDataUrl() {
  const width = state.width;
  const height = state.height;
  if (!width || !height) return '';

  const scale = Math.max(width, height);
  const cell = Math.max(1, Math.floor(THUMBNAIL_SIZE / scale));
  const canvas = document.createElement('canvas');
  canvas.width = width * cell;
  canvas.height = height * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    const row = state.grid[y] || [];
    for (let x = 0; x < width; x += 1) {
      const cellEntry = row[x];
      const color = cellEntry?.color1 ?? cellEntry?.color ?? null;
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  try {
    return canvas.toDataURL('image/png');
  } catch (_) {
    return '';
  }
}

function buildThumbnailDataUrlFromSlot(slot) {
  const width = Number(slot?.canvas?.width);
  const height = Number(slot?.canvas?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return '';

  const gridRows = Array.isArray(slot?.gridRows) ? slot.gridRows : [];
  const entries = Array.isArray(slot?.palette?.entries) ? slot.palette.entries : [];
  if (!gridRows.length || !entries.length) return '';

  const paletteByCode = new Map();
  entries.forEach((entry) => {
    const code = typeof entry?.code === 'string' ? entry.code.trim() : '';
    const primary = typeof entry?.color1 === 'string' && entry.color1.trim()
      ? entry.color1.trim()
      : (typeof entry?.color === 'string' ? entry.color.trim() : '');
    if (!code || !primary) return;
    paletteByCode.set(code, primary);
  });
  if (!paletteByCode.size) return '';

  const scale = Math.max(width, height);
  const cell = Math.max(1, Math.floor(THUMBNAIL_SIZE / scale));
  const canvas = document.createElement('canvas');
  canvas.width = width * cell;
  canvas.height = height * cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y += 1) {
    const rowRaw = typeof gridRows[y] === 'string' ? gridRows[y] : '';
    if (!rowRaw) continue;
    const codes = rowRaw.split(',');
    for (let x = 0; x < width; x += 1) {
      const code = codes[x] ? codes[x].trim() : '';
      if (!code) continue;
      const color = paletteByCode.get(code);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  try {
    return canvas.toDataURL('image/png');
  } catch (_) {
    return '';
  }
}

function buildSlotPayload(options = {}) {
  const includeThumbnail = options.includeThumbnail !== false;
  const savedAt = nowIso();
  return {
    savedAt,
    canvas: {
      width: state.width,
      height: state.height,
      pixelRatio: state.pixelRatio,
      cellSize: state.cellSize
    },
    palette: buildPalettePayload(),
    gridRows: buildGridRows(),
    thumbnail: includeThumbnail ? buildThumbnailDataUrl() : ''
  };
}

function applyPaletteFromSlot(slot) {
  const palette = slot?.palette;
  const entries = Array.isArray(palette?.entries) ? palette.entries : [];
  const rawPalette = {};
  entries.forEach((entry) => {
    if (!entry || typeof entry.code !== 'string' || !entry.code.trim()) return;
    rawPalette[entry.code] = {
      num: entry.code,
      type: entry.type ?? 'normal',
      color1: entry.color1 ?? entry.color ?? '#000000',
      color: entry.color1 ?? entry.color ?? '#000000',
      color2: entry.color2 ?? null
    };
  });
  applyPalette(rawPalette, palette?.label || '本地色卡', { persistSelection: false });
}

function applyCanvasFromSlot(slot) {
  const canvas = slot?.canvas || {};
  const width = Number(canvas.width);
  const height = Number(canvas.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    window.alert('本地存储内容损坏：画布尺寸无效。');
    return false;
  }

  const createdAt = slot?.savedAt ?? null;
  const cellSize = Number.isFinite(Number(canvas.pixelRatio)) ? Number(canvas.pixelRatio) : undefined;
  createCanvas(width, height, { createdAt, cellSize });

  const gridRows = Array.isArray(slot.gridRows) ? slot.gridRows : [];
  for (let y = 0; y < height; y += 1) {
    const rowRaw = typeof gridRows[y] === 'string' ? gridRows[y] : '';
    const codes = rowRaw ? rowRaw.split(',') : [];
    for (let x = 0; x < width; x += 1) {
      const code = codes[x] ? codes[x].trim() : '';
      state.grid[y][x] = code ? (state.palette?.[code] ?? null) : null;
    }
  }

  redrawCanvas();
  updateStatusCreated();
  updateZoomIndicator();
  saveHistory();
  return true;
}

function isSlotEmpty(slot) {
  return !slot || typeof slot !== 'object' || !slot.canvas || !Array.isArray(slot.gridRows);
}

function openLocalStorageWindow(mode) {
  const win = elements.localStorageWindow;
  if (!win) return;
  win.dataset.mode = mode;
  win.classList.add('is-active');
  win.setAttribute('aria-hidden', 'false');

  const title = elements.localStorageWindowTitle;
  const hint = elements.localStorageWindowHint;
  if (title) {
    title.textContent = mode === 'load' ? '读取本地存储' : '保存在本地';
  }
  if (hint) {
    hint.textContent =
      mode === 'load'
        ? '点击存储格读取本地存储内容'
        : '点击存储格存储在本地，位置1为自动保存不可手动存储';
  }

  closeAllToolPanels();
  renderSlots();
  win.focus?.();
}

export function openLocalStorageWindowByMode(mode) {
  openLocalStorageWindow(mode);
}

function closeLocalStorageWindow() {
  const win = elements.localStorageWindow;
  if (!win) return;
  win.classList.remove('is-active');
  win.setAttribute('aria-hidden', 'true');
}

function updateAutosaveCountdownText() {
  const toast = elements.autoSaveToast;
  if (!toast || autosaveStatus !== 'countdown' || !autosaveCountdownEnabled) return;
  const remaining = Math.max(0, nextAutosaveAt - Date.now());
  toast.textContent = `自动保存：下次保存 ${formatCountdown(remaining)}`;
  toast.classList.remove('is-loading');
  toast.classList.add('is-visible');
  toast.setAttribute('aria-hidden', 'false');
}

function showAutoSaveToast(message, options = {}) {
  const toast = elements.autoSaveToast;
  if (!toast) return;

  autosaveStatus = options.status ?? 'status';
  const duration = options.durationMs ?? 2000;
  autosaveForceUntil = Date.now() + duration;
  toast.textContent = message;
  toast.classList.toggle('is-loading', Boolean(options.loading));
  toast.classList.add('is-visible');
  toast.setAttribute('aria-hidden', 'false');
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      toast.classList.add('is-visible');
      toast.setAttribute('aria-hidden', 'false');
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
  }

  if (autosaveToastTimer) window.clearTimeout(autosaveToastTimer);
  autosaveToastTimer = window.setTimeout(() => {
    autosaveStatus = 'countdown';
    if (autosaveCountdownEnabled) {
      updateAutosaveCountdownText();
      return;
    }
    toast.classList.remove('is-visible', 'is-loading');
    toast.setAttribute('aria-hidden', 'true');
    toast.style.opacity = '';
    toast.style.transform = '';
  }, duration);
}

function buildSlotTile(slot, index, mode) {
  const isAuto = index === AUTOSAVE_SLOT;
  const empty = isSlotEmpty(slot);
  const wrapper = document.createElement('div');
  wrapper.className = `local-slot${empty ? ' is-empty' : ''}`;
  wrapper.dataset.slot = String(index);
  wrapper.setAttribute('role', 'listitem');
  wrapper.setAttribute('aria-label', `本地存储位置 ${index + 1}`);
  wrapper.tabIndex = 0;

  if (isAuto) {
    const badge = document.createElement('div');
    badge.className = 'local-slot__badge';
    badge.textContent = '自动保存';
    wrapper.appendChild(badge);
  }

  const preview = document.createElement('div');
  preview.className = 'local-slot__preview';
  if (empty) {
    const emptyWrap = document.createElement('div');
    emptyWrap.className = 'local-slot__empty';
    const icon = document.createElement('img');
    icon.src = getEmptyAssetUrl();
    icon.alt = '';
    const text = document.createElement('div');
    text.textContent = '无存储内容';
    emptyWrap.appendChild(icon);
    emptyWrap.appendChild(text);
    preview.appendChild(emptyWrap);
  } else {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    const thumbnail = typeof slot.thumbnail === 'string' ? slot.thumbnail : '';
    const generated = thumbnail ? '' : buildThumbnailDataUrlFromSlot(slot);
    const fallbackSrc = getEmptyAssetUrl();
    img.src = thumbnail || generated || fallbackSrc;
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied === 'true') return;
      img.dataset.fallbackApplied = 'true';
      img.src = fallbackSrc;
    });
    preview.appendChild(img);
  }
  wrapper.appendChild(preview);

  const meta = document.createElement('div');
  meta.className = 'local-slot__meta';
  const title = document.createElement('div');
  title.className = 'local-slot__meta-title';
  title.textContent = empty ? `位置 ${index + 1}` : (slot.palette?.label || '未知色卡');
  meta.appendChild(title);

  const sizeRow = document.createElement('div');
  sizeRow.className = 'local-slot__meta-row';
  const sizeLeft = document.createElement('span');
  sizeLeft.textContent = empty ? '尺寸：--' : `尺寸：${slot.canvas?.width ?? '--'}×${slot.canvas?.height ?? '--'}`;
  const sizeRight = document.createElement('span');
  sizeRight.textContent = empty ? '' : `时间：${formatTime(slot.savedAt)}`;
  sizeRow.appendChild(sizeLeft);
  sizeRow.appendChild(sizeRight);
  meta.appendChild(sizeRow);
  wrapper.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'local-slot__actions';
  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = mode === 'load' ? 'primary-button' : 'ghost-button';
  actionBtn.dataset.action = mode === 'load' ? 'load' : 'delete';
  actionBtn.dataset.slot = String(index);
  actionBtn.textContent = mode === 'load' ? '读取' : '删除保存';
  actionBtn.disabled = empty;
  actions.appendChild(actionBtn);
  wrapper.appendChild(actions);

  return wrapper;
}

function renderSlots() {
  const container = elements.localStorageSlots;
  const win = elements.localStorageWindow;
  if (!container || !win) return;
  const mode = win.dataset.mode === 'load' ? 'load' : 'save';
  const slots = loadSlots();

  container.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    container.appendChild(buildSlotTile(slots[i], i, mode));
  }
}

function saveToSlot(index, options = {}) {
  if (index === AUTOSAVE_SLOT && options.manual) {
    window.alert('第 1 个位置为自动保存位，不能手动保存到此处。');
    return;
  }
  if (!state.width || !state.height) {
    window.alert('请先创建画布后再保存。');
    return;
  }
  if (!isCanvasDirty()) {
    window.alert('当前画布为空，无需保存。');
    return;
  }

  const slots = loadSlots();
  const existing = slots[index];
  if (!isSlotEmpty(existing) && options.confirmOverwrite) {
    const ok = window.confirm(`位置 ${index + 1} 已有存储内容，是否覆盖保存？`);
    if (!ok) return;
  }

  const payload = buildSlotPayload({ includeThumbnail: options.includeThumbnail !== false });
  slots[index] = payload;
  try {
    saveSlots(slots);
  } catch (error) {
    console.error('Failed to save local slot', error);
    window.alert('本地保存失败：可能是浏览器存储空间不足。');
    return;
  }

  renderSlots();
}

export function emergencyAutosave() {
  if (!state.width || !state.height) return false;
  if (!isCanvasDirty()) return false;
  try {
    showAutoSaveToast('正在自动保存…', { loading: true, durationMs: 2000, status: 'saving' });
    const slots = loadSlots();
    slots[AUTOSAVE_SLOT] = buildSlotPayload({ includeThumbnail: false });
    saveSlots(slots);
    showAutoSaveToast('已自动保存', { loading: false, durationMs: 2000, status: 'saved' });
    return true;
  } catch (error) {
    console.error('Emergency autosave failed', error);
    showAutoSaveToast('自动保存失败（存储空间不足？）', { loading: false, durationMs: 2000, status: 'error' });
    return false;
  }
}

function deleteSlot(index) {
  const slots = loadSlots();
  if (isSlotEmpty(slots[index])) return;
  const ok = window.confirm(`确定删除位置 ${index + 1} 的存储内容吗？`);
  if (!ok) return;
  slots[index] = null;
  try {
    saveSlots(slots);
  } catch (error) {
    console.error('Failed to delete local slot', error);
  }
  renderSlots();
}

function loadFromSlot(index) {
  const slots = loadSlots();
  const slot = slots[index];
  if (isSlotEmpty(slot)) return;

  if (isCanvasDirty()) {
    const ok = window.confirm('读取本地存储会覆盖当前画布内容，是否继续？');
    if (!ok) return;
  }

  applyPaletteFromSlot(slot);
  const ok = applyCanvasFromSlot(slot);
  if (ok) closeLocalStorageWindow();
}

function bindSlotEvents() {
  const container = elements.localStorageSlots;
  const win = elements.localStorageWindow;
  if (!container || !win) return;

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionBtn = target.closest('button[data-action]');
    if (actionBtn) {
      event.stopPropagation();
      const slotIndex = Number(actionBtn.getAttribute('data-slot'));
      const action = actionBtn.getAttribute('data-action');
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
      if (action === 'delete') deleteSlot(slotIndex);
      if (action === 'load') loadFromSlot(slotIndex);
      return;
    }

    const tile = target.closest('.local-slot');
    if (!tile) return;
    const slotIndex = Number(tile.dataset.slot);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
    const mode = win.dataset.mode === 'load' ? 'load' : 'save';
    if (mode === 'load') {
      loadFromSlot(slotIndex);
      return;
    }
    const slots = loadSlots();
    saveToSlot(slotIndex, { manual: true, confirmOverwrite: !isSlotEmpty(slots[slotIndex]) });
  });
}

function bindWindowControls() {
  const close = () => closeLocalStorageWindow();
  elements.localStorageCloseBtn?.addEventListener('click', close);
  elements.localStorageCancelBtn?.addEventListener('click', close);
  elements.localStorageWindow?.addEventListener('click', (event) => {
    if (event.target === elements.localStorageWindow) close();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (elements.localStorageWindow?.getAttribute('aria-hidden') === 'false') {
      close();
    }
  });
}

function startAutosave() {
  if (autosaveTimer) return;
  if (!nextAutosaveAt) {
    nextAutosaveAt = Date.now() + AUTOSAVE_INTERVAL_MS;
  }
  if (autosaveCountdownEnabled && !autosaveCountdownTimer) {
    autosaveCountdownTimer = window.setInterval(updateAutosaveCountdownText, 1000);
  }
  updateAutosaveCountdownText();
  autosaveTimer = window.setInterval(() => {
    if (!state.width || !state.height) return;
    nextAutosaveAt = Date.now() + AUTOSAVE_INTERVAL_MS;
    if (!isCanvasDirty()) {
      updateAutosaveCountdownText();
      return;
    }
    showAutoSaveToast('正在自动保存…', { loading: true, durationMs: 2000, status: 'saving' });
    window.setTimeout(() => {
      try {
        saveToSlot(AUTOSAVE_SLOT, { manual: false, confirmOverwrite: false });
        showAutoSaveToast('已自动保存', { loading: false, durationMs: 2000, status: 'saved' });
      } catch (error) {
        console.error('Autosave failed', error);
        showAutoSaveToast('自动保存失败（存储空间不足？）', { loading: false, durationMs: 2000, status: 'error' });
      }
    }, 200);
  }, AUTOSAVE_INTERVAL_MS);
}

export function initializeLocalStorageFeature() {
  if (!elements.localStorageWindow) return;

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(AUTOSAVE_COUNTDOWN_KEY);
    autosaveCountdownEnabled = stored !== 'false';
  }
  if (elements.autosaveCountdownToggle) {
    elements.autosaveCountdownToggle.checked = autosaveCountdownEnabled;
  }
  if (elements.autoSaveToast && autosaveCountdownEnabled) {
    autosaveStatus = 'countdown';
    if (!nextAutosaveAt) {
      nextAutosaveAt = Date.now() + AUTOSAVE_INTERVAL_MS;
    }
    updateAutosaveCountdownText();
  } else if (elements.autoSaveToast) {
    elements.autoSaveToast.classList.remove('is-visible', 'is-loading');
    elements.autoSaveToast.setAttribute('aria-hidden', 'true');
    elements.autoSaveToast.style.opacity = '';
    elements.autoSaveToast.style.transform = '';
  }

  elements.openLocalSaveBtn?.addEventListener('click', () => openLocalStorageWindow('save'));
  elements.openLocalLoadBtn?.addEventListener('click', () => openLocalStorageWindow('load'));
  bindWindowControls();
  bindSlotEvents();
  startAutosave();
}

export function setAutosaveCountdownEnabled(enabled) {
  autosaveCountdownEnabled = Boolean(enabled);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AUTOSAVE_COUNTDOWN_KEY, autosaveCountdownEnabled ? 'true' : 'false');
    } catch (_) { }
  }
  if (elements.autosaveCountdownToggle) {
    elements.autosaveCountdownToggle.checked = autosaveCountdownEnabled;
  }
  if (autosaveCountdownEnabled) {
    if (!nextAutosaveAt) {
      nextAutosaveAt = Date.now() + AUTOSAVE_INTERVAL_MS;
    }
    if (!autosaveCountdownTimer) {
      autosaveCountdownTimer = window.setInterval(updateAutosaveCountdownText, 1000);
    }
    autosaveStatus = 'countdown';
    updateAutosaveCountdownText();
  } else {
    if (autosaveCountdownTimer) {
      window.clearInterval(autosaveCountdownTimer);
      autosaveCountdownTimer = null;
    }
    if (elements.autoSaveToast && Date.now() > autosaveForceUntil) {
      elements.autoSaveToast.classList.remove('is-visible', 'is-loading');
      elements.autoSaveToast.setAttribute('aria-hidden', 'true');
      elements.autoSaveToast.style.opacity = '';
      elements.autoSaveToast.style.transform = '';
    }
  }
}

export function getAutosaveCountdownEnabled() {
  return autosaveCountdownEnabled;
}

function closeAllToolPanels() {
  document.querySelectorAll('.tool-panel.is-active').forEach((panel) => {
    panel.classList.remove('is-active');
    panel.setAttribute('aria-hidden', 'true');
    const target = panel.getAttribute('data-panel');
    if (!target) return;
    const btn = document.querySelector(`[data-role="panel"][data-panel-target="${target}"]`);
    if (!btn) return;
    btn.classList.remove('is-active');
    btn.setAttribute('aria-expanded', 'false');
  });
  state.activePanel = null;
}



