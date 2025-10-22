import { elements } from './elements.js';
import { state } from './state.js';
import { exportImage, exportToPDF } from './exporter.js';
import { exportProject } from './pd.js';
import { renderExportCanvas } from './exporter.js';

// 预览状态管理
let previewState = {
    sourceCanvas: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    minScale: 0.1,
    maxScale: 3
};

let exportInProgress = false;

export function initializeExportWindow() {
    if (!elements.exportWindow) return;

    // 绑定事件
    elements.exportCloseBtn?.addEventListener('click', () => toggleExportWindow(false));
    elements.exportCancelBtn?.addEventListener('click', () => toggleExportWindow(false));
    elements.exportConfirmBtn?.addEventListener('click', handleExportConfirm);

    // 绑定设置变化事件
    bindExportSettingsEvents();

    // 初始化默认设置
    initializeExportSettings();

    // 绑定预览交互事件
    bindPreviewInteractions();

    document.addEventListener('keydown', handleKeydown);
    syncExportWindow();
}

function bindPreviewInteractions() {
    const previewCanvas = elements.exportPreviewCanvas;
    if (!previewCanvas) return;

    // 鼠标滚轮缩放
    previewCanvas.addEventListener('wheel', handlePreviewWheel, { passive: false });

    // 鼠标拖动
    previewCanvas.addEventListener('mousedown', handlePreviewMouseDown);
    previewCanvas.addEventListener('mousemove', handlePreviewMouseMove);
    previewCanvas.addEventListener('mouseup', handlePreviewMouseUp);
    previewCanvas.addEventListener('mouseleave', handlePreviewMouseUp);

    // 触摸事件支持
    previewCanvas.addEventListener('touchstart', handlePreviewTouchStart, { passive: false });
    previewCanvas.addEventListener('touchmove', handlePreviewTouchMove, { passive: false });
    previewCanvas.addEventListener('touchend', handlePreviewTouchEnd);

    // 双击重置视图
    previewCanvas.addEventListener('dblclick', resetPreviewView);
}

function handlePreviewWheel(event) {
    event.preventDefault();

    const rect = elements.exportPreviewCanvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(
        previewState.minScale,
        Math.min(previewState.maxScale, previewState.scale * zoomFactor)
    );

    if (newScale !== previewState.scale) {
        // 计算缩放中心点
        const scaleChange = newScale / previewState.scale;
        previewState.offsetX = mouseX - (mouseX - previewState.offsetX) * scaleChange;
        previewState.offsetY = mouseY - (mouseY - previewState.offsetY) * scaleChange;

        previewState.scale = newScale;
        renderPreviewCanvas();
    }
}

function handlePreviewMouseDown(event) {
    if (event.button !== 0) return; // 只处理左键

    previewState.isDragging = true;
    previewState.lastX = event.clientX;
    previewState.lastY = event.clientY;
    elements.exportPreviewCanvas.style.cursor = 'grabbing';
}

function handlePreviewMouseMove(event) {
    if (!previewState.isDragging) return;

    const deltaX = event.clientX - previewState.lastX;
    const deltaY = event.clientY - previewState.lastY;

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

    const deltaX = event.touches[0].clientX - previewState.lastX;
    const deltaY = event.touches[0].clientY - previewState.lastY;

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

function renderPreviewCanvas() {
    if (!previewState.sourceCanvas || !elements.exportPreviewCanvas) return;

    const previewCtx = elements.exportPreviewCanvas.getContext('2d');
    const previewWidth = elements.exportPreviewCanvas.width;
    const previewHeight = elements.exportPreviewCanvas.height;

    // 清空画布
    previewCtx.clearRect(0, 0, previewWidth, previewHeight);

    // 绘制棋盘格背景（用于透明背景预览）
    drawPreviewCheckerboard(previewCtx, previewWidth, previewHeight);

    // 保存当前状态
    previewCtx.save();

    // 应用缩放和偏移
    previewCtx.translate(previewState.offsetX, previewState.offsetY);
    previewCtx.scale(previewState.scale, previewState.scale);

    // 绘制源图像
    previewCtx.drawImage(previewState.sourceCanvas, 0, 0);

    // 恢复状态
    previewCtx.restore();

    // 更新光标样式
    elements.exportPreviewCanvas.style.cursor = previewState.isDragging ? 'grabbing' : 'grab';
}

function drawPreviewCheckerboard(ctx, width, height) {
    const size = 12;
    ctx.fillStyle = '#f8f9fc';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e8eaf6';
    for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size * 2) {
            if ((y / size) % 2 === 0) {
                ctx.fillRect(x + size, y, size, size);
            } else {
                ctx.fillRect(x, y, size, size);
            }
        }
    }
}

