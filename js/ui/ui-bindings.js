import { elements } from '../elements.js';
import { state } from '../state.js';
import {
  createCanvas,
  handleWheelEvent,
  isCanvasDirty,
  redrawCanvas,
  renderGridLayer,
  setCellSize,
  setDisplayMode,
  setTool,
  updateCanvasOpacityLabel,
  updateStatusCreated,
  updateZoomIndicator,
  updateToolButtons,
  validateCanvasSize
} from '../canvas.js';
import {
  applyBaseLayerPosition,
  applyBaseScale,
  clearBaseImage,
  handleBaseImageChange,
  recenterBaseImage,
  snapBaseToCanvas,
  toggleBaseEditMode,
  formatBaseScaleValue
} from '../base-image.js';
import { toggleReferenceWindow } from '../reference.js';
import { toggleExportWindow } from '../export-window.js';
import {
  handlePaletteFile,
  handleDeletePalette,
  handlePaletteSelectionChange,
  renderPalette,
  handleBuiltinPaletteLoad
} from '../palette.js';
import { flipHorizontal, flipVertical, rotateClockwise, rotateCounterclockwise } from '../image-operations.js';
import { importProjectFile } from '../pd.js';
import { resolveResolutionValue, handleResolutionInputChange } from '../app/resolution.js';
import { renderSelectionLayers } from '../selection-layer.js';
import { toggleSymmetryMode, getSymmetryMode } from '../symmetry.js';

const CANVAS_WARNING_AREA = 80 * 80;
const CANVAS_DANGER_AREA = 128 * 128;
let closeAllPanels = () => { };

export function initializeUIBindings() {
  initializePanelSwitcher();
  enhanceToolbarTooltips();
  enhanceFocusModePanel();
  bindBaseImageControls();
  bindCanvasControls();
  bindToolControls();
  bindImageOperationControls();
  bindPaletteControls();
  bindWindowControls();
  bindProjectControls();
  bindFocusModeControls();
}

function bindBaseImageControls() {
  elements.importBaseBtn?.addEventListener('click', () => elements.baseImageInput?.click());
  elements.clearBaseBtn?.addEventListener('click', clearBaseImage);
  elements.baseImageInput?.addEventListener('change', handleBaseImageChange);
  elements.toggleBaseEditBtn?.addEventListener('click', toggleBaseEditMode);
  elements.recenterBaseBtn?.addEventListener('click', recenterBaseImage);
  elements.snapBaseToCanvasBtn?.addEventListener('click', snapBaseToCanvas);
  elements.baseScaleRange?.addEventListener('input', handleBaseScaleRangeInput);
  elements.baseScaleInput?.addEventListener('input', handleBaseScaleInput);
  elements.baseScaleInput?.addEventListener('change', handleBaseScaleInput);
  elements.baseLayerSelect?.addEventListener('change', (event) => {
    state.baseLayerPosition = event.target.value;
    applyBaseLayerPosition();
  });
}

function bindCanvasControls() {
  elements.widthInput?.addEventListener('input', updateCanvasSizeWarningMessage);
  elements.heightInput?.addEventListener('input', updateCanvasSizeWarningMessage);
  elements.createCanvasBtn?.addEventListener('click', createNewCanvas);
  elements.resolutionInput?.addEventListener('change', handleResolutionInputChange);
  elements.canvasWrapper?.addEventListener('wheel', handleWheelEvent, { passive: false });
  elements.canvasOpacityRange?.addEventListener('input', handleCanvasOpacityChange);
  elements.zoomRange?.addEventListener('input', handleZoomChange);
  elements.autoSnapToggle?.addEventListener('change', (event) => {
    state.autoSnap = Boolean(event.target.checked);
  });
  elements.showCodesToggle?.addEventListener('change', (event) => {
    state.showCodes = Boolean(event.target.checked);
    redrawCanvas();
    renderSelectionLayers();
  });
  elements.displayModeRadios?.forEach((radio) => {
    radio.addEventListener('change', handleDisplayModeChange);
  });
  elements.pixelShapeRadios?.forEach((radio) => {
    radio.addEventListener('change', handlePixelShapeChange);
  });
  elements.axisOpacityRange?.addEventListener('input', handleAxisOpacityChange);
  bindGridOverlayControls();
  updateCanvasSizeWarningMessage();
  updateZoomIndicator();
  updateStatusCreated();
}

