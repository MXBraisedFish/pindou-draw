import { elements } from './elements.js';
import { state } from './state.js';
import { exportImage, exportToPDF } from './exporter.js';
import { exportProject } from './pd.js';
import { renderExportCanvas } from './exporter.js';

let previewState = {
    sourceCanvas: null, scale: 1, offsetX: 0, offsetY: 0,
    isDragging: false, lastX: 0, lastY: 0,
    minScale: 0.1, maxScale: 3
};

let exportInProgress = false;

export function initializeExportWindow() {
    if (!elements.exportWindow) return;

    [elements.exportCloseBtn, elements.exportCancelBtn].forEach(btn =>
        btn?.addEventListener('click', () => toggleExportWindow(false))
    );
    elements.exportConfirmBtn?.addEventListener('click', handleExportConfirm);

    bindExportSettingsEvents();
    initializeExportSettings();
    bindPreviewInteractions();
    document.addEventListener('keydown', handleKeydown);
    syncExportWindow();
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
    previewState.offsetX += deltaX; previewState.offsetY += deltaY;
    previewState.lastX = event.clientX; previewState.lastY = event.clientY;
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
    previewState.offsetX += deltaX; previewState.offsetY += deltaY;
    previewState.lastX = event.touches[0].clientX; previewState.lastY = event.touches[0].clientY;
    renderPreviewCanvas();
}

function handlePreviewTouchEnd() { previewState.isDragging = false; }

function resetPreviewView() { calculateInitialView(); renderPreviewCanvas(); }

function renderPreviewCanvas() {
    if (!previewState.sourceCanvas || !elements.exportPreviewCanvas) return;
    const previewCtx = elements.exportPreviewCanvas.getContext('2d');
    const previewWidth = elements.exportPreviewCanvas.width, previewHeight = elements.exportPreviewCanvas.height;

    previewCtx.clearRect(0, 0, previewWidth, previewHeight);
    drawPreviewCheckerboard(previewCtx, previewWidth, previewHeight);

    previewCtx.save();
    previewCtx.translate(previewState.offsetX, previewState.offsetY);
    previewCtx.scale(previewState.scale, previewState.scale);
    previewCtx.drawImage(previewState.sourceCanvas, 0, 0);
    previewCtx.restore();

    elements.exportPreviewCanvas.style.cursor = previewState.isDragging ? 'grabbing' : 'grab';
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
    next ? (updateExportPreview(), updateDefaultFilename()) : resetPreviewState();
    syncExportWindow();
}

function resetPreviewState() {
    previewState = {
        sourceCanvas: null, scale: 1, offsetX: 0, offsetY: 0,
        isDragging: false, lastX: 0, lastY: 0,
        minScale: 0.1, maxScale: 3
    };
}

function bindExportSettingsEvents() {
    const settings = {
        'exportFormat': value => { state.exportSettings.format = value; updateExportPreview(); updateFilenameSuffix(); },
        'includeCodes': value => { state.exportSettings.includeCodes = value === 'true'; updateExportPreview(); },
        'includeAxes': value => { state.exportSettings.includeAxes = value === 'true'; updateExportPreview(); },
        'backgroundType': value => { state.exportSettings.backgroundType = value; updateExportPreview(); }
    };

    Object.entries(settings).forEach(([name, handler]) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(radio =>
            radio.addEventListener('change', (e) => handler(e.target.value))
        );
    });

    elements.exportBackgroundColor?.addEventListener('input', (e) => {
        state.exportSettings.backgroundColor = e.target.value;
        updateExportPreview();
    });

    elements.exportFilename?.addEventListener('input', (e) => {
        state.exportSettings.filename = e.target.value;
    });
}

function initializeExportSettings() {
    state.exportSettings = {
        format: 'image/png', includeCodes: false, includeAxes: false,
        backgroundType: 'solid', backgroundColor: '#ffffff', filename: ''
    };

    updateRadioSelection('exportFormat', 'image/png');
    updateRadioSelection('includeCodes', 'false');
    updateRadioSelection('includeAxes', 'false');
    updateRadioSelection('backgroundType', 'solid');
    elements.exportBackgroundColor && (elements.exportBackgroundColor.value = '#ffffff');
}

