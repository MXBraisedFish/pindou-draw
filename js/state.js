export const hiddenBaseCanvas = document.createElement('canvas');
export const hiddenBaseCtx = hiddenBaseCanvas.getContext('2d');

export const state = {
  width: 0,
  height: 0,
  defaultCellSize: 10,
  cellSize: 10,
  grid: [],
  palette: {},
  paletteKeys: [],
  selectedColorKey: null,
  showCodes: false,
  autoSnap: false,
  baseImage: null,
  baseImageData: null,
  baseImageName: null,
  baseScale: 1,
  baseOffsetX: 0,
  baseOffsetY: 0,
  baseLayerPosition: 'under',
  baseEditing: false,
  backgroundOpacity: 0.9,
  panX: 0,
  panY: 0,
  lastMiddleClickTime: 0,
  currentTool: 'pencil',
  isFullscreen: false,
  paletteLibrary: new Map(),
  paletteOrder: [],
  currentPaletteId: null,
  currentPaletteLabel: '',
  axisPadding: { top: 0, right: 0, bottom: 0, left: 0 }
};