function bindToolControls() {
  elements.toolButtons?.forEach((button) => {
    const tool = button.dataset.tool;
    if (!tool) return;
    button.addEventListener('click', () => {
      setTool(tool);
      closeAllPanels();
    });
  });
}

function bindImageOperationControls() {
  elements.flipHorizontalBtn?.addEventListener('click', flipHorizontal);
  elements.flipVerticalBtn?.addEventListener('click', flipVertical);
  elements.rotateClockwiseBtn?.addEventListener('click', rotateClockwise);
  elements.rotateCounterclockwiseBtn?.addEventListener('click', rotateCounterclockwise);
  bindSymmetryControls();
}

function bindSymmetryControls() {
  if (!elements.symmetryButtons?.length) return;
  const handleClick = (event) => {
    const button = event.currentTarget;
    const mode = button?.dataset?.symmetryMode;
    toggleSymmetryMode(mode);
    updateSymmetryButtons();
    renderGridLayer();
  };
  elements.symmetryButtons.forEach((button) => {
    button.addEventListener('click', handleClick);
  });
  document.addEventListener('symmetry:change', updateSymmetryButtons);
  updateSymmetryButtons();
  renderGridLayer();
}

function updateSymmetryButtons() {
  const activeMode = getSymmetryMode();
  elements.symmetryButtons?.forEach((button) => {
    const mode = button?.dataset?.symmetryMode;
    const isActive = Boolean(mode && mode === activeMode && mode !== 'none');
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function bindPaletteControls() {
  elements.loadDefaultPaletteBtn?.addEventListener('click', handleBuiltinPaletteLoad);
  elements.importPaletteBtn?.addEventListener('click', () => elements.paletteFileInput?.click());
  elements.paletteFileInput?.addEventListener('change', handlePaletteFile);
  elements.paletteFilter?.addEventListener('input', renderPalette);
  elements.deletePaletteBtn?.addEventListener('click', handleDeletePalette);
  elements.paletteHistorySelect?.addEventListener('change', handlePaletteSelectionChange);
  elements.createPaletteBtn?.addEventListener('click', () => {
    try {
      window.open('./color-maker.html', '_blank', 'noopener');
    } catch (error) {
      console.warn('无法打开色卡制作工具', error);
    }
  });
}

function bindGridOverlayControls() {
  const normalizeInterval = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(512, Math.round(parsed));
  };
  const normalizeStartMode = (value, axis) => {
    const normalized = String(value || '').toLowerCase();
    if (axis === 'x') {
      return ['ltr', 'rtl', 'center'].includes(normalized) ? normalized : 'center';
    }
    return ['ttb', 'btt', 'center'].includes(normalized) ? normalized : 'center';
  };
  const applyGridOverlay = (patch) => {
    state.gridOverlay = { ...state.gridOverlay, ...patch };
    renderGridLayer();
  };
  const { gridOverlay } = state;
  if (elements.gridBoldXToggle) {
    elements.gridBoldXToggle.checked = Boolean(gridOverlay?.xBoldEnabled);
    elements.gridBoldXToggle.addEventListener('change', (event) => {
      applyGridOverlay({ xBoldEnabled: Boolean(event.target.checked) });
    });
  }
  if (elements.gridBoldYToggle) {
    elements.gridBoldYToggle.checked = Boolean(gridOverlay?.yBoldEnabled);
    elements.gridBoldYToggle.addEventListener('change', (event) => {
      applyGridOverlay({ yBoldEnabled: Boolean(event.target.checked) });
    });
  }
  if (elements.gridBoldXInterval) {
    const value = normalizeInterval(gridOverlay?.xBoldInterval ?? 5);
    elements.gridBoldXInterval.value = String(value);
    elements.gridBoldXInterval.addEventListener('change', (event) => {
      const next = normalizeInterval(event.target.value);
      event.target.value = String(next);
      applyGridOverlay({ xBoldInterval: next });
    });
  }
  if (elements.gridBoldYInterval) {
    const value = normalizeInterval(gridOverlay?.yBoldInterval ?? 5);
    elements.gridBoldYInterval.value = String(value);
    elements.gridBoldYInterval.addEventListener('change', (event) => {
      const next = normalizeInterval(event.target.value);
      event.target.value = String(next);
      applyGridOverlay({ yBoldInterval: next });
    });
  }
  if (elements.gridXStart) {
    const value = normalizeStartMode(gridOverlay?.xStartMode ?? 'center', 'x');
    elements.gridXStart.value = value;
    elements.gridXStart.addEventListener('change', (event) => {
      const next = normalizeStartMode(event.target.value, 'x');
      event.target.value = next;
      applyGridOverlay({ xStartMode: next });
    });
  }
  if (elements.gridYStart) {
    const value = normalizeStartMode(gridOverlay?.yStartMode ?? 'center', 'y');
    elements.gridYStart.value = value;
    elements.gridYStart.addEventListener('change', (event) => {
      const next = normalizeStartMode(event.target.value, 'y');
      event.target.value = next;
      applyGridOverlay({ yStartMode: next });
    });
  }
  document.querySelectorAll('.grid-accordion__header').forEach((button) => {
    const accordion = button.closest('.grid-accordion');
    const content = accordion?.querySelector('.grid-accordion__content');
    const setExpanded = (expanded) => {
      button.setAttribute('aria-expanded', String(expanded));
      if (content) content.hidden = !expanded;
      accordion?.classList.toggle('is-collapsed', !expanded);
    };
    const initialExpanded = button.getAttribute('aria-expanded') !== 'false';
    setExpanded(initialExpanded);
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-expanded') !== 'true';
      setExpanded(next);
    });
  });
}

