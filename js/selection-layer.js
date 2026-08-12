import { elements } from './elements.js';
import { state } from './state.js';
import { isCellSelected } from './selection.js';
import { canvasHighlightManager } from './canvas-highlight.js';
import { computeHighlightRegions, drawHighlightRegionOutline } from './highlight-outline.js';
export function initializeSelectionLayers() {
  renderSelectionLayers();
}
export function renderSelectionLayers() {
  const selection = state.selection;
  const preview = selection?.preview || null;
  const hasSelection = Boolean(selection?.active);
  const hasPreview = Boolean(preview);
  const highlightActive = !hasSelection && !hasPreview && canvasHighlightManager?.shouldRenderHighlight?.();
  if (elements.gridCanvas) {
    elements.gridCanvas.classList.toggle('is-above-highlight', Boolean(highlightActive));
  }
  if (!hasSelection && !hasPreview && !highlightActive) {
    clearSelectionLayers();
    return;
  }
  clearSelectionLayers();
  if (highlightActive) {
    renderHighlightOverlay(canvasHighlightManager.getSelectedColors());
    return;
  }
  if (hasSelection) {
    renderSelectionMask();
    renderSelectionContent(preview);
  }
  renderSelectionOutline(selection?.bounds, preview);
}
function clearSelectionLayers() {
  [elements.selectionMaskCtx, elements.selectionContentCtx, elements.selectionOutlineCtx].filter(Boolean).forEach((ctx) => ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height));
}
function renderSelectionMask() {
  const ctx = elements.selectionMaskCtx;
  if (!ctx || !state.width || !state.height) return;
  const { cellSize, axisPadding }
    = state;
  const originX = axisPadding.left;
  const originY = axisPadding.top;
  ctx.fillStyle = 'rgba(33, 35, 51, 0.35)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = 'rgba(33, 35, 51, 0.35)';
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (isCellSelected(x, y)) continue;
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  }
}
function renderSelectionContent(preview) {
  const ctx = elements.selectionContentCtx;
  if (!ctx || !state.width || !state.height) return;
  const { cellSize, axisPadding }
    = state;
  const originX = axisPadding.left;
  const originY = axisPadding.top;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!isCellSelected(x, y)) continue;
      const cell = state.grid[y]?.[x];
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      if (cell) {
        ctx.fillStyle = cell.color;
        ctx.fillRect(px, py, cellSize, cellSize);
      }
      else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }
  }
  if (preview?.type === 'move') {
    drawMovePreview(ctx, preview.offsetX, preview.offsetY, originX, originY, cellSize);
  }
}
function drawMovePreview(ctx, offsetX, offsetY, originX, originY, cellSize) {
  if (!offsetX && !offsetY) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!isCellSelected(x, y)) continue;
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      if (targetX < 0 || targetX >= state.width || targetY < 0 || targetY >= state.height) continue;
      const cell = state.grid[y]?.[x];
      const px = originX + targetX * cellSize;
      const py = originY + targetY * cellSize;
      if (cell) {
        ctx.fillStyle = cell.color;
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }
  }
  ctx.restore();
}
function renderSelectionOutline(selectionBounds, preview) {
  const ctx = elements.selectionOutlineCtx;
  if (!ctx) return;
  const rect = deriveOutlineRect(selectionBounds, preview);
  if (!rect) return;
  const { cellSize, axisPadding }
    = state;
  const originX = axisPadding.left;
  const originY = axisPadding.top;
  const left = originX + rect.x * cellSize + 0.5;
  const top = originY + rect.y * cellSize + 0.5;
  const w = rect.width * cellSize;
  const h = rect.height * cellSize;
  ctx.save();
  ctx.strokeStyle = preview?.type === 'subtract' ? '#ff6b6b' : preview?.type === 'move' ? '#ffb347' : '#4f8dff';
  ctx.lineWidth = 1;
  ctx.setLineDash([cellSize * 0.4, cellSize * 0.4]);
  ctx.strokeRect(left, top, w, h);
  ctx.restore();
}
function deriveOutlineRect(selectionBounds, preview) {
  if (preview?.type === 'move' && selectionBounds) {
    return { x: selectionBounds.x + (preview.offsetX || 0), y: selectionBounds.y + (preview.offsetY || 0), width: selectionBounds.width, height: selectionBounds.height };
  }
  if (preview?.rect) {
    const { x1, y1, x2, y2 }
      = preview.rect;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const width = Math.abs(x2 - x1) + 1;
    const height = Math.abs(y2 - y1) + 1;
    return { x: minX, y: minY, width, height };
  }
  if (selectionBounds) return selectionBounds;
  return null;
}

function renderHighlightOverlay(selectedColors) {
  const maskCtx = elements.selectionMaskCtx;
  const contentCtx = elements.selectionContentCtx;
  const outlineCtx = elements.selectionOutlineCtx;
  if (!maskCtx || !contentCtx || !outlineCtx) return;
  if (!selectedColors || selectedColors.size === 0 || !state.width || !state.height) return;
  const { cellSize, axisPadding } = state;
  const originX = axisPadding.left;
  const originY = axisPadding.top;
  const regions = computeHighlightRegions(selectedColors);
  if (!regions.length) return;

  maskCtx.fillStyle = 'rgba(33, 35, 51, 0.35)';
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y]?.[x];
      if (!cell || !selectedColors.has(cell?.code)) {
        const px = originX + x * cellSize;
        const py = originY + y * cellSize;
        maskCtx.fillRect(px, py, cellSize, cellSize);
      }
    }
  }
  contentCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  regions.forEach((region) => {
    region.forEach(([x, y]) => {
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      contentCtx.fillRect(px, py, cellSize, cellSize);
    });
  });

  outlineCtx.save();
  outlineCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  outlineCtx.lineWidth = Math.max(2, Math.round(cellSize * 0.12));
  outlineCtx.lineJoin = 'miter';
  regions.forEach((region) => {
    drawHighlightRegionOutline(outlineCtx, region, originX, originY, cellSize);
  });
  outlineCtx.restore();
}

if (typeof document !== 'undefined') {
  document.addEventListener('highlightOverlayUpdated', () => renderSelectionLayers());
  document.addEventListener('grid:updated', () => renderSelectionLayers());
}
