import { elements } from './elements.js';
import { state } from './state.js';
import { setTool } from './canvas.js';
import { toggleFullscreen } from './fullscreen.js';
import { toggleReferenceWindow } from './reference.js';
import { toggleBaseEditMode } from './base-image.js';
import { exportImage } from './exporter.js';

// 快捷键映射配置
const SHORTCUTS = {
    '1': () => setTool('pencil'),
    '2': () => setTool('bucket'),
    '3': () => setTool('eyedropper'),
    'a': () => toggleFullscreen(),
    'c': () => toggleReferenceWindow(),
    'q': () => toggleBaseEditMode(),
    's': () => handleExportShortcut()
};

// 需要忽略快捷键的输入元素类型
const IGNORED_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

// 用于跟踪按键状态，避免重复触发
let keyState = {};

export function initializeShortcuts() {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function handleKeyDown(event) {
    // 如果焦点在输入元素上，不触发快捷键
    if (IGNORED_TAGS.includes(event.target.tagName)) {
        return;
    }

    const key = event.key.toLowerCase();

    // 防止重复触发
    if (keyState[key]) {
        return;
    }

    keyState[key] = true;

    // 检查是否有对应的快捷键
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
        window.alert("无效的画布尺寸，无法导出图像。");
        return;
    }

    // 使用默认导出选项（不包含色号和坐标系）
    exportImage({
        includeCodes: false,
        includeAxes: false
    });
}

// 导出快捷键配置，便于其他模块使用
export function getShortcutHelp() {
    return {
        '1': '铅笔工具',
        '2': '油漆桶工具',
        '3': '吸管工具',
        'a': '切换全屏',
        'c': '打开/关闭参考图',
        'q': '切换底图编辑模式',
        's': '导出图片'
    };
}

// 提供禁用/启用快捷键的功能
let shortcutsEnabled = true;

export function disableShortcuts() {
    shortcutsEnabled = false;
}

export function enableShortcuts() {
    shortcutsEnabled = true;
}

export function areShortcutsEnabled() {
    return shortcutsEnabled;
}