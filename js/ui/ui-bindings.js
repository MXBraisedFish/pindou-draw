import { elements } from '../elements.js';
import { state } from '../state.js';
import {
  createCanvas,
  handleWheelEvent,
  isCanvasDirty,
  redrawCanvas,
  renderGridLayer,
  redo,
  setCellSize,
  setDisplayMode,
  setTool,
  updateCanvasOpacityLabel,
  updateStatusCreated,
  updateZoomIndicator,
  updateToolButtons,
  undo,
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
import { computeRightToolbarAnchor } from '../toolbar-anchor.js';

const CANVAS_WARNING_AREA = 80 * 80;
const CANVAS_DANGER_AREA = 128 * 128;
let closeAllPanels = () => { };
let manualHintHideTimer = null;
let manualHintShown = false;
let tabletUsageHideTimer = null;
let tabletTooltipHideTimer = null;
let tabletTooltipActiveBtn = null;

export function initializeUIBindings() {
  initializeTabletMode();
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
  bindTabletControls();
  bindTabletPaletteExclusivity();
  bindManualHintToast();
  bindTabletUsageToast();
  bindTabletToolbarTooltipAutoHide();
}

function bindManualHintToast() {
  document.addEventListener('update:autoClosed', () => {
    showManualHintToast();
  });
  window.addEventListener('resize', () => {
    if (!elements.manualHintToast?.classList.contains('is-visible')) return;
    positionManualHintToast();
  });
}

function positionManualHintToast() {
  const toast = elements.manualHintToast;
  const anchor = document.querySelector('[data-role="panel"][data-panel-target="manual"]');
  if (!toast || !anchor) return;

  const margin = 12;
  const anchorRect = anchor.getBoundingClientRect();
  const toastWidth = toast.offsetWidth || 280;
  const toastHeight = toast.offsetHeight || 40;

  let left = anchorRect.right + 12;
  let top = anchorRect.top + anchorRect.height / 2 - toastHeight / 2;

  left = Math.max(margin, Math.min(left, window.innerWidth - toastWidth - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - toastHeight - margin));

  toast.style.left = `${left}px`;
  toast.style.top = `${top}px`;
}

function showManualHintToast() {
  if (manualHintShown) return;
  const toast = elements.manualHintToast;
  if (!toast) return;

  manualHintShown = true;
  positionManualHintToast();
  toast.classList.add('is-visible');
  toast.setAttribute('aria-hidden', 'false');

  if (manualHintHideTimer) {
    clearTimeout(manualHintHideTimer);
  }
  manualHintHideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.setAttribute('aria-hidden', 'true');
  }, 3000);
}

function bindTabletUsageToast() {
  document.addEventListener('tablet:change', (ev) => {
    if (!ev?.detail?.enabled) return;
    showTabletUsageToast();
  });
}

function showTabletUsageToast() {
  const toast = elements.tabletUsageToast;
  if (!toast || !state.isTabletMode) return;

  toast.classList.add('is-visible');
  toast.setAttribute('aria-hidden', 'false');

  if (tabletUsageHideTimer) {
    clearTimeout(tabletUsageHideTimer);
  }
  tabletUsageHideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    toast.setAttribute('aria-hidden', 'true');
  }, 3000);
}

function bindTabletToolbarTooltipAutoHide() {
  const hide = () => {
    if (tabletTooltipHideTimer) {
      clearTimeout(tabletTooltipHideTimer);
      tabletTooltipHideTimer = null;
    }
    if (tabletTooltipActiveBtn) {
      tabletTooltipActiveBtn.classList.remove('tablet-tooltip-visible');
      tabletTooltipActiveBtn = null;
    }
  };

  document.addEventListener('tablet:change', (ev) => {
    if (ev?.detail?.enabled) return;
    hide();
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!state.isTabletMode) return;
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target || !target.closest('.toolbar')) {
      hide();
    }
  }, true);

  document.querySelectorAll('.toolbar-button[data-tooltip]').forEach((btn) => {
    btn.addEventListener('pointerdown', () => {
      if (!state.isTabletMode) return;
      hide();
      btn.classList.add('tablet-tooltip-visible');
      tabletTooltipActiveBtn = btn;
      tabletTooltipHideTimer = setTimeout(() => {
        if (tabletTooltipActiveBtn !== btn) return;
        btn.classList.remove('tablet-tooltip-visible');
        tabletTooltipActiveBtn = null;
      }, 1500);
    });
  });
}

