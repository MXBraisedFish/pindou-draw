
const state = {
  colors: [],
  editingColor: null,
  activeColor: null,
  paletteName: '拼豆色卡',
  pendingExport: null,
  preview: {
    ctx: null,
    grid: [],
    mode: 'standard',
    isDrawing: false,
    cols: 64,
    rows: 40,
  }
};


const COLOR_TYPE_LABELS = {
  normal: '普通',
  pearlescent: '珠光',
  light: '光变',
  temperatrue: '温变',
  transparent: '透明',
  glow: '夜光'
};


const DUAL_COLOR_TYPES = new Set(['light', 'temperatrue']);


const elements = {

  colorForm: document.getElementById('colorForm'),
  colorType: document.getElementById('colorType'),
  colorNum: document.getElementById('colorNum'),
  primaryColorPicker: document.getElementById('primaryColorPicker'),
  primaryColorR: document.getElementById('primaryColorR'),
  primaryColorG: document.getElementById('primaryColorG'),
  primaryColorB: document.getElementById('primaryColorB'),
  primaryColorA: document.getElementById('primaryColorA'),
  primaryAlphaValue: document.getElementById('primaryAlphaValue'),
  primaryAlphaControl: document.getElementById('primaryAlphaControl'),
  primaryColorTag: document.getElementById('primaryColorTag'),
  secondaryColorConfig: document.getElementById('secondaryColorConfig'),
  secondaryColorPicker: document.getElementById('secondaryColorPicker'),
  secondaryColorR: document.getElementById('secondaryColorR'),
  secondaryColorG: document.getElementById('secondaryColorG'),
  secondaryColorB: document.getElementById('secondaryColorB'),
  secondaryColorA: document.getElementById('secondaryColorA'),
  secondaryAlphaValue: document.getElementById('secondaryAlphaValue'),
  secondaryAlphaControl: document.getElementById('secondaryAlphaControl'),
  secondaryColorEnabled: document.getElementById('secondaryColorEnabled'),
  addColorBtn: document.getElementById('addColorBtn'),
  resetFormBtn: document.getElementById('resetFormBtn'),


  colorList: document.getElementById('colorList'),
  colorCountBadge: document.getElementById('colorCountBadge'),


  previewCanvas: document.getElementById('previewCanvas'),
  previewMode: document.getElementById('previewMode'),
  useCurrentColorBtn: document.getElementById('useCurrentColorBtn'),
  clearCanvasBtn: document.getElementById('clearCanvasBtn'),
  activeColorPreview: document.getElementById('activeColorPreview'),
  activeColorSwatch: document.getElementById('activeColorSwatch'),
  activeColorCode: document.getElementById('activeColorCode'),
  activeColorType: document.getElementById('activeColorType'),


  importBtn: document.getElementById('importBtn'),
  importInput: document.getElementById('importInput'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),


  exportModal: document.getElementById('exportModal'),
  exportNameInput: document.getElementById('exportNameInput'),
  exportCancelBtn: document.getElementById('exportCancelBtn'),
  exportConfirmBtn: document.getElementById('exportConfirmBtn')
};


function init() {
  bindEvents();
  initCanvas();
  updateTypeVisibility();
  renderColorList();
  setupBeforeUnloadWarning();
  updateActiveColorPreview(null);
}