function updateRadioSelection(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
        radio.checked = radio.value === value;
    });
}

function updateExportPreview() {
    if (!elements.exportPreviewCanvas || !state.exportVisible) return;
    elements.exportPreviewCanvas.style.opacity = '0.7';
    requestAnimationFrame(generateExportPreview);
}

function generateExportPreview() {
    if (!state.width || !state.height) { showNoCanvasMessage(); return; }

    const tempCanvas = document.createElement('canvas');
    const settings = state.exportSettings;
    const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

    renderExportCanvas(tempCanvas, { includeCodes: settings.includeCodes, includeAxes: settings.includeAxes, backgroundColor });
    previewState.sourceCanvas = tempCanvas;

    const previewContainer = elements.exportPreviewCanvas.parentElement;
    if (previewContainer) {
        const rect = previewContainer.getBoundingClientRect();
        elements.exportPreviewCanvas.width = rect.width - 32;
        elements.exportPreviewCanvas.height = rect.height - 32;
    } else {
        elements.exportPreviewCanvas.width = 400;
        elements.exportPreviewCanvas.height = 300;
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
    canvas.width = 400; canvas.height = 300;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPreviewCheckerboard(ctx, canvas.width, canvas.height);
    ctx.fillStyle = '#666'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '16px sans-serif';
    ctx.fillText('请先创建画布', canvas.width / 2, canvas.height / 2);
}

function updateDefaultFilename() {
    if (!elements.exportFilename) return;
    state.exportSettings.filename = 'pixel-art';
    elements.exportFilename.value = 'pixel-art';
    updateFilenameSuffix();
}

function updateFilenameSuffix() {
    const suffixElement = document.querySelector('.filename-suffix');
    if (!suffixElement) return;

    let extension = 'png';
    switch (state.exportSettings.format) {
        case 'image/jpeg': extension = 'jpg'; break;
        case 'application/pdf': extension = 'pdf'; break;
        case 'application/psd': extension = 'psd'; break;
        case 'application/pd': extension = 'pd'; break;
    }

    const sizeSuffix = state.width && state.height ? `${state.width}x${state.height}` : 'size';
    suffixElement.textContent = `-${sizeSuffix}.${extension}`;
}

function handleExportConfirm() {
    if (!state.width || !state.height) { window.alert('请先创建画布'); return; }
    if (exportInProgress) return;

    const settings = state.exportSettings;

    if (settings.format === 'application/pd') {
        exportProject();
    } else if (settings.format === 'application/pdf') {
        exportInProgress = true;
        elements.exportConfirmBtn.disabled = true;
        elements.exportConfirmBtn.textContent = '导出中...';

        const filename = settings.filename || 'pixel-art';
        const sizeSuffix = `${state.width}x${state.height}`;
        const fullFilename = `${filename}-${sizeSuffix}.pdf`;
        const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

        exportToPDF({ includeCodes: settings.includeCodes, includeAxes: settings.includeAxes, backgroundColor, filename: fullFilename })
            .then(() => showExportSuccess('PDF'))
            .catch((error) => { console.error('PDF导出失败:', error); window.alert(`PDF导出失败: ${error.message}`); })
            .finally(() => { exportInProgress = false; elements.exportConfirmBtn.disabled = false; elements.exportConfirmBtn.textContent = '确认导出'; });
    } else {
        const filename = settings.filename || 'pixel-art';
        const fullFilename = `${filename}-${state.width}x${state.height}.${settings.format === 'image/jpeg' ? 'jpg' : 'png'}`;
        const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

        exportImage({ includeCodes: settings.includeCodes, includeAxes: settings.includeAxes, backgroundColor, filename: fullFilename, format: settings.format });
    }

    toggleExportWindow(false);
}

function showExportSuccess(format) { console.log(`${format}文件导出成功！`); }

function syncExportWindow() {
    if (!elements.exportWindow) return;
    const visible = state.exportVisible;
    elements.exportWindow.classList.toggle('is-visible', visible);
    elements.exportWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');
    visible && elements.exportWindow.focus?.();
}

function handleKeydown(ev) { ev.key === 'Escape' && state.exportVisible && toggleExportWindow(false); }