import { state } from './state.js';
import { renderExportCanvas, resolveExportCellStage, resolveExportColorForCode, drawExportPixel, computeExportInfoScale } from './exporter.js';
import { computeAxisPadding } from './utils.js';
import { EXPORT_SCALE } from './constants.js';
import { renderAxisLabels, renderGridLines } from './grid-overlay.js';
import { computeHighlightRegions, drawHighlightRegionOutline } from './highlight-outline.js';
import { getUsedColors } from './color-usage-cache.js';
import { TEXT } from './language.js';

const PIXEL_FONT_FAMILY = '"Segoe UI", "Microsoft YaHei", "SimHei", "Arial", sans-serif';
const FALLBACK_RGB = { r: 0, g: 0, b: 0 };

class ExportHighlightManager {
    constructor() {
        this.selectedColors = new Set();
        this.usedColors = [];
        this.isInitialized = false;
        this.cellSize = EXPORT_SCALE;
        this.currentFilterText = '';
        this.listContainer = null;
        this.filterDebounceTimer = null;
        this.renderJob = null;
        this.selectedCountEl = null;
        this.totalCountEl = null;
    }

    initialize() {
        if (this.isInitialized) return;

        this.bindEvents();
        this.isInitialized = true;
    }

    bindEvents() {
        const colorList = document.getElementById('highlightColorList');
        this.listContainer = colorList?.querySelector('.highlight-list-content') ?? colorList;
        this.selectedCountEl = document.getElementById('highlightSelectedCount');
        this.totalCountEl = document.getElementById('highlightTotalCount');

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
        this.updateSelectionSummary();
    }

    collectUsedColors() {
        return getUsedColors();
    }