function bindEvents() {

  elements.colorForm.addEventListener('submit', handleFormSubmit);
  elements.resetFormBtn.addEventListener('click', resetForm);
  elements.colorType.addEventListener('change', updateTypeVisibility);


  elements.primaryColorPicker.addEventListener('input', () => {
    syncFromPicker('primary');
    updateActiveColorFromForm();
  });
  elements.primaryColorR.addEventListener('input', () => {
    syncFromRgb('primary');
    updateActiveColorFromForm();
  });
  elements.primaryColorG.addEventListener('input', () => {
    syncFromRgb('primary');
    updateActiveColorFromForm();
  });
  elements.primaryColorB.addEventListener('input', () => {
    syncFromRgb('primary');
    updateActiveColorFromForm();
  });
  elements.primaryColorA.addEventListener('input', (e) => {
    elements.primaryAlphaValue.textContent = `${e.target.value}%`;
    updateActiveColorFromForm();
  });

  elements.secondaryColorPicker.addEventListener('input', () => {
    syncFromPicker('secondary');
    updateActiveColorFromForm();
  });
  elements.secondaryColorR.addEventListener('input', () => {
    syncFromRgb('secondary');
    updateActiveColorFromForm();
  });
  elements.secondaryColorG.addEventListener('input', () => {
    syncFromRgb('secondary');
    updateActiveColorFromForm();
  });
  elements.secondaryColorB.addEventListener('input', () => {
    syncFromRgb('secondary');
    updateActiveColorFromForm();
  });
  elements.secondaryColorA.addEventListener('input', (e) => {
    elements.secondaryAlphaValue.textContent = `${e.target.value}%`;
    updateActiveColorFromForm();
  });

  elements.secondaryColorEnabled.addEventListener('change', () => {
    toggleSecondaryInputs();
    updateActiveColorFromForm();
  });


  elements.previewMode.addEventListener('change', handlePreviewModeChange);
  elements.useCurrentColorBtn.addEventListener('click', useCurrentColor);
  elements.clearCanvasBtn.addEventListener('click', clearCanvas);


  elements.importBtn.addEventListener('click', () => elements.importInput.click());
  elements.importInput.addEventListener('change', handleImport);
  elements.exportJsonBtn.addEventListener('click', () => handleExportRequest('json'));
  elements.exportCsvBtn.addEventListener('click', () => handleExportRequest('csv'));


  elements.exportCancelBtn.addEventListener('click', closeExportModal);
  elements.exportConfirmBtn.addEventListener('click', confirmExport);
  elements.exportModal.addEventListener('click', (e) => {
    if (e.target === elements.exportModal) closeExportModal();
  });


  elements.colorList.addEventListener('click', handleColorListClick);
}


function initCanvas() {
  const canvas = elements.previewCanvas;
  const container = canvas.parentElement;

  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;


    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;


    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;


    state.preview.ctx = canvas.getContext('2d');
    state.preview.ctx.scale(dpr, dpr);
    state.preview.ctx.imageSmoothingEnabled = false;


    state.preview.cols = Math.floor(rect.width / 10);
    state.preview.rows = Math.floor(rect.height / 10);
    state.preview.grid = createEmptyGrid();

    renderCanvas();
  }


  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);


  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
}


function startDrawing(e) {

  if (!state.activeColor) {
    const colorData = getFormData();
    if (colorData.color1) {

      state.activeColor = {
        source: 'custom',
        color1: colorData.color1,
        color2: colorData.color2,
        type: colorData.type
      };

      updateActiveColorPreview(colorData);
    } else {
      alert('请先选择或添加一个颜色');
      return;
    }
  }

  state.preview.isDrawing = true;
  draw(e);
}


function createEmptyGrid() {
  return Array.from({ length: state.preview.rows }, () =>
    Array.from({ length: state.preview.cols }, () => null)
  );
}


function draw(e) {
  if (!state.preview.isDrawing) return;

  const rect = elements.previewCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / 10);
  const y = Math.floor((e.clientY - rect.top) / 10);

  if (x >= 0 && x < state.preview.cols && y >= 0 && y < state.preview.rows) {
    state.preview.grid[y][x] = state.activeColor;
    renderCanvas();
  }
}


function stopDrawing() {
  state.preview.isDrawing = false;
}


function renderCanvas() {
  const ctx = state.preview.ctx;
  const canvas = elements.previewCanvas;
  const dpr = window.devicePixelRatio || 1;
  const cellSize = 10;


  ctx.clearRect(0, 0, canvas.width, canvas.height);


  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);


  for (let y = 0; y < state.preview.rows; y++) {
    for (let x = 0; x < state.preview.cols; x++) {
      const colorRef = state.preview.grid[y][x];
      if (!colorRef) continue;

      const color = resolvePreviewColor(colorRef);
      if (!color) continue;

      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);


      if (colorRef.type === 'pearlescent') {
        applyPearlescentEffect(ctx, x * cellSize, y * cellSize, cellSize);
      }
    }
  }
}


function applyPearlescentEffect(ctx, x, y, size) {
  ctx.save();


  const gradient = ctx.createRadialGradient(
    x + size * 0.3, y + size * 0.3, 0,
    x + size * 0.3, y + size * 0.3, size * 0.7
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);

  ctx.restore();
}


function resolvePreviewColor(colorRef) {
  if (colorRef.source === 'custom') {
    return resolveColorForMode(colorRef, state.preview.mode);
  }

  if (colorRef.source === 'palette') {
    const color = state.colors.find(c => c.num === colorRef.num);
    if (!color) return null;

    return resolveColorForMode(color, state.preview.mode);
  }

  return null;
}