function bindWindowControls() {
  elements.toggleReferenceBtn?.addEventListener('click', toggleReferenceWindow);
  elements.exportBtn?.addEventListener('click', () => {
    if (state.width && state.height) {
      toggleExportWindow(true);
    } else {
      window.alert('请先创建画布。');
    }
  });
  const toolbarExportBtn = document.querySelector('[data-role="export"]');
  toolbarExportBtn?.addEventListener('click', () => {
    if (state.width && state.height) {
      toggleExportWindow(true);
    } else {
      window.alert('请先创建画布。');
    }
  });
}

function bindProjectControls() {
  elements.importProjectBtn?.addEventListener('click', () => elements.projectFileInput?.click());
  elements.projectFileInput?.addEventListener('change', handleProjectFileImport);
}

function handleBaseScaleRangeInput(event) {
  const rawValue = Number(event.target.value);
  if (!state.baseImage || !Number.isFinite(rawValue)) return;

  const changed = applyBaseScale(rawValue, state.width / 2, state.height / 2);
  if (elements.baseScaleRange) {
    elements.baseScaleRange.value = String(state.baseScale);
  }
  if (elements.baseScaleInput) {
    elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);
  }

  if (changed) renderSelectionLayers();
}

function handleBaseScaleInput(event) {
  if (!elements.baseScaleInput) return;

  const rawValue = Number(event.target.value);
  if (!state.baseImage || !Number.isFinite(rawValue)) {
    elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);
    return;
  }

  const changed = applyBaseScale(rawValue, state.width / 2, state.height / 2);
  if (elements.baseScaleRange) {
    elements.baseScaleRange.value = String(state.baseScale);
  }
  elements.baseScaleInput.value = formatBaseScaleValue(state.baseScale);
  if (changed) {
    renderSelectionLayers();
  }
}

function handleCanvasOpacityChange(event) {
  state.backgroundOpacity = Number(event.target.value) / 100;
  updateCanvasOpacityLabel();
  redrawCanvas();
  renderSelectionLayers();
}

function handleDisplayModeChange(event) {
  if (!event.target?.checked) return;
  const value = String(event.target.value || 'standard');
  setDisplayMode(value);
}

function handlePixelShapeChange(event) {
  if (!event.target?.checked) return;
  const value = String(event.target.value || 'square');
  if (state.pixelShape === value) return;
  state.pixelShape = value;
  redrawCanvas();
}

function handleAxisOpacityChange(event) {
  const raw = Number(event.target.value);
  const safe = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 100;
  state.axisOpacity = safe / 100;
  if (elements.axisOpacityValue) {
    elements.axisOpacityValue.textContent = `${safe}%`;
  }
  renderGridLayer();
}

function updateCanvasSizeWarningMessage() {
  const warningEl = elements.canvasSizeWarning;
  if (!warningEl) return;

  const width = Number(elements.widthInput?.value);
  const height = Number(elements.heightInput?.value);

  warningEl.className = 'canvas-size-warning';

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    warningEl.textContent = '';
    return;
  }

  const area = width * height;
  let message = `创建${width} × ${height}尺寸的画布浏览器可以正常运行。`;
  if (area > CANVAS_DANGER_AREA) {
    message = `创建${width} × ${height}尺寸的画布可能会导致浏览器卡顿。`;
    warningEl.classList.add('is-danger');
  } else if (area > CANVAS_WARNING_AREA) {
    message = `创建${width} × ${height}尺寸的画布可能会导致浏览器严重卡顿。`;
    warningEl.classList.add('is-warning');
  } else {
    warningEl.textContent = `创建${width} × ${height}尺寸的画布浏览器可以正常运行。`;
    return;
  }

  warningEl.textContent = message;
}

