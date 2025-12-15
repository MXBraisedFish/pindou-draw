import { elements } from './elements.js';
import { state } from './state.js';
import { exportImage, exportToPDF, exportToSVG, renderExportCanvas } from './exporter.js';
import { exportProject } from './pd.js';
import { exportHighlightManager } from './export-highlight.js';
import { TEXT } from './language.js';
let previewState = { sourceCanvas: null, scale: 1, offsetX: 0, offsetY: 0, isDragging: false, lastX: 0, lastY: 0, minScale: 0.1, maxScale: 3 };
let exportInProgress = false;
const HIGHLIGHT_IMAGE_FORMATS = new Set(['image/png', 'image/jpeg']);
let colorInputTimer = null;
let previewRenderHandle = null;
let previewRenderCancel = null;
let pendingPreviewSnapshot = null;
let lastPreviewSignature = null;
export function initializeExportWindow() {
    if (!elements.exportWindow) return;
    
    [elements.exportCloseBtn, elements.exportCancelBtn].forEach(btn => 
        btn?.addEventListener('click', () => toggleExportWindow(false))
    );
    
    elements.exportConfirmBtn?.addEventListener('click', handleExportConfirm);
    
    
    elements.resetPreviewViewBtn?.addEventListener('click', resetPreviewView);
    
    exportHighlightManager.initialize();
    bindExportSettingsEvents();
    initializeExportSettings();
    bindPreviewInteractions();
    bindExportTabletViewTabs();
    document.addEventListener('keydown', handleKeydown);
    syncExportWindow();
}


function renderPreviewCanvas() {
    if (!previewState.sourceCanvas || !elements.exportPreviewCanvas) return;
    
    const previewCtx = elements.exportPreviewCanvas.getContext('2d');
    const previewWidth = elements.exportPreviewCanvas.width;
    const previewHeight = elements.exportPreviewCanvas.height;
    
    previewCtx.clearRect(0, 0, previewWidth, previewHeight);
    drawPreviewCheckerboard(previewCtx, previewWidth, previewHeight);
    
    previewCtx.save();
    previewCtx.translate(previewState.offsetX, previewState.offsetY);
    previewCtx.scale(previewState.scale, previewState.scale);
    previewCtx.drawImage(previewState.sourceCanvas, 0, 0);
    previewCtx.restore();
    
    elements.exportPreviewCanvas.style.cursor = previewState.isDragging ? 'grabbing' : 'grab';
    
    
    updateScaleDisplay();
}

function updateScaleDisplay() {
    const scaleValue = Math.round(previewState.scale * 100);
    const scaleElement = document.getElementById('previewScaleValue');
    if (scaleElement) {
        scaleElement.textContent = `${scaleValue}%`;
    }
}

