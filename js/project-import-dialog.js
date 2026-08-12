import { elements } from './elements.js';

const DIRECTIONS = ['top', 'right', 'bottom', 'left'];

function ensureProjectImportStyles() {
  if (document.querySelector('link[data-project-import-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/project-import.css';
  link.dataset.projectImportStyle = 'true';
  document.head.appendChild(link);
}

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'class') {
      el.className = value;
      return;
    }
    if (key === 'text') {
      el.textContent = value;
      return;
    }
    el.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === undefined || child === null) return;
    el.appendChild(child);
  });
  return el;
}

function buildOverview() {
  const root = createElement('div', { class: 'project-import-overview' }, [
    createOverviewItem('文件', createElement('strong', { id: 'projectImportFileName', text: '--' })),
    createOverviewItem('画布尺寸', createElement('strong', { id: 'projectImportCanvasSize', text: '--' })),
    createOverviewItem('色卡', createElement('div', { class: 'overview-value' }, [
      createElement('strong', { id: 'projectImportPaletteLabel', text: '--' }),
      createElement('span', { id: 'projectImportPaletteBadge', class: 'project-import-badge' })
    ]))
  ]);
  return root;
}

function createOverviewItem(label, valueNode) {
  return createElement('div', { class: 'overview-item' }, [
    createElement('span', { class: 'overview-label', text: label }),
    valueNode
  ]);
}

function buildModeGrid() {
  const grid = createElement('div', { class: 'project-import-mode-grid' });
  const modes = [
    { key: 'new', title: '新建画布', tag: '覆盖', desc: '创建与 .pd 相同尺寸的新画布，可选择如何处理色卡。' },
    { key: 'extend', title: '拓展画布', tag: '追加', desc: '保留当前作品，将 .pd 内容衔接到画布的指定方向。' }
  ];
  modes.forEach((mode) => {
    const button = createElement('button', {
      class: 'project-import-mode',
      type: 'button',
      'data-import-mode': mode.key
    }, [
      createElement('div', {}, [
        createElement('span', { class: 'mode-title', text: mode.title }),
        createElement('span', { class: 'mode-tag', text: mode.tag })
      ]),
      createElement('p', { text: mode.desc })
    ]);
    grid.appendChild(button);
  });
  return grid;
}

function buildPaletteOptions() {
  const section = createElement('section', { class: 'project-import-option', id: 'projectImportNewOptions' });
  const header = createElement('header', { class: 'project-import-option__header' }, [
    createElement('h3', { text: '新建画布' }),
    createElement('p', { class: 'project-import-hint-text', id: 'projectImportNewSummary' })
  ]);
  const notice = createElement('div', { id: 'projectImportPaletteNotice', class: 'project-import-hint' });
  const radios = createElement('div', { class: 'project-import-radio-group', id: 'projectImportPaletteRadios' });

  const radioPd = createRadioOption('pd', '使用 .pd 文件色卡', '画布将切换为该色卡，内容保持原色。', 'projectImportPaletteStrategy');
  radioPd.classList.add('project-import-radio--pd');
  const radioCurrent = createRadioOption('current', '使用当前色卡', '.pd 内容会转换为当前色卡内最接近的颜色。', 'projectImportPaletteStrategy');
  radioCurrent.classList.add('project-import-radio--current');

  radios.append(radioPd, radioCurrent);
  const hint = createElement('p', { id: 'projectImportNewOnlyHint', class: 'project-import-hint-text' });
  section.append(header, notice, radios, hint);
  return section;
}

function createRadioOption(value, title, desc, name) {
  const label = createElement('label', { class: 'project-import-radio' });
  const input = createElement('input', { type: 'radio', name, value });
  const body = createElement('div', {}, [
    createElement('strong', { text: title }),
    createElement('p', { text: desc })
  ]);
  label.append(input, body);
  return label;
}

