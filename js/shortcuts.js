import { state } from './state.js';
import { setTool, undo, redo } from './canvas.js';
import { toggleFullscreen } from './fullscreen.js';
import { toggleReferenceWindow } from './reference.js';
import { toggleBaseEditMode } from './base-image.js';
import { exportImage } from './exporter.js';
const SHORTCUTS = { '1': () => setTool('pencil'), '2': () => setTool('bucket'), '3': () => setTool('eyedropper'), '4': () => setTool('selection'), a: toggleFullscreen, c: toggleReferenceWindow, q: toggleBaseEditMode, s: handleExportShortcut, z: undo, x: redo };
const IGNORED_TAGS = ['TEXTAREA', 'SELECT'];
const INPUT_TYPES_ALLOWLIST = new Set(['button', 'checkbox', 'color', 'radio', 'range', 'file']);
const TEXT_NODE_TYPE = 3;
const keyState = Object.create(null);
let shortcutsEnabled = true;
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
  if (shouldIgnoreShortcutTarget(event.target)) return;
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (!key || keyState[key]) return;
  const handler = SHORTCUTS[key];
  if (!handler) return;
  keyState[key] = true;
  event.preventDefault();
  handler();
}
function handleKeyUp(event) {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (!key) return;
  keyState[key] = false;
}
function handleExportShortcut() {
  if (!state.width || !state.height) {
    window.alert('画布尺寸无效，无法导出图像');
    return;
  }
  exportImage({ includeCodes: false, includeAxes: false });
}
export function getShortcutHelp() {
  return { '1': '铅笔工具', '2': '油漆桶工具', '3': '吸管工具', '4': '矩形选区', a: '切换全屏', c: '打开/关闭参考图', q: '切换底图编辑模式', s: '导出图片', z: '撤销', x: '重做' };
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