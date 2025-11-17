import { elements } from './elements.js';
import { state } from './state.js';
import { getUsedColors } from './color-usage-cache.js';
import { redrawCanvas, saveHistory } from './canvas.js';
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
    this.replaceBtn = null;
    this.replacementPanel = null;
    this.replacementCloseBtn = null;
    this.replacementConfirmBtn = null;
    this.replacementList = null;
    this.replacementFilterInput = null;
    this.replacementSourceCount = null;
    this.replacementTargetCount = null;
    this.replacementFilter = '';
    this.replacementTargets = new Set();
  }

  initialize() {
    if (this.isInitialized) return;

    this.windowEl = elements.canvasHighlightWindow;
    this.closeBtn = elements.canvasHighlightCloseBtn;
    this.openBtn = elements.canvasHighlightBtn;
    this.listRoot = elements.canvasHighlightList;
    this.listEl = this.listRoot?.querySelector('.highlight-list-content') ?? this.listRoot;
    this.filterInput = elements.canvasHighlightFilter;
    this.selectAllBtn = elements.canvasHighlightSelectAllBtn;
    this.deselectAllBtn = elements.canvasHighlightDeselectAllBtn;
    this.messageEl = elements.canvasHighlightMessage;
    this.replaceBtn = elements.canvasHighlightReplaceBtn;
    this.replacementPanel = elements.canvasHighlightReplacementPanel;
    this.replacementCloseBtn = elements.canvasHighlightReplacementCloseBtn;
    this.replacementConfirmBtn = elements.canvasHighlightReplacementConfirmBtn;
    this.replacementList = elements.canvasHighlightReplacementList;
    this.replacementFilterInput = elements.canvasHighlightReplacementFilter;
    this.replacementSourceCount = elements.canvasHighlightReplacementSourceCount;

    if (!this.windowEl || !this.openBtn || !this.listEl) return;

    this.bindEvents();
    this.updateUsedColors({ silent: true });
    this.isInitialized = true;
  }

  bindEvents() {
    this.openBtn?.addEventListener('click', () => this.toggleWindow(true));
    this.closeBtn?.addEventListener('click', () => this.toggleWindow(false));
    this.windowEl?.addEventListener('click', (event) => {
      if (event.target === this.windowEl) this.toggleWindow(false);
    });

    this.listRoot?.addEventListener('click', (event) => {
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
    this.replaceBtn?.addEventListener('click', () => this.openReplacementPanel());
    this.replacementCloseBtn?.addEventListener('click', () => this.toggleReplacementPanel(false));
    this.replacementConfirmBtn?.addEventListener('click', () => this.applyReplacement());
    this.replacementFilterInput?.addEventListener('input', (event) => {
      this.filterReplacementPalette(event?.target?.value ?? '');
    });
    this.replacementPanel?.addEventListener('click', (event) => {
      if (event.target === this.replacementPanel) this.toggleReplacementPanel(false);
    });

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
      this.toggleReplacementPanel(false);
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
    if (this.replacementPanel?.classList.contains('is-visible')) {
      this.renderReplacementPalette();
    }

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
      this.listEl.innerHTML = `<div class="highlight-empty">${TEXT.canvasHighlight.empty}</div>`;
      return;
    }

    this.listEl.innerHTML = '';
    const treatAsFullSelection = this.isFullSelection();

    let index = 0;
    const chunkSize = 160;
    const renderChunk = () => {
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + chunkSize, filtered.length);
      for (; index < end; index += 1) {
        const color = filtered[index];
        if (!color) continue;
      const isSelected = treatAsFullSelection || this.selectedColors.has(color.code);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'highlight-color-item';
        item.dataset.code = color.code;

        if (isSelected) {
          item.classList.add('is-selected');
        }
        item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        const countLabel = TEXT.highlight?.colorCount ? TEXT.highlight.colorCount(color.count) : String(color.count);
        item.innerHTML = `
          <div class="highlight-color-cell">
            <span class="highlight-color-swatch" style="background: ${color.color}"></span>
            <span class="highlight-color-checkbox" aria-hidden="true"></span>
          </div>
          <div class="highlight-color-code">${color.code}</div>
          <div class="highlight-color-count" title="${countLabel}">${color.count.toLocaleString()}</div>
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

  openReplacementPanel() {
    if (!this.hasSelectedColors()) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noSelection ?? '请先选中一个高亮颜色', 'error');
      return;
    }
    if (!state.paletteKeys.length) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noPalette ?? '请先加载色卡再进行替换', 'error');
      return;
    }
    this.replacementFilter = '';
    if (this.replacementFilterInput) {
      this.replacementFilterInput.value = '';
    }
    this.replacementTargets.clear();
    this.toggleReplacementPanel(true);
  }

  toggleReplacementPanel(visible) {
    if (!this.replacementPanel) return;
    const show = Boolean(visible);
    this.replacementPanel.classList.toggle('is-visible', show);
    this.replacementPanel.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
      this.renderReplacementPalette();
      this.updateReplacementCounts();
      this.replacementFilterInput?.focus();
      return;
    }
    this.replacementTargets.clear();
    this.replacementFilter = '';
    if (this.replacementFilterInput) {
      this.replacementFilterInput.value = '';
    }
    this.renderReplacementPalette();
    this.updateReplacementCounts();
  }

  filterReplacementPalette(text) {
    this.replacementFilter = String(text ?? '').trim();
    if (this.replacementPanel?.classList.contains('is-visible')) {
      this.renderReplacementPalette();
    }
  }

  renderReplacementPalette() {
    if (!this.replacementList) return;
    const filter = (this.replacementFilter ?? '').toLowerCase();
    const entries = [];
    for (const code of state.paletteKeys) {
      const entry = state.palette[code];
      if (!entry || this.selectedColors.has(code)) continue;
      if (filter && !this.matchesReplacementEntry(entry, filter)) continue;
      entries.push(entry);
    }
    this.replacementList.innerHTML = '';
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'highlight-window__replacement-empty';
      empty.textContent = TEXT.canvasHighlight?.replace?.empty ?? '当前无可用于替换的颜色';
      this.replacementList.appendChild(empty);
      this.updateReplacementCounts();
      return;
    }
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'highlight-window__replacement-item';
      const selected = this.replacementTargets.has(entry.code);
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', selected ? 'true' : 'false');
      item.dataset.code = entry.code;
      item.addEventListener('click', (event) => {
        event.preventDefault();
        this.toggleReplacementTarget(entry.code);
      });
      const swatch = document.createElement('span');
      swatch.className = 'highlight-window__replacement-swatch';
      swatch.style.background = entry.color ?? entry.color1 ?? 'transparent';
      const codeEl = document.createElement('span');
      codeEl.className = 'highlight-window__replacement-code';
      codeEl.textContent = entry.code;
      item.appendChild(swatch);
      item.appendChild(codeEl);
      fragment.appendChild(item);
    });
    this.replacementList.appendChild(fragment);
    this.updateReplacementCounts();
  }

  matchesReplacementEntry(entry, filter) {
    if (!entry) return false;
    const lowercase = (value) => String(value ?? '').toLowerCase();
    const targets = [
      lowercase(entry.code),
      lowercase(entry.label),
      lowercase(entry.color),
      lowercase(entry.color1),
      lowercase(entry.color2)
    ];
    return targets.some((value) => value.includes(filter));
  }

  toggleReplacementTarget(code) {
    if (!code) return;
    if (this.replacementTargets.has(code)) {
      this.replacementTargets.delete(code);
    } else {
      this.replacementTargets.add(code);
    }
    this.renderReplacementPalette();
  }

  updateReplacementCounts() {
    if (this.replacementSourceCount) {
      const sourceText = TEXT.canvasHighlight?.replace?.sourceCount?.(this.selectedColors.size)
        ?? `已选 ${this.selectedColors.size} 个高亮颜色`;
      this.replacementSourceCount.textContent = sourceText;
    }
    if (this.replacementTargetCount) {
      const targetText = TEXT.canvasHighlight?.replace?.targetCount?.(this.replacementTargets.size)
        ?? `已选 ${this.replacementTargets.size} 个替换颜色`;
      this.replacementTargetCount.textContent = targetText;
    }
  }

  applyReplacement() {
    if (!this.selectedColors.size) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noSelection ?? '请先选中一个高亮颜色', 'error');
      return;
    }
    if (!this.replacementTargets.size) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noTargets ?? '请先选中一个替换颜色', 'error');
      return;
    }
    const mapping = this.buildReplacementMap();
    if (!mapping.size) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noChange ?? '所选颜色已与替换颜色一致，无需替换', 'info');
      return;
    }
    const replaced = this.replaceMappedColors(mapping);
    if (!replaced) {
      this.showMessage(TEXT.canvasHighlight?.replace?.noChange ?? '所选颜色已与替换颜色一致，无需替换', 'info');
      return;
    }
    redrawCanvas();
    saveHistory();
    const nextSelection = new Set();
    mapping.forEach((entry) => {
      if (entry?.code) {
        nextSelection.add(entry.code);
      }
    });
    this.selectedColors = nextSelection;
    this.replacementTargets.clear();
    this.replacementFilter = '';
    if (this.replacementFilterInput) {
      this.replacementFilterInput.value = '';
    }
    this.updateUsedColors();
    this.notifySelectionChanged();
    this.toggleReplacementPanel(false);
    const successText = TEXT.canvasHighlight?.replace?.success?.(replaced) ?? `已替换 ${replaced} 个像素`;
    this.showMessage(successText, 'info');
  }

  buildReplacementMap() {
    const targets = Array.from(this.replacementTargets);
    if (!targets.length) return new Map();
    const result = new Map();
    const sources = Array.from(this.selectedColors);
    let index = 0;
    for (const code of sources) {
      if (!code) continue;
      const targetCode = targets[index % targets.length];
      index += 1;
      if (!targetCode || targetCode === code) continue;
      const entry = state.palette[targetCode];
      if (entry) {
        result.set(code, entry);
      }
    }
    return result;
  }

  replaceMappedColors(mapping) {
    if (!mapping.size) return 0;
    let replaced = 0;
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const cell = state.grid[y]?.[x];
        if (!cell) continue;
        const target = mapping.get(cell.code);
        if (!target) continue;
        if (cell.code === target.code) continue;
        state.grid[y][x] = target;
        replaced += 1;
      }
    }
    return replaced;
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

  hasSelectedColors() {
    return this.selectedColors.size > 0;
  }

  hasHighlight() {
    return this.selectedColors.size > 0 && !this.isFullSelection();
  }

  shouldRenderHighlight() {
    return this.hasHighlight() && state.width > 0 && state.height > 0;
  }

  isFullSelection() {
    return this.usedColors.length > 0 && this.selectedColors.size >= this.usedColors.length;
  }
}

export const canvasHighlightManager = new CanvasHighlightManager();

export function initializeCanvasHighlight() {
  canvasHighlightManager.initialize();
}

export function openCanvasHighlightWindow() {
  canvasHighlightManager.toggleWindow(true);
}