function handleZoomChange(event) {
  const rawValue = Number(event.target.value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    if (event.target) {
      event.target.value = String(state.zoomValue);
    }
    updateZoomIndicator();
    return;
  }
  setCellSize(rawValue);
}

function createNewCanvas() {
  const width = Number(elements.widthInput?.value);
  const height = Number(elements.heightInput?.value);
  updateCanvasSizeWarningMessage();

  if (!validateCanvasSize(width, height)) {
    window.alert('请输入 1 - 1024 范围内的画布尺寸。');
    return;
  }

  if (isCanvasDirty() && !window.confirm('新建画布会清空当前画布的颜色，是否继续？')) {
    return;
  }

  const normalizedResolution = resolveResolutionValue(elements.resolutionInput?.value);
  if (elements.resolutionInput) {
    elements.resolutionInput.value = String(normalizedResolution);
  }
  state.pixelRatio = normalizedResolution;

  createCanvas(width, height, { cellSize: normalizedResolution });
  renderSelectionLayers();
}

async function handleProjectFileImport(event) {
  const file = event.target.files?.[0];
  if (file) {
    await importProjectFile(file);
  }
  event.target.value = '';
}

function initializePanelSwitcher() {
  const panelButtons = Array.from(elements.panelButtons ?? []);

  const toolButtons = Array.from(elements.toolButtons ?? []);

  const panelEntries = panelButtons
    .map((button) => {
      const target = button.dataset.panelTarget;
      if (!target) return null;
      const panel = document.querySelector(`[data-panel="${target}"]`);
      if (!panel) return null;
      return { target, button, panel };
    })
    .filter(Boolean);

  const entryByTarget = new Map(panelEntries.map((entry) => [entry.target, entry]));
  let activeEntry = panelEntries.find((entry) => entry.panel.classList.contains('is-active')) ?? null;

  const setPanelVisibility = (entry, visible) => {
    entry.panel.classList.toggle('is-active', visible);
    entry.panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
    entry.button.classList.toggle('is-active', visible);
    entry.button.setAttribute('aria-expanded', visible ? 'true' : 'false');
  };

  const hideAllPanels = () => {
    panelEntries.forEach((entry) => setPanelVisibility(entry, false));
  };

  closeAllPanels = ({ refocusTool = true } = {}) => {
    if (activeEntry) {
      setPanelVisibility(activeEntry, false);
    }
    activeEntry = null;
    state.activePanel = null;
    if (refocusTool) updateToolButtons();
  };

  panelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.panelTarget;
      const entry = entryByTarget.get(target);
      if (!entry) return;
      const shouldClose = activeEntry === entry;
      hideAllPanels();
      if (shouldClose) {
        closeAllPanels();
        return;
      }
      setPanelVisibility(entry, true);
      activeEntry = entry;
      state.activePanel = entry.target;
      updateToolButtons();
    });
  });

  elements.panelCloseButtons?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panelClose;
      const entry = entryByTarget.get(target);
      if (!entry) return;
      if (activeEntry === entry) {
        closeAllPanels();
      } else {
        setPanelVisibility(entry, false);
        updateToolButtons();
      }
    });
  });

  hideAllPanels();
  if (activeEntry) {
    setPanelVisibility(activeEntry, true);
    state.activePanel = activeEntry.target;
    updateToolButtons();
  } else {
    state.activePanel = null;
    updateToolButtons();
  }
}

function bindFocusModeControls() {
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement?.requestFullscreen?.();
    }
  };
  elements.focusFullscreenBtn?.addEventListener('click', toggleFullscreen);
  elements.focusSimpleModeBtn?.addEventListener('click', () => {
    setSimpleMode(!state.simpleMode);
  });
  document.addEventListener('fullscreenchange', updateFullscreenButtonState);
  updateFullscreenButtonState();
  initializeSimpleModeUI();
}