function bindTabletPaletteExclusivity() {
  elements.paletteWindowToggleBtn?.addEventListener('click', () => {
    if (!state.isTabletMode) return;
    const paletteWindow = elements.paletteWindow;
    if (!paletteWindow) return;
    const currentlyVisible = paletteWindow.getAttribute('aria-hidden') === 'false' && paletteWindow.classList.contains('is-active');
    if (currentlyVisible) return;
    closeAllTabletFixedPanelsExceptPalette();
  });
  elements.paletteWindowCloseBtn?.addEventListener('click', () => {
    if (!state.isTabletMode) return;
  });
}

function closeAllTabletFixedPanelsExceptPalette() {
  if (!state.isTabletMode) return;
  closeAllPanels({ refocusTool: false });
  document.querySelectorAll('.tool-panel.is-active').forEach((panel) => {
    if (panel.id === 'paletteWindow') return;
    panel.classList.remove('is-active');
    panel.setAttribute('aria-hidden', 'true');
    const target = panel.dataset?.panel;
    if (target) {
      const btn = document.querySelector(`[data-role="panel"][data-panel-target="${target}"]`);
      if (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-expanded', 'false');
      }
    }
  });
  state.activePanel = null;
  updateToolButtons();
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
  const originalAccept = elements.projectFileInput?.getAttribute('accept') ?? '';
  elements.importProjectBtn?.addEventListener('click', () => {
    if (!elements.projectFileInput) return;
    elements.projectFileInput.accept = state.isTabletMode ? '*/*' : originalAccept;
    elements.projectFileInput.click();
  });
  elements.projectFileInput?.addEventListener('change', (ev) => {
    if (elements.projectFileInput) {
      elements.projectFileInput.accept = originalAccept;
    }
    handleProjectFileImport(ev);
  });
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
      if (state.isTabletMode) {
        closeTabletPalettePanelIfVisible();
      }
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

function closeTabletPalettePanelIfVisible() {
  if (!state.isTabletMode) return;
  const paletteWindow = elements.paletteWindow;
  if (!paletteWindow) return;
  const visible = paletteWindow.getAttribute('aria-hidden') === 'false' && paletteWindow.classList.contains('is-active');
  if (!visible) return;
  elements.paletteWindowCloseBtn?.click();
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
    if (state.isTabletMode) return;
    setSimpleMode(!state.simpleMode);
  });
  elements.forceTabletModeBtnPanel?.addEventListener('click', () => setTabletModeOverride('tablet'));
  elements.forceDesktopModeBtnPanel?.addEventListener('click', () => setTabletModeOverride('desktop'));
  document.addEventListener('fullscreenchange', updateFullscreenButtonState);
  updateFullscreenButtonState();
  initializeSimpleModeUI();
}

function initializeTabletMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    state.isTabletMode = false;
    updateTabletUI();
    return;
  }
  const portraitQuery = window.matchMedia('(min-width: 768px) and (max-width: 1199px) and (orientation: portrait)');
  const landscapeQuery = window.matchMedia('(min-width: 1024px) and (max-width: 1366px) and (orientation: landscape)');
  const queries = [portraitQuery, landscapeQuery];
  const applyState = () => {
    const mediaMatches = queries.some((mq) => mq.matches);
    let matches = mediaMatches;
    if (state.tabletModeOverride === 'tablet') matches = true;
    if (state.tabletModeOverride === 'desktop') matches = false;
    const prev = state.isTabletMode;
    state.isTabletMode = matches;
    document.body?.classList.toggle('tablet-mode', matches);
    if (prev !== matches && typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('tablet:change', { detail: { enabled: matches } }));
      } catch (error) { }
    }
    if (!prev && matches) {
      window.alert('平板端目前处于测试版本，当前使用可能会遇到不可预知的Bug，请谨慎使用，若您遇到Bug请及时汇报(小红书、B站、Github仓库)。');
      showTabletUsageToast();
    }
    if (matches && state.simpleMode) {
      setSimpleMode(false);
    }
    if (!matches && state.tabletEraserActive) {
      state.tabletEraserActive = false;
      state.selectionToolMode = 'add';
    }
    if (prev !== matches) {
      updateToolButtons();
      if (matches) {
        applyTabletFloatingWindowFixups();
      } else {
        cleanupTabletFloatingWindowFixups();
      }
    }
    updateTabletUI();
  };
  queries.forEach((mq) => {
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', applyState);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(applyState);
    }
  });
  window.addEventListener('resize', applyState);
  document.addEventListener('tablet:override', applyState);
  applyState();
}

function applyTabletFloatingWindowFixups() {
  if (!state.isTabletMode) return;
  // Tablet layout is handled by each feature (e.g. palette dock, reference long-press drag/resize).
}

function cleanupTabletFloatingWindowFixups() {
  elements.paletteWindow?.classList.remove('is-tablet-fixed');
  elements.referenceWindow?.classList.remove('is-tablet-fixed');
}

function bindTabletControls() {
  elements.tabletUndoBtn?.addEventListener('click', undo);
  elements.tabletRedoBtn?.addEventListener('click', redo);
  elements.tabletMoveToggleBtn?.addEventListener('click', toggleMoveMode);
  elements.eraserPrimaryBtn?.addEventListener('click', () => {
    state.tabletEraserActive = false;
    updateToolPopouts();
  });
  elements.eraserSwitchBtn?.addEventListener('click', () => {
    if (state.currentTool === 'pencil' || state.currentTool === 'bucket') {
      state.tabletEraserActive = true;
      updateToolPopouts();
    }
  });
  elements.selectionAddBtn?.addEventListener('click', () => setSelectionToolMode('add'));
  elements.selectionDeleteBtn?.addEventListener('click', () => setSelectionToolMode('delete'));
  elements.selectionMoveBtn?.addEventListener('click', () => setSelectionToolMode('move'));
  document.addEventListener('tool:change', () => {
    if (state.currentTool !== 'selection') {
      state.selectionToolMode = 'add';
    }
    if (state.currentTool !== 'pencil' && state.currentTool !== 'bucket') {
      state.tabletEraserActive = false;
    }
    updateTabletUI();
  });
  window.addEventListener('resize', () => {
    positionToolPopouts();
  });
  updateTabletUI();
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
  if (enabled && state.isTabletMode) {
    updateSimpleModeButtonState();
    return;
  }
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
  const locked = state.isTabletMode;
  if (elements.focusSimpleModeBtn) {
    elements.focusSimpleModeBtn.disabled = locked;
    elements.focusSimpleModeBtn.textContent = locked
      ? '平板端禁用简洁模式'
      : (state.simpleMode ? '退出简洁模式' : '进入简洁模式');
    elements.focusSimpleModeBtn.classList.toggle('is-active', state.simpleMode && !locked);
  }
  if (elements.simpleModeExitBtn) {
    elements.simpleModeExitBtn.disabled = locked;
    elements.simpleModeExitBtn.classList.toggle('is-active', state.simpleMode && !locked);
  }
  if (elements.simpleToolbar) {
    const hidden = locked || !state.simpleMode;
    elements.simpleToolbar.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }
  updateModeOverrideSwitchUI();
}

function updateTabletUI() {
  updateTabletUndoRedoVisibility();
  updateMoveToggleUI();
  updateToolPopouts();
  updateSimpleModeButtonState();
  updateModeOverrideSwitchUI();
}

