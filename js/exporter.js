import { EXPORT_SCALE, PIXEL_FONT_FAMILY } from './constants.js';
import { elements } from './elements.js';
import { state } from './state.js';
import { computeAxisPadding, pickTextColor } from './utils.js';
import { renderAxisLabels } from './canvas.js';
import { collectUsedColors, getActivePaletteLabel } from './palette.js';

export function renderExportCanvas(exportCanvas, options = {}) {
  const { includeCodes = false, includeAxes = false, backgroundColor = '#ffffff' } = options;
  const factor = EXPORT_SCALE;
  const axisPadding = includeAxes ? computeAxisPadding(factor, state.width, state.height) : { top: 0, right: 0, bottom: 0, left: 0 };
  const contentWidth = state.width * factor, contentHeight = state.height * factor;
  const drawingWidth = contentWidth + axisPadding.left + axisPadding.right, drawingHeight = contentHeight + axisPadding.top + axisPadding.bottom;
  const usedColors = collectUsedColors(), totalUsedCells = usedColors.reduce((sum, entry) => sum + entry.count, 0);
  const paletteLabel = getActivePaletteLabel();

  const pagePaddingX = Math.max(40, Math.round(factor * 0.8)), pagePaddingY = Math.max(40, Math.round(factor * 0.8));
  const headingGap = Math.max(16, Math.round(factor * 0.32)), sectionGap = Math.max(28, Math.round(factor * 0.56));
  const swatchGapX = Math.max(28, Math.round(factor * 0.56)), swatchGapY = Math.max(32, Math.round(factor * 0.64));
  const swatchTextGap = Math.max(14, Math.round(factor * 0.28));

  const headingFont = Math.max(28, Math.round(factor * 0.65)), totalFont = Math.max(24, Math.round(factor * 0.55));
  const sectionTitleFont = Math.max(26, Math.round(factor * 0.6)), swatchLabelFont = Math.max(22, Math.round(factor * 0.5));
  const swatchCountFont = Math.max(20, Math.round(factor * 0.46)), paletteFont = Math.max(24, Math.round(factor * 0.55));
  const emptyFont = Math.max(20, Math.round(factor * 0.46));

  const swatchWidth = Math.max(96, Math.round(factor * 1.9)), swatchHeight = Math.max(64, Math.round(factor * 1.28));
  const swatchRadius = Math.round(Math.min(swatchWidth, swatchHeight) * 0.35);

  const availableWidth = drawingWidth;
  const maxColumns = Math.max(1, Math.floor((availableWidth + swatchGapX) / (swatchWidth + swatchGapX)));
  const columns = usedColors.length ? Math.min(usedColors.length, Math.max(1, maxColumns)) : 1;
  const rows = usedColors.length ? Math.ceil(usedColors.length / columns) : 1;
  const itemHeight = swatchLabelFont + swatchTextGap + swatchHeight + swatchTextGap + swatchCountFont;
  const swatchAreaHeight = usedColors.length ? rows * itemHeight + (rows - 1) * swatchGapY : swatchHeight + swatchLabelFont;
  const swatchContentWidth = usedColors.length ? columns * swatchWidth + (columns - 1) * swatchGapX : swatchWidth;

  let totalHeight = pagePaddingY;
  totalHeight += headingFont + headingGap + drawingHeight + sectionGap + totalFont + sectionGap;
  totalHeight += sectionTitleFont + headingGap + swatchAreaHeight + sectionGap + paletteFont + pagePaddingY;

  const totalWidth = drawingWidth + pagePaddingX * 2;

  exportCanvas.width = Math.ceil(totalWidth);
  exportCanvas.height = Math.ceil(totalHeight);
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

  if (backgroundColor === 'transparent') drawCheckerboard(exportCtx, exportCanvas.width, exportCanvas.height);
  else { exportCtx.fillStyle = backgroundColor; exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height); }

  exportCtx.imageSmoothingEnabled = false;
  const centerX = totalWidth / 2;
  let cursorY = pagePaddingY;

  exportCtx.fillStyle = '#1f1f1f'; exportCtx.textAlign = 'center'; exportCtx.textBaseline = 'top';
  exportCtx.font = `${headingFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillText('绘制图', centerX, cursorY);
  cursorY += headingFont + headingGap;

  const drawingLeft = pagePaddingX, drawingTop = cursorY;
  const originX = drawingLeft + axisPadding.left, originY = drawingTop + axisPadding.top;

  exportCtx.fillStyle = '#ffffff'; exportCtx.fillRect(drawingLeft, drawingTop, drawingWidth, drawingHeight);
  exportCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)'; exportCtx.lineWidth = 1;
  exportCtx.strokeRect(drawingLeft + 0.5, drawingTop + 0.5, drawingWidth - 1, drawingHeight - 1);

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      if (!cell) continue;
      exportCtx.fillStyle = cell.color;
      exportCtx.fillRect(originX + x * factor, originY + y * factor, factor, factor);
    }
  }

  if (includeCodes) {
    const fontPx = Math.max(10, Math.floor(factor * 0.3));
    exportCtx.save(); exportCtx.font = `${fontPx}px ${PIXEL_FONT_FAMILY}`;
    exportCtx.textAlign = 'center'; exportCtx.textBaseline = 'middle';
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = state.grid[y][x];
        if (!cell?.code) continue;
        exportCtx.fillStyle = pickTextColor(cell.rgb);
        exportCtx.fillText(cell.code, originX + x * factor + factor / 2, originY + y * factor + factor / 2);
      }
    }
    exportCtx.restore();
  }

  if (includeAxes) {
    exportCtx.save(); exportCtx.strokeStyle = 'rgba(0, 0, 0, 0.12)'; exportCtx.lineWidth = Math.max(1, Math.round(factor * 0.02));
    for (let gx = 0; gx <= state.width; gx++) {
      const x = gx * factor + 0.5;
      exportCtx.beginPath(); exportCtx.moveTo(originX + x - 0.5, drawingTop); exportCtx.lineTo(originX + x - 0.5, drawingTop + drawingHeight); exportCtx.stroke();
    }
    for (let gy = 0; gy <= state.height; gy++) {
      const y = gy * factor + 0.5;
      exportCtx.beginPath(); exportCtx.moveTo(drawingLeft, originY + y - 0.5); exportCtx.lineTo(drawingLeft + drawingWidth, originY + y - 0.5); exportCtx.stroke();
    }
    exportCtx.restore();
    renderAxisLabels(exportCtx, {
      originX, originY, cellSize: factor, widthCells: state.width, heightCells: state.height,
      textColor: 'rgba(0,0,0,0.75)', tickColor: 'rgba(0,0,0,0.35)', fontSize: Math.max(12, Math.floor(factor * 0.28)),
      tickLength: Math.max(6, Math.floor(factor * 0.25)), gap: Math.max(6, Math.floor(factor * 0.2))
    });
  }

  cursorY = drawingTop + drawingHeight + sectionGap;
  exportCtx.font = `${totalFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillStyle = '#1f1f1f'; exportCtx.textAlign = 'center'; exportCtx.textBaseline = 'top';
  exportCtx.fillText(`总数量: ${totalUsedCells}`, centerX, cursorY); cursorY += totalFont + sectionGap;

  exportCtx.font = `${sectionTitleFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillText('使用色号', centerX, cursorY); cursorY += sectionTitleFont + headingGap;

  const swatchAreaTop = cursorY, swatchStartX = pagePaddingX + (availableWidth - swatchContentWidth) / 2;

  if (!usedColors.length) {
    exportCtx.save(); exportCtx.font = `${emptyFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillStyle = '#6f7285'; exportCtx.textBaseline = 'middle';
    exportCtx.fillText('尚未绘制任何颜色', centerX, swatchAreaTop + swatchAreaHeight / 2); exportCtx.restore();
  } else {
    exportCtx.textBaseline = 'top';
    usedColors.forEach((entry, index) => {
      const columnIndex = index % columns, rowIndex = Math.floor(index / columns);
      const itemLeft = swatchStartX + columnIndex * (swatchWidth + swatchGapX);
      const itemTop = swatchAreaTop + rowIndex * (itemHeight + swatchGapY);
      const itemCenterX = itemLeft + swatchWidth / 2;

      exportCtx.font = `${swatchLabelFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillStyle = '#1f1f1f';
      exportCtx.fillText(entry.code, itemCenterX, itemTop);

      const swatchTop = itemTop + swatchLabelFont + swatchTextGap;
      exportCtx.save(); beginRoundedRectPath(exportCtx, itemLeft, swatchTop, swatchWidth, swatchHeight, swatchRadius);
      exportCtx.fillStyle = entry.color; exportCtx.fill();
      exportCtx.lineWidth = Math.max(2, Math.round(factor * 0.06)); exportCtx.strokeStyle = 'rgba(0, 0, 0, 0.18)'; exportCtx.stroke(); exportCtx.restore();

      const countTop = swatchTop + swatchHeight + swatchTextGap;
      exportCtx.font = `${swatchCountFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillStyle = '#3f4255';
      exportCtx.fillText(String(entry.count), itemCenterX, countTop);
    });
  }

  cursorY = swatchAreaTop + swatchAreaHeight + sectionGap;
  exportCtx.font = `${paletteFont}px ${PIXEL_FONT_FAMILY}`; exportCtx.fillStyle = '#1f1f1f'; exportCtx.textBaseline = 'top';
  exportCtx.fillText(`- 调色板: ${paletteLabel} -`, centerX, cursorY);
  return exportCanvas;
}

function drawCheckerboard(ctx, width, height) {
  const size = 8;
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e0e0e0';
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size * 2) {
      if ((y / size) % 2 === 0) ctx.fillRect(x + size, y, size, size);
      else ctx.fillRect(x, y, size, size);
    }
  }
}

