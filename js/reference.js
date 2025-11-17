import { elements } from './elements.js';
import { state } from './state.js';
import { registerFloatingWindow } from './floating-window-stack.js';
import { computeRightToolbarAnchor } from './toolbar-anchor.js';
let fitBaseImageToCanvas, updateStatusBase, syncBaseControlsAvailability, applyBaseLayerPosition, updateBaseImageDisplay;
let pointerMoveHandler = null;
let pointerUpHandler = null;
let pointerCancelHandler = null;
let _rafPending = false;
try {
  const baseImageModule = await import('./base-image.js');
  fitBaseImageToCanvas = baseImageModule.fitBaseImageToCanvas;
  updateStatusBase = baseImageModule.updateStatusBase;
  syncBaseControlsAvailability = baseImageModule.syncBaseControlsAvailability;
  applyBaseLayerPosition = baseImageModule.applyBaseLayerPosition;
  updateBaseImageDisplay = baseImageModule.updateBaseImageDisplay;
} catch (error) {
  console.warn('底图模块导入失败，将使用备用方案:', error);
} const MIN_WIDTH = 240, MIN_HEIGHT = 200, EDGE_MARGIN = 16, MINIMIZED_SIZE = 88;
const ICONS = { ADD: '+', MINIMIZE: '-', RESTORE: '↩', CLOSE: 'x' };
let referenceIdSeed = 0, activePointer = null, referenceWindowStackHandle = null;
export function initializeReferenceFeature() {
  if (!elements.referenceWindow) return;

  referenceWindowStackHandle = registerFloatingWindow(elements.referenceWindow);

  const events = [
    [elements.referenceAddBtn, 'click', handleAddButtonClick],
    [elements.referenceImageInput, 'change', handleReferenceImageSelection],
    [elements.referenceCloseBtn, 'click', () => setReferenceWindowVisible(false)],
    [elements.referenceMinimizeBtn, 'click', () => setReferenceWindowMinimized(!state.referenceWindowMinimized)],
    [elements.referenceHeader, 'pointerdown', handleHeaderPointerDown],
    [elements.referenceResizer, 'pointerdown', handleResizerPointerDown],
    [elements.referenceWindow, 'pointerdown', handleWindowPointerDown]
  ];

  events.forEach(([element, event, handler]) => element?.addEventListener(event, handler));
  window.addEventListener('resize', handleViewportResize);

  
  initializeReferenceRect();
  renderReferenceImages();
  syncReferenceWindowState();

  
  if (elements.referenceAddBtn && state.referenceWindowMinimized) {
    elements.referenceAddBtn.style.display = 'none';
  }
}
export function toggleReferenceWindow(force) {
  const next = typeof force === 'boolean' ? force : !state.referenceWindowVisible;
  setReferenceWindowVisible(next);
}
export function setReferenceWindowVisible(visible) {
  state.referenceWindowVisible = Boolean(visible);
  if (visible) {
    referenceWindowStackHandle?.bringToFront();
  } else {
    setReferenceWindowMinimized(false);
  }
  syncReferenceWindowState();
}
function setReferenceWindowMinimized(flag) {
  const next = Boolean(flag);
  if (state.referenceWindowMinimized === next) return;

  if (next) {
    
    state.referenceWindowPrevRect = { ...state.referenceWindowRect };
    
    state.referenceWindowRect.width = MINIMIZED_SIZE;
    state.referenceWindowRect.height = MINIMIZED_SIZE;
  } else {
    
    if (state.referenceWindowPrevRect) {
      state.referenceWindowRect = { ...state.referenceWindowPrevRect };
    } else {
      state.referenceWindowRect.width = 320;
      state.referenceWindowRect.height = 420;
    }
    
    state.referenceWindowPrevRect = null;
  }

  state.referenceWindowMinimized = next;
  ensureReferenceRectBounds();
  syncReferenceWindowState();
}
function handleAddButtonClick() {
  !state.referenceWindowVisible && setReferenceWindowVisible(true);
  triggerReferencePicker();
}
function triggerReferencePicker() {
  elements.referenceImageInput?.click();
} async function handleReferenceImageSelection(ev) {
  const files = Array.from(ev.target.files || []);
  if (!files.length) return;
  await addReferenceImages(files);
  ev.target.value = '';
} async function addReferenceImages(files) {
  const entries = (await Promise.all(files.map(loadReferenceEntry))).filter(Boolean);
  if (!entries.length) return;
  entries.forEach(entry => state.referenceImages.push(entry));
  sortReferenceImages();
  renderReferenceImages();
  setReferenceWindowVisible(true);
}
function sortReferenceImages() {
  state.referenceImages.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-Hans-u-nu-latn', { numeric: true, sensitivity: 'accent' });
    return byName !== 0 ? byName : a.addedAt - b.addedAt;
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
  } const fragment = document.createDocumentFragment();
  state.referenceImages.forEach(entry => {
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
    } item.appendChild(header);
    const image = document.createElement('img');
    image.src = entry.src;
    image.alt = entry.name;
    image.loading = 'lazy';
    item.appendChild(image);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '0.5rem';
    buttonContainer.style.marginTop = '0.5rem';
    const setAsBaseBtn = document.createElement('button');
    setAsBaseBtn.type = 'button';
    setAsBaseBtn.textContent = '作为底图';
    setAsBaseBtn.className = 'reference-set-button'
    setAsBaseBtn.style.flex = '1';
    setAsBaseBtn.addEventListener('click', () => setReferenceAsBaseImage(entry));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '删除';
    deleteBtn.className = 'reference-delete-button'
    deleteBtn.style.flex = '1';
    deleteBtn.addEventListener('click', () => handleDeleteReference(entry.id));
    buttonContainer.appendChild(setAsBaseBtn);
    buttonContainer.appendChild(deleteBtn);
    item.appendChild(buttonContainer);
    fragment.appendChild(item);
  });
  list.appendChild(fragment);
}
function handleDeleteReference(id) {
  const targetIndex = state.referenceImages.findIndex(item => item.id === id);
  if (targetIndex === -1) return;
  if (!window.confirm('确定删除这张参考图吗？')) return;
  state.referenceImages.splice(targetIndex, 1);
  renderReferenceImages();
  if (!state.referenceImages.length) {
    setReferenceWindowMinimized(false);
    syncReferenceWindowState();
  }
}
function initializeReferenceRect() {
  const rect = state.referenceWindowRect ?? { width: 320, height: 420, top: 24, left: null };
  state.referenceWindowRect = rect;
  if (!Number.isFinite(rect.left)) {
    const anchored = computeRightToolbarAnchor(rect.width, EDGE_MARGIN * 2);
    rect.left = Number.isFinite(anchored)
      ? anchored
      : Math.max(EDGE_MARGIN, window.innerWidth - rect.width - EDGE_MARGIN);
  } rect.top = Number.isFinite(rect.top) ? rect.top : EDGE_MARGIN;
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
    elements.toggleReferenceBtn.classList.toggle('is-active', visible);
    elements.toggleReferenceBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }

  
  if (elements.referenceAddBtn) {
    elements.referenceAddBtn.textContent = ICONS.ADD;
    
    elements.referenceAddBtn.style.display = state.referenceWindowMinimized ? 'none' : 'block';
  }

  if (elements.referenceMinimizeBtn) {
    elements.referenceMinimizeBtn.textContent = state.referenceWindowMinimized ? ICONS.RESTORE : ICONS.MINIMIZE;
    elements.referenceMinimizeBtn.setAttribute('aria-label',
      state.referenceWindowMinimized ? '还原参考窗' : '最小化参考窗');
  }

  if (elements.referenceCloseBtn) {
    elements.referenceCloseBtn.textContent = ICONS.CLOSE;
  }

  
  if (elements.referenceResizer) {
    elements.referenceResizer.style.pointerEvents = state.referenceWindowMinimized ? 'none' : 'auto';
  }
}
function handleHeaderPointerDown(ev) {
  if (ev.button !== 0 || ev.target.closest('button')) return;
  beginInteraction(ev, 'move');
}
function handleWindowPointerDown(ev) {
  
  if (state.referenceWindowMinimized && ev.button === 0 && !ev.target.closest('button')) {
    beginInteraction(ev, 'move');
  }
}