function updateTabletUndoRedoVisibility() {
  if (!elements.tabletUndoRedoBar) return;
  const visible = state.isTabletMode;
  elements.tabletUndoRedoBar.classList.toggle('is-visible', visible);
  elements.tabletUndoRedoBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateMoveToggleUI() {
  if (!elements.tabletMoveToggleBtn) return;
  const active = state.isTabletMode && state.moveModeEnabled;
  elements.tabletMoveToggleBtn.disabled = !state.isTabletMode;
  elements.tabletMoveToggleBtn.classList.toggle('is-active', active);
  elements.tabletMoveToggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function updateFullscreenButtonState() {
  const isFullscreen = Boolean(document.fullscreenElement);
  if (elements.focusFullscreenBtn) {
    elements.focusFullscreenBtn.textContent = isFullscreen ? '退出全屏' : '进入全屏';
    elements.focusFullscreenBtn.classList.toggle('is-active', isFullscreen);
  }
  updateModeOverrideSwitchUI();
}

function updateModeOverrideSwitchUI() {
  const showDesktopSwitch = !state.isTabletMode;
  const showTabletSwitch = state.isTabletMode;

  if (elements.forceTabletModeBtnPanel) {
    elements.forceTabletModeBtnPanel.style.display = showDesktopSwitch ? '' : 'none';
  }
  if (elements.forceDesktopModeBtnPanel) {
    elements.forceDesktopModeBtnPanel.style.display = showTabletSwitch ? '' : 'none';
  }
}

function setTabletModeOverride(target) {
  if (target !== 'tablet' && target !== 'desktop' && target !== null) return;
  if (state.tabletModeOverride === target) return;
  state.tabletModeOverride = target;
  try {
    document.dispatchEvent(new CustomEvent('tablet:override', { detail: { target } }));
  } catch (_) { }
  updateTabletUI();
}

function updateToolPopouts() {
  const { toolPopouts, eraserPopout, selectionPopout } = elements;
  if (!toolPopouts || !eraserPopout || !selectionPopout) return;

  const isTablet = state.isTabletMode;

  // Always hide all popouts first to ensure a clean state.
  eraserPopout.classList.remove('is-visible');
  eraserPopout.classList.add('no-display');
  eraserPopout.setAttribute('aria-hidden', 'true');
  selectionPopout.classList.remove('is-visible');
  selectionPopout.classList.add('no-display');
  selectionPopout.setAttribute('aria-hidden', 'true');
  toolPopouts.setAttribute('aria-hidden', 'true');
  
  // Popouts are exclusive to tablet mode.
  if (!isTablet) {
    state.tabletEraserActive = false;
    state.selectionToolMode = 'add'; // Reset state when leaving tablet mode
    return;
  }

  const tool = state.currentTool;
  let anyVisible = false;

  // Mutually exclusive logic: only one popout can be visible at a time.
  if (tool === 'pencil' || tool === 'bucket') {
    selectionPopout.classList.remove('is-visible');
    selectionPopout.classList.add('no-display');
    selectionPopout.setAttribute('aria-hidden', 'true');

    eraserPopout.classList.add('is-visible');
    eraserPopout.classList.remove('no-display');
    eraserPopout.setAttribute('aria-hidden', 'false');
    anyVisible = true;

    // Configure the eraser/primary tool button inside the popout
    const activeIcon = tool === 'bucket' ? 'svg/油漆桶.svg' : 'svg/画笔.svg';
    if (elements.eraserPrimaryBtn) {
      elements.eraserPrimaryBtn.innerHTML = `<img src="${activeIcon}" alt="">`;
      elements.eraserPrimaryBtn.classList.toggle('is-active', !state.tabletEraserActive);
      elements.eraserPrimaryBtn.setAttribute('aria-pressed', String(!state.tabletEraserActive));
    }
    if (elements.eraserSwitchBtn) {
      elements.eraserSwitchBtn.classList.toggle('is-active', state.tabletEraserActive);
      elements.eraserSwitchBtn.setAttribute('aria-pressed', String(state.tabletEraserActive));
    }
  } else if (tool === 'selection') {
    eraserPopout.classList.remove('is-visible');
    eraserPopout.classList.add('no-display');
    eraserPopout.setAttribute('aria-hidden', 'true');

    selectionPopout.classList.add('is-visible');
    selectionPopout.classList.remove('no-display');
    selectionPopout.setAttribute('aria-hidden', 'false');
    anyVisible = true;
    
    // Configure the selection mode buttons
    highlightSelectionButton(elements.selectionAddBtn, state.selectionToolMode === 'add');
    highlightSelectionButton(elements.selectionDeleteBtn, state.selectionToolMode === 'delete');
    highlightSelectionButton(elements.selectionMoveBtn, state.selectionToolMode === 'move');
  } else {
    // For any other tool (like eyedropper), ensure associated states are reset.
    state.tabletEraserActive = false;
    // state.selectionToolMode = 'add'; // This line is commented out as it might reset user intention undesirably.
  }

  // Finally, show the main popout container if any popout is visible.
  if (anyVisible) {
    toolPopouts.setAttribute('aria-hidden', 'false');
    positionToolPopouts();
  }
}

function highlightSelectionButton(button, active) {
  if (!button) return;
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function positionToolPopouts() {
  positionPopout(elements.eraserPopout, resolveAnchorButton());
  positionPopout(elements.selectionPopout, elements.toolSelectionBtn);
}

function resolveAnchorButton() {
  if (state.currentTool === 'pencil') return elements.toolPencilBtn;
  if (state.currentTool === 'bucket') return elements.toolBucketBtn;
  return null;
}

function positionPopout(popout, anchor) {
  if (!popout || !anchor || !popout.classList.contains('is-visible')) return;
  const rect = anchor.getBoundingClientRect();
  const { scrollX, scrollY, innerWidth } = window;
  popout.style.visibility = 'hidden';
  popout.style.display = 'flex';
  const popWidth = popout.offsetWidth;
  const popHeight = popout.offsetHeight;
  const spacing = 12;
  const top = rect.top + rect.height / 2 - popHeight / 2 + scrollY;
  const left = rect.left - popWidth - spacing + scrollX;
  const clampedTop = Math.max(12 + scrollY, top);
  const clampedLeft = Math.max(12 + scrollX, Math.min(left, innerWidth + scrollX - popWidth - 12));
  popout.style.top = `${clampedTop}px`;
  popout.style.left = `${clampedLeft}px`;
  popout.style.visibility = 'visible';
}

function setSelectionToolMode(mode) {
  if (!['add', 'delete', 'move'].includes(mode)) return;
  state.selectionToolMode = mode;
  updateToolPopouts();
}

function toggleMoveMode() {
  if (!state.isTabletMode) return;
  state.moveModeEnabled = !state.moveModeEnabled;
  updateMoveToggleUI();
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

  let modeSwitchRow = body.querySelector('.focus-mode-mode-switch');
  if (!modeSwitchRow) {
    modeSwitchRow = document.createElement('div');
    modeSwitchRow.className = 'button-row focus-mode-mode-switch';
    body.appendChild(modeSwitchRow);
  } else {
    modeSwitchRow.innerHTML = '';
  }

  const forceTabletBtn = document.createElement('button');
  forceTabletBtn.id = 'forceTabletModeBtnPanel';
  forceTabletBtn.type = 'button';
  forceTabletBtn.className = 'ghost-button';
  forceTabletBtn.textContent = '改为平板端操作与显示';
  modeSwitchRow.appendChild(forceTabletBtn);

  const forceDesktopBtn = document.createElement('button');
  forceDesktopBtn.id = 'forceDesktopModeBtnPanel';
  forceDesktopBtn.type = 'button';
  forceDesktopBtn.className = 'ghost-button';
  forceDesktopBtn.textContent = '改为电脑端操作与显示';
  modeSwitchRow.appendChild(forceDesktopBtn);

  elements.focusFullscreenBtn = fullscreenBtn;
  elements.focusSimpleModeBtn = simpleBtn;
  elements.forceTabletModeBtnPanel = forceTabletBtn;
  elements.forceDesktopModeBtnPanel = forceDesktopBtn;
}