    renderColorList(filterText = this.currentFilterText) {
        const container = this.listContainer ?? document.getElementById('highlightColorList')?.querySelector('.highlight-list-content');
        if (!container) return;

        const rawInput = typeof filterText === 'string' ? filterText.trim() : '';
        this.currentFilterText = rawInput;
        const normalizedFilter = rawInput.toLowerCase();

        const filteredColors = normalizedFilter
            ? this.usedColors.filter((color) => color.code.toLowerCase().includes(normalizedFilter))
            : this.usedColors;

        this.cancelPendingRender();
        const colorOptions = this.getExportColorOptions();

        const selectedStateLabel = TEXT.highlight.stateSelected ?? '��ѡ';
        const unselectedStateLabel = TEXT.highlight.stateUnselected ?? 'δѡ';

        if (!filteredColors.length) {
            container.innerHTML = `<div class="highlight-empty">${TEXT.highlight.noMatch}</div>`;
            this.updateSelectionSummary();
            return;
        }

        container.innerHTML = '';

        const treatAsFullSelection = this.isAllColorsSelected(this.selectedColors);
        let index = 0;
        const chunkSize = 160;
        const renderChunk = () => {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + chunkSize, filteredColors.length);
            for (; index < end; index += 1) {
                const color = filteredColors[index];
                if (!color) continue;
                const stage = resolveExportColorForCode(color.code, color, colorOptions);
                const swatchColor = stage?.color ?? color.color;
                const isSelected = !treatAsFullSelection && this.selectedColors.has(color.code);
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'highlight-color-item export-highlight-color-item';
                if (isSelected) item.classList.add('is-selected');
                item.dataset.code = color.code;
                item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
                const stateLabel = isSelected ? selectedStateLabel : unselectedStateLabel;

                item.innerHTML = `
            <div class="highlight-color-cell">
                <span class="highlight-color-swatch" style="background: ${swatchColor}"></span>
            </div>
            <div class="highlight-color-code" title="${color.code}">${color.code}</div>
            <div class="highlight-color-count" title="${TEXT.highlight.colorCount?.(color.count) ?? ''}">${color.count.toLocaleString()}</div>
            <div class="highlight-color-select" title="${stateLabel}">
                <span class="highlight-select-icon ${isSelected ? 'is-selected' : ''}" aria-hidden="true"></span>
                <span class="sr-only">${stateLabel}</span>
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
        this.updateSelectionSummary();
    }

    toggleColorSelection(colorCode) {
        if (!colorCode) return;

        if (this.selectedColors.has(colorCode)) {
            this.selectedColors.delete(colorCode);
        } else {
            this.selectedColors.add(colorCode);
        }

        this.renderColorList(this.currentFilterText);
        this.updateSelectionSummary();
        this.updatePreview();
        this.updateFormatRestrictions();
        document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
    }

    selectAllColors() {
        this.usedColors.forEach((color) => this.selectedColors.add(color.code));
        this.renderColorList(this.currentFilterText);
        this.updateSelectionSummary();
        this.updatePreview();
        this.updateFormatRestrictions();
        document.dispatchEvent(new CustomEvent('highlightColorsChanged'));
    }

    deselectAllColors() {
        this.selectedColors.clear();
        this.renderColorList(this.currentFilterText);
        this.updateSelectionSummary();
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

    updateSelectionSummary() {
        if (this.selectedCountEl) {
            this.selectedCountEl.textContent = String(this.selectedColors.size);
        }
        if (this.totalCountEl) {
            this.totalCountEl.textContent = String(this.usedColors.length);
        }
    }

    updatePreview() {
        if (typeof window.updateExportPreview === 'function') {
            window.updateExportPreview();
        }
    }

    handleFormatChange(format) {
        if (this.hasHighlight() && !this.isFormatSupported(format)) {
            this.showMessage(TEXT.highlight.formatUnsupported, 'error');
            return;
        }

        this.updatePreview();
    }

    updateFormatRestrictions() {
        const formatRadios = document.querySelectorAll('input[name="exportFormat"]');
        const hasHighlight = this.hasHighlight();

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

    async exportAllHighlightedImages(options = {}) {
        return this.exportColorCollection(this.usedColors, {
            archiveSuffix: 'color-highlights',
            successMessage: TEXT.highlight.exportFinished,
            ...options
        });
    }

    async exportColorCollection(colors, options = {}) {
        const { archiveSuffix, successMessage, silent = false } = options;

        if (!colors.length) {
            if (!silent) this.showMessage(TEXT.highlight.noExportableColors, 'error');
            return;
        }

        if (!window.JSZip) {
            if (!silent) this.showMessage(TEXT.highlight.zipMissing, 'error');
            return;
        }

        this.showProgress(TEXT.highlight.progressGenerating, colors.length);

        try {
            const zip = new JSZip();
            const baseFilename = document.getElementById('exportFilename')?.value || TEXT.highlight.defaultFilename;
            const settings = this.getExportSettings();

            for (let i = 0; i < colors.length; i += 1) {
                const color = colors[i];
                this.updateProgress(i + 1, colors.length, TEXT.highlight.progressExportingColor(color.code));

                const canvas = await this.renderSingleColorHighlight(color.code, settings);
                const blob = await this.canvasToBlob(canvas, settings.format);
                const filename = this.generateFilename(baseFilename, color.code, settings.format);
                zip.file(filename, blob);
            }

            this.updateProgress(colors.length, colors.length, TEXT.highlight.progressAllDone);
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const archiveName = `${baseFilename}-${archiveSuffix || 'color-highlights'}.zip`;
            this.downloadZip(zipBlob, archiveName);
            if (!silent && successMessage) {
                this.showMessage(successMessage, 'info');
            }
        } catch (error) {
            console.error(TEXT.highlight.exportErrorConsole, error);
            if (!silent) {
                this.showMessage(TEXT.highlight.exportErrorMessage(error?.message ?? ''), 'error');
            }
            throw error;
        } finally {
            this.hideProgress();
        }
    }

    getExportSettings() {
        const includeCodes = Boolean(document.querySelector('input[name="includeCodes"]')?.checked);
        const includeAxes = Boolean(document.querySelector('input[name="includeAxes"]')?.checked);
        const includeLightColors = document.querySelector('input[name="includeLightColors"]')?.checked !== false;
        const includeTemperatureColors = document.querySelector('input[name="includeTemperatureColors"]')?.checked !== false;
        const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'image/png';
        const backgroundType = document.querySelector('input[name="backgroundType"]:checked')?.value;
        const pickedColor = (document.getElementById('exportBackgroundColor')?.value || '#ffffff').toUpperCase();
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
            includeLightColors,
            includeTemperatureColors,
            backgroundType: format === 'image/jpeg' && useTransparent ? 'solid' : backgroundType,
            backgroundColor,
            format
        };
    }

    getExportColorOptions() {
        const settings = state.exportSettings || {};
        return {
            includeLightColors: settings.includeLightColors !== false,
            includeTemperatureColors: settings.includeTemperatureColors !== false
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
            includeLightColors = true,
            includeTemperatureColors = true,
            backgroundColor = '#ffffff'
        } = options;

        const ctx = canvas.getContext('2d');
        const colorOptions = { includeLightColors, includeTemperatureColors };
        const allColorsSelected = this.isAllColorsSelected(selectedColors);

        if (selectedColors.size === 0 || allColorsSelected) {
            renderExportCanvas(canvas, {
                includeCodes,
                includeAxes,
                includeLightColors,
                includeTemperatureColors,
                backgroundColor,
                hasHighlight: false
            });
            return canvas;
        }

        const stageCache = Array.from({ length: state.height }, () => Array(state.width));
        const factor = this.cellSize;
        const layoutScale = computeExportInfoScale(state.width, state.height);
        const spacingScale = Math.min(layoutScale, 3.2);
        const axisPadding = includeAxes
            ? computeAxisPadding(factor, state.width, state.height)
            : { top: 0, right: 0, bottom: 0, left: 0 };
        const contentWidth = state.width * factor;
        const contentHeight = state.height * factor;
        const drawingWidth = contentWidth + axisPadding.left + axisPadding.right;
        const drawingHeight = contentHeight + axisPadding.top + axisPadding.bottom;

        const pagePaddingX = Math.max(40, Math.round(factor * 0.8 * spacingScale));
        const pagePaddingY = Math.max(40, Math.round(factor * 0.8 * spacingScale));
        const headingFont = Math.max(28, Math.round(factor * 0.65 * layoutScale));
        const headingGap = Math.max(16, Math.round(factor * 0.32 * spacingScale));
        const sectionGap = Math.max(28, Math.round(factor * 0.56 * spacingScale));
        const totalFont = Math.max(24, Math.round(factor * 0.55 * layoutScale));
        const sectionTitleFont = Math.max(26, Math.round(factor * 0.6 * layoutScale));
        const paletteFont = Math.max(24, Math.round(factor * 0.55 * layoutScale));
        const selectedUsedColors = this.collectSelectedUsedColors(selectedColors);
        const totalSelectedCells = selectedUsedColors.reduce((sum, entry) => sum + entry.count, 0);
        const displaySelectedColors = selectedUsedColors.map((entry) => {
            const stage = resolveExportColorForCode(entry.code, entry, colorOptions);
            return {
                ...entry,
                color: stage?.color ?? entry.color
            };
        });
        const swatchGapX = Math.max(28, Math.round(factor * 0.56 * spacingScale));
        const swatchGapY = Math.max(32, Math.round(factor * 0.64 * spacingScale));
        const swatchTextGap = Math.max(14, Math.round(factor * 0.28 * layoutScale));
        const swatchLabelFont = Math.max(22, Math.round(factor * 0.5 * layoutScale));
        const swatchCountFont = Math.max(20, Math.round(factor * 0.46 * layoutScale));
        const swatchWidth = Math.max(96, Math.round(factor * 1.6 * spacingScale));
        const swatchHeight = Math.max(64, Math.round(factor * 1.2 * spacingScale));
        const availableWidth = drawingWidth;
        const maxColumns = Math.max(1, Math.floor((availableWidth + swatchGapX) / (swatchWidth + swatchGapX)));
        const columns = displaySelectedColors.length
            ? Math.min(displaySelectedColors.length, Math.max(1, maxColumns))
            : 1;
        const rows = displaySelectedColors.length ? Math.ceil(displaySelectedColors.length / columns) : 1;
        const itemHeight = swatchLabelFont + swatchTextGap + swatchHeight + swatchTextGap + swatchCountFont;
        const swatchAreaHeight = displaySelectedColors.length
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
        const exportFilename = (state.exportSettings?.filename || 'pixel-art').trim() || 'pixel-art';
        const titleSuffix = selectedColors?.size ? '-高亮图' : '';
        ctx.fillText(`${exportFilename}${titleSuffix}`, centerX, cursorY);

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
                const stage = resolveExportCellStage(cell, colorOptions);
                if (!stage) continue;
                const pixelX = originX + x * factor;
                const pixelY = originY + y * factor;
                drawExportPixel(ctx, cell, stage, pixelX, pixelY, factor, backgroundColor);
                stageCache[y][x] = stage;
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
                const stage = stageCache[y][x] ?? resolveExportCellStage(cell, colorOptions);
                if (!stage) continue;
                const pixelX = originX + x * factor;
                const pixelY = originY + y * factor;
                drawExportPixel(ctx, cell, stage, pixelX, pixelY, factor, backgroundColor);
            }
        }

        if (includeCodes) {
            for (let y = 0; y < state.height; y += 1) {
                for (let x = 0; x < state.width; x += 1) {
                    const cell = state.grid[y][x];
                    if (!cell || !selectedColors.has(cell.code)) continue;
                    const stage = stageCache[y][x] ?? resolveExportCellStage(cell, colorOptions);
                    if (!stage) continue;
                    const pixelX = originX + x * factor;
                    const pixelY = originY + y * factor;
                    this.renderColorCode(ctx, cell, stage, pixelX, pixelY, factor);
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
            const thinWidth = Math.max(1, Math.round(factor * 0.02));
            const boldWidth = Math.max(thinWidth + 1, Math.round(factor * 0.08));
            renderGridLines(ctx, {
                originX,
                originY,
                cellSize: factor,
                widthCells: state.width,
                heightCells: state.height,
                thinColor: 'rgba(0,0,0,0.18)',
                boldColor: 'rgba(0,0,0,0.45)',
                thinLineWidth: thinWidth,
                boldLineWidth: boldWidth,
                gridOptions: state.gridOverlay
            });
            renderAxisLabels(ctx, {
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
        const swatchContentWidth = displaySelectedColors.length
            ? columns * swatchWidth + (columns - 1) * swatchGapX
            : swatchWidth;
        const swatchStartX = pagePaddingX + (availableWidth - swatchContentWidth) / 2;

        if (!displaySelectedColors.length) {
            ctx.save();
            ctx.font = `${swatchCountFont}px ${PIXEL_FONT_FAMILY}`;
            ctx.fillStyle = '#6f7285';
            ctx.textBaseline = 'middle';
            ctx.fillText(TEXT.highlight.canvasEmptyHint, centerX, swatchAreaTop + swatchAreaHeight / 2);
            ctx.restore();
        } else {
            ctx.textBaseline = 'top';
            displaySelectedColors.forEach((entry, index) => {
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

        const referenceColors = this.usedColors?.length ? this.usedColors : this.collectUsedColors();
        if (referenceColors.length === 0) return false;
        if (selectedColors.size !== referenceColors.length) return false;

        for (const color of referenceColors) {
            if (!selectedColors.has(color.code)) return false;
        }
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

    renderColorCode(ctx, cell, stage, pixelX, pixelY, cellSize) {
        const fontSize = Math.max(10, Math.floor(cellSize * 0.3));
        ctx.font = `${fontSize}px ${PIXEL_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const rgb = stage?.rgb ?? cell.rgb ?? FALLBACK_RGB;
        ctx.fillStyle = this.getContrastColor(rgb);
        ctx.fillText(cell.code, pixelX + cellSize / 2, pixelY + cellSize / 2);
    }

    getContrastColor(rgb) {
        const source = rgb ?? FALLBACK_RGB;
        const brightness = (source.r * 299 + source.g * 587 + source.b * 114) / 1000;
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
        return this.selectedColors.size > 0 && !this.isAllColorsSelected(this.selectedColors);
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




