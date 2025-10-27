import { state } from './state.js';
import { setTool } from './canvas.js';
import { toggleFullscreen } from './fullscreen.js';
import { toggleReferenceWindow } from './reference.js';
import { toggleBaseEditMode } from './base-image.js';
import { exportImage } from './exporter.js';
import { undo, redo } from './canvas.js';

const SHORTCUTS = {
    '1': () => setTool('pencil'),
    '2': () => setTool('bucket'),
    '3': () => setTool('eyedropper'),
    '4': () => setTool('selection'),
    'a': toggleFullscreen,
    'c': toggleReferenceWindow,
    'q': toggleBaseEditMode,
    's': handleExportShortcut,
    'z': undo,
    'x': redo
};

const IGNORED_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
const keyState = {};

export function initializeShortcuts() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(event) {
    if (IGNORED_TAGS.includes(event.target.tagName)) return;

    const key = event.key.toLowerCase();
    if (keyState[key]) return;

    keyState[key] = true;
    if (SHORTCUTS[key]) {
        event.preventDefault();
        SHORTCUTS[key]();
    }
}

function handleKeyUp(event) {
    const key = event.key.toLowerCase();
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
    return {
        '1': '铅笔工具',
        '2': '油漆桶工具',
        '3': '吸管工具',
        '4': '框选工具',
        'a': '切换全屏',
        'c': '打开/关闭参考图',
        'q': '切换底图编辑模式',
        's': '导出图片',
        'z': '撤回',
        'x': '重做'
    };
}

let shortcutsEnabled = true;
export function disableShortcuts() { shortcutsEnabled = false; }
export function enableShortcuts() { shortcutsEnabled = true; }
export function areShortcutsEnabled() { return shortcutsEnabled; }
