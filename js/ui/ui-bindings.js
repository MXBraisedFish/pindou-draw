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
import { getAutosaveCountdownEnabled, initializeLocalStorageFeature, setAutosaveCountdownEnabled } from '../local-storage.js';
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
import { isUpdateDismissed } from '../update.js';
import { isIntroDismissed } from '../intro.js';

const CANVAS_WARNING_AREA = 80 * 80;
const CANVAS_DANGER_AREA = 128 * 128;
let closeAllPanels = () => { };
let manualHintHideTimer = null;
let manualHintShown = false;
let tabletUsageHideTimer = null;
let tabletTooltipHideTimer = null;
let tabletTooltipActiveBtn = null;
let tabletTooltipOverlayEl = null;
let tabletFullscreenDesired = false;
let tabletFullscreenExitFailures = [];
let tabletFullscreenReenterBound = false;
let lastFullscreenToggleIntent = null;
let lastFullscreenToggleTime = 0;
let paletteLoadedToastQueue = [];
let paletteLoadedListenerBound = false;
let paletteReady = false;
let manualHintPending = false;

function isMobileLayout() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

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
  bindMobileMenu();
  bindMobileToolbarLayout();
  bindDocsLinkRouting();
  bindTabletFullscreenResilience();
  initializeLocalStorageFeature();
}

function bindManualHintToast() {
  document.addEventListener('update:autoClosed', () => {
    if (isIntroDismissed() && !state.updateVisible && !state.introVisible) {
      showManualHintToast();
    }
  });
  document.addEventListener('intro:closed', () => {
    if (!state.updateVisible && !state.introVisible) {
      showManualHintToast();
    }
  });
  window.addEventListener('resize', () => {
    if (!elements.manualHintToast?.classList.contains('is-visible')) return;
    positionManualHintToast();
  });
  if (isUpdateDismissed() && isIntroDismissed() && !state.updateVisible && !state.introVisible) {
    showManualHintToast();
  }
  document.addEventListener('palette:loaded', () => {
    paletteReady = true;
    if (manualHintPending && !manualHintShown && !state.updateVisible && !state.introVisible) {
      manualHintPending = false;
      showManualHintToast();
    }
  }, { once: true });
}

function positionManualHintToast() {
  const toast = elements.manualHintToast;
  const anchor = document.querySelector('[data-role="panel"][data-panel-target="manual"]');
  if (!toast || !anchor) return;

  const margin = 12;
  const anchorRect = anchor.getBoundingClientRect();
  const mobileAnchor = isMobileLayout()
    ? document.querySelector('#mobileMenuBtn') ?? document.querySelector('.mobile-menu-panel')
    : null;
  const targetRect = mobileAnchor?.getBoundingClientRect?.() || anchorRect;
  const toastWidth = toast.offsetWidth || 280;
  const toastHeight = toast.offsetHeight || 40;

  let left = anchorRect.right + 12;
  let top = anchorRect.top + anchorRect.height / 2 - toastHeight / 2;

  if (mobileAnchor) {
    left = targetRect.left + targetRect.width / 2 - toastWidth / 2;
    top = targetRect.top - toastHeight - 10;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - toastWidth - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - toastHeight - margin));

  toast.style.left = `${left}px`;
  toast.style.top = `${top}px`;
}