function resolveColorForMode(colorData, mode) {
  const { type, color1, color2 } = colorData;


  if (DUAL_COLOR_TYPES.has(type)) {
    const isActive =
      (mode === 'temperature' && type === 'temperatrue') ||
      (mode === 'light' && type === 'light') ||
      (mode === 'special');

    if (isActive && color2) {

      console.log(1)
      return color2;
    } else if (isActive && !color2) {

      console.log(2)
      return color1;
    } else if (!isActive && !color2) {

      console.log(3)
      return 'rgb(255, 255, 255)';
    }
  }


  if (mode === 'night') {
    if (type === 'glow') {

      return color1;
    } else {

      return applyNightEffect(color1);
    }
  }


  return color1;
}


function applyNightEffect(colorStr) {
  const color = parseColor(colorStr);
  if (!color) return colorStr;


  const factor = 0.4;
  const r = Math.floor(color.r * factor);
  const g = Math.floor(color.g * factor);
  const b = Math.floor(color.b * factor);

  if (color.a !== undefined && color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a})`;
  }

  return `rgb(${r}, ${g}, ${b})`;
}


function handleFormSubmit(e) {
  e.preventDefault();

  const colorData = getFormData();

  if (!colorData.num) {
    alert('请输入色号');
    return;
  }

  if (!colorData.color1) {
    alert('请选择颜色');
    return;
  }


  const existingIndex = state.colors.findIndex(c => c.num === colorData.num);

  if (state.editingColor && state.editingColor !== colorData.num && existingIndex !== -1) {
    alert('色号已存在，请修改色号');
    return;
  }

  if (state.editingColor) {

    const index = state.colors.findIndex(c => c.num === state.editingColor);
    if (index !== -1) {
      state.colors[index] = colorData;
    }
    state.editingColor = null;
    elements.addColorBtn.textContent = '添加至色卡';
  } else {

    if (existingIndex !== -1) {
      alert('色号已存在，请修改色号');
      return;
    }
    state.colors.push(colorData);
  }


  setActiveColor(colorData.num);


  resetForm();


  renderColorList();
}


function getFormData() {
  const type = elements.colorType.value;
  const num = elements.colorNum.value.trim();

  const primaryColor = getColorFromInputs('primary');
  const primaryColorStr = formatColor(primaryColor, type === 'normal');

  let secondaryColorStr = '';
  if (DUAL_COLOR_TYPES.has(type) && elements.secondaryColorEnabled.checked) {
    const secondaryColor = getColorFromInputs('secondary');
    secondaryColorStr = formatColor(secondaryColor, false);
  }

  return {
    num,
    type,
    color1: primaryColorStr,
    color2: secondaryColorStr
  };
}


function getColorFromInputs(prefix) {
  const r = parseInt(document.getElementById(`${prefix}ColorR`).value) || 0;
  const g = parseInt(document.getElementById(`${prefix}ColorG`).value) || 0;
  const b = parseInt(document.getElementById(`${prefix}ColorB`).value) || 0;
  const a = parseInt(document.getElementById(`${prefix}ColorA`).value) / 100;

  return { r, g, b, a };
}


function formatColor(color, forceRgb) {
  if (forceRgb || color.a === 1) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}


function parseColor(colorStr) {
  if (!colorStr) return null;


  const rgbMatch = colorStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
      a: 1
    };
  }


  const rgbaMatch = colorStr.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/i);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: parseFloat(rgbaMatch[4])
    };
  }


  if (colorStr.startsWith('#')) {
    return hexToRgb(colorStr);
  }

  return null;
}


function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: 1
  } : null;
}


function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}


function syncFromPicker(prefix) {
  const picker = document.getElementById(`${prefix}ColorPicker`);
  const hex = picker.value;
  const rgb = hexToRgb(hex);

  if (rgb) {
    document.getElementById(`${prefix}ColorR`).value = rgb.r;
    document.getElementById(`${prefix}ColorG`).value = rgb.g;
    document.getElementById(`${prefix}ColorB`).value = rgb.b;
  }
}


function syncFromRgb(prefix) {
  const r = parseInt(document.getElementById(`${prefix}ColorR`).value) || 0;
  const g = parseInt(document.getElementById(`${prefix}ColorG`).value) || 0;
  const b = parseInt(document.getElementById(`${prefix}ColorB`).value) || 0;

  const hex = rgbToHex(r, g, b);
  document.getElementById(`${prefix}ColorPicker`).value = hex;
}


function updateTypeVisibility() {
  const type = elements.colorType.value;
  const isNormal = type === 'normal';
  const isDualColor = DUAL_COLOR_TYPES.has(type);


  elements.primaryColorTag.textContent = isNormal ? 'RGB' : 'RGBA';


  elements.primaryAlphaControl.style.display = isNormal ? 'none' : 'flex';


  elements.secondaryColorConfig.style.display = isDualColor ? 'block' : 'none';


  if (!isDualColor) {
    elements.secondaryColorEnabled.checked = false;
    toggleSecondaryInputs();
  }


  updateActiveColorFromForm();
}


function toggleSecondaryInputs() {
  const enabled = elements.secondaryColorEnabled.checked;

  const inputs = [
    elements.secondaryColorPicker,
    elements.secondaryColorR,
    elements.secondaryColorG,
    elements.secondaryColorB,
    elements.secondaryColorA
  ];

  inputs.forEach(input => {
    input.disabled = !enabled;
  });

  elements.secondaryAlphaControl.style.display = enabled ? 'flex' : 'none';
}


function resetForm() {
  elements.colorNum.value = '';
  elements.colorType.value = 'normal';


  setColorInputs('primary', { r: 255, g: 255, b: 255, a: 1 });


  setColorInputs('secondary', { r: 255, g: 255, b: 255, a: 1 });
  elements.secondaryColorEnabled.checked = false;
  toggleSecondaryInputs();

  updateTypeVisibility();

  state.editingColor = null;
  elements.addColorBtn.textContent = '添加至色卡';


  state.activeColor = null;
  elements.activeColorPreview.style.display = 'none';
}


function setColorInputs(prefix, color) {
  document.getElementById(`${prefix}ColorR`).value = color.r;
  document.getElementById(`${prefix}ColorG`).value = color.g;
  document.getElementById(`${prefix}ColorB`).value = color.b;
  document.getElementById(`${prefix}ColorA`).value = Math.round(color.a * 100);
  document.getElementById(`${prefix}AlphaValue`).textContent = `${Math.round(color.a * 100)}%`;
  document.getElementById(`${prefix}ColorPicker`).value = rgbToHex(color.r, color.g, color.b);
}


function renderColorList() {
  const colorList = elements.colorList;
  colorList.innerHTML = '';

  if (state.colors.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = '暂无颜色，请先添加颜色';
    colorList.appendChild(placeholder);
    elements.colorCountBadge.textContent = '0 色';
    return;
  }


  const sortedColors = [...state.colors].sort((a, b) =>
    a.num.localeCompare(b.num, undefined, { numeric: true })
  );

  sortedColors.forEach(color => {
    const colorItem = document.createElement('div');
    colorItem.className = 'color-item';
    if (state.activeColor && state.activeColor.source === 'palette' && state.activeColor.num === color.num) {
      colorItem.classList.add('active');
    }
    colorItem.dataset.num = color.num;

    const swatchStyle = getSwatchStyle(color);

    colorItem.innerHTML = `
          <div class="color-swatch ${swatchStyle.hasAlpha ? 'has-alpha' : ''}" ${swatchStyle.style}></div>
          <div class="color-info">
            <div class="color-code">${color.num}</div>
            <div class="color-type">${COLOR_TYPE_LABELS[color.type] || color.type}</div>
          </div>
          <div class="color-actions">
            <button class="color-action" data-action="edit" data-num="${color.num}">编辑</button>
            <button class="color-action" data-action="delete" data-num="${color.num}">删除</button>
          </div>
        `;

    colorList.appendChild(colorItem);
  });

  elements.colorCountBadge.textContent = `${state.colors.length} 色`;
}


function getSwatchStyle(color) {
  const hasAlpha = color.color1.includes('rgba') || (color.color2 && color.color2.includes('rgba'));

  if (color.color2 && DUAL_COLOR_TYPES.has(color.type)) {
    return {
      style: `style="background: linear-gradient(135deg, ${color.color1}, ${color.color2});"`,
      hasAlpha
    };
  }

  if (color.type === 'pearlescent') {
    return {
      style: `style="background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${color.color1} 45%, ${color.color1} 100%);"`,
      hasAlpha
    };
  }

  if (hasAlpha) {
    return {
      style: `style="background: ${color.color1};"`,
      hasAlpha: true
    };
  }

  return {
    style: `style="background: ${color.color1};"`,
    hasAlpha: false
  };
}


function handleColorListClick(e) {
  const target = e.target;
  const colorItem = target.closest('.color-item');

  if (!colorItem) return;

  const num = colorItem.dataset.num;


  if (target.classList.contains('color-action')) {
    const action = target.dataset.action;

    if (action === 'edit') {
      editColor(num);
    } else if (action === 'delete') {
      deleteColor(num);
    }


    if (action !== 'delete') {
      setActiveColor(num);
    }
  } else {

    setActiveColor(num);
  }
}

function editColor(num) {
  const color = state.colors.find(c => c.num === num);
  if (!color) return;


  elements.colorNum.value = color.num;
  elements.colorType.value = color.type;


  const primaryColor = parseColor(color.color1);
  if (primaryColor) {
    setColorInputs('primary', primaryColor);
  }


  if (color.color2) {
    const secondaryColor = parseColor(color.color2);
    if (secondaryColor) {
      setColorInputs('secondary', secondaryColor);
      elements.secondaryColorEnabled.checked = true;
      toggleSecondaryInputs();
    }
  } else {
    elements.secondaryColorEnabled.checked = false;
    toggleSecondaryInputs();
  }

  updateTypeVisibility();


  state.editingColor = num;
  elements.addColorBtn.textContent = '更新颜色';
}


function deleteColor(num) {
  if (!confirm(`确定要删除颜色 ${num} 吗？`)) return;

  state.colors = state.colors.filter(c => c.num !== num);


  if (state.activeColor && state.activeColor.num === num) {
    state.activeColor = null;
    elements.activeColorPreview.style.display = 'none';
  }


  if (state.editingColor === num) {
    resetForm();
  }


  for (let y = 0; y < state.preview.rows; y++) {
    for (let x = 0; x < state.preview.cols; x++) {
      if (state.preview.grid[y][x] && state.preview.grid[y][x].num === num) {
        state.preview.grid[y][x] = null;
      }
    }
  }

  renderColorList();
  renderCanvas();
}


function setActiveColor(num) {
  const color = state.colors.find(c => c.num === num);
  if (!color) return;

  state.activeColor = {
    source: 'palette',
    num: color.num,
    type: color.type
  };


  updateActiveColorPreview(color);


  document.querySelectorAll('.color-item').forEach(item => {
    item.classList.toggle('active', item.dataset.num === num);
  });
}


function updateActiveColorPreview(colorData) {
  if (colorData) {
    const swatchStyle = getSwatchStyle(colorData);


    elements.activeColorSwatch.className = `preview-swatch ${swatchStyle.hasAlpha ? 'has-alpha' : ''}`;


    if (swatchStyle.style.includes('linear-gradient')) {

      const gradientMatch = swatchStyle.style.match(/background: (linear-gradient[^;]+);/);
      if (gradientMatch) {
        elements.activeColorSwatch.style.background = gradientMatch[1];
      }
    } else {

      const colorMatch = swatchStyle.style.match(/background: ([^;]+);/);
      if (colorMatch) {
        elements.activeColorSwatch.style.background = colorMatch[1];
      }
    }

    elements.activeColorCode.textContent = colorData.num;
    elements.activeColorType.textContent = COLOR_TYPE_LABELS[colorData.type] || colorData.type;
  } else {

    elements.activeColorSwatch.style.background = '#ffffff';
    elements.activeColorSwatch.className = 'preview-swatch';
    elements.activeColorCode.textContent = '无';
    elements.activeColorType.textContent = '无活动颜色';
  }


  elements.activeColorPreview.style.display = 'flex';
}


function useCurrentColor() {
  const colorData = getFormData();

  if (!colorData.color1) {
    alert('请先编辑一个颜色');
    return;
  }

  state.activeColor = {
    source: 'custom',
    color1: colorData.color1,
    color2: colorData.color2,
    type: colorData.type
  };


  updateActiveColorPreview(colorData);


  document.querySelectorAll('.color-item').forEach(item => {
    item.classList.remove('active');
  });
}


function updateActiveColorFromForm() {
  const colorData = getFormData();

  if (!colorData.color1) return;


  if (!state.activeColor || state.activeColor.source === 'custom') {
    state.activeColor = {
      source: 'custom',
      color1: colorData.color1,
      color2: colorData.color2,
      type: colorData.type
    };


    updateActiveColorPreview(colorData);
  }
}


function clearCanvas() {
  if (!confirm('确定要清空画布吗？')) return;

  state.preview.grid = createEmptyGrid();
  renderCanvas();
}


function handlePreviewModeChange() {
  state.preview.mode = elements.previewMode.value;
  renderCanvas();
}


function handleExportRequest(format) {
  if (state.colors.length === 0) {
    alert('没有可导出的颜色');
    return;
  }

  state.pendingExport = format;
  elements.exportNameInput.value = state.paletteName;
  elements.exportModal.classList.add('visible');
}


function confirmExport() {
  const name = elements.exportNameInput.value.trim() || '拼豆色卡';
  state.paletteName = name;

  if (state.pendingExport === 'json') {
    exportJson(name);
  } else if (state.pendingExport === 'csv') {
    exportCsv(name);
  }

  closeExportModal();
}


function closeExportModal() {
  elements.exportModal.classList.remove('visible');
  state.pendingExport = null;
}


function exportJson(name) {
  const data = {};

  state.colors.forEach(color => {
    data[color.num] = {
      num: color.num,
      type: color.type,
      color1: color.color1,
      color: color.color1,
      ...(color.color2 ? { color2: color.color2 } : {})
    };
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${name}.json`);
}


