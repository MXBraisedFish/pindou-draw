import { elements } from './elements.js';
import { state } from './state.js';
import { redrawCanvas, saveHistory } from './canvas.js';
import { getUsedColors } from './color-usage-cache.js';
import { TEXT } from './language.js';

class CanvasHighlightManager {
  constructor() {
    this.selectedColors = new Set();
    this.usedColors = [];
    this.filterText = '';
    this.isInitialized = false;
    this.isWindowOpen = false;
    this.lastActiveElement = null;
    this.boundHandleGridUpdated = this.handleGridUpdated.bind(this);
    this.boundHandleKeydown = this.handleGlobalKeydown.bind(this);
    this.renderJob = null;
    this.filterDebounceTimer = null;
  }

  initialize() {
    if (this.isInitialized) return;

    this.windowEl = elements.canvasHighlightWindow;
    this.closeBtn = elements.canvasHighlightCloseBtn;
    this.openBtn = elements.canvasHighlightBtn;
    this.listEl = elements.canvasHighlightList;
    this.filterInput = elements.canvasHighlightFilter;
    this.selectAllBtn = elements.canvasHighlightSelectAllBtn;
    this.deselectAllBtn = elements.canvasHighlightDeselectAllBtn;
    this.replaceSelect = elements.canvasHighlightReplaceSelect;
    this.replaceBtn = elements.canvasHighlightApplyReplaceBtn;
    this.messageEl = elements.canvasHighlightMessage;

    if (!this.windowEl || !this.openBtn || !this.listEl) return;

    this.bindEvents();
    this.refreshPaletteOptions();
    this.updateUsedColors({ silent: true });
    this.isInitialized = true;
  }

  bindEvents() {
    this.openBtn?.addEventListener('click', () => this.toggleWindow(true));
    this.closeBtn?.addEventListener('click', () => this.toggleWindow(false));
    this.windowEl?.addEventListener('click', (event) => {
      if (event.target === this.windowEl) this.toggleWindow(false);
    });

    this.listEl?.addEventListener('click', (event) => {
      const item = event.target.closest('.highlight-color-item');
      if (!item) return;
      const { code } = item.dataset;
      if (code) this.toggleColorSelection(code);
    });

    this.filterInput?.addEventListener('input', (event) => {
      this.filterColors(event.target.value);
    });

    this.selectAllBtn?.addEventListener('click', () => this.selectAllColors());
    this.deselectAllBtn?.addEventListener('click', () => this.deselectAllColors());
    this.replaceBtn?.addEventListener('click', () => this.handleReplaceAction());

    document.addEventListener('grid:updated', this.boundHandleGridUpdated);
  }

  toggleWindow(visible) {
    if (!this.windowEl) return;
    const show = Boolean(visible);
    if (show === this.isWindowOpen) return;

    if (show) {
      this.lastActiveElement = document.activeElement;
      this.windowEl.classList.add('is-visible');
      this.windowEl.setAttribute('aria-hidden', 'false');
      this.refreshPaletteOptions();
      this.updateUsedColors();
      window.requestAnimationFrame(() => {
        this.filterInput?.focus();
      });
      document.addEventListener('keydown', this.boundHandleKeydown);
    } else {
      this.windowEl.classList.remove('is-visible');
      this.windowEl.setAttribute('aria-hidden', 'true');
      this.cancelPendingRender();
      this.clearFilterDebounce();
      document.removeEventListener('keydown', this.boundHandleKeydown);
      if (this.lastActiveElement?.focus) {
        this.lastActiveElement.focus();
      }
    }

    this.isWindowOpen = show;
  }

  handleGlobalKeydown(event) {
    if (!this.isWindowOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.toggleWindow(false);
    }
  }

  handleGridUpdated() {
    if (!this.isInitialized) return;
    this.updateUsedColors({ silent: true });
  }

  collectUsedColors() {
    return getUsedColors();
  }

  updateUsedColors(options = {}) {
    const { silent = false } = options;
    if (this.isWindowOpen) {
      this.refreshPaletteOptions();
    }
    const colors = this.collectUsedColors();
    this.usedColors = colors;

    const availableCodes = new Set(colors.map((color) => color.code));
    let selectionChanged = false;

    this.selectedColors.forEach((code) => {
      if (!availableCodes.has(code)) {
        this.selectedColors.delete(code);
        selectionChanged = true;
      }
    });

    this.clearFilterDebounce();
    this.renderColorList();

    if (selectionChanged) {
      this.notifySelectionChanged();
    } else if (!silent) {
      this.notifyOverlayUpdated();
    }

    return colors;
  }