function showManualHintToast() {
  if (manualHintShown) return;
  const toast = elements.manualHintToast;
  if (!toast) return;

  if (!paletteReady) {
    manualHintPending = true;
    return;
  }
  if (state.updateVisible || state.introVisible) {
    manualHintPending = true;
    return;
  }
  const mobileText = toast.dataset.textMobile;
  const defaultText = toast.dataset.textDefault;
  if (isMobileLayout() && mobileText) {
    toast.textContent = mobileText;
  } else if (defaultText) {
    toast.textContent = defaultText;
  }
  if (enqueueToastAfterPaletteLoaded(showManualHintToast)) return;
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

  if (enqueueToastAfterPaletteLoaded(showTabletUsageToast)) return;
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

function enqueueToastAfterPaletteLoaded(callback) {
  const overlay = elements.paletteLoadingOverlay;
  const isLoading = overlay?.classList.contains('is-visible');
  if (!isLoading) return false;

  paletteLoadedToastQueue.push(callback);
  if (!paletteLoadedListenerBound) {
    paletteLoadedListenerBound = true;
    document.addEventListener(
      'palette:loaded',
      () => {
        paletteLoadedListenerBound = false;
        const queue = paletteLoadedToastQueue.slice();
        paletteLoadedToastQueue = [];
        queue.forEach((fn) => fn());
      },
      { once: true }
    );
  }
  return true;
}

function bindTabletToolbarTooltipAutoHide() {
  const ensureOverlay = () => {
    if (tabletTooltipOverlayEl) return tabletTooltipOverlayEl;
    const el = document.createElement('div');
    el.id = 'tabletToolbarTooltipOverlay';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    tabletTooltipOverlayEl = el;
    return el;
  };

  const hideOverlay = () => {
    if (!tabletTooltipOverlayEl) return;
    tabletTooltipOverlayEl.classList.remove('is-visible', 'placement-left', 'placement-right', 'placement-top');
    tabletTooltipOverlayEl.textContent = '';
    tabletTooltipOverlayEl.setAttribute('aria-hidden', 'true');
  };

  const showOverlayForButton = (btn) => {
    const tooltip = btn?.dataset?.tooltip;
    if (!tooltip) return;
    const overlay = ensureOverlay();
    overlay.textContent = tooltip;
    overlay.setAttribute('aria-hidden', 'false');

    const rect = btn.getBoundingClientRect();
    const gap = 12;
    const isLeft = !!btn.closest('.toolbar-left');
    const isRight = !!btn.closest('.toolbar-right');
    const isBottom = !!btn.closest('.toolbar-bottom');

    overlay.classList.remove('placement-left', 'placement-right', 'placement-top');
    if (isBottom) {
      overlay.classList.add('placement-top');
      overlay.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      overlay.style.top = `${Math.round(rect.top - gap)}px`;
    } else if (isRight) {
      overlay.classList.add('placement-left');
      overlay.style.left = `${Math.round(rect.left - gap)}px`;
      overlay.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    } else {
      overlay.classList.add('placement-right');
      overlay.style.left = `${Math.round(rect.right + gap)}px`;
      overlay.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    }

    overlay.classList.add('is-visible');
  };

  const hide = () => {
    if (tabletTooltipHideTimer) {
      clearTimeout(tabletTooltipHideTimer);
      tabletTooltipHideTimer = null;
    }
    if (tabletTooltipActiveBtn) {
      tabletTooltipActiveBtn = null;
    }
    hideOverlay();
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
      tabletTooltipActiveBtn = btn;
      showOverlayForButton(btn);
      tabletTooltipHideTimer = setTimeout(() => {
        if (tabletTooltipActiveBtn !== btn) return;
        tabletTooltipActiveBtn = null;
        hideOverlay();
      }, 1500);
    });
  });
}