function exportCsv(name) {
  const headers = ['num', 'type', 'color1', 'color2'];
  const rows = state.colors.map(color => [
    color.num,
    color.type,
    color.color1,
    color.color2 || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${name}.csv`);
}


function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      if (file.name.toLowerCase().endsWith('.json')) {
        importJson(event.target.result, file.name);
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        importCsv(event.target.result, file.name);
      } else {
        alert('不支持的文件格式');
      }
    } catch (error) {
      console.error('导入失败:', error);
      alert('导入失败，请检查文件格式');
    }


    e.target.value = '';
  };

  reader.readAsText(file);
}


function importJson(jsonStr, filename) {
  const data = JSON.parse(jsonStr);

  if (typeof data !== 'object' || data === null) {
    throw new Error('无效的JSON格式');
  }

  const colors = [];

  Object.values(data).forEach(item => {
    if (item && item.num && item.color1) {
      colors.push({
        num: item.num,
        type: item.type || 'normal',
        color1: item.color1,
        color2: item.color2 || ''
      });
    }
  });

  if (colors.length === 0) {
    throw new Error('未找到有效的颜色数据');
  }

  applyImportedColors(colors, filename);
}


function importCsv(csvStr, filename) {
  const lines = csvStr.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV文件内容为空');
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const numIndex = headers.indexOf('num');
  const typeIndex = headers.indexOf('type');
  const color1Index = headers.indexOf('color1');
  const color2Index = headers.indexOf('color2');

  if (numIndex === -1 || color1Index === -1) {
    throw new Error('CSV文件缺少必要列');
  }

  const colors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);

    if (cells.length <= Math.max(numIndex, color1Index)) continue;

    const num = cells[numIndex].replace(/"/g, '').trim();
    const type = typeIndex !== -1 ? cells[typeIndex].replace(/"/g, '').trim() : 'normal';
    const color1 = cells[color1Index].replace(/"/g, '').trim();
    const color2 = color2Index !== -1 ? cells[color2Index].replace(/"/g, '').trim() : '';

    if (num && color1) {
      colors.push({ num, type, color1, color2 });
    }
  }

  if (colors.length === 0) {
    throw new Error('未找到有效的颜色数据');
  }

  applyImportedColors(colors, filename);
}


function parseCsvLine(line) {
  const result = [];
  let inQuotes = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function applyImportedColors(colors, filename) {
  state.colors = colors;
  state.paletteName = filename.replace(/\.[^/.]+$/, "");


  state.activeColor = null;
  state.editingColor = null;
  resetForm();


  state.preview.grid = createEmptyGrid();


  renderColorList();
  renderCanvas();
  elements.activeColorPreview.style.display = 'none';

  alert(`成功导入 ${colors.length} 个颜色`);
}

function setupBeforeUnloadWarning() {
  console.log('setupBeforeUnloadWarning');
  window.addEventListener('beforeunload', function (e) {
    // 如果有颜色数据，就显示警告
    if (state.colors.length > 0) {
      e.preventDefault();
      console.log('beforeunload');
      e.returnValue = '您有未保存的色卡数据，关闭页面将导致所有编辑内容丢失。确定要离开吗？';
      return e.returnValue;
    }
  });
}

init();