import { state } from './state.js';
import { saveHistory, redrawCanvas, resizeCanvas, updateStageTransform } from './canvas.js';
import { TEXT } from './language.js';
export function flipHorizontal() {
    if (!state.width || !state.height) {
        console.warn(TEXT.console.imageOperations.flipHorizontal);
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
    resizeCanvas();
    updateStageTransform();
}
export function flipVertical() {
    if (!state.width || !state.height) {
        console.warn(TEXT.console.imageOperations.flipVertical);
        return;
    }
    saveHistory();
    const newGrid = [];
    for (let y = 0; y < state.height; y++) {
        newGrid[y] = [...state.grid[state.height - 1 - y]];
    }
    state.grid = newGrid;
    redrawCanvas();
    resizeCanvas();
    updateStageTransform();
}
export function rotateClockwise() {
    if (!state.width || !state.height) {
        console.warn(TEXT.console.imageOperations.rotate);
        return;
    }
    saveHistory();
    const newWidth = state.height;
    const newHeight = state.width;
    const newGrid = Array.from({ length: newHeight }, () => Array.from({ length: newWidth }, () => null));
    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            newGrid[x][newWidth - 1 - y] = state.grid[y][x];
        }
    }
    state.grid = newGrid;
    state.width = newWidth;
    state.height = newHeight;
    redrawCanvas();
    resizeCanvas();
    updateStageTransform();
}
export function rotateCounterclockwise() {
    if (!state.width || !state.height) {
        console.warn(TEXT.console.imageOperations.rotate);
        return;
    }
    saveHistory();
    const newWidth = state.height;
    const newHeight = state.width;
    const newGrid = Array.from({ length: newHeight }, () => Array.from({ length: newWidth }, () => null));
    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            newGrid[newHeight - 1 - x][y] = state.grid[y][x];
        }
    }
    state.grid = newGrid;
    state.width = newWidth;
    state.height = newHeight;
    redrawCanvas();
    resizeCanvas();
    updateStageTransform();
}
