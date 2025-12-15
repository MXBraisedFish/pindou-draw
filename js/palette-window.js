import { elements } from './elements.js';
import { state } from './state.js';
import { registerFloatingWindow } from './floating-window-stack.js';
import { computeRightToolbarAnchor } from './toolbar-anchor.js';

const EDGE_MARGIN = 16;
const DEFAULT_MIN_WIDTH = 280;
const DEFAULT_MIN_HEIGHT = 460;
const DEFAULT_MAX_HEIGHT = 750;

class PaletteWindowController {
  constructor() {
    this.windowEl = elements.paletteWindow;
    this.headerEl = elements.paletteWindowHeader;
    this.resizerEl = elements.paletteWindowResizer;
    this.toggleBtn = elements.paletteWindowToggleBtn;
    this.closeBtn = elements.paletteWindowCloseBtn;
    this.isVisible = false;
    this.position = null;
    this.dimensions = null;
    this.interaction = null;
    this.originalParent = null;
    this.originalNextSibling = null;
    this.tabletDockEl = null;
    this.minSize = {
      width: Number(this.windowEl?.dataset.minWidth) || DEFAULT_MIN_WIDTH,
      height: Number(this.windowEl?.dataset.minHeight) || DEFAULT_MIN_HEIGHT
    };
    this.maxSize = {
      width: Number(this.windowEl?.dataset.maxWidth) || 0,
      height: Number(this.windowEl?.dataset.maxHeight) || DEFAULT_MAX_HEIGHT
    };
    this.windowStackHandle = null;
    this.boundHandleResize = this.handleResize.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundTabletChange = this.handleTabletChange.bind(this);
  }

  init() {
    if (!this.windowEl || !this.toggleBtn) return;
    this.originalParent = this.windowEl.parentNode;
    this.originalNextSibling = this.windowEl.nextSibling;
    this.dimensions = this.measureInitialSize();
    const datasetMaxWidth = Number(this.windowEl?.dataset.maxWidth);
    if (Number.isFinite(datasetMaxWidth) && datasetMaxWidth > 0) {
      this.maxSize.width = datasetMaxWidth;
    } else if (!Number.isFinite(this.maxSize.width) || this.maxSize.width <= 0) {
      this.maxSize.width = this.dimensions.width;
    }
    const requestedMaxHeight = Number(this.windowEl?.dataset.maxHeight) || DEFAULT_MAX_HEIGHT;
    const baseMaxHeight = Math.max(requestedMaxHeight, this.dimensions.height);
    this.maxSize.height = Math.max(this.maxSize.height || 0, baseMaxHeight);
    this.position = this.computeInitialPosition();
    this.applyLayout();

    this.windowStackHandle = registerFloatingWindow(this.windowEl);

    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.closeBtn?.addEventListener('click', () => this.hide());
    this.headerEl?.addEventListener('pointerdown', (event) => this.startInteraction(event, 'move'));
    this.resizerEl?.addEventListener('pointerdown', (event) => this.startInteraction(event, 'resize'));
    window.addEventListener('resize', this.boundHandleResize);
    document.addEventListener('tablet:change', this.boundTabletChange);

    this.applyTabletDockState(Boolean(state.isTabletMode));
  }

  measureInitialSize() {
    if (!this.windowEl) {
      return { width: this.minSize.width, height: this.minSize.height };
    }
    let width = this.windowEl.offsetWidth;
    let height = this.windowEl.offsetHeight;
    let tempStylesApplied = false;
    const prevStyles = {
      display: this.windowEl.style.display,
      visibility: this.windowEl.style.visibility,
      pointerEvents: this.windowEl.style.pointerEvents
    };
    if ((!width || !height) && typeof window !== 'undefined') {
      tempStylesApplied = true;
      this.windowEl.style.visibility = 'hidden';
      this.windowEl.style.pointerEvents = 'none';
      this.windowEl.style.display = 'flex';
      const rect = this.windowEl.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      this.windowEl.style.display = prevStyles.display;
      this.windowEl.style.visibility = prevStyles.visibility;
      this.windowEl.style.pointerEvents = prevStyles.pointerEvents;
    }
    if ((!width || !height) && typeof window !== 'undefined' && !tempStylesApplied) {
      const computed = window.getComputedStyle(this.windowEl);
      width = parseFloat(computed.width) || width;
      height = parseFloat(computed.height) || height;
    }
    return {
      width: Math.max(this.minSize.width, width || this.minSize.width),
      height: Math.max(this.minSize.height, height || this.minSize.height)
    };
  }

