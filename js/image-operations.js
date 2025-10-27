// image-operations.js
import { state } from './state.js';
import { saveHistory, redrawCanvas, resizeCanvas, updateStageTransform } from './canvas.js';

/**
 * 图像操作功能模块
 * 提供画布的旋转和翻转功能
 */

/**
 * 水平翻转画布
 */
export function flipHorizontal() {
    if (!state.width || !state.height) {
        console.warn('无法执行水平翻转：画布未创建');
        return;
    }

    saveHistory();

    const newGrid = [];
    for (let y = 0; y < state.height; y++) {
        const newRow = [];
        for (let x = 0; x < state.width; x++) {
            newRow[x] = state.grid[y][state.width - 1 - x];
        }
        newGrid.push(newRow);
    }

    state.grid = newGrid;
    redrawCanvas();
    resizeCanvas(); // 这会更新所有画布的实际物理尺寸
    updateStageTransform();
}

/**
 * 垂直翻转画布
 */
export function flipVertical() {
    if (!state.width || !state.height) {
        console.warn('无法执行垂直翻转：画布未创建');
        return;
    }

    saveHistory();

    const newGrid = [];
    for (let y = 0; y < state.height; y++) {
        newGrid[y] = [...state.grid[state.height - 1 - y]];
    }

    state.grid = newGrid;
    redrawCanvas();
    resizeCanvas(); // 这会更新所有画布的实际物理尺寸
    updateStageTransform(); resizeCanvas(); // 这会更新所有画布的实际物理尺寸
    updateStageTransform();
}

/**
 * 顺时针旋转画布90度
 */
export function rotateClockwise() {
    if (!state.width || !state.height) {
        console.warn('无法执行旋转：画布未创建');
        return;
    }

    saveHistory();

    const newWidth = state.height;
    const newHeight = state.width;
    const newGrid = Array.from({ length: newHeight }, () =>
        Array.from({ length: newWidth }, () => null)
    );

    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            newGrid[x][newWidth - 1 - y] = state.grid[y][x];
        }
    }

    state.grid = newGrid;
    state.width = newWidth;
    state.height = newHeight;

    redrawCanvas();
    resizeCanvas(); // 这会更新所有画布的实际物理尺寸
    updateStageTransform();
}

/**
 * 逆时针旋转画布90度
 */
export function rotateCounterclockwise() {
    if (!state.width || !state.height) {
        console.warn('无法执行旋转：画布未创建');
        return;
    }

    saveHistory();

    const newWidth = state.height;
    const newHeight = state.width;
    const newGrid = Array.from({ length: newHeight }, () =>
        Array.from({ length: newWidth }, () => null)
    );

    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            newGrid[newHeight - 1 - x][y] = state.grid[y][x];
        }
    }

    state.grid = newGrid;
    state.width = newWidth;
    state.height = newHeight;

    redrawCanvas();
    resizeCanvas(); // 这会更新所有画布的实际物理尺寸
    updateStageTransform();
}