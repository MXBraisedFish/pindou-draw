import { elements } from './elements.js';
import { state } from './state.js';
import { setTool, undo, redo } from './canvas.js';
import { toggleReferenceWindow } from './reference.js';
import { toggleBaseEditMode } from './base-image.js';
import { exportImage } from './exporter.js';
import { toggleExportWindow } from './export-window.js';
import { toggleUpdate } from './update.js';
import { toggleColorManagement } from './palette.js';
import { openCanvasHighlightWindow } from './canvas-highlight.js';

const DIGIT_SHORTCUTS = {
  '1': () => setTool('pencil'),
  '2': () => setTool('bucket'),
  '3': () => setTool('eyedropper'),
  '4': () => setTool('selection')
};

const ALT_SHORTCUTS = {
  s: handleQuickSave,
  z: undo,
  x: redo,
  w: () => toggleBaseEditMode(),
  a: toggleFullscreen,
  q: toggleSimpleMode,
  r: () => togglePanel('canvas-settings'),
  t: () => togglePanel('base-settings'),
  y: () => toggleReferenceWindow(),
  u: () => toggleExportWindow(),
  i: () => togglePanel('display-settings'),
  o: () => toggleUpdate(),
  p: openManualPage,
  f: togglePaletteWindow,
  g: () => togglePanel('image-operations'),
  h: () => togglePanel('palette-management'),
  v: () => toggleColorManagement(),
  b: () => openCanvasHighlightWindow()
};

const IGNORED_TAGS = ['TEXTAREA', 'SELECT'];
const INPUT_TYPES_ALLOWLIST = new Set(['button', 'checkbox', 'color', 'radio', 'range', 'file']);
const TEXT_NODE_TYPE = 3;
let shortcutsEnabled = true;
const FULLSCREEN_COOLDOWN_MS = 600;
let fullscreenPending = false;
let lastFullscreenToggle = 0;

export function initializeShortcuts() {
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
}

function normalizeEventTarget(target) {
  if (!target) return null;
  if (target.nodeType === TEXT_NODE_TYPE) return target.parentElement;
  return target;
}

function shouldIgnoreShortcutTarget(target) {
  const element = normalizeEventTarget(target);
  if (!element) return false;
  if (typeof element.closest === 'function' && element.closest('[data-shortcuts-ignore="true"]')) {
    return true;
  }
  if (element.isContentEditable) return true;

  const tagName = element.tagName?.toUpperCase?.() ?? '';
  if (!tagName) return false;

  if (tagName === 'INPUT') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (!INPUT_TYPES_ALLOWLIST.has(type)) return true;
    return element.hasAttribute('readonly');
  }

  return IGNORED_TAGS.includes(tagName);
}

function handleKeyDown(event) {
  if (!shortcutsEnabled) return;
  if (event.repeat) return;
  if (shouldIgnoreShortcutTarget(event.target)) return;

  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (!key) return;

  const altLike = event.altKey || event.metaKey;
  if (altLike && !event.ctrlKey) {
    const handler = ALT_SHORTCUTS[key];
    if (!handler) return;
    event.preventDefault();
    handler();
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const digitHandler = DIGIT_SHORTCUTS[key];
  if (!digitHandler) return;
  event.preventDefault();
  digitHandler();
}

function handleKeyUp() {

}

function handleQuickSave() {
  if (!state.width || !state.height) {
    window.alert('画布尺寸无效，无法导出图片。');
    return;
  }
  const settings = state.exportSettings ?? {};
  const background = settings.backgroundType === 'transparent'
    ? 'transparent'
    : (settings.backgroundColor || '#ffffff');
  const filename = `pixel-canvas-${state.width}x${state.height}.png`;
  exportImage({
    includeCodes: true,
    includeAxes: true,
    includeLightColors: true,
    includeTemperatureColors: true,
    backgroundColor: background,
    filename,
    format: 'image/png'
  });
}

function toggleFullscreen() {
  if (fullscreenPending) return;
  const now = Date.now();
  if (now - lastFullscreenToggle < FULLSCREEN_COOLDOWN_MS) return;
  const entering = !document.fullscreenElement;
  const action = entering
    ? document.documentElement?.requestFullscreen?.()
    : document.exitFullscreen?.();
  if (!action) return;
  fullscreenPending = true;
  lastFullscreenToggle = now;
  const settle = () => {
    fullscreenPending = false;
  };
  if (typeof action.then === 'function') {
    action.catch(() => { }).finally(settle);
  } else {
    settle();
  }
}

function toggleSimpleMode() {
  if (state.isTabletMode) return;
  if (elements.focusSimpleModeBtn) {
    elements.focusSimpleModeBtn.click();
    return;
  }
  if (elements.simpleModeExitBtn) {
    elements.simpleModeExitBtn.click();
  }
}

function togglePaletteWindow() {
  elements.paletteWindowToggleBtn?.click();
}

function togglePanel(target) {
  const button = document.querySelector(`[data-panel-target="${target}"]`);
  button?.click();
}

function openManualPage() {
  window.open('./manual.html', '_blank', 'noopener');
}

export function getShortcutHelp() {
  return {
    '1': '画笔工具',
    '2': '油漆桶工具',
    '3': '吸管工具',
    '4': '选区工具',
    'Ctrl+S': '默认方式保存（含色号与坐标轴）',
    'Ctrl+Z': '撤回一步',
    'Ctrl+X': '回退一步',
    'Ctrl+W': '底图编辑模式',
    'Ctrl+A': '全屏切换',
    'Ctrl+Q': '简洁模式开关',
    'Ctrl+R': '画布设置面板',
    'Ctrl+T': '底图设置面板',
    'Ctrl+Y': '参考图窗口',
    'Ctrl+U': '导出窗口',
    'Ctrl+I': '显示设置面板',
    'Ctrl+O': '查看更新说明',
    'Ctrl+P': '打开说明书',
    'Ctrl+F': '调色板窗口',
    'Ctrl+G': '图像操作面板',
    'Ctrl+H': '色卡管理面板',
    'Ctrl+V': '颜色管理窗口',
    'Alt+B': '画布高亮管理窗口'
  };
}

export function disableShortcuts() {
  shortcutsEnabled = false;
}

export function enableShortcuts() {
  shortcutsEnabled = true;
}

export function areShortcutsEnabled() {
  return shortcutsEnabled;
}
