import { state } from './state.js';
import { renderExportCanvas } from './exporter.js';
import { computeAxisPadding } from './utils.js';
import { EXPORT_SCALE } from './constants.js';
import { computeHighlightRegions, drawHighlightRegionOutline } from './highlight-outline.js';
import { getUsedColors } from './color-usage-cache.js';
import { TEXT } from './language.js';

const PIXEL_FONT_FAMILY = '"PixelFont", "Segoe UI", "Microsoft YaHei", sans-serif';
const AXIS_STYLE = {
    minFont: 12,
    minTick: 6,
    minGap: 6,
    fontFamily: PIXEL_FONT_FAMILY
};

class ExportHighlightManager {
    constructor() {
        this.selectedColors = new Set();
        this.usedColors = [];
        this.isInitialized = false;
        this.cellSize = EXPORT_SCALE; // 使用导出倍率作为高亮绘制的默认像素尺寸
        this.currentFilterText = '';
    }

    initialize() {
        if (this.isInitialized) return;

        this.bindEvents();
        this.isInitialized = true;
    }

    bindEvents() {
        const colorList = document.getElementById('highlightColorList');
        this.listContainer = colorList;
        colorList?.addEventListener('click', (event) => {
            const item = event.target.closest('.highlight-color-item');
            if (item) this.toggleColorSelection(item.dataset.code);
        });

        document.getElementById('selectAllHighlightColors')?.addEventListener('click', () => {
            this.selectAllColors();
        });

        document.getElementById('deselectAllHighlightColors')?.addEventListener('click', () => {
            this.deselectAllColors();
        });

        document.getElementById('exportAllHighlightColors')?.addEventListener('click', () => {
            this.exportAllHighlightedImages();
        });

        document.getElementById('highlightColorFilter')?.addEventListener('input', (event) => {
            this.filterColors(event.target.value);
        });

        document.querySelectorAll('input[name="exportFormat"]').forEach((radio) => {
            radio.addEventListener('change', (event) => {
                this.handleFormatChange(event.target.value);
            });
        });
    }

    updateUsedColors() {
        this.usedColors = this.collectUsedColors();
        this.clearFilterDebounce();
        this.renderColorList(this.currentFilterText);
    }

    collectUsedColors() {
        return getUsedColors();
    }

    renderColorList(filterText = this.currentFilterText) {
        const container = this.listContainer ?? document.getElementById('highlightColorList');
        if (!container) return;

        const rawInput = typeof filterText === 'string' ? filterText.trim() : '';
        this.currentFilterText = rawInput;
        const normalizedFilter = rawInput.toLowerCase();

        const filteredColors = normalizedFilter
            ? this.usedColors.filter((color) => color.code.toLowerCase().includes(normalizedFilter))
            : this.usedColors;

        this.cancelPendingRender();

        if (!filteredColors.length) {
            container.innerHTML = `<div class="highlight-color-empty">${TEXT.highlight.noMatch}</div>`;
            return;
        }

        container.innerHTML = '';

        let index = 0;
        const chunkSize = 160;
        const renderChunk = () => {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + chunkSize, filteredColors.length);
            for (; index < end; index += 1) {
                const color = filteredColors[index];
                if (!color) continue;
                const item = document.createElement('div');
                item.className = 'highlight-color-item';
                item.dataset.code = color.code;

                if (this.selectedColors.has(color.code)) {
                    item.classList.add('selected');
                }

                item.innerHTML = `
        <div class="highlight-color-checkbox ${this.selectedColors.has(color.code) ? 'checked' : ''}"></div>
        <div class="highlight-color-swatch" style="background: ${color.color}"></div>
        <div class="highlight-color-info">
          <div class="highlight-color-code">${color.code}</div>
          <div class="highlight-color-count">${TEXT.highlight.colorCount(color.count)}</div>
        </div>
      `;

                fragment.appendChild(item);
            }

            container.appendChild(fragment);

            if (index < filteredColors.length && typeof window !== 'undefined') {
                this.renderJob = window.requestAnimationFrame(renderChunk);
            } else {
                this.renderJob = null;
            }
        };