export function exportImage(options = {}) {
  const { includeCodes = false, includeAxes = false, backgroundColor = '#ffffff', filename = null, format = 'image/png' } = options;

  if (!state.width || !state.height) { window.alert('请先新建画布'); return; }

  if (format === 'application/pdf') {
    const fullFilename = filename || `pixel-canvas-${state.width}x${state.height}.pdf`;
    exportToPDF({ includeCodes, includeAxes, backgroundColor, filename: fullFilename }).catch(error => window.alert(error.message));
    return;
  }

  const exportCanvas = document.createElement('canvas');
  renderExportCanvas(exportCanvas, { includeCodes, includeAxes, backgroundColor });

  const mime = format, dataUrl = exportCanvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined);
  const extension = getFileExtension(mime), link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename || `pixel-canvas-${state.width}x${state.height}.${extension}`;
  link.click();
}

export async function exportToPDF(options = {}) {
  const { includeCodes = false, includeAxes = false, backgroundColor = '#ffffff', filename = `pixel-canvas-${state.width}x${state.height}.pdf` } = options;

  if (!state.width || !state.height) throw new Error('请先新建画布');

  return new Promise((resolve, reject) => {
    try {
      const exportCanvas = document.createElement('canvas');
      renderExportCanvas(exportCanvas, { includeCodes, includeAxes, backgroundColor });
      const imageData = exportCanvas.toDataURL('image/png');

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: exportCanvas.width > exportCanvas.height ? 'landscape' : 'portrait', unit: 'px', format: [exportCanvas.width, exportCanvas.height] });
      pdf.addImage({ imageData, format: 'PNG', x: 0, y: 0, width: exportCanvas.width, height: exportCanvas.height });
      pdf.save(filename);
      resolve();
    } catch (error) {
      console.error('PDF导出失败:', error);
      reject(new Error('PDF导出失败: ' + error.message));
    }
  });
}

function getFileExtension(mimeType) {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'application/pdf': return 'pdf';
    case 'application/psd': return 'psd';
    default: return 'png';
  }
}

function beginRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}