function handleResizerPointerDown(ev) {
  if (state.referenceWindowMinimized || ev.button !== 0) return;
  ev.stopPropagation();
  beginInteraction(ev, 'resize');
}
function beginInteraction(ev, mode) {
  if (!elements.referenceWindow) return;

  
  if (mode === 'resize' && state.referenceWindowMinimized) return;

  activePointer = {
    id: ev.pointerId,
    mode,
    startX: ev.clientX,
    startY: ev.clientY,
    origin: { ...state.referenceWindowRect }
  };

  
  const draggingClass = mode === 'resize' ? 'is-resizing' : 'is-dragging';
  elements.referenceWindow.classList.add(draggingClass);
  elements.referenceWindow.style.transition = 'none';
  referenceWindowStackHandle?.bringToFront();

  
  pointerMoveHandler = handlePointerMove.bind(this);
  pointerUpHandler = handlePointerUp.bind(this);
  pointerCancelHandler = handlePointerUp.bind(this);

  
  window.addEventListener('pointermove', pointerMoveHandler, { passive: true });
  window.addEventListener('pointerup', pointerUpHandler, { passive: true });
  window.addEventListener('pointercancel', pointerCancelHandler, { passive: true });

  
  if (elements.referenceWindow.setPointerCapture) {
    elements.referenceWindow.setPointerCapture(ev.pointerId);
  }

  ev.preventDefault();
  ev.stopPropagation();
}
function handlePointerMove(ev) {
  
  if (!activePointer) {
    cleanupInteraction();
    return;
  }

  if (ev.pointerId !== activePointer.id) {
    return;
  }

  const dx = ev.clientX - activePointer.startX;
  const dy = ev.clientY - activePointer.startY;

  
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;

      
      if (!activePointer) {
        return;
      }

      if (activePointer.mode === 'move') {
        state.referenceWindowRect.left = activePointer.origin.left + dx;
        state.referenceWindowRect.top = activePointer.origin.top + dy;
      } else if (activePointer.mode === 'resize') {
        state.referenceWindowRect.width = Math.max(MIN_WIDTH, activePointer.origin.width + dx);
        state.referenceWindowRect.height = Math.max(MIN_HEIGHT, activePointer.origin.height + dy);
      }

      ensureReferenceRectBounds(activePointer.mode === 'resize');
      if (state.referenceWindowMinimized && state.referenceWindowPrevRect) {
        state.referenceWindowPrevRect.left = state.referenceWindowRect.left;
        state.referenceWindowPrevRect.top = state.referenceWindowRect.top;
      }
      applyReferenceWindowLayout();
    });
  }
}

