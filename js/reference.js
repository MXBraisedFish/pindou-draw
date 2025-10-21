import { elements } from './elements.js';
import { state } from './state.js';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 200;
const EDGE_MARGIN = 16;
const MINIMIZED_SIZE = 88;
const ICON_ADD = '+';
const ICON_MINIMIZE = '-';
const ICON_RESTORE = '⁙';
const ICON_CLOSE = 'x';

let referenceIdSeed = 0;
let activePointer = null;

export function initializeReferenceFeature() {
  if (!elements.referenceWindow) return;
  elements.referenceAddBtn?.addEventListener('click', handleAddButtonClick);
  elements.referenceImageInput?.addEventListener('change', handleReferenceImageSelection);
  elements.referenceCloseBtn?.addEventListener('click', () => {
    setReferenceWindowVisible(false);
  });
  elements.referenceMinimizeBtn?.addEventListener('click', () => {
    setReferenceWindowMinimized(!state.referenceWindowMinimized);
  });
  elements.referenceHeader?.addEventListener('pointerdown', handleHeaderPointerDown);
  elements.referenceResizer?.addEventListener('pointerdown', handleResizerPointerDown);
  elements.referenceWindow?.addEventListener('pointerdown', handleWindowPointerDown);
  window.addEventListener('resize', handleViewportResize);

  initializeReferenceRect();
  renderReferenceImages();
  syncReferenceWindowState();
}

export function toggleReferenceWindow(force) {
  const next = typeof force === 'boolean' ? force : !state.referenceWindowVisible;
  setReferenceWindowVisible(next);
}

export function setReferenceWindowVisible(visible) {
  state.referenceWindowVisible = Boolean(visible);
  if (!visible) {
    setReferenceWindowMinimized(false);
  }
  syncReferenceWindowState();
}

function setReferenceWindowMinimized(flag) {
  const next = Boolean(flag);
  if (state.referenceWindowMinimized === next) return;
  if (next) {
    state.referenceWindowPrevRect = { ...state.referenceWindowRect };
  } else if (state.referenceWindowPrevRect) {
    state.referenceWindowRect = { ...state.referenceWindowPrevRect };
  }
  state.referenceWindowMinimized = next;
  ensureReferenceRectBounds();
  syncReferenceWindowState();
}

function handleAddButtonClick() {
  if (!state.referenceWindowVisible) {
    setReferenceWindowVisible(true);
  }
  triggerReferencePicker();
}

function triggerReferencePicker() {
  elements.referenceImageInput?.click();
}

async function handleReferenceImageSelection(ev) {
  const files = Array.from(ev.target.files || []);
  if (!files.length) return;
  await addReferenceImages(files);
  ev.target.value = '';
}

async function addReferenceImages(files) {
  const tasks = files.map(loadReferenceEntry);
  const entries = (await Promise.all(tasks)).filter(Boolean);
  if (!entries.length) return;
  entries.forEach((entry) => state.referenceImages.push(entry));
  sortReferenceImages();
  renderReferenceImages();
  setReferenceWindowVisible(true);
}

function sortReferenceImages() {
  state.referenceImages.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-Hans-u-nu-latn', {
      numeric: true,
      sensitivity: 'accent'
    });
    if (byName !== 0) return byName;
    return a.addedAt - b.addedAt;
  });
}

function renderReferenceImages() {
  const list = elements.referenceList;
  if (!list) return;
  list.innerHTML = '';
  if (!state.referenceImages.length) {
    const empty = document.createElement('div');
    empty.className = 'reference-empty';
    empty.textContent = '尚未添加参考图。';
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.referenceImages.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'reference-item';

    const header = document.createElement('header');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    header.appendChild(name);

    if (entry.width && entry.height) {
      const meta = document.createElement('span');
      meta.textContent = `${entry.width} × ${entry.height}`;
      header.appendChild(meta);
    }

    item.appendChild(header);

    const image = document.createElement('img');
    image.src = entry.src;
    image.alt = entry.name;
    image.loading = 'lazy';
    item.appendChild(image);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'reference-delete';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => handleDeleteReference(entry.id));
    item.appendChild(deleteBtn);

    fragment.appendChild(item);
  });
  list.appendChild(fragment);
}

function handleDeleteReference(id) {
  const targetIndex = state.referenceImages.findIndex((item) => item.id === id);
  if (targetIndex === -1) return;
  const confirmed = window.confirm('确定删除这张参考图吗？');
  if (!confirmed) return;
  state.referenceImages.splice(targetIndex, 1);
  renderReferenceImages();
  if (!state.referenceImages.length) {
    setReferenceWindowMinimized(false);
    syncReferenceWindowState();
  }
}

function initializeReferenceRect() {
  const rect = state.referenceWindowRect ?? {
    width: 320,
    height: 420,
    top: 24,
    left: null
  };
  state.referenceWindowRect = rect;
  if (!Number.isFinite(rect.left)) {
    rect.left = Math.max(
      EDGE_MARGIN,
      window.innerWidth - rect.width - EDGE_MARGIN
    );
  }
  rect.top = Number.isFinite(rect.top) ? rect.top : EDGE_MARGIN;
  ensureReferenceRectBounds(true);
  applyReferenceWindowLayout();
}