function buildExtendOptions() {
  const section = createElement('section', { class: 'project-import-option', id: 'projectImportExtendOptions' });
  const header = createElement('header', { class: 'project-import-option__header' }, [
    createElement('h3', { text: '拓展画布' }),
    createElement('p', { class: 'project-import-hint-text', id: 'projectImportExtendSummary' })
  ]);
  const grid = createElement('div', { class: 'project-import-direction-grid' });
  DIRECTIONS.forEach((dir) => {
    const btn = createElement('button', {
      type: 'button',
      class: 'project-import-direction',
      'data-extend-direction': dir
    }, [
      createElement('span', { class: 'direction-label', text: directionLabel(dir) }),
      createElement('span', { class: 'direction-size', 'data-direction-size': dir, text: '--' })
    ]);
    grid.appendChild(btn);
  });
  const hint = createElement('div', { id: 'projectImportExtendPaletteAlert', class: 'panel-notice project-import-hint' });
  section.append(header, grid, hint);
  return section;
}

function directionLabel(dir) {
  switch (dir) {
    case 'top': return '向上';
    case 'right': return '向右';
    case 'bottom': return '向下';
    case 'left': return '向左';
    default: return dir;
  }
}

function buildOverlay() {
  ensureProjectImportStyles();
  const overlay = createElement('div', {
    id: 'projectImportOverlay',
    class: 'overlay',
    'aria-hidden': 'true',
    'data-shortcuts-ignore': 'true'
  });

  const dialog = createElement('div', { class: 'overlay__dialog project-import-dialog' });
  const header = createElement('header', { class: 'overlay__header' }, [
    createElement('h2', { text: '.pd 导入设置' }),
    createElement('button', { id: 'projectImportCloseBtn', type: 'button', 'aria-label': '关闭 .pd 导入设置', text: '×' })
  ]);
  const body = createElement('div', { class: 'overlay__body project-import-body' });
  body.append(
    buildOverview(),
    createElement('div', { id: 'projectImportNotice', class: 'panel-notice project-import-notice' }),
    buildModeGrid(),
    buildPaletteOptions(),
    buildExtendOptions()
  );

  const footer = createElement('footer', { class: 'overlay__footer project-import-footer' }, [
    createElement('div', { id: 'projectImportFooterHint', class: 'project-import-footer-hint' }),
    createElement('div', { class: 'project-import-actions' }, [
      createElement('button', { id: 'projectImportCancelBtn', type: 'button', class: 'ghost-button', text: '取消' }),
      createElement('button', { id: 'projectImportConfirmBtn', type: 'button', class: 'primary-button', text: '开始导入' })
    ])
  ]);

  dialog.append(header, body, footer);
  overlay.append(dialog);
  document.body.appendChild(overlay);
  return overlay;
}