  computeInitialPosition() {
    const width = this.dimensions?.width ?? this.windowEl.offsetWidth ?? 380;
    const anchored = computeRightToolbarAnchor(width, EDGE_MARGIN * 2);
    const fallbackX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN * 2);
    const x = Number.isFinite(anchored) ? anchored : fallbackX;
    const y = Math.max(EDGE_MARGIN * 2, Math.min(200, window.innerHeight - 520));
    return { x, y };
  }

  clampSize(width, height) {
    const maxViewportWidth = Math.max(this.minSize.width, window.innerWidth - EDGE_MARGIN * 2);
    const maxViewportHeight = Math.max(this.minSize.height, window.innerHeight - EDGE_MARGIN * 2);
    const maxWidth = Math.min(this.maxSize.width || maxViewportWidth, maxViewportWidth);
    const maxHeight = Math.min(this.maxSize.height || maxViewportHeight, maxViewportHeight);
    return {
      width: Math.min(Math.max(this.minSize.width, width), maxWidth),
      height: Math.min(Math.max(this.minSize.height, height), maxHeight)
    };
  }

  clampPosition(x, y) {
    const size = this.dimensions ?? this.measureInitialSize();
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - size.width - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, window.innerHeight - size.height - EDGE_MARGIN);
    return {
      x: Math.min(Math.max(EDGE_MARGIN, x), maxX),
      y: Math.min(Math.max(EDGE_MARGIN, y), maxY)
    };
  }

  applyLayout() {
    if (!this.position) return;
    if (state.isTabletMode) {
      return;
    }
    this.dimensions = this.clampSize(this.dimensions?.width ?? this.minSize.width, this.dimensions?.height ?? this.minSize.height);
    this.position = this.clampPosition(this.position.x, this.position.y);

    this.windowEl.style.width = `${Math.round(this.dimensions.width)}px`;
    this.windowEl.style.height = `${Math.round(this.dimensions.height)}px`;
    this.windowEl.style.left = `${Math.round(this.position.x)}px`;
    this.windowEl.style.top = `${Math.round(this.position.y)}px`;
    this.windowEl.style.right = 'auto';
    this.windowEl.style.bottom = 'auto';
  }

  handleResize() {
    if (!this.position) return;
    if (state.isTabletMode) {
      return;
    }
    this.applyLayout();
  }

  toggle() {
    this.isVisible ? this.hide() : this.show();
  }

  show() {
    if (this.isVisible) return;
    this.isVisible = true;
    if (state.isTabletMode) {
      this.applyTabletDockState(true);
      this.windowEl.classList.add('is-active');
      this.windowEl.classList.remove('is-visible');
    } else {
      this.windowEl.classList.add('is-visible');
      this.windowEl.classList.remove('is-active');
      this.applyLayout();
    }
    this.windowEl.setAttribute('aria-hidden', 'false');
    this.toggleBtn.classList.add('is-active');
    this.toggleBtn.setAttribute('aria-pressed', 'true');
    this.windowStackHandle?.bringToFront();
  }

  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.windowEl.classList.remove('is-visible', 'is-active');
    this.windowEl.setAttribute('aria-hidden', 'true');
    this.toggleBtn.classList.remove('is-active');
    this.toggleBtn.setAttribute('aria-pressed', 'false');
    this.stopInteraction();
  }

  startInteraction(event, mode) {
    if (state.isTabletMode) return;
    if (!this.isVisible || event.button !== 0) return;
    event.preventDefault();
    this.windowStackHandle?.bringToFront();
    const originPosition = this.position ?? this.computeInitialPosition();
    const originSize = this.dimensions ?? this.measureInitialSize();
    this.interaction = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originX: originPosition.x,
      originY: originPosition.y,
      originWidth: originSize.width,
      originHeight: originSize.height
    };

    const activeClass = mode === 'resize' ? 'is-resizing' : 'is-dragging';
    this.windowEl.classList.add(activeClass);
    window.addEventListener('pointermove', this.boundPointerMove, { passive: false });
    window.addEventListener('pointerup', this.boundPointerUp, { passive: false });
    window.addEventListener('pointercancel', this.boundPointerUp, { passive: false });
    event.stopPropagation();
  }

  handlePointerMove(event) {
    if (!this.interaction || event.pointerId !== this.interaction.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - this.interaction.startX;
    const deltaY = event.clientY - this.interaction.startY;

    if (this.interaction.mode === 'move') {
      const nextX = this.interaction.originX + deltaX;
      const nextY = this.interaction.originY + deltaY;
      this.position = this.clampPosition(nextX, nextY);
    } else {
      const nextWidth = this.interaction.originWidth + deltaX;
      const nextHeight = this.interaction.originHeight + deltaY;
      this.dimensions = this.clampSize(nextWidth, nextHeight);
      this.position = this.clampPosition(this.position?.x ?? this.interaction.originX, this.position?.y ?? this.interaction.originY);
    }
    this.applyLayout();
  }

  handlePointerUp(event) {
    if (!this.interaction || event.pointerId !== this.interaction.pointerId) return;
    this.stopInteraction();
  }

  stopInteraction() {
    if (!this.interaction) return;
    this.windowEl.classList.remove('is-dragging', 'is-resizing');
    this.interaction = null;
    window.removeEventListener('pointermove', this.boundPointerMove);
    window.removeEventListener('pointerup', this.boundPointerUp);
    window.removeEventListener('pointercancel', this.boundPointerUp);
  }

  handleTabletChange(event) {
    const enabled = Boolean(event?.detail?.enabled);
    this.applyTabletDockState(enabled);
    if (!enabled && this.isVisible) {
      this.position = this.computeInitialPosition();
      this.applyLayout();
    }
  }

  ensureTabletDock() {
    if (this.tabletDockEl && this.tabletDockEl.isConnected) return this.tabletDockEl;
    const rightStack = document.querySelector('.panel-stack.panel-stack-right');
    if (rightStack) {
      this.tabletDockEl = rightStack;
      return rightStack;
    }
    const dock = document.createElement('div');
    dock.id = 'tabletPaletteDock';
    dock.className = 'panel-stack panel-stack-right tablet-palette-dock';
    dock.setAttribute('aria-live', 'polite');
    document.body.appendChild(dock);
    this.tabletDockEl = dock;
    return dock;
  }

  applyTabletDockState(enabled) {
    if (!this.windowEl || !this.headerEl) return;
    if (enabled) {
      const dock = this.ensureTabletDock();
      if (dock && this.windowEl.parentNode !== dock) {
        dock.appendChild(this.windowEl);
      }
      this.windowEl.classList.add('tool-panel', 'tablet-palette-panel');
      this.windowEl.classList.remove('floating-window');
      this.windowEl.classList.remove('is-visible');
      this.windowEl.classList.toggle('is-active', this.isVisible);
      this.headerEl.classList.add('tool-panel__header');
      const body = this.windowEl.querySelector('.floating-window__body');
      body?.classList.add('tool-panel__body');
      if (this.resizerEl) this.resizerEl.style.display = 'none';
      this.windowEl.style.left = '';
      this.windowEl.style.top = '';
      this.windowEl.style.right = '';
      this.windowEl.style.bottom = '';
    } else {
      this.windowEl.classList.remove('tool-panel', 'tablet-palette-panel', 'is-active');
      this.windowEl.classList.add('floating-window');
      this.windowEl.classList.toggle('is-visible', this.isVisible);
      this.headerEl.classList.remove('tool-panel__header');
      const body = this.windowEl.querySelector('.floating-window__body');
      body?.classList.remove('tool-panel__body');
      if (this.resizerEl) this.resizerEl.style.display = '';
      if (this.originalParent) {
        this.originalParent.insertBefore(this.windowEl, this.originalNextSibling);
      }
    }
  }
}

let paletteWindowController = null;

export function initializePaletteWindow() {
  if (paletteWindowController) return paletteWindowController;
  paletteWindowController = new PaletteWindowController();
  paletteWindowController.init();
  return paletteWindowController;
}