function ensureReferenceRectBounds(adjustSize = false) {
  const rect = state.referenceWindowRect;
  if (!rect) return;
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - EDGE_MARGIN * 2);
  if (adjustSize || !state.referenceWindowMinimized) {
    rect.width = clamp(rect.width, MIN_WIDTH, maxWidth);
    rect.height = clamp(rect.height, MIN_HEIGHT, maxHeight);
  }
  const usedWidth = state.referenceWindowMinimized ? MINIMIZED_SIZE : rect.width;
  const usedHeight = state.referenceWindowMinimized ? MINIMIZED_SIZE : rect.height;
  const maxLeft = window.innerWidth - usedWidth - EDGE_MARGIN;
  const maxTop = window.innerHeight - usedHeight - EDGE_MARGIN;
  rect.left = clamp(
    Number.isFinite(rect.left) ? rect.left : EDGE_MARGIN,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, maxLeft)
  );
  rect.top = clamp(
    Number.isFinite(rect.top) ? rect.top : EDGE_MARGIN,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, maxTop)
  );
}

function applyReferenceWindowLayout() {
  const windowEl = elements.referenceWindow;
  if (!windowEl) return;
  const rect = state.referenceWindowRect;
  const width = state.referenceWindowMinimized ? MINIMIZED_SIZE : rect.width;
  const height = state.referenceWindowMinimized ? MINIMIZED_SIZE : rect.height;
  windowEl.style.width = `${Math.round(width)}px`;
  windowEl.style.height = `${Math.round(height)}px`;
  windowEl.style.top = `${Math.round(rect.top)}px`;
  windowEl.style.left = `${Math.round(rect.left)}px`;
  windowEl.style.right = 'auto';
  windowEl.style.bottom = 'auto';
}

function syncReferenceWindowState() {
  const windowEl = elements.referenceWindow;
  if (!windowEl) return;

  ensureReferenceRectBounds();
  applyReferenceWindowLayout();

  const visible = state.referenceWindowVisible;
  windowEl.classList.toggle('is-visible', visible);
  windowEl.classList.toggle('is-minimized', state.referenceWindowMinimized);
  windowEl.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (elements.toggleReferenceBtn) {
    elements.toggleReferenceBtn.classList.toggle('active', visible);
    elements.toggleReferenceBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }

  if (elements.referenceAddBtn) {
    elements.referenceAddBtn.textContent = ICON_ADD;
  }

  if (elements.referenceMinimizeBtn) {
    elements.referenceMinimizeBtn.textContent = state.referenceWindowMinimized
      ? ICON_RESTORE
      : ICON_MINIMIZE;
    elements.referenceMinimizeBtn.setAttribute(
      'aria-label',
      state.referenceWindowMinimized ? '还原参考窗' : '最小化参考窗'
    );
  }

  if (elements.referenceCloseBtn) {
    elements.referenceCloseBtn.textContent = ICON_CLOSE;
  }

  if (elements.referenceResizer) {
    elements.referenceResizer.style.pointerEvents = state.referenceWindowMinimized ? 'none' : 'auto';
  }
}

function handleHeaderPointerDown(ev) {
  if (ev.button !== 0) return;
  if (ev.target.closest('button')) return;
  beginInteraction(ev, 'move');
}

function handleWindowPointerDown(ev) {
  if (!state.referenceWindowMinimized) return;
  if (ev.button !== 0) return;
  if (ev.target.closest('button')) return;
  beginInteraction(ev, 'move');
}

function handleResizerPointerDown(ev) {
  if (state.referenceWindowMinimized) return;
  if (ev.button !== 0) return;
  ev.stopPropagation();
  beginInteraction(ev, 'resize');
}

function beginInteraction(ev, mode) {
  if (!elements.referenceWindow) return;
  activePointer = {
    id: ev.pointerId,
    mode,
    startX: ev.clientX,
    startY: ev.clientY,
    origin: {
      left: state.referenceWindowRect.left,
      top: state.referenceWindowRect.top,
      width: state.referenceWindowRect.width,
      height: state.referenceWindowRect.height
    }
  };
  elements.referenceWindow.classList.add('is-dragging');
  try {
    ev.target.setPointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);
  ev.preventDefault();
}

function handlePointerMove(ev) {
  if (!activePointer || ev.pointerId !== activePointer.id) return;
  const dx = ev.clientX - activePointer.startX;
  const dy = ev.clientY - activePointer.startY;

  if (activePointer.mode === 'move') {
    state.referenceWindowRect.left = activePointer.origin.left + dx;
    state.referenceWindowRect.top = activePointer.origin.top + dy;
  } else if (activePointer.mode === 'resize') {
    state.referenceWindowRect.width = activePointer.origin.width + dx;
    state.referenceWindowRect.height = activePointer.origin.height + dy;
  }
  ensureReferenceRectBounds(activePointer.mode === 'resize');
  applyReferenceWindowLayout();
}

function handlePointerUp(ev) {
  if (!activePointer || ev.pointerId !== activePointer.id) return;
  try {
    ev.target.releasePointerCapture(ev.pointerId);
  } catch {
    /* ignore */
  }
  activePointer = null;
  elements.referenceWindow?.classList.remove('is-dragging');
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
  window.removeEventListener('pointercancel', handlePointerUp);
  ensureReferenceRectBounds();
  applyReferenceWindowLayout();
}

function handleViewportResize() {
  ensureReferenceRectBounds(true);
  applyReferenceWindowLayout();
}

async function loadReferenceEntry(file) {
  const dataUrl = await readFileAsDataURL(file);
  if (!dataUrl) return null;
  const dimensions = await measureImage(dataUrl);
  const id = `ref-${Date.now()}-${referenceIdSeed++}`;
  return {
    id,
    name: file.name || `参考图 ${referenceIdSeed}`,
    src: dataUrl,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    addedAt: Date.now()
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function measureImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