function bindMobileMenu() {
  const button = elements.mobileMenuBtn;
  const overlay = elements.mobileMenuOverlay;
  const panel = elements.mobileMenuPanel;
  if (!button || !overlay || !panel) return;

  const close = () => {
    document.body.classList.remove('mobile-menu-open');
    document.body.classList.remove('mobile-subtool-open');
    overlay.setAttribute('aria-hidden', 'true');
  };

  const open = () => {
    document.body.classList.add('mobile-menu-open');
    overlay.setAttribute('aria-hidden', 'false');
  };

  const openSubtool = (target) => {
    if (!isMobileLayout()) return;
    const trigger = document.querySelector(`[data-role="panel"][data-panel-target="${target}"]`);
    if (!trigger) return;
    open();
    document.body.classList.add('mobile-subtool-open');
    trigger.click();
  };

  const closeSubtool = () => {
    if (!document.body.classList.contains('mobile-subtool-open')) return;
    closeAllPanels({ refocusTool: false });
    document.body.classList.remove('mobile-subtool-open');
    open();
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (document.body.classList.contains('mobile-menu-open')) {
      close();
    } else {
      open();
    }
  });

  overlay.addEventListener('click', (event) => {
    if (panel.contains(event.target)) return;
    const activePanel = document.querySelector('.tool-panel.is-active');
    if (document.body.classList.contains('mobile-subtool-open') && activePanel && activePanel.contains(event.target)) {
      return;
    }
    if (document.body.classList.contains('mobile-subtool-open')) {
      closeSubtool();
      return;
    }
    close();
  });

  elements.mobileMenuCanvasBtn?.addEventListener('click', () => {
    openSubtool('canvas-settings');
  });
  elements.mobileMenuInfoBtn?.addEventListener('click', () => {
    openSubtool('canvas-info');
  });
  elements.mobileMenuManualBtn?.addEventListener('click', () => {
    openSubtool('manual');
  });
  elements.mobileMenuBaseBtn?.addEventListener('click', () => {
    openSubtool('base-settings');
  });
  elements.mobileMenuReferenceBtn?.addEventListener('click', () => {
    if (!isMobileLayout()) return;
    close();
    toggleReferenceWindow(true);
  });
  elements.mobileMenuExportBtn?.addEventListener('click', () => {
    openSubtool('export-tools');
  });
  elements.mobileMenuImportBtn?.addEventListener('click', () => {
    openSubtool('import-tools');
  });
  elements.mobileMenuDisplayBtn?.addEventListener('click', () => {
    openSubtool('display-settings');
  });
  elements.mobileMenuFullscreenBtn?.addEventListener('click', () => {
    close();
    closeAllPanels({ refocusTool: false });
    if (isMobileLayout()) {
      elements.focusFullscreenAction?.();
      return;
    }
    openSubtool('focus-mode');
  });
  elements.mobileMenuImageOpsBtn?.addEventListener('click', () => {
    openSubtool('image-operations');
  });
  elements.mobileMenuPaletteManageBtn?.addEventListener('click', () => {
    openSubtool('palette-management');
  });
  elements.mobileMenuColorManageBtn?.addEventListener('click', () => {
    openSubtool('color-management');
  });

  elements.panelCloseButtons?.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isMobileLayout()) return;
      if (!document.body.classList.contains('mobile-subtool-open')) return;
      document.body.classList.remove('mobile-subtool-open');
      open();
    });
  });
}

document.addEventListener('mobile:reset-subtools', () => {
  if (!isMobileLayout()) return;
  closeAllPanels({ refocusTool: false });
  document.body.classList.remove('mobile-menu-open', 'mobile-subtool-open');
  elements.mobileMenuOverlay?.setAttribute('aria-hidden', 'true');
});

document.addEventListener('mobile:close-panels', () => {
  if (!isMobileLayout()) return;
  closeAllPanels({ refocusTool: false });
});

function bindMobileToolbarLayout() {
  const handleLayout = () => {
    const moveBtn = elements.tabletMoveToggleBtn;
    const toolbar = elements.mobileToolbar;
    const slot = elements.mobileMoveSlot;
    const group = elements.mobileToolbarGroup;
    const tabletBar = elements.tabletUndoRedoBar;
    if (!moveBtn || !toolbar) return;
    if (!isMobileLayout()) {
      if (tabletBar && !tabletBar.contains(moveBtn)) {
        tabletBar.insertBefore(moveBtn, elements.tabletRedoBtn ?? null);
      }
      if (group) {
        group.setAttribute('aria-hidden', 'true');
      }
      moveBtn.style.left = '';
      moveBtn.style.bottom = '';
      moveBtn.style.width = '';
      moveBtn.style.height = '';
      toolbar.style.left = '';
      toolbar.style.transform = '';
      return;
    }
    if (slot && !slot.contains(moveBtn)) {
      slot.appendChild(moveBtn);
    }
    if (group) {
      group.setAttribute('aria-hidden', 'false');
    }
  };

  window.addEventListener('resize', handleLayout);
  window.addEventListener('orientationchange', handleLayout);
  document.addEventListener('DOMContentLoaded', handleLayout);
  handleLayout();
}