function bindExportSettingsEvents() {
    document.querySelectorAll('input[name="exportFormat"]').forEach((radio) => {
        radio.addEventListener('change', (event) => {
            state.exportSettings.format = event.target.value;
            if (event.target.value === 'image/jpeg' && state.exportSettings.backgroundType !== 'solid') {
                state.exportSettings.backgroundType = 'solid';
                updateRadioSelection('backgroundType', 'solid');
                updateBackgroundControls();
                window.alert(TEXT.highlight.jpgBackgroundWarning);
            }
            updateFormatAvailability();
            updateFilenamePreview();
            updateExportPreview();
        });
    });

    document.querySelectorAll('input[name="backgroundType"]').forEach((radio) => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === 'transparent' && state.exportSettings.format === 'image/jpeg') {
                window.alert(TEXT.highlight.jpgBackgroundWarning);
                updateRadioSelection('backgroundType', 'solid');
                return;
            }
            state.exportSettings.backgroundType = event.target.value;
            updateBackgroundControls();
            updateExportPreview();
        });
    });

    const includeCodesCheckbox = document.querySelector('input[name="includeCodes"]');
    includeCodesCheckbox?.addEventListener('change', (event) => {
        state.exportSettings.includeCodes = event.target.checked;
        updateExportPreview();
    });

    const includeAxesCheckbox = document.querySelector('input[name="includeAxes"]');
    includeAxesCheckbox?.addEventListener('change', (event) => {
        state.exportSettings.includeAxes = event.target.checked;
        updateExportPreview();
    });

    const includeLightColorsCheckbox = document.querySelector('input[name="includeLightColors"]');
    includeLightColorsCheckbox?.addEventListener('change', (event) => {
        state.exportSettings.includeLightColors = event.target.checked;
        exportHighlightManager.renderColorList?.();
        updateExportPreview();
    });

    const includeTemperatureColorsCheckbox = document.querySelector('input[name="includeTemperatureColors"]');
    includeTemperatureColorsCheckbox?.addEventListener('change', (event) => {
        state.exportSettings.includeTemperatureColors = event.target.checked;
        exportHighlightManager.renderColorList?.();
        updateExportPreview();
    });

    elements.exportBackgroundColor?.addEventListener('input', (event) => {
        if (state.exportSettings.backgroundType !== 'solid') return;
        const value = (event.target.value || '#ffffff').toUpperCase();
        state.exportSettings.backgroundColor = value;
        updateColorValueLabel(value, false);
        clearTimeout(colorInputTimer);
        colorInputTimer = setTimeout(() => updateExportPreview(), 120);
    });

    elements.exportFilename?.addEventListener('input', (event) => {
        state.exportSettings.filename = event.target.value.trim();
        updateFilenamePreview();
    });

    document.addEventListener('highlightColorsChanged', () => {
        updateFormatAvailability();
        updateExportPreview();
    });

}
function bindPreviewInteractions() {
    const previewCanvas = elements.exportPreviewCanvas;
    if (!previewCanvas) return;
    previewCanvas.addEventListener('wheel', handlePreviewWheel, { passive: false });
    previewCanvas.addEventListener('mousedown', handlePreviewMouseDown);
    previewCanvas.addEventListener('mousemove', handlePreviewMouseMove);
    previewCanvas.addEventListener('mouseup', handlePreviewMouseUp);
    previewCanvas.addEventListener('mouseleave', handlePreviewMouseUp);
    previewCanvas.addEventListener('touchstart', handlePreviewTouchStart, { passive: false });
    previewCanvas.addEventListener('touchmove', handlePreviewTouchMove, { passive: false });
    previewCanvas.addEventListener('touchend', handlePreviewTouchEnd);
    previewCanvas.addEventListener('dblclick', resetPreviewView);
}
function handlePreviewWheel(event) {
    event.preventDefault();
    const rect = elements.exportPreviewCanvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left, mouseY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(previewState.minScale, Math.min(previewState.maxScale, previewState.scale * zoomFactor));
    if (newScale !== previewState.scale) {
        const scaleChange = newScale / previewState.scale;
        previewState.offsetX = mouseX - (mouseX - previewState.offsetX) * scaleChange;
        previewState.offsetY = mouseY - (mouseY - previewState.offsetY) * scaleChange;
        previewState.scale = newScale;
        renderPreviewCanvas();
    }
}
function handlePreviewMouseDown(event) {
    if (event.button !== 0) return;
    previewState.isDragging = true;
    previewState.lastX = event.clientX;
    previewState.lastY = event.clientY;
    elements.exportPreviewCanvas.style.cursor = 'grabbing';
}
function handlePreviewMouseMove(event) {
    if (!previewState.isDragging) return;
    const deltaX = event.clientX - previewState.lastX, deltaY = event.clientY - previewState.lastY;
    previewState.offsetX += deltaX;
    previewState.offsetY += deltaY;
    previewState.lastX = event.clientX;
    previewState.lastY = event.clientY;
    renderPreviewCanvas();
}
function handlePreviewMouseUp() {
    previewState.isDragging = false;
    elements.exportPreviewCanvas.style.cursor = 'grab';
}
function handlePreviewTouchStart(event) {
    if (event.touches.length !== 1) return;
    event.preventDefault();
    previewState.isDragging = true;
    previewState.lastX = event.touches[0].clientX;
    previewState.lastY = event.touches[0].clientY;
}
function handlePreviewTouchMove(event) {
    if (!previewState.isDragging || event.touches.length !== 1) return;
    event.preventDefault();
    const deltaX = event.touches[0].clientX - previewState.lastX, deltaY = event.touches[0].clientY - previewState.lastY;
    previewState.offsetX += deltaX;
    previewState.offsetY += deltaY;
    previewState.lastX = event.touches[0].clientX;
    previewState.lastY = event.touches[0].clientY;
    renderPreviewCanvas();
}
function handlePreviewTouchEnd() {
    previewState.isDragging = false;
}
function resetPreviewView() {
    calculateInitialView();
    renderPreviewCanvas();
}
function drawPreviewCheckerboard(ctx, width, height) {
    const size = 12;
    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e8eaf6';
    for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size * 2) {
            if ((y / size) % 2 === 0) ctx.fillRect(x + size, y, size, size);
            else ctx.fillRect(x, y, size, size);
        }
    }
}
export function toggleExportWindow(force) {
    const next = typeof force === 'boolean' ? force : !state.exportVisible;
    if (state.exportVisible === next) return;
    state.exportVisible = next;
    if (next) {
        if (state.isTabletMode && elements.exportWindow) {
            elements.exportWindow.dataset.tabletExportView = 'preview';
        }
        updateExportPreview({ force: true });
        updateDefaultFilename();
        exportHighlightManager.updateUsedColors(); 
        updateFormatAvailability();
        updateBackgroundControls();
        updateFilenamePreview();
    } else {
        resetPreviewState();
    }
    syncExportWindow();
}
function resetPreviewState() {
    if (previewRenderHandle !== null && typeof previewRenderCancel === 'function') {
        previewRenderCancel(previewRenderHandle);
    }
    previewRenderHandle = null;
    previewRenderCancel = null;
    pendingPreviewSnapshot = null;
    lastPreviewSignature = null;
    previewState = { sourceCanvas: null, scale: 1, offsetX: 0, offsetY: 0, isDragging: false, lastX: 0, lastY: 0, minScale: 0.1, maxScale: 3 };
    if (elements.exportPreviewCanvas) {
        elements.exportPreviewCanvas.style.opacity = '1';
    }
}
function initializeExportSettings() {
    const initialFormat = document.querySelector('input[name="exportFormat"]:checked')?.value || 'image/png';
    const includeCodes = Boolean(document.querySelector('input[name="includeCodes"]')?.checked);
    const includeAxes = Boolean(document.querySelector('input[name="includeAxes"]')?.checked);
    const includeLightColors = document.querySelector('input[name="includeLightColors"]')?.checked !== false;
    const includeTemperatureColors = document.querySelector('input[name="includeTemperatureColors"]')?.checked !== false;
    const backgroundType = document.querySelector('input[name="backgroundType"]:checked')?.value || 'solid';
    const backgroundColor = (elements.exportBackgroundColor?.value || '#ffffff').toUpperCase();
    const filename = elements.exportFilename?.value?.trim() || 'pixel-art';

    state.exportSettings = {
        format: initialFormat,
        includeCodes,
        includeAxes,
        includeLightColors,
        includeTemperatureColors,
        backgroundType,
        backgroundColor,
        filename
    };

    if (elements.exportFilename) {
        elements.exportFilename.value = filename;
    }
    if (elements.exportBackgroundColor) {
        elements.exportBackgroundColor.value = backgroundColor;
    }

    updateFilenamePreview();
    updateBackgroundControls();
    updateFormatAvailability();
}
function updateRadioSelection(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
        radio.checked = radio.value === value;
    });
}
function buildPreviewSnapshot() {
    const exportSettings = state.exportSettings || {};
    const settings = {
        format: exportSettings.format || 'image/png',
        includeCodes: Boolean(exportSettings.includeCodes),
        includeAxes: Boolean(exportSettings.includeAxes),
        includeLightColors: exportSettings.includeLightColors !== false,
        includeTemperatureColors: exportSettings.includeTemperatureColors !== false,
        backgroundType: exportSettings.backgroundType || 'solid',
        backgroundColor: (exportSettings.backgroundColor || '#ffffff').toUpperCase()
    };

    const selectedSet = typeof exportHighlightManager.getSelectedColors === 'function'
        ? exportHighlightManager.getSelectedColors()
        : new Set();
    const hasHighlight = exportHighlightManager.hasHighlight();
    const effectiveSelection = hasHighlight && selectedSet ? Array.from(selectedSet) : [];
    effectiveSelection.sort((a, b) => a.localeCompare(b, 'zh-Hans-u-nu-latn', { numeric: true }));
    const signatureParts = [
        state.width,
        state.height,
        settings.format,
        settings.includeCodes ? 1 : 0,
        settings.includeAxes ? 1 : 0,
        settings.includeLightColors ? 1 : 0,
        settings.includeTemperatureColors ? 1 : 0,
        settings.backgroundType,
        settings.backgroundColor,
        hasHighlight ? 1 : 0,
        effectiveSelection.join('|'),
        state.historyIndex
    ];

    return {
        width: state.width,
        height: state.height,
        settings,
        selectedColorCodes: effectiveSelection,
        hasHighlight,
        backgroundColor: getExportBackgroundColor(settings.format),
        signature: signatureParts.join(';')
    };
}
function updateExportPreview(options = {}) {
    const { force = false } = options;
    if (!elements.exportPreviewCanvas || !state.exportVisible) return;

    const snapshot = buildPreviewSnapshot();
    const needsFreshSource = !previewState.sourceCanvas;
    if (!force && !needsFreshSource && snapshot.signature === lastPreviewSignature) {
        renderPreviewCanvas();
        return;
    }

    pendingPreviewSnapshot = snapshot;
    if (previewRenderHandle !== null && typeof previewRenderCancel === 'function') {
        previewRenderCancel(previewRenderHandle);
    }
    previewRenderHandle = null;
    previewRenderCancel = null;

    elements.exportPreviewCanvas.style.opacity = '0.65';

    const runRender = () => {
        previewRenderHandle = null;
        previewRenderCancel = null;
        if (!pendingPreviewSnapshot) return;
        generateExportPreview(pendingPreviewSnapshot);
        pendingPreviewSnapshot = null;
    };

    if (typeof requestAnimationFrame === 'function') {
        previewRenderCancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
        previewRenderHandle = requestAnimationFrame(runRender);
    } else {
        previewRenderCancel = clearTimeout;
        previewRenderHandle = setTimeout(runRender, 16);
    }
}
function generateExportPreview(snapshot) {
    if (!snapshot || !snapshot.width || !snapshot.height) {
        lastPreviewSignature = null;
        showNoCanvasMessage();
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const settings = snapshot.settings || state.exportSettings;
    const selectedColors = new Set(snapshot.selectedColorCodes || []);
    const shouldHighlight = snapshot.hasHighlight && selectedColors.size > 0;

    if (shouldHighlight) {
        exportHighlightManager.renderHighlightedCanvas(tempCanvas, selectedColors, {
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            includeLightColors: settings.includeLightColors,
            includeTemperatureColors: settings.includeTemperatureColors,
            backgroundColor: snapshot.backgroundColor
        });
    } else {
        renderExportCanvas(tempCanvas, {
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            includeLightColors: settings.includeLightColors,
            includeTemperatureColors: settings.includeTemperatureColors,
            backgroundColor: snapshot.backgroundColor,
            hasHighlight: false
        });
    }

    previewState.sourceCanvas = tempCanvas;
    lastPreviewSignature = snapshot.signature;

    const previewContainer = elements.exportPreviewCanvas.closest('.preview-stage') ?? elements.exportPreviewCanvas.parentElement;
    if (previewContainer) {
        const styles = window.getComputedStyle(previewContainer);
        const paddingX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
        const paddingY = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0');
        const innerWidth = previewContainer.clientWidth - paddingX;
        const innerHeight = previewContainer.clientHeight - paddingY;
        const ratioX = Math.max(1, Math.floor(innerWidth));
        const ratioY = Math.max(1, Math.floor(innerHeight));
        elements.exportPreviewCanvas.width = ratioX;
        elements.exportPreviewCanvas.height = ratioY;
        elements.exportPreviewCanvas.style.width = `${ratioX}px`;
        elements.exportPreviewCanvas.style.height = `${ratioY}px`;
    } else {
        elements.exportPreviewCanvas.width = 400;
        elements.exportPreviewCanvas.height = 300;
        elements.exportPreviewCanvas.style.width = '400px';
        elements.exportPreviewCanvas.style.height = '300px';
    }

    calculateInitialView();
    renderPreviewCanvas();
    elements.exportPreviewCanvas.style.opacity = '1';
}
function calculateInitialView() {
    if (!previewState.sourceCanvas) return;
    const previewCanvas = elements.exportPreviewCanvas, sourceCanvas = previewState.sourceCanvas;
    const previewAspect = previewCanvas.width / previewCanvas.height, sourceAspect = sourceCanvas.width / sourceCanvas.height;
    let scale = sourceAspect > previewAspect ? previewCanvas.width / sourceCanvas.width : previewCanvas.height / sourceCanvas.height;
    scale = Math.max(previewState.minScale, Math.min(previewState.maxScale, scale * 0.9));
    const scaledWidth = sourceCanvas.width * scale, scaledHeight = sourceCanvas.height * scale;
    previewState.scale = scale;
    previewState.offsetX = (previewCanvas.width - scaledWidth) / 2;
    previewState.offsetY = (previewCanvas.height - scaledHeight) / 2;
}
function showNoCanvasMessage() {
    const canvas = elements.exportPreviewCanvas, ctx = canvas.getContext('2d');
    canvas.width = 400;
    canvas.height = 300;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPreviewCheckerboard(ctx, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px sans-serif';
    ctx.fillText(TEXT.exportWindow.noCanvas, canvas.width / 2, canvas.height / 2);
}
function updateDefaultFilename() {
    if (!elements.exportFilename) return;
    state.exportSettings.filename = 'pixel-art';
    elements.exportFilename.value = 'pixel-art';
    updateFilenamePreview();
}
function updateFilenamePreview() {
    const baseElement = document.querySelector('.filename-base');
    if (baseElement) {
        baseElement.textContent = state.exportSettings.filename || 'pixel-art';
    }
    updateFilenameSuffix();
}

function updateFilenameSuffix() {
    const suffixElement = document.querySelector('.filename-suffix');
    if (!suffixElement) return;
    const extension = resolveFormatExtension(state.exportSettings.format);
    const sizeSuffix = state.width && state.height ? `${state.width}x${state.height}` : 'size';
    suffixElement.textContent = `-${sizeSuffix}.${extension}`;
}

function resolveFormatExtension(format) {
    switch (format) {
        case 'image/jpeg': return 'jpg';
        case 'image/svg+xml': return 'svg';
        case 'application/pdf': return 'pdf';
        case 'application/psd': return 'psd';
        case 'application/pd': return 'pd';
        default: return 'png';
    }
}
function handleExportConfirm() {
    if (!state.width || !state.height) {
        window.alert(TEXT.exportWindow.noCanvas);
        return;
    }
    if (exportInProgress) return;
    const settings = state.exportSettings;
    const selectedColors = exportHighlightManager.getSelectedColors();
    const hasHighlight = exportHighlightManager.hasHighlight();
    if (hasHighlight && !HIGHLIGHT_IMAGE_FORMATS.has(settings.format)) {
        window.alert(TEXT.highlight.formatUnsupported);
        return;
    }

    if (settings.format === 'application/pd') {
        exportProject();
    } else if (settings.format === 'application/pdf') {
        exportInProgress = true;
        elements.exportConfirmBtn.disabled = true;
        elements.exportConfirmBtn.textContent = TEXT.buttons.exporting;

        const filename = settings.filename || 'pixel-art';
        const sizeSuffix = `${state.width}x${state.height}`;
        const fullFilename = `${filename}-${sizeSuffix}.pdf`;
        const backgroundColor = getExportBackgroundColor(settings.format);
        exportToPDF({
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            includeLightColors: settings.includeLightColors,
            includeTemperatureColors: settings.includeTemperatureColors,
            backgroundColor,
            hasHighlight: false,
            filename: fullFilename
        }).then(() => window.alert('PDF会创建预览页面，需自行在右上角下载')).catch((error) => {
            console.error(TEXT.exporter.pdfErrorConsole, error);
            window.alert(TEXT.exporter.pdfErrorMessage(error.message));
        }).finally(() => {
            exportInProgress = false;
            elements.exportConfirmBtn.disabled = false;
            elements.exportConfirmBtn.textContent = TEXT.buttons.confirmExport;
        });
    } else if (settings.format === 'image/svg+xml') {
        const filename = settings.filename || 'pixel-art';
        const sizeSuffix = `${state.width}x${state.height}`;
        const fullFilename = `${filename}-${sizeSuffix}.svg`;
        const backgroundColor = getExportBackgroundColor(settings.format);
        try {
            exportToSVG({
                includeCodes: settings.includeCodes,
                includeAxes: settings.includeAxes,
                includeLightColors: settings.includeLightColors,
                includeTemperatureColors: settings.includeTemperatureColors,
                backgroundColor,
                hasHighlight: false,
                filename: fullFilename
            });
        } catch (error) {
            console.error(error);
            window.alert(error?.message || TEXT.exporter.svgUnavailable);
        }
    } else {
        const filename = settings.filename || 'pixel-art';
        const extension = resolveFormatExtension(settings.format);
        const fullFilename = `${filename}-${state.width}x${state.height}.${extension}`;
        const backgroundColor = getExportBackgroundColor(settings.format);
        exportImage({
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            includeLightColors: settings.includeLightColors,
            includeTemperatureColors: settings.includeTemperatureColors,
            backgroundColor,
            filename: fullFilename,
            format: settings.format
        });
    }
    toggleExportWindow(false);
}
function updateFormatAvailability() {
    const hasHighlight = exportHighlightManager.hasHighlight();
    const radios = document.querySelectorAll('input[name="exportFormat"]');
    let activeRadio = null;
    radios.forEach((radio) => {
        const allowed = !hasHighlight || HIGHLIGHT_IMAGE_FORMATS.has(radio.value);
        radio.disabled = !allowed;
        radio.parentElement?.classList.toggle('is-disabled', !allowed);
        if (radio.checked && allowed) {
            activeRadio = radio;
        }
    });
    if (!activeRadio) {
        const fallback = Array.from(radios).find((radio) => !radio.disabled);
        if (fallback) {
            fallback.checked = true;
            state.exportSettings.format = fallback.value;
            updateFilenamePreview();
            updateExportPreview();
        }
    }
}

function updateBackgroundControls() {
    const isSolid = state.exportSettings.backgroundType === 'solid';
    if (elements.exportBackgroundColor) {
        elements.exportBackgroundColor.disabled = !isSolid;
    }
    updateColorValueLabel(state.exportSettings.backgroundColor, !isSolid);
}

function updateColorValueLabel(value, disabled) {
    const colorValueEl = document.querySelector('.color-value');
    if (!colorValueEl) return;
    colorValueEl.textContent = (value || '#ffffff').toUpperCase();
    colorValueEl.classList.toggle('is-disabled', disabled);
}

function getSelectedBackgroundColor() {
    return state.exportSettings.backgroundType === 'solid'
        ? state.exportSettings.backgroundColor
        : 'transparent';
}

function getExportBackgroundColor(format) {
    const selected = getSelectedBackgroundColor();
    if (format === 'image/jpeg' && selected === 'transparent') {
        return '#ffffff';
    }
    return selected;
}
function syncExportWindow() {
  if (!elements.exportWindow) return;
  const visible = state.exportVisible;
  elements.exportWindow.classList.toggle('is-visible', visible);
  elements.exportWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
  visible && elements.exportWindow.focus?.();
  if (visible) {
      updateExportTabletViewTabsUI();
  }
  const exportToggleBtn = elements.exportBtn ?? document.querySelector('[data-role="export"]');
  if (exportToggleBtn) {
    exportToggleBtn.classList.toggle('is-active', visible);
    exportToggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }
}

function bindExportTabletViewTabs() {
    const previewBtn = document.getElementById('exportTabPreview');
    const settingsBtn = document.getElementById('exportTabSettings');
    if (!previewBtn || !settingsBtn) return;

    previewBtn.addEventListener('click', () => setTabletExportView('preview'));
    settingsBtn.addEventListener('click', () => setTabletExportView('settings'));

    document.addEventListener('tablet:change', () => {
        if (!state.exportVisible) return;
        if (state.isTabletMode && elements.exportWindow) {
            const raw = elements.exportWindow.dataset.tabletExportView;
            if (raw !== 'preview' && raw !== 'settings') {
                elements.exportWindow.dataset.tabletExportView = 'preview';
            }
        }
        updateExportTabletViewTabsUI();
    });

    updateExportTabletViewTabsUI();
}

function setTabletExportView(view) {
    if (!elements.exportWindow || !state.isTabletMode) return;
    const normalized = view === 'settings' ? 'settings' : 'preview';
    elements.exportWindow.dataset.tabletExportView = normalized;
    updateExportTabletViewTabsUI();
}

function updateExportTabletViewTabsUI() {
    const previewBtn = document.getElementById('exportTabPreview');
    const settingsBtn = document.getElementById('exportTabSettings');
    if (!previewBtn || !settingsBtn || !elements.exportWindow) return;

    if (!state.isTabletMode) {
        previewBtn.setAttribute('aria-selected', 'false');
        settingsBtn.setAttribute('aria-selected', 'false');
        return;
    }

    const view = elements.exportWindow.dataset.tabletExportView === 'settings' ? 'settings' : 'preview';
    previewBtn.setAttribute('aria-selected', view === 'preview' ? 'true' : 'false');
    settingsBtn.setAttribute('aria-selected', view === 'settings' ? 'true' : 'false');
}
function handleKeydown(ev) {
    ev.key === 'Escape' && state.exportVisible && toggleExportWindow(false);
}

if (typeof window !== 'undefined') {
    window.updateExportPreview = updateExportPreview;
}