export function toggleExportWindow(force) {
    const next = typeof force === 'boolean' ? force : !state.exportVisible;
    if (state.exportVisible === next) return;
    state.exportVisible = next;

    if (next) {
        // 打开窗口时更新预览和默认文件名
        updateExportPreview();
        updateDefaultFilename();
    } else {
        // 关闭窗口时重置预览状态
        resetPreviewState();
    }

    syncExportWindow();
}

function resetPreviewState() {
    previewState = {
        sourceCanvas: null,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        isDragging: false,
        lastX: 0,
        lastY: 0,
        minScale: 0.1,
        maxScale: 3
    };
}

function bindExportSettingsEvents() {
    // 格式选择
    elements.exportFormatRadios?.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.exportSettings.format = e.target.value;
            updateExportPreview();
            updateFilenameSuffix();
        });
    });

    // 包含色号
    elements.includeCodesRadios?.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.exportSettings.includeCodes = e.target.value === 'true';
            updateExportPreview();
        });
    });

    // 包含坐标系
    elements.includeAxesRadios?.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.exportSettings.includeAxes = e.target.value === 'true';
            updateExportPreview();
        });
    });

    // 背景类型
    elements.backgroundTypeRadios?.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.exportSettings.backgroundType = e.target.value;
            updateExportPreview();
        });
    });

    // 背景颜色
    elements.exportBackgroundColor?.addEventListener('input', (e) => {
        state.exportSettings.backgroundColor = e.target.value;
        updateExportPreview();
    });

    // 文件名
    elements.exportFilename?.addEventListener('input', (e) => {
        state.exportSettings.filename = e.target.value;
    });
}

function initializeExportSettings() {
    // 设置默认值
    state.exportSettings = {
        format: 'image/png',
        includeCodes: false,
        includeAxes: false,
        backgroundType: 'solid',
        backgroundColor: '#ffffff',
        filename: ''
    };

    // 更新UI反映默认值
    updateRadioSelection('exportFormat', 'image/png');
    updateRadioSelection('includeCodes', 'false');
    updateRadioSelection('includeAxes', 'false');
    updateRadioSelection('backgroundType', 'solid');

    if (elements.exportBackgroundColor) {
        elements.exportBackgroundColor.value = '#ffffff';
    }
}

function updateRadioSelection(name, value) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(radio => {
        radio.checked = radio.value === value;
    });
}

function updateExportPreview() {
    if (!elements.exportPreviewCanvas || !state.exportVisible) return;

    // 显示加载状态
    elements.exportPreviewCanvas.style.opacity = '0.7';

    // 使用requestAnimationFrame避免阻塞UI
    requestAnimationFrame(() => {
        generateExportPreview();
    });
}

function generateExportPreview() {
    if (!state.width || !state.height) {
        showNoCanvasMessage();
        return;
    }

    // 创建临时Canvas用于生成完整导出图像
    const tempCanvas = document.createElement('canvas');

    // 使用与导出相同的设置渲染
    const settings = state.exportSettings;
    const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

    renderExportCanvas(tempCanvas, {
        includeCodes: settings.includeCodes,
        includeAxes: settings.includeAxes,
        backgroundColor: backgroundColor
    });

    // 保存源Canvas
    previewState.sourceCanvas = tempCanvas;

    // 设置预览Canvas尺寸为容器尺寸
    const previewContainer = elements.exportPreviewCanvas.parentElement;
    if (previewContainer) {
        const rect = previewContainer.getBoundingClientRect();
        elements.exportPreviewCanvas.width = rect.width - 32; // 减去padding
        elements.exportPreviewCanvas.height = rect.height - 32;
    } else {
        // 默认尺寸
        elements.exportPreviewCanvas.width = 400;
        elements.exportPreviewCanvas.height = 300;
    }

    // 重置视图
    calculateInitialView();

    // 渲染预览
    renderPreviewCanvas();

    // 恢复不透明度
    elements.exportPreviewCanvas.style.opacity = '1';
}