  renderColorList(filterText = this.filterText) {
    if (!this.listEl) return;

    const normalized = typeof filterText === 'string' ? filterText.trim().toLowerCase() : '';
    this.filterText = normalized;

    const filtered = normalized
      ? this.usedColors.filter((color) => color.code.toLowerCase().includes(normalized))
      : this.usedColors;

    this.cancelPendingRender();

    if (!filtered.length) {
      this.listEl.innerHTML = `<div class="highlight-color-empty">${TEXT.canvasHighlight.empty}</div>`;
      return;
    }

    this.listEl.innerHTML = '';

    let index = 0;
    const chunkSize = 160;
    const renderChunk = () => {
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + chunkSize, filtered.length);
      for (; index < end; index += 1) {
        const color = filtered[index];
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

      this.listEl.appendChild(fragment);

      if (index < filtered.length && typeof window !== 'undefined') {
        this.renderJob = window.requestAnimationFrame(renderChunk);
      } else {
        this.renderJob = null;
      }
    };

    renderChunk();
  }

  filterColors(text) {
    this.filterText = typeof text === 'string' ? text : '';
    this.clearFilterDebounce();
    if (typeof window === 'undefined') {
      this.renderColorList(this.filterText);
      return;
    }
    this.filterDebounceTimer = window.setTimeout(() => {
      this.renderColorList(this.filterText);
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
  toggleColorSelection(colorCode) {
    if (!colorCode) return;

    if (this.selectedColors.has(colorCode)) {
      this.selectedColors.delete(colorCode);
    } else {
      this.selectedColors.add(colorCode);
    }

    this.renderColorList();
    this.notifySelectionChanged();
  }

  selectAllColors() {
    this.usedColors.forEach((color) => {
      this.selectedColors.add(color.code);
    });
    this.renderColorList();
    this.notifySelectionChanged();
  }

  deselectAllColors() {
    if (this.selectedColors.size === 0) return;
    this.selectedColors.clear();
    this.renderColorList();
    this.notifySelectionChanged();
  }

  handleReplaceAction() {
    const targetCode = this.replaceSelect?.value?.trim();
    if (!targetCode) {
      this.showMessage(TEXT.canvasHighlight.messages.chooseTarget, 'error');
      return;
    }

    if (this.selectedColors.size === 0) {
      this.showMessage(TEXT.canvasHighlight.messages.chooseSource, 'error');
      return;
    }

    const targetEntry = state.palette[targetCode];
    if (!targetEntry) {
      this.showMessage(TEXT.canvasHighlight.messages.missingTarget, 'error');
      return;
    }

    const replaced = this.replaceHighlightedColors(targetEntry);
    if (replaced === 0) {
      this.showMessage(TEXT.canvasHighlight.messages.noPixels, 'info');
      return;
    }

    this.selectedColors = new Set([targetEntry.code]);
    redrawCanvas();
    saveHistory();
    this.updateUsedColors();
    this.notifySelectionChanged();
    this.showMessage(TEXT.canvasHighlight.messages.replaced(replaced, targetEntry.code), 'info');
  }

  replaceHighlightedColors(targetEntry) {
    if (!targetEntry) return 0;

    let changes = 0;
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const cell = state.grid[y]?.[x];
        if (!cell || !this.selectedColors.has(cell.code)) continue;
        if (cell.code === targetEntry.code) continue;
        state.grid[y][x] = targetEntry;
        changes += 1;
      }
    }

    return changes;
  }

  refreshPaletteOptions() {
    if (!this.replaceSelect) return;

    const previousValue = this.replaceSelect.value;
    this.replaceSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = TEXT.canvasHighlight.replacePlaceholder;
    placeholder.disabled = true;
    placeholder.selected = true;
    this.replaceSelect.appendChild(placeholder);

    state.paletteKeys.forEach((code) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = code;
      if (state.palette[code]?.color) {
        option.style.background = state.palette[code].color;
      }
      this.replaceSelect.appendChild(option);
    });

    if (previousValue && state.palette[previousValue]) {
      this.replaceSelect.value = previousValue;
    }
  }

  notifySelectionChanged() {
    this.clearMessage();
    this.notifyOverlayUpdated();
  }

  notifyOverlayUpdated() {
    document.dispatchEvent(new CustomEvent('highlightOverlayUpdated'));
  }

  clearMessage() {
    if (!this.messageEl) return;
    this.messageEl.textContent = '';
    this.messageEl.className = 'highlight-message';
  }

  showMessage(text, type = 'info') {
    if (!this.messageEl) return;
    this.messageEl.textContent = text ?? '';
    const modifier = type === 'error' ? 'error' : 'info';
    this.messageEl.className = `highlight-message ${modifier}`;
  }

  getSelectedColors() {
    return this.selectedColors;
  }

  hasHighlight() {
    return this.selectedColors.size > 0;
  }

  shouldRenderHighlight() {
    return this.hasHighlight() && state.width > 0 && state.height > 0;
  }
}

export const canvasHighlightManager = new CanvasHighlightManager();

export function initializeCanvasHighlight() {
  canvasHighlightManager.initialize();
}