function initializeSimpleModeUI() {
  const active = Boolean(state.simpleMode);
  document.body?.classList.toggle('simple-mode-active', active);
  if (elements.simpleToolbar) {
    elements.simpleToolbar.setAttribute('aria-hidden', active ? 'false' : 'true');
  }
  updateSimpleModeButtonState();
  elements.simpleModeExitBtn?.addEventListener('click', () => setSimpleMode(false));
  elements.simplePaletteWindowBtn?.addEventListener('click', () => {
    elements.paletteWindowToggleBtn?.click();
  });
}

function setSimpleMode(nextState) {
  const enabled = Boolean(nextState);
  if (state.simpleMode === enabled) return;
  state.simpleMode = enabled;
  document.body?.classList.toggle('simple-mode-active', enabled);
  if (elements.simpleToolbar) {
    elements.simpleToolbar.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  }
  if (enabled) {
    closeAllPanels({ refocusTool: false });
  }
  updateSimpleModeButtonState();
}

function updateSimpleModeButtonState() {
  if (elements.focusSimpleModeBtn) {
    elements.focusSimpleModeBtn.textContent = state.simpleMode ? '退出简洁模式' : '进入简洁模式';
    elements.focusSimpleModeBtn.classList.toggle('is-active', state.simpleMode);
  }
  if (elements.simpleModeExitBtn) {
    elements.simpleModeExitBtn.classList.toggle('is-active', state.simpleMode);
  }
}

function updateFullscreenButtonState() {
  const isFullscreen = Boolean(document.fullscreenElement);
  if (elements.focusFullscreenBtn) {
    elements.focusFullscreenBtn.textContent = isFullscreen ? '退出全屏' : '进入全屏';
    elements.focusFullscreenBtn.classList.toggle('is-active', isFullscreen);
  }
}

function enhanceToolbarTooltips() {
  const configs = [
    { selector: '[data-panel-target="canvas-settings"]', tooltip: '新建画布/扩裁画布' },
    { selector: '[data-panel-target="base-settings"]', tooltip: '导入或校准底图' },
    { selector: '#toggleReferenceBtn', tooltip: '打开参考图窗口', ariaLabel: '参考窗口' },
    { selector: '[data-panel-target="export-tools"]', tooltip: '导出草图' },
    { selector: '[data-panel-target="import-tools"]', tooltip: '导入PD工程文件' },
    { selector: '[data-panel-target="display-settings"]', tooltip: '显示模式设置' },
    { selector: '[data-panel-target="focus-mode"]', tooltip: '全屏和简洁模式开关' },
    { selector: '[data-panel-target="manual"]', tooltip: '查看使用手册与更新日志' },
    { selector: '#toolPencilBtn', tooltip: '画笔', ariaLabel: '画笔工具' },
    { selector: '#toolBucketBtn', tooltip: '油漆桶', ariaLabel: '填充工具' },
    { selector: '#toolEyedropperBtn', tooltip: '吸管', ariaLabel: '拾色工具' },
    { selector: '#toolSelectionBtn', tooltip: '选区', ariaLabel: '选区工具' }
  ];
  configs.forEach(({ selector, tooltip, ariaLabel }) => {
    const btn = document.querySelector(selector);
    if (!btn) return;
    if (tooltip) btn.dataset.tooltip = tooltip;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
  });
}

function enhanceFocusModePanel() {
  const panel = document.querySelector('#panel-focus-mode');
  if (!panel) return;
  const title = panel.querySelector('.tool-panel__header h2');
  if (title) {
    title.textContent = '全屏与简洁模式';
  }
  const body = panel.querySelector('.tool-panel__body');
  if (!body) return;
  const description = body.querySelector('.panel-description');
  if (description) {
    description.textContent = '可快速切换至全屏并预览简洁模式按钮。';
  }
  let actionRow = body.querySelector('.focus-mode-actions');
  if (!actionRow) {
    actionRow = document.createElement('div');
    actionRow.className = 'button-row focus-mode-actions';
    body.appendChild(actionRow);
  } else {
    actionRow.innerHTML = '';
  }
  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.id = 'focusFullscreenBtn';
  fullscreenBtn.type = 'button';
  fullscreenBtn.className = 'primary-button';
  fullscreenBtn.textContent = '进入全屏';
  actionRow.appendChild(fullscreenBtn);
  const simpleBtn = document.createElement('button');
  simpleBtn.id = 'focusSimpleModeBtn';
  simpleBtn.type = 'button';
  simpleBtn.className = 'ghost-button';
  simpleBtn.textContent = '简洁模式';
  actionRow.appendChild(simpleBtn);
  elements.focusFullscreenBtn = fullscreenBtn;
  elements.focusSimpleModeBtn = simpleBtn;
}