        renderChunk();
    }

    toggleColorSelection(colorCode) {
        if (!colorCode) return;

        if (this.selectedColors.has(colorCode)) {
            this.selectedColors.delete(colorCode);
        } else {
            this.selectedColors.add(colorCode);
        }

        this.renderColorList(this.currentFilterText);
        this.updatePreview();
        this.updateFormatRestrictions();
        document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
    }

    selectAllColors() {
        this.usedColors.forEach((color) => this.selectedColors.add(color.code));
        this.renderColorList(this.currentFilterText);
        this.updatePreview();
        this.updateFormatRestrictions();
        document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
    }

    deselectAllColors() {
        this.selectedColors.clear();
        this.renderColorList(this.currentFilterText);
        this.updatePreview();
        this.updateFormatRestrictions();
        document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
    }

    filterColors(text) {
        this.currentFilterText = typeof text === 'string' ? text.trim() : '';
        this.clearFilterDebounce();
        if (typeof window === 'undefined') {
            this.renderColorList(this.currentFilterText);
            return;
        }
        this.filterDebounceTimer = window.setTimeout(() => {
            this.renderColorList(this.currentFilterText);
            this.filterDebounceTimer = null;
        }, 100);
    }

    cancelPendingRender() {
        if (this.renderJob !== null && typeof window !== 'undefined') {
            window.cancelAnimationFrame(this.renderJob);
        }
        this.renderJob = null;
    }

    clearFilterDebounce() {
        if (this.filterDebounceTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(this.filterDebounceTimer);
        }
        this.filterDebounceTimer = null;
    }

    updatePreview() {
        if (typeof window.updateExportPreview === 'function') {
            window.updateExportPreview();
        }
    }

    handleFormatChange(format) {
        if (this.selectedColors.size > 0 && !this.isFormatSupported(format)) {
            this.showMessage(TEXT.highlight.formatUnsupported, 'error');
            return;
        }

        this.updatePreview();
    }

    updateFormatRestrictions() {
        const formatRadios = document.querySelectorAll('input[name="exportFormat"]');
        const hasHighlight = this.selectedColors.size > 0;

        formatRadios.forEach((radio) => {
            if (hasHighlight && !this.isFormatSupported(radio.value)) {
                radio.disabled = true;
                radio.parentElement.style.opacity = '0.5';
            } else {
                radio.disabled = false;
                radio.parentElement.style.opacity = '1';
            }
        });

        if (!hasHighlight) return;

        const active = document.querySelector('input[name="exportFormat"]:checked');
        if (active && !active.disabled) return;

        const fallback = Array.from(formatRadios).find((radio) => !radio.disabled);
        if (fallback && !fallback.checked) {
            fallback.checked = true;
            this.showMessage(TEXT.highlight.formatAutoSwitched, 'info');
        }
    }

    isFormatSupported(format) {
        return format === 'image/png' || format === 'image/jpeg';
    }

    showMessage(message, type = 'info') {
        const messageEl = document.getElementById('highlightMessage');
        if (!messageEl) return;

        messageEl.textContent = message;
        messageEl.className = `highlight-message ${type}`;

        window.clearTimeout(this._messageTimer);
        this._messageTimer = window.setTimeout(() => {
            messageEl.textContent = '';
            messageEl.className = 'highlight-message';
        }, 3000);
    }

    async exportAllHighlightedImages() {
        if (this.usedColors.length === 0) {
            this.showMessage(TEXT.highlight.noExportableColors, 'error');
            return;
        }

        if (!window.JSZip) {
            this.showMessage(TEXT.highlight.zipMissing, 'error');
            return;
        }

        this.showProgress(TEXT.highlight.progressGenerating, this.usedColors.length);

        try {
            const zip = new JSZip();
            const baseFilename = document.getElementById('exportFilename')?.value || TEXT.highlight.defaultFilename;
            const settings = this.getExportSettings();

            for (let i = 0; i < this.usedColors.length; i += 1) {
                const color = this.usedColors[i];
                this.updateProgress(i + 1, this.usedColors.length, TEXT.highlight.progressExportingColor(color.code));

                const canvas = await this.renderSingleColorHighlight(color.code, settings);
                const blob = await this.canvasToBlob(canvas, settings.format);
                const filename = this.generateFilename(baseFilename, color.code, settings.format);
                zip.file(filename, blob);
            }

            this.updateProgress(this.usedColors.length, this.usedColors.length, TEXT.highlight.progressAllDone);
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            this.downloadZip(zipBlob, `${baseFilename}-color-highlights.zip`);
            this.showMessage(TEXT.highlight.exportFinished, 'info');
        } catch (error) {
            console.error(TEXT.highlight.exportErrorConsole, error);
            this.showMessage(TEXT.highlight.exportErrorMessage(error?.message ?? ''), 'error');
        } finally {
            this.hideProgress();
        }
    }

    getExportSettings() {
        const includeCodes = document.querySelector('input[name="includeCodes"]:checked')?.value === 'true';
        const includeAxes = document.querySelector('input[name="includeAxes"]:checked')?.value === 'true';
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'image/png';
        const backgroundType = document.querySelector('input[name="backgroundType"]:checked')?.value;
        const pickedColor = document.getElementById('exportBackgroundColor')?.value || '#ffffff';
        const useTransparent = backgroundType === 'transparent';

        const backgroundColor = format === 'image/jpeg' && useTransparent
            ? '#ffffff'
            : (useTransparent ? 'transparent' : pickedColor);

        if (format === 'image/jpeg' && useTransparent) {
            this.showMessage(TEXT.highlight.jpgBackgroundWarning, 'info');
        }

        return {
            includeCodes,
            includeAxes,
            backgroundType: format === 'image/jpeg' && useTransparent ? 'solid' : backgroundType,
            backgroundColor,
            format
        };
    }

    async renderSingleColorHighlight(colorCode, settings) {
        return new Promise((resolve) => {
            const tempCanvas = document.createElement('canvas');
            const selectedColors = new Set([colorCode]);
            this.renderHighlightedCanvas(tempCanvas, selectedColors, settings);
            resolve(tempCanvas);
        });
    }

    renderHighlightedCanvas(canvas, selectedColors, options = {}) {
        const {
            includeCodes = false,
            includeAxes = false,
            backgroundColor = '#ffffff'
        } = options;

        this.updateUsedColors();

        const ctx = canvas.getContext('2d');
        const allColorsSelected = this.isAllColorsSelected(selectedColors);

        if (selectedColors.size === 0 || allColorsSelected) {
            renderExportCanvas(canvas, { includeCodes, includeAxes, backgroundColor });
            return canvas;
        }

        const factor = this.cellSize;
        const axisPadding = includeAxes
            ? computeAxisPadding(factor, state.width, state.height)
            : { top: 0, right: 0, bottom: 0, left: 0 };
        const contentWidth = state.width * factor;
        const contentHeight = state.height * factor;
        const drawingWidth = contentWidth + axisPadding.left + axisPadding.right;
        const drawingHeight = contentHeight + axisPadding.top + axisPadding.bottom;

        const pagePaddingX = Math.max(40, Math.round(factor * 0.8));
        const pagePaddingY = Math.max(40, Math.round(factor * 0.8));
        const headingFont = Math.max(28, Math.round(factor * 0.65));
        const headingGap = Math.max(16, Math.round(factor * 0.32));
        const sectionGap = Math.max(28, Math.round(factor * 0.56));
        const totalFont = Math.max(24, Math.round(factor * 0.55));
        const sectionTitleFont = Math.max(26, Math.round(factor * 0.6));
        const paletteFont = Math.max(24, Math.round(factor * 0.55));
        const selectedUsedColors = this.collectSelectedUsedColors(selectedColors);
        const totalSelectedCells = selectedUsedColors.reduce((sum, entry) => sum + entry.count, 0);
        const swatchGapX = Math.max(28, Math.round(factor * 0.56));
        const swatchGapY = Math.max(32, Math.round(factor * 0.64));
        const swatchTextGap = Math.max(14, Math.round(factor * 0.28));
        const swatchLabelFont = Math.max(22, Math.round(factor * 0.5));
        const swatchCountFont = Math.max(20, Math.round(factor * 0.46));
        const swatchWidth = Math.max(96, Math.round(factor * 1.9));
        const swatchHeight = Math.max(64, Math.round(factor * 1.28));
        const availableWidth = drawingWidth;
        const maxColumns = Math.max(1, Math.floor((availableWidth + swatchGapX) / (swatchWidth + swatchGapX)));
        const columns = selectedUsedColors.length
            ? Math.min(selectedUsedColors.length, Math.max(1, maxColumns))
            : 1;
        const rows = selectedUsedColors.length ? Math.ceil(selectedUsedColors.length / columns) : 1;
        const itemHeight = swatchLabelFont + swatchTextGap + swatchHeight + swatchTextGap + swatchCountFont;
        const swatchAreaHeight = selectedUsedColors.length
            ? rows * itemHeight + (rows - 1) * swatchGapY
            : swatchHeight + swatchLabelFont;

        let totalHeight = pagePaddingY;
        totalHeight += headingFont + headingGap + drawingHeight + sectionGap + totalFont + sectionGap;
        totalHeight += sectionTitleFont + headingGap + swatchAreaHeight + sectionGap + paletteFont + pagePaddingY;

        const drawingLeft = pagePaddingX;
        const drawingTop = pagePaddingY + headingFont + headingGap;
        const originX = drawingLeft + axisPadding.left;
        const originY = drawingTop + axisPadding.top;

        canvas.width = drawingWidth + pagePaddingX * 2;
        canvas.height = totalHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (backgroundColor === 'transparent') {
            this.drawCheckerboard(ctx, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.imageSmoothingEnabled = false;

        const centerX = canvas.width / 2;
        let cursorY = pagePaddingY;

        ctx.fillStyle = '#1f1f1f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `${headingFont}px ${PIXEL_FONT_FAMILY}`;
        ctx.fillText(TEXT.highlight.canvasTitle, centerX, cursorY);

        cursorY += headingFont + headingGap;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawingLeft, drawingTop, drawingWidth, drawingHeight);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawingLeft + 0.5, drawingTop + 0.5, drawingWidth - 1, drawingHeight - 1);

        for (let y = 0; y < state.height; y += 1) {
            for (let x = 0; x < state.width; x += 1) {
                const cell = state.grid[y][x];
                if (!cell) continue;
                const pixelX = originX + x * factor;
                const pixelY = originY + y * factor;
                ctx.fillStyle = cell.color;
                ctx.fillRect(pixelX, pixelY, factor, factor);
            }
        }

        ctx.fillStyle = 'rgba(101, 100, 100, 0.5)';
        for (let y = 0; y < state.height; y += 1) {
            for (let x = 0; x < state.width; x += 1) {
                const cell = state.grid[y][x];
                const pixelX = originX + x * factor;
                const pixelY = originY + y * factor;
                if (!cell || !selectedColors.has(cell.code)) {
                    ctx.fillRect(pixelX, pixelY, factor, factor);
                }
            }
        }

        for (let y = 0; y < state.height; y += 1) {
            for (let x = 0; x < state.width; x += 1) {
                const cell = state.grid[y][x];
                if (!cell || !selectedColors.has(cell.code)) continue;
                const pixelX = originX + x * factor;
                const pixelY = originY + y * factor;
                ctx.fillStyle = cell.color;
                ctx.fillRect(pixelX, pixelY, factor, factor);
            }
        }

        if (includeCodes) {
            for (let y = 0; y < state.height; y += 1) {
                for (let x = 0; x < state.width; x += 1) {
                    const cell = state.grid[y][x];
                    if (!cell || !selectedColors.has(cell.code)) continue;
                    const pixelX = originX + x * factor;
                    const pixelY = originY + y * factor;
                    this.renderColorCode(ctx, cell, pixelX, pixelY, factor);
                }
            }
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(3, Math.round(factor * 0.06));
        ctx.lineJoin = 'miter';

        const regions = computeHighlightRegions(selectedColors);
        regions.forEach((region) => {
            drawHighlightRegionOutline(ctx, region, originX, originY, factor);
        });

        if (includeAxes) {
            this.renderAxisLabels(ctx, {
                originX,
                originY,
                cellSize: factor,
                widthCells: state.width,
                heightCells: state.height,
                textColor: 'rgba(0,0,0,0.75)',
                tickColor: 'rgba(0,0,0,0.35)',
                fontSize: Math.max(12, Math.floor(factor * 0.28)),
                tickLength: Math.max(6, Math.floor(factor * 0.25)),
                gap: Math.max(6, Math.floor(factor * 0.2))
            });
        }

        cursorY = drawingTop + drawingHeight + sectionGap;
        ctx.font = `${totalFont}px ${PIXEL_FONT_FAMILY}`;
        ctx.fillStyle = '#1f1f1f';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(TEXT.highlight.canvasTotalLabel(totalSelectedCells), centerX, cursorY);

        cursorY += totalFont + sectionGap;
        ctx.font = `${sectionTitleFont}px ${PIXEL_FONT_FAMILY}`;
        ctx.fillText(TEXT.highlight.canvasSectionTitle, centerX, cursorY);

        cursorY += sectionTitleFont + headingGap;

        const swatchAreaTop = cursorY;
        const swatchContentWidth = selectedUsedColors.length
            ? columns * swatchWidth + (columns - 1) * swatchGapX
            : swatchWidth;
        const swatchStartX = pagePaddingX + (availableWidth - swatchContentWidth) / 2;

        if (!selectedUsedColors.length) {
            ctx.save();
            ctx.font = `${swatchCountFont}px ${PIXEL_FONT_FAMILY}`;
            ctx.fillStyle = '#6f7285';
            ctx.textBaseline = 'middle';
            ctx.fillText(TEXT.highlight.canvasEmptyHint, centerX, swatchAreaTop + swatchAreaHeight / 2);
            ctx.restore();
        } else {
            ctx.textBaseline = 'top';
            selectedUsedColors.forEach((entry, index) => {
                const columnIndex = index % columns;
                const rowIndex = Math.floor(index / columns);
                const itemLeft = swatchStartX + columnIndex * (swatchWidth + swatchGapX);
                const itemTop = swatchAreaTop + rowIndex * (itemHeight + swatchGapY);
                const itemCenterX = itemLeft + swatchWidth / 2;

                ctx.font = `${swatchLabelFont}px ${PIXEL_FONT_FAMILY}`;
                ctx.fillStyle = '#1f1f1f';
                ctx.fillText(entry.code, itemCenterX, itemTop);

                const swatchTop = itemTop + swatchLabelFont + swatchTextGap;
                ctx.save();
                this.beginRoundedRectPath(
                    ctx,
                    itemLeft,
                    swatchTop,
                    swatchWidth,
                    swatchHeight,
                    Math.round(Math.min(swatchWidth, swatchHeight) * 0.35)
                );
                ctx.fillStyle = entry.color;
                ctx.fill();
                ctx.lineWidth = Math.max(2, Math.round(factor * 0.06));
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
                ctx.stroke();
                ctx.restore();

                const countTop = swatchTop + swatchHeight + swatchTextGap;
                ctx.font = `${swatchCountFont}px ${PIXEL_FONT_FAMILY}`;
                ctx.fillStyle = '#3f4255';
                ctx.fillText(String(entry.count), itemCenterX, countTop);
            });
        }

        cursorY = swatchAreaTop + swatchAreaHeight + sectionGap;
        ctx.font = `${paletteFont}px ${PIXEL_FONT_FAMILY}`;
        ctx.fillStyle = '#1f1f1f';
        ctx.textBaseline = 'top';
        const paletteLabel = this.getActivePaletteLabel();
        ctx.fillText(TEXT.highlight.canvasPaletteLabel(paletteLabel), centerX, cursorY);

        return canvas;
    }

    isAllColorsSelected(selectedColors) {
        if (selectedColors.size === 0) return false;

        const currentUsedColors = this.collectUsedColors();
        if (currentUsedColors.length === 0) return false;
        if (selectedColors.size !== currentUsedColors.length) return false;

        for (const color of currentUsedColors) {
            if (!selectedColors.has(color.code)) return false;
        }

        return true;
    }

    collectSelectedUsedColors(selectedColors) {
        const usage = new Map();

        for (let y = 0; y < state.height; y += 1) {
            for (let x = 0; x < state.width; x += 1) {
                const cell = state.grid[y][x];
                if (!cell || !selectedColors.has(cell.code)) continue;

                if (!usage.has(cell.code)) {
                    usage.set(cell.code, {
                        code: cell.code,
                        color: cell.color,
                        rgb: cell.rgb,
                        count: 0
                    });
                }

                usage.get(cell.code).count += 1;
            }
        }

        const colors = Array.from(usage.values());
        colors.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-u-nu-latn', { numeric: true }));
        return colors;
    }

    getActivePaletteLabel() {
        const label = (state.currentPaletteLabel || '').trim();
        if (label) return label;

        if (state.currentPaletteId && state.paletteLibrary.has(state.currentPaletteId)) {
            const entry = state.paletteLibrary.get(state.currentPaletteId);
            if (entry?.name) return entry.name;
        }

        return TEXT.highlight.unnamedPalette;
    }

    beginRoundedRectPath(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
    }

    renderAxisLabels(ctx, options = {}) {
        const {
            originX = 0,
            originY = 0,
            cellSize = 10,
            widthCells = 0,
            heightCells = 0,
            textColor = 'rgba(0,0,0,0.65)',
            tickColor = 'rgba(0,0,0,0.3)',
            fontSize = 12,
            tickLength = 6,
            gap = 6
        } = options;

        if (!ctx) return;

        ctx.save();
        ctx.font = `${fontSize}px ${AXIS_STYLE.fontFamily}`;
        ctx.fillStyle = textColor;
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = Math.max(1, Math.round(cellSize * 0.02));

        for (let gx = 0; gx <= widthCells; gx += 1) {
            const x = gx * cellSize + 0.5;
            ctx.beginPath();
            ctx.moveTo(originX + x - 0.5, originY);
            ctx.lineTo(originX + x - 0.5, originY + heightCells * cellSize);
            ctx.stroke();
        }

        for (let gy = 0; gy <= heightCells; gy += 1) {
            const y = gy * cellSize + 0.5;
            ctx.beginPath();
            ctx.moveTo(originX, originY + y - 0.5);
            ctx.lineTo(originX + widthCells * cellSize, originY + y - 0.5);
            ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const topY = originY - gap - tickLength;
        for (let x = 0; x < widthCells; x += 1) {
            const centerX = originX + x * cellSize + cellSize / 2;
            ctx.beginPath();
            ctx.moveTo(centerX, originY - 0.5);
            ctx.lineTo(centerX, originY - tickLength - 0.5);
            ctx.stroke();
            ctx.fillText(String(x + 1), centerX, topY);
        }

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const leftX = originX - gap;
        for (let y = 0; y < heightCells; y += 1) {
            const centerY = originY + y * cellSize + cellSize / 2;
            ctx.beginPath();
            ctx.moveTo(originX - 0.5, centerY);
            ctx.lineTo(originX - tickLength - 0.5, centerY);
            ctx.stroke();
            ctx.fillText(String(y + 1), leftX, centerY);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const bottomY = originY + heightCells * cellSize + gap + tickLength;
        for (let x = 0; x < widthCells; x += 1) {
            const centerX = originX + x * cellSize + cellSize / 2;
            ctx.beginPath();
            ctx.moveTo(centerX, originY + heightCells * cellSize + 0.5);
            ctx.lineTo(centerX, originY + heightCells * cellSize + tickLength + 0.5);
            ctx.stroke();
            ctx.fillText(String(x + 1), centerX, bottomY);
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const rightEdge = originX + widthCells * cellSize + 0.5;
        const rightLabelX = rightEdge + tickLength + gap;
        for (let y = 0; y < heightCells; y += 1) {
            const centerY = originY + y * cellSize + cellSize / 2;
            ctx.beginPath();
            ctx.moveTo(rightEdge, centerY);
            ctx.lineTo(rightEdge + tickLength, centerY);
            ctx.stroke();
            ctx.fillText(String(y + 1), rightLabelX, centerY);
        }

        ctx.restore();
    }

    createHighlightMask(selectedColors) {
        const mask = Array.from({ length: state.height }, () =>
            Array.from({ length: state.width }, () => false)
        );

        for (let y = 0; y < state.height; y += 1) {
            for (let x = 0; x < state.width; x += 1) {
                const cell = state.grid[y]?.[x];
                mask[y][x] = Boolean(cell && selectedColors.has(cell.code));
            }
        }

        return mask;
    }

    renderColorCode(ctx, cell, pixelX, pixelY, cellSize) {
        const fontSize = Math.max(10, Math.floor(cellSize * 0.3));
        ctx.font = `${fontSize}px ${PIXEL_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.getContrastColor(cell.rgb);
        ctx.fillText(cell.code, pixelX + cellSize / 2, pixelY + cellSize / 2);
    }

    getContrastColor(rgb) {
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
    }

    isCellHighlighted(x, y, selectedColors) {
        const cell = state.grid[y]?.[x];
        return Boolean(cell && selectedColors.has(cell.code));
    }

    canvasToBlob(canvas, format = 'image/png') {
        return new Promise((resolve) => {
            const mime = format === 'image/jpeg' ? 'image/jpeg' : 'image/png';
            const quality = mime === 'image/jpeg' ? 0.92 : undefined;
            canvas.toBlob(resolve, mime, quality);
        });
    }

    generateFilename(baseName, colorCode, format = 'image/png') {
        const sizeSuffix = state.width && state.height ? `${state.width}x${state.height}` : 'size';
        const extension = this.getFormatExtension(format);
        return `${baseName}-${colorCode}-${sizeSuffix}.${extension}`;
    }

    getFormatExtension(format) {
        return format === 'image/jpeg' ? 'jpg' : 'png';
    }

    downloadZip(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    showProgress(message, total) {
        let progressEl = document.getElementById('exportProgress');

        if (!progressEl) {
            progressEl = document.createElement('div');
            progressEl.id = 'exportProgress';
            progressEl.className = 'export-progress';
            progressEl.innerHTML = `
        <div class="export-spinner"></div>
        <div class="export-progress-text">${message}</div>
        <div class="export-progress-count">0/${total}</div>
      `;
            document.body.appendChild(progressEl);
        } else {
            progressEl.querySelector('.export-progress-text').textContent = message;
            progressEl.querySelector('.export-progress-count').textContent = `0/${total}`;
        }

        progressEl.classList.add('visible');
    }

    updateProgress(current, total, message = '') {
        const progressEl = document.getElementById('exportProgress');
        if (!progressEl) return;

        const countEl = progressEl.querySelector('.export-progress-count');
        const textEl = progressEl.querySelector('.export-progress-text');

        if (countEl) countEl.textContent = `${current}/${total}`;
        if (textEl && message) textEl.textContent = message;
    }

    hideProgress() {
        const progressEl = document.getElementById('exportProgress');
        if (progressEl) {
            progressEl.classList.remove('visible');
        }
    }

    getSelectedColors() {
        return this.selectedColors;
    }

    hasHighlight() {
        return this.selectedColors.size > 0;
    }

    drawCheckerboard(ctx, width, height) {
        const size = 8;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#e0e0e0';

        for (let y = 0; y < height; y += size) {
            for (let x = 0; x < width; x += size * 2) {
                if ((y / size) % 2 === 0) ctx.fillRect(x + size, y, size, size);
                else ctx.fillRect(x, y, size, size);
            }
        }
    }
}

export const exportHighlightManager = new ExportHighlightManager();