function bindDocsLinkRouting() {
  const link = elements.docsLink;
  if (!link) return;

  const originalHref = link.getAttribute('href') || 'manual.html';
  link.dataset.desktopHref = originalHref;
  link.dataset.tabletHref = './manual-tablet.html';
  link.dataset.mobileHref = './manual-phone.html';

  const applyHref = () => {
    if (isMobileLayout()) {
      link.setAttribute('href', link.dataset.mobileHref);
      return;
    }
    link.setAttribute('href', state.isTabletMode ? link.dataset.tabletHref : link.dataset.desktopHref);
  };

  document.addEventListener('tablet:change', applyHref);
  applyHref();
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
  elements.toggleBaseEditBtn?.addEventListener('click', () => {
    const wasEditing = state.baseEditing;
    toggleBaseEditMode();
    if (!wasEditing && state.baseEditing && isMobileLayout()) {
      document.dispatchEvent(new Event('mobile:reset-subtools'));
    }
  });
  elements.recenterBaseBtn?.addEventListener('click', recenterBaseImage);
  elements.snapBaseToCanvasBtn?.addEventListener('click', snapBaseToCanvas);
  elements.baseEditExitBtn?.addEventListener('click', () => {
    toggleBaseEditMode(false);
  });
  elements.baseScaleRange?.addEventListener('input', handleBaseScaleRangeInput);
  elements.baseScaleInput?.addEventListener('input', handleBaseScaleInput);
  elements.baseScaleInput?.addEventListener('change', handleBaseScaleInput);
  elements.baseEditScaleRange?.addEventListener('input', handleBaseScaleRangeInput);
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
  if (elements.autosaveCountdownToggle) {
    elements.autosaveCountdownToggle.checked = getAutosaveCountdownEnabled();
    elements.autosaveCountdownToggle.addEventListener('change', (event) => {
      setAutosaveCountdownEnabled(Boolean(event.target.checked));
    });
  }
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
  elements.mobilePaletteWindowBtn?.addEventListener('click', () => {
    if (!isMobileLayout()) return;
    elements.paletteWindowToggleBtn?.click();
  });
  const syncCreatePaletteState = () => {
    if (!elements.createPaletteBtn) return;
    const disabled = state.isTabletMode || isMobileLayout();
    elements.createPaletteBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    elements.createPaletteBtn.classList.toggle('is-disabled', disabled);
  };
  elements.createPaletteBtn?.addEventListener('click', () => {
    if (state.isTabletMode || isMobileLayout()) {
      window.alert('制作色卡仅支持电脑端，请在电脑上使用该功能。');
      return;
    }
    try {
      window.open('./color-maker.html', '_blank', 'noopener');
    } catch (error) {
      console.warn('无法打开色卡制作工具', error);
    }
  });
  document.addEventListener('tablet:change', syncCreatePaletteState);
  syncCreatePaletteState();

  const paletteWindow = elements.paletteWindow;
  const syncMobilePaletteButton = () => {
    const button = elements.mobilePaletteWindowBtn;
    if (!button || !paletteWindow) return;
    const isOpen = paletteWindow.getAttribute('aria-hidden') === 'false' && paletteWindow.classList.contains('is-visible');
    button.classList.toggle('is-active', isOpen);
    button.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  };

  if (paletteWindow) {
    const observer = new MutationObserver(syncMobilePaletteButton);
    observer.observe(paletteWindow, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
    syncMobilePaletteButton();
  }
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
  // export actions
  elements.openExportWindowBtn?.addEventListener('click', () => {
    if (!state.width || !state.height) {
      window.alert('请先创建画布后再导出。');
      return;
    }
    closeAllPanels({ refocusTool: false });
    toggleExportWindow(true);
  });
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
    if (state.isTabletMode || isMobileLayout()) {
      elements.projectFileInput.removeAttribute('accept');
    } else {
      elements.projectFileInput.setAttribute('accept', originalAccept);
    }
    elements.projectFileInput.click();
  });
  elements.projectFileInput?.addEventListener('change', (ev) => {
    if (elements.projectFileInput) {
      if (originalAccept) {
        elements.projectFileInput.setAttribute('accept', originalAccept);
      } else {
        elements.projectFileInput.removeAttribute('accept');
      }
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
  if (isMobileLayout()) {
    try {
      document.dispatchEvent(new CustomEvent('mobile:reset-subtools'));
    } catch (_) { }
  }
}

function updateCanvasInfoPanel() {
  if (!elements.canvasInfoCreated && !elements.canvasInfoPalette && !elements.canvasInfoSize && !elements.canvasInfoBase) {
    return;
  }
  if (elements.canvasInfoCreated && elements.statusCreated) {
    elements.canvasInfoCreated.textContent = elements.statusCreated.textContent?.trim() || '--';
  }
  if (elements.canvasInfoPalette && elements.statusPalette) {
    elements.canvasInfoPalette.textContent = elements.statusPalette.textContent?.trim() || '--';
  }
  if (elements.canvasInfoSize && elements.statusSize) {
    elements.canvasInfoSize.textContent = elements.statusSize.textContent?.trim() || '--';
  }
  if (elements.canvasInfoBase && elements.statusBase) {
    elements.canvasInfoBase.textContent = elements.statusBase.textContent?.trim() || '--';
  }
}

async function handleProjectFileImport(event) {
  const file = event.target.files?.[0];
  if (file) {
    try {
      await importProjectFile(file);
      if (isMobileLayout()) {
        document.dispatchEvent(new CustomEvent('mobile:reset-subtools'));
      }
    } catch (_) { }
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
  if (isMobileLayout() && activeEntry?.target === 'canvas-settings') {
    activeEntry.panel.classList.remove('is-active');
    activeEntry.panel.setAttribute('aria-hidden', 'true');
    activeEntry.button.classList.remove('is-active');
    activeEntry.button.setAttribute('aria-expanded', 'false');
    activeEntry = null;
  }

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
      if (entry.target === 'canvas-info') {
        updateCanvasInfoPanel();
      }
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
  if (activeEntry && !(isMobileLayout() && activeEntry.target === 'canvas-settings')) {
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
    closeAllPanels({ refocusTool: false });
    const now = Date.now();
    lastFullscreenToggleTime = now;
    if (document.fullscreenElement) {
      lastFullscreenToggleIntent = 'exit';
      if (state.isTabletMode) tabletFullscreenDesired = false;
      document.exitFullscreen?.();
    } else {
      lastFullscreenToggleIntent = 'enter';
      if (state.isTabletMode) tabletFullscreenDesired = true;
      try {
        document.documentElement?.requestFullscreen?.();
      } catch (_) { }
    }
  };
  elements.focusFullscreenAction = toggleFullscreen;
  elements.focusFullscreenBtn?.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenButtonState);
  updateFullscreenButtonState();
  initializeSimpleModeUI();
}

function bindTabletFullscreenResilience() {
  if (tabletFullscreenReenterBound || typeof document === 'undefined') return;

  const shouldAttempt = () => state.isTabletMode && tabletFullscreenDesired && !document.fullscreenElement;

  const registerExitFailure = () => {
    const now = Date.now();
    tabletFullscreenExitFailures = tabletFullscreenExitFailures.filter((t) => now - t < 10000);
    tabletFullscreenExitFailures.push(now);
    return tabletFullscreenExitFailures.length;
  };

  const scheduleGestureReenter = () => {
    if (!shouldAttempt()) return;
    const handler = () => {
      if (!shouldAttempt()) return;
      try {
        document.documentElement?.requestFullscreen?.();
      } catch (_) { }
    };
    window.addEventListener('pointerdown', handler, { once: true, capture: true });
  };

  const tryAutoReenter = () => {
    if (!shouldAttempt()) return;
    const attempts = registerExitFailure();
    if (attempts >= 3) {
      tabletFullscreenDesired = false;
      return;
    }
    try {
      const result = document.documentElement?.requestFullscreen?.();
      if (result && typeof result.catch === 'function') {
        result.catch(() => scheduleGestureReenter());
      } else {
        scheduleGestureReenter();
      }
    } catch (_) {
      scheduleGestureReenter();
    }
  };

  document.addEventListener('fullscreenchange', () => {
    if (!state.isTabletMode) return;
    const isFullscreen = Boolean(document.fullscreenElement);
    if (isFullscreen) return;
    if (!tabletFullscreenDesired) return;

    // 如果是用户刚刚点击按钮主动退出，则不要自动恢复。
    const recent = Date.now() - lastFullscreenToggleTime < 1200;
    if (recent && lastFullscreenToggleIntent === 'exit') return;

    tryAutoReenter();
  });

  // 某些移动端在弹窗/文件选择器/下载确认后会退出全屏，回到前台时再尝试恢复。
  window.addEventListener('focus', () => {
    if (!shouldAttempt()) return;
    scheduleGestureReenter();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!shouldAttempt()) return;
    scheduleGestureReenter();
  });

  document.addEventListener('tablet:change', (ev) => {
    if (!ev?.detail?.enabled) {
      tabletFullscreenDesired = false;
      tabletFullscreenExitFailures = [];
      return;
    }
  });

  tabletFullscreenReenterBound = true;
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
    if (!isMobileLayout()) {
      if (state.tabletModeOverride === 'tablet') matches = true;
      if (state.tabletModeOverride === 'desktop') matches = false;
    } else {
      matches = false;
    }
    const prev = state.isTabletMode;
    state.isTabletMode = matches;
    document.body?.classList.toggle('tablet-mode', matches);
    if (prev !== matches && typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('tablet:change', { detail: { enabled: matches } }));
      } catch (error) { }
    }
    if (!prev && matches) {
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
  window.addEventListener('orientationchange', () => {
    positionToolPopouts();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      positionToolPopouts();
    });
    window.visualViewport.addEventListener('scroll', () => {
      positionToolPopouts();
    });
  }
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
  elements.focusSimpleModeBtn?.addEventListener('click', () => {
    if (elements.focusSimpleModeBtn.disabled) return;
    setSimpleMode(!state.simpleMode);
  });
  elements.simplePaletteWindowBtn?.addEventListener('click', () => {
    elements.paletteWindowToggleBtn?.click();
  });
}

