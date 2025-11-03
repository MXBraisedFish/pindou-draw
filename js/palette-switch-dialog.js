import { elements } from './elements.js';

const confirmMessages = {
  convert: '转换色卡后可能导致颜色信息丢失，确定要转换吗？',
  reset: '新建画布会导致所有绘制的内容丢失，确定要新建画布吗？'
};

class PaletteSwitchDialog {
  constructor() {
    this.overlay = elements.paletteSwitchOverlay;
    this.closeBtn = elements.paletteSwitchCloseBtn;
    this.cancelBtn = elements.paletteSwitchCancelBtn;
    this.convertBtn = elements.paletteSwitchConvertBtn;
    this.resetBtn = elements.paletteSwitchResetBtn;
    this.nameEl = elements.paletteSwitchName;
    this.resolve = null;
    this.previousActiveElement = null;

    if (!this.overlay) return;

    this.handleOverlayClick = this.handleOverlayClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleConvert = this.handleConvert.bind(this);
    this.handleReset = this.handleReset.bind(this);

    this.overlay.addEventListener('click', this.handleOverlayClick);
    this.closeBtn?.addEventListener('click', this.handleCancel);
    this.cancelBtn?.addEventListener('click', this.handleCancel);
    this.convertBtn?.addEventListener('click', this.handleConvert);
    this.resetBtn?.addEventListener('click', this.handleReset);
  }

  open(options = {}) {
    if (!this.overlay) {
      return Promise.resolve('cancel');
    }

    const { paletteName = '目标色卡', hasDrawing = false } = options;

    this.nameEl && (this.nameEl.textContent = paletteName);

    if (this.convertBtn) {
      this.convertBtn.disabled = !hasDrawing;
      this.convertBtn.setAttribute('aria-disabled', hasDrawing ? 'false' : 'true');
      this.convertBtn.title = hasDrawing ? '' : '当前画布没有可转换的颜色';
    }

    this.overlay.classList.add('is-visible');
    this.overlay.setAttribute('aria-hidden', 'false');

    this.previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTarget = hasDrawing ? this.convertBtn : this.resetBtn;
    focusTarget?.focus();

    document.addEventListener('keydown', this.handleKeydown, true);

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  close(result = 'cancel') {
    if (!this.overlay) return;

    this.overlay.classList.remove('is-visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.handleKeydown, true);

    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
    const resolver = this.resolve;
    this.resolve = null;
    this.previousActiveElement = null;

    if (resolver) resolver(result);
  }

  handleOverlayClick(event) {
    if (event.target === this.overlay) {
      this.handleCancel();
    }
  }

  handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handleCancel();
    }
  }

  handleCancel() {
    this.close('cancel');
  }

  handleConvert() {
    if (this.convertBtn?.disabled) return;
    if (window.confirm(confirmMessages.convert)) {
      this.close('convert');
    }
  }

  handleReset() {
    if (window.confirm(confirmMessages.reset)) {
      this.close('new');
    }
  }
}

const dialog = new PaletteSwitchDialog();

export function requestPaletteSwitchDecision(options) {
  return dialog.open(options);
}
