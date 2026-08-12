export const STORAGE_KEYS = {
  paletteLibrary: 'pixelPaletteLibrary',
  paletteSelection: 'pixelPaletteSelection'
};
export const DOUBLE_CLICK_MS = 350;
export const SIZE_LIMITS = { minCell: 5, maxCell: 40 };
export const CANVAS_SIZE_LIMIT = 1024;
export const BASE_SCALE_LIMITS = { min: 0.01, max: 2 };
export const EXPORT_SCALE = 50;
export const PIXEL_FONT_FAMILY = '"Segoe UI", "Microsoft YaHei", "SimHei", "Arial", sans-serif';
export const AXIS_STYLE = {
  minFont: 12,
  minTick: 6,
  minGap: 6,
  fontFamily: PIXEL_FONT_FAMILY
};
export const GRID_OVERLAY_DEFAULTS = {
  xBoldEnabled: false,
  yBoldEnabled: false,
  xBoldInterval: 5,
  yBoldInterval: 5,
  xStartMode: 'center',
  yStartMode: 'center'
};
export const MAX_SAFE_CANVAS_DIMENSION = 16384;