function calculateInitialView() {
    if (!previewState.sourceCanvas) return;

    const previewCanvas = elements.exportPreviewCanvas;
    const sourceCanvas = previewState.sourceCanvas;

    // 计算预览区域和源图像的宽高比
    const previewAspect = previewCanvas.width / previewCanvas.height;
    const sourceAspect = sourceCanvas.width / sourceCanvas.height;

    // 计算合适的缩放比例，使源图像完全显示在预览区域内
    let scale;
    if (sourceAspect > previewAspect) {
        // 源图像更宽，以宽度为基准
        scale = previewCanvas.width / sourceCanvas.width;
    } else {
        // 源图像更高，以高度为基准
        scale = previewCanvas.height / sourceCanvas.height;
    }

    // 应用一些边距，让图像周围有一些空间
    scale *= 0.9;

    // 限制缩放范围
    scale = Math.max(previewState.minScale, Math.min(previewState.maxScale, scale));

    // 计算居中位置
    const scaledWidth = sourceCanvas.width * scale;
    const scaledHeight = sourceCanvas.height * scale;
    const offsetX = (previewCanvas.width - scaledWidth) / 2;
    const offsetY = (previewCanvas.height - scaledHeight) / 2;

    // 更新预览状态
    previewState.scale = scale;
    previewState.offsetX = offsetX;
    previewState.offsetY = offsetY;
}

function showNoCanvasMessage() {
    const canvas = elements.exportPreviewCanvas;
    const ctx = canvas.getContext('2d');

    // 设置默认尺寸
    canvas.width = 400;
    canvas.height = 300;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPreviewCheckerboard(ctx, canvas.width, canvas.height);

    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px sans-serif';
    ctx.fillText('请先创建画布', canvas.width / 2, canvas.height / 2);
}

function updateDefaultFilename() {
    if (!elements.exportFilename) return;

    const baseName = 'pixel-art';
    state.exportSettings.filename = baseName;
    elements.exportFilename.value = baseName;
    updateFilenameSuffix();
}

function updateFilenameSuffix() {
    const suffixElement = document.querySelector('.filename-suffix');
    if (!suffixElement) return;

    let extension = 'png';
    switch (state.exportSettings.format) {
        case 'image/jpeg':
            extension = 'jpg';
            break;
        case 'application/pdf':
            extension = 'pdf';
            break;
        case 'application/psd':
            extension = 'psd';
            break;
        case 'application/pd':
            extension = 'pd';
            break;
        default:
            extension = 'png';
    }

    const sizeSuffix = state.width && state.height ? `${state.width}x${state.height}` : 'size';
    suffixElement.textContent = `-${sizeSuffix}.${extension}`;
}

function handleExportConfirm() {
    if (!state.width || !state.height) {
        window.alert('请先创建画布');
        return;
    }

    // 防止重复点击
    if (exportInProgress) {
        return;
    }

    const settings = state.exportSettings;

    if (settings.format === 'application/pd') {
        // 导出PD工程文件
        exportProject();
    } else if (settings.format === 'application/pdf') {
        // 设置导出状态
        exportInProgress = true;
        elements.exportConfirmBtn.disabled = true;
        elements.exportConfirmBtn.textContent = '导出中...';

        // 导出PDF
        const filename = settings.filename || 'pixel-art';
        const sizeSuffix = `${state.width}x${state.height}`;
        const fullFilename = `${filename}-${sizeSuffix}.pdf`;
        const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

        exportToPDF({
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            backgroundColor: backgroundColor,
            filename: fullFilename
        })
            .then(() => {
                // 导出成功
                showExportSuccess('PDF');
            })
            .catch((error) => {
                // 导出失败
                console.error('PDF导出失败:', error);
                window.alert(`PDF导出失败: ${error.message}`);
            })
            .finally(() => {
                // 恢复按钮状态
                exportInProgress = false;
                elements.exportConfirmBtn.disabled = false;
                elements.exportConfirmBtn.textContent = '确认导出';
            });
    } else {
        // 导出图片
        const filename = settings.filename || 'pixel-art';
        const fullFilename = `${filename}-${state.width}x${state.height}.${settings.format === 'image/jpeg' ? 'jpg' : 'png'}`;
        const backgroundColor = settings.backgroundType === 'transparent' ? 'transparent' : settings.backgroundColor;

        exportImage({
            includeCodes: settings.includeCodes,
            includeAxes: settings.includeAxes,
            backgroundColor: backgroundColor,
            filename: fullFilename,
            format: settings.format
        });
    }

    // 关闭导出窗口
    toggleExportWindow(false);
}

// 添加导出成功提示函数
function showExportSuccess(format) {
    // 可以添加一个简单的成功提示
    const message = `${format}文件导出成功！`;
    console.log(message);
}

function syncExportWindow() {
    if (!elements.exportWindow) return;
    const visible = state.exportVisible;
    elements.exportWindow.classList.toggle('is-visible', visible);
    elements.exportWindow.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (visible) {
        elements.exportWindow.focus?.();
    }
}

function handleKeydown(ev) {
    if (ev.key === 'Escape' && state.exportVisible) {
        toggleExportWindow(false);
    }
}