function cleanupInteraction() {
  
  window.removeEventListener('pointermove', pointerMoveHandler);
  window.removeEventListener('pointerup', pointerUpHandler);
  window.removeEventListener('pointercancel', pointerCancelHandler);

  pointerMoveHandler = null;
  pointerUpHandler = null;
  pointerCancelHandler = null;

  
  if (elements.referenceWindow) {
    elements.referenceWindow.classList.remove('is-dragging', 'is-resizing');
    elements.referenceWindow.style.transition = '';

    
    if (elements.referenceWindow.releasePointerCapture && activePointer) {
      elements.referenceWindow.releasePointerCapture(activePointer.id);
    }
  }

  activePointer = null;
  _rafPending = false;

  ensureReferenceRectBounds();
  applyReferenceWindowLayout();
}
function handlePointerUp(ev) {
  
  if (!activePointer || (ev.pointerId !== activePointer.id && activePointer.id !== undefined)) {
    cleanupInteraction();
    return;
  }

  try {
    ev.target.releasePointerCapture(ev.pointerId);
  } catch { }

  cleanupInteraction();
}
function handleViewportResize() {
  ensureReferenceRectBounds(true);
  applyReferenceWindowLayout();
} async function loadReferenceEntry(file) {
  const dataUrl = await readFileAsDataURL(file);
  if (!dataUrl) return null;
  const dimensions = await measureImage(dataUrl);
  const id = `ref-${Date.now()}-${referenceIdSeed++}`;
  return { id, name: file.name || `参考图 ${referenceIdSeed}`, src: dataUrl, width: dimensions?.width ?? null, height: dimensions?.height ?? null, addedAt: Date.now() };
}
function readFileAsDataURL(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
function measureImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function setReferenceAsBaseImage(entry) {
  if (state.baseImage) {
    if (!window.confirm('当前已有底图，是否替换？')) return;
  } const img = new Image();
  img.onload = function () {
    state.baseImage = img;
    state.baseImageName = entry.name;
    state.baseEditing = false;
    const functions = { 'fitBaseImageToCanvas': typeof fitBaseImageToCanvas, 'updateStatusBase': typeof updateStatusBase, 'syncBaseControlsAvailability': typeof syncBaseControlsAvailability, 'applyBaseLayerPosition': typeof applyBaseLayerPosition, 'updateBaseImageDisplay': typeof updateBaseImageDisplay };
    try {
      if (typeof fitBaseImageToCanvas === 'function') {
        fitBaseImageToCanvas();
      } if (typeof updateStatusBase === 'function') {
        updateStatusBase();
      } if (typeof syncBaseControlsAvailability === 'function') {
        syncBaseControlsAvailability();
      } if (typeof applyBaseLayerPosition === 'function') {
        applyBaseLayerPosition();
      } if (typeof updateBaseImageDisplay === 'function') {
        updateBaseImageDisplay();
      }
    } catch (error) {
      console.error('调用底图函数时出错:', error);
    }
    setReferenceWindowVisible(false);
  };
  img.onerror = function () {
    console.error('图片加载失败:', entry.src);
    window.alert('图片加载失败，请检查图片格式');
  };
  img.src = entry.src;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