class ProjectImportDialog {
  constructor() {
    this.overlay = null;
    this.state = {
      mode: 'new',
      paletteStrategy: 'pd',
      extendDirection: 'right'
    };
    this.resolve = null;
    this.context = null;
    this.boundKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.handleCancel();
      }
    };
    this.build();
  }

  build() {
    this.overlay = buildOverlay();
    elements.projectImportOverlay = this.overlay;
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.fileNameEl = this.overlay.querySelector('#projectImportFileName');
    this.canvasSizeEl = this.overlay.querySelector('#projectImportCanvasSize');
    this.paletteLabelEl = this.overlay.querySelector('#projectImportPaletteLabel');
    this.paletteBadgeEl = this.overlay.querySelector('#projectImportPaletteBadge');
    this.noticeEl = this.overlay.querySelector('#projectImportNotice');
    this.modeButtons = Array.from(this.overlay.querySelectorAll('[data-import-mode]'));
    this.paletteRadios = Array.from(this.overlay.querySelectorAll('input[name="projectImportPaletteStrategy"]'));
    this.paletteSection = this.overlay.querySelector('#projectImportNewOptions');
    this.paletteSummaryEl = this.overlay.querySelector('#projectImportNewSummary');
    this.paletteNoticeEl = this.overlay.querySelector('#projectImportPaletteNotice');
    this.paletteHintEl = this.overlay.querySelector('#projectImportNewOnlyHint');
    this.extendSection = this.overlay.querySelector('#projectImportExtendOptions');
    this.extendSummaryEl = this.overlay.querySelector('#projectImportExtendSummary');
    this.extendButtons = Array.from(this.overlay.querySelectorAll('[data-extend-direction]'));
    this.extendInfoEl = this.overlay.querySelector('#projectImportExtendPaletteAlert');
    this.footerHintEl = this.overlay.querySelector('#projectImportFooterHint');
    this.closeBtn = this.overlay.querySelector('#projectImportCloseBtn');
    this.cancelBtn = this.overlay.querySelector('#projectImportCancelBtn');
    this.confirmBtn = this.overlay.querySelector('#projectImportConfirmBtn');
    elements.projectImportConfirmBtn = this.confirmBtn;
    elements.projectImportCancelBtn = this.cancelBtn;
  }

  bindEvents() {
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.handleCancel();
      }
    });
    this.closeBtn.addEventListener('click', () => this.handleCancel());
    this.cancelBtn.addEventListener('click', () => this.handleCancel());
    this.confirmBtn.addEventListener('click', () => this.handleConfirm());
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.importMode));
    });
    this.extendButtons.forEach((btn) => {
      btn.addEventListener('click', () => this.handleDirectionChange(btn.dataset.extendDirection));
    });
    this.paletteRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          this.state.paletteStrategy = radio.value;
          this.updateFooterHint();
        }
      });
    });
  }

  open(context) {
    this.context = context;
    this.state.mode = context.defaultMode ?? 'new';
    const pdAvailable = context.palette.hasFilePalette && context.palette.hasLibraryMatch;
    this.state.paletteStrategy = context.defaultPaletteStrategy ?? (pdAvailable ? 'pd' : 'current');
    this.state.extendDirection = context.defaultDirection ?? 'right';
    this.refreshUI();
    this.overlay.classList.add('is-visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this.boundKeyHandler, true);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  close(result = null) {
    this.overlay.classList.remove('is-visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.boundKeyHandler, true);
    const resolver = this.resolve;
    this.resolve = null;
    if (resolver) resolver(result);
  }

  refreshUI() {
    const { fileName, importSize, palette, extend } = this.context;
    const pdAvailable = palette.hasFilePalette && palette.hasLibraryMatch;
    if (!pdAvailable && this.state.paletteStrategy === 'pd') {
      this.state.paletteStrategy = 'current';
    }
    this.fileNameEl.textContent = fileName || '--';
    this.canvasSizeEl.textContent = `${importSize.width} × ${importSize.height}`;
    this.paletteLabelEl.textContent = palette.label || '未识别';
    this.paletteBadgeEl.textContent = palette.sameAsCurrent ? '当前色卡' : (pdAvailable ? '文件色卡' : '未附带');
    this.paletteBadgeEl.style.display = palette.hasFilePalette ? 'inline-flex' : 'none';
    this.noticeEl.textContent = palette.sameAsCurrent
      ? '检测到 .pd 使用的色卡与当前画布一致，可直接导入。'
      : pdAvailable
        ? '可以沿用 .pd 提供的色卡，或将内容转换为当前色卡。'
        : '该文件未携带色卡信息或本地不存在该色卡，将尝试匹配当前色卡。';

    this.modeButtons.forEach((btn) => {
      const isActive = btn.dataset.importMode === this.state.mode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (btn.dataset.importMode === 'extend') {
        const disabled = !extend.available;
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        btn.classList.toggle('is-disabled', disabled);
        btn.disabled = disabled;
      }
    });

    this.setSectionVisibility(this.paletteSection, this.state.mode === 'new');
    this.setSectionVisibility(this.extendSection, this.state.mode === 'extend');

    const hasPdPalette = pdAvailable;
    const pdOption = this.overlay.querySelector('.project-import-radio--pd');
    if (pdOption) {
      pdOption.style.display = hasPdPalette ? '' : 'none';
      pdOption.classList.toggle('is-disabled', !hasPdPalette);
    }
    this.paletteNoticeEl.textContent = hasPdPalette
      ? '选择导入后画布使用的色卡策略。'
      : '文件色卡本地不存在，将使用当前色卡进行匹配。';
    this.paletteSummaryEl.textContent = palette.sameAsCurrent
      ? '当前色卡与文件一致。'
      : hasPdPalette
        ? '可在导入时切换或保留色卡。'
        : '只能使用当前色卡。';
    this.paletteHintEl.textContent = palette.hasLibraryMatch
      ? '已识别为内置色卡，可直接切换。'
      : '';

    this.paletteRadios.forEach((radio) => {
      if (radio.value === 'pd' && !hasPdPalette) {
        radio.checked = false;
        radio.disabled = true;
        return;
      }
      radio.disabled = false;
      radio.checked = radio.value === this.state.paletteStrategy;
    });

    this.extendButtons.forEach((btn) => {
      const dir = btn.dataset.extendDirection;
      const info = extend.directions[dir] || { valid: false, reason: '不可用' };
      const sizeLabel = btn.querySelector(`[data-direction-size="${dir}"]`);
      if (sizeLabel) {
        sizeLabel.textContent = info.valid ? `${info.width} × ${info.height}` : info.reason || '不可用';
      }
      const disabled = !info.valid;
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      btn.classList.toggle('is-active', dir === this.state.extendDirection && !disabled);
      btn.disabled = disabled;
    });

    this.extendSummaryEl.textContent = extend.available
      ? '选择将 .pd 内容追加到画布的方向。'
      : '当前尺寸无法拓展，建议改为新建画布。';
    this.extendInfoEl.textContent = palette.sameAsCurrent
      ? '色卡一致，可直接将像素追加到指定方向。'
      : '色卡不同，拓展时会自动转换为当前色卡中最接近的颜色。';

    this.updateFooterHint();
  }

  setMode(mode) {
    if (!mode) return;
    if (mode === 'extend' && !this.context.extend.available) return;
    this.state.mode = mode;
    if (mode === 'extend') {
      const validDir = DIRECTIONS.find((dir) => this.context.extend.directions[dir]?.valid);
      if (validDir) {
        this.state.extendDirection = validDir;
      }
    }
    if (mode === 'new' && this.state.paletteStrategy === 'pd' && !this.context.palette.hasFilePalette) {
      this.state.paletteStrategy = 'current';
    }
    this.refreshUI();
  }

  handleDirectionChange(direction) {
    if (!direction) return;
    const info = this.context.extend.directions[direction];
    if (!info?.valid) return;
    this.state.extendDirection = direction;
    this.updateFooterHint();
    this.extendButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.extendDirection === direction);
    });
  }

  setSectionVisibility(section, visible) {
    if (!section) return;
    section.hidden = !visible;
    section.classList.toggle('is-hidden', !visible);
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  updateFooterHint() {
    const { mode, paletteStrategy, extendDirection } = this.state;
    const paletteText = paletteStrategy === 'pd' ? '使用 .pd 色卡' : '转换为当前色卡';
    const modeText = mode === 'new'
      ? `新建画布（${paletteText}）`
      : `拓展画布（方向：${directionLabel(extendDirection)}）`;
    this.footerHintEl.textContent = modeText;
    this.confirmBtn.textContent = mode === 'new' ? '开始导入' : '拓展画布';
    const disabled = mode === 'extend' && !this.context.extend.available;
    this.confirmBtn.disabled = disabled;
  }

  handleConfirm() {
    const { mode, paletteStrategy, extendDirection } = this.state;
    if (mode === 'extend' && !this.context.extend.directions[extendDirection]?.valid) {
      return;
    }
    this.close({
      mode,
      paletteStrategy,
      extendDirection
    });
  }

  handleCancel() {
    this.close(null);
  }
}

const dialog = new ProjectImportDialog();

export function requestProjectImportDecision(context) {
  return dialog.open(context);
}