function setSimpleMode(nextState) {
  const enabled = Boolean(nextState);
  if (enabled && (state.isTabletMode || isMobileLayout())) {
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
  const locked = state.isTabletMode || isMobileLayout();
  if (locked && state.simpleMode) {
    state.simpleMode = false;
    document.body?.classList.remove('simple-mode-active');
    if (elements.simpleToolbar) {
      elements.simpleToolbar.setAttribute('aria-hidden', 'true');
    }
  }
  const lockedLabel = state.isTabletMode ? '平板端禁用简洁模式' : '移动端禁用简洁模式';
  if (elements.focusSimpleModeBtn) {
    elements.focusSimpleModeBtn.disabled = locked;
    elements.focusSimpleModeBtn.textContent = locked
      ? lockedLabel
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
  const visible = state.isTabletMode || isMobileLayout();
  elements.tabletUndoRedoBar.classList.toggle('is-visible', visible);
  elements.tabletUndoRedoBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function updateMoveToggleUI() {
  if (!elements.tabletMoveToggleBtn) return;
  const inCompactMode = state.isTabletMode || isMobileLayout();
  const active = inCompactMode && state.moveModeEnabled;
  elements.tabletMoveToggleBtn.disabled = !inCompactMode;
  elements.tabletMoveToggleBtn.classList.toggle('is-active', active);
  elements.tabletMoveToggleBtn.classList.toggle('tool-button--selected', active);
  elements.tabletMoveToggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function updateFullscreenButtonState() {
  const isFullscreen = Boolean(document.fullscreenElement);
  if (elements.focusFullscreenBtn) {
    const label = isFullscreen ? '退出全屏' : '进入全屏';
    elements.focusFullscreenBtn.setAttribute('aria-label', label);
    elements.focusFullscreenBtn.dataset.tooltip = label;
    elements.focusFullscreenBtn.setAttribute('title', label);
    elements.focusFullscreenBtn.classList.toggle('is-active', isFullscreen);
    elements.focusFullscreenBtn.textContent = label;
  }
  if (elements.mobileMenuFullscreenBtn) {
    const label = isFullscreen ? '退出全屏' : '进入全屏';
    elements.mobileMenuFullscreenBtn.setAttribute('aria-label', label);
    const textEl = elements.mobileMenuFullscreenBtn.querySelector('span');
    if (textEl) textEl.textContent = label;
  }
  updateModeOverrideSwitchUI();
}

function updateModeOverrideSwitchUI() {
  const isMobile = isMobileLayout();
  const showDesktopSwitch = !isMobile && !state.isTabletMode;
  const showTabletSwitch = !isMobile && state.isTabletMode;

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

  const isCompactMode = state.isTabletMode || isMobileLayout();

  // Always hide all popouts first to ensure a clean state.
  eraserPopout.classList.remove('is-visible');
  eraserPopout.classList.add('no-display');
  eraserPopout.setAttribute('aria-hidden', 'true');
  selectionPopout.classList.remove('is-visible');
  selectionPopout.classList.add('no-display');
  selectionPopout.setAttribute('aria-hidden', 'true');
  toolPopouts.setAttribute('aria-hidden', 'true');
  
  // Popouts are exclusive to tablet mode.
  if (!isCompactMode) {
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
  if (isMobileLayout()) {
    positionPopoutCentered(elements.eraserPopout);
    positionPopoutCentered(elements.selectionPopout);
    return;
  }
  positionPopout(elements.eraserPopout, resolveAnchorButton());
  positionPopout(elements.selectionPopout, elements.toolSelectionBtn);
}

function resolveAnchorButton() {
  if (state.currentTool === 'pencil') return elements.toolPencilBtn;
  if (state.currentTool === 'bucket') return elements.toolBucketBtn;
  return null;
}

function positionPopoutCentered(popout) {
  if (!popout || !popout.classList.contains('is-visible')) return;
  const toolbarGroup = elements.mobileToolbarGroup;
  if (!toolbarGroup) return;
  const rect = toolbarGroup.getBoundingClientRect();
  const { innerWidth, innerHeight } = window;
  popout.style.visibility = 'hidden';
  popout.style.display = 'flex';
  const popWidth = popout.offsetWidth;
  const popHeight = popout.offsetHeight;
  const spacing = 12;
  const top = rect.top - popHeight - spacing;
  const left = innerWidth / 2 - popWidth / 2;
  const clampedTop = Math.max(12, Math.min(top, innerHeight - popHeight - 12));
  const clampedLeft = Math.max(12, Math.min(left, innerWidth - popWidth - 12));
  popout.style.top = `${clampedTop}px`;
  popout.style.left = `${clampedLeft}px`;
  popout.style.visibility = 'visible';
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
  if (!state.isTabletMode && !isMobileLayout()) return;
  state.moveModeEnabled = !state.moveModeEnabled;
  updateMoveToggleUI();
}

function enhanceToolbarTooltips() {
  const configs = [
    { selector: '[data-panel-target="canvas-settings"]', tooltip: '新建画布/扩裁画布' },
    { selector: '[data-panel-target="base-settings"]', tooltip: '导入或校准底图' },
    { selector: '#toggleReferenceBtn', tooltip: '打开参考图窗口', ariaLabel: '参考窗口' },
    { selector: '[data-panel-target="export-tools"]', tooltip: '导出文件或本地保存' },
    { selector: '[data-panel-target="import-tools"]', tooltip: '导入文件或本地读取' },
    { selector: '[data-panel-target="display-settings"]', tooltip: '显示模式设置' },
    { selector: '#focusModePanelBtn', tooltip: '全屏与简洁模式' },
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

  forceTabletBtn.addEventListener('click', () => setTabletModeOverride('tablet'));
  forceDesktopBtn.addEventListener('click', () => setTabletModeOverride('desktop'));
}
