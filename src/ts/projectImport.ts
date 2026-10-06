import { CANVAS_SIZE_MAX, GROUP_SIZE_MAX, type CanvasSnapshot } from '@/stores/canvas'
import { validateColorCard, type ColorCard, type ColorEntry, type ColorType } from '@/ts/colorCard'

const LEGACY_SIZE_MAX = 1024
const legacyTypes: Record<string, ColorType> = {
  normal: 'solid',
  transparent: 'transparent',
  pearlescent: 'pearl',
  glow: 'glow',
  temperatrue: 'thermo',
  light: 'photo',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validSize(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
}

// The legacy exporter emits rgb()/rgba(). Match convert_old_cards.py by
// compositing alpha over white, since v4 color cards store six-digit hex values.
function legacyHex(value: unknown): string {
  if (typeof value !== 'string') throw new Error('旧工程色卡中的颜色无效。')
  const color = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return (
      '#' +
      color
        .slice(1)
        .split('')
        .map((digit) => digit + digit)
        .join('')
    )
  }
  const match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/)
  if (!match) throw new Error('旧工程色卡中的颜色无效。')
  const channels = [Number(match[1]), Number(match[2]), Number(match[3])]
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (channels.some((channel) => channel > 255) || alpha < 0 || alpha > 1) {
    throw new Error('旧工程色卡中的颜色无效。')
  }
  return (
    '#' +
    channels
      .map((channel) =>
        Math.round(channel * alpha + 255 * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function legacySnapshot(grid: string[][], id = 'legacy_main'): CanvasSnapshot {
  return {
    layers: [{ id, name: '主图层', visible: true, grid }],
    activeLayerId: id,
    renderMode: 'day',
    symmetry: 'off',
    pixelShape: 'square',
    showColorIds: false,
    showColorIdsHighlightOnly: false,
    backgroundColor: '#ffffff',
    showGrid: true,
    thickLineH: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
    thickLineV: { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
    underlay: null,
    autoPickUnderlayColor: false,
  }
}

function convertLegacyProject(data: Record<string, unknown>, fallbackName: string) {
  const canvas = data.canvas
  const palette = data.palette
  if (
    !isRecord(canvas) ||
    !validSize(canvas.width, LEGACY_SIZE_MAX) ||
    !validSize(canvas.height, LEGACY_SIZE_MAX)
  ) {
    throw new Error('旧工程的画布宽、高必须为 1–1024 格。')
  }
  if (!isRecord(palette) || !Array.isArray(palette.entries) || !palette.entries.length) {
    throw new Error('旧工程文件中没有有效的色卡。')
  }
  const byCode = new Map<string, ColorEntry>()
  for (const raw of palette.entries) {
    if (!isRecord(raw) || typeof raw.code !== 'string' || !raw.code.trim()) {
      throw new Error('旧工程色卡中的色号无效。')
    }
    const id = raw.code.trim()
    if (byCode.has(id)) throw new Error(`旧工程色卡含重复色号：${id}`)
    const type = legacyTypes[String(raw.type ?? 'normal')]
    if (!type) throw new Error(`旧工程中存在不支持的颜色类型：${String(raw.type)}`)
    byCode.set(id, {
      id,
      type,
      color1: legacyHex(raw.color1 || raw.color),
      color2: raw.color2 ? legacyHex(raw.color2) : null,
    })
  }
  if (!Array.isArray(data.grid)) throw new Error('旧工程文件中的像素数据无效。')
  const width = canvas.width
  const height = canvas.height
  const sourceGrid = data.grid
  const grid = Array.from({ length: height }, (_, rowIndex) => {
    const sourceRow: unknown = sourceGrid[rowIndex]
    if (sourceRow !== undefined && !Array.isArray(sourceRow)) {
      throw new Error('旧工程文件中的像素数据无效。')
    }
    return Array.from({ length: width }, (_, col) => {
      const code: unknown = Array.isArray(sourceRow) ? sourceRow[col] : null
      if (code === null || code === undefined || code === '') return ''
      if (typeof code !== 'string') throw new Error('旧工程文件中的像素色号无效。')
      const entry = byCode.get(code.trim())
      if (!entry) throw new Error(`旧工程的色卡中缺少色号：${code}`)
      return entry.color1
    })
  })
  const colorCard: ColorCard = {
    name:
      typeof palette.label === 'string' && palette.label.trim() ? palette.label.trim() : '导入色卡',
    author: 'unknown',
    version: 1,
    colors: [...byCode.values()],
  }
  const common = {
    version: 4,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : fallbackName,
    colorCard,
    currentColorId: colorCard.colors[0]!.id,
    recentColorIds: [],
    referenceImage: null,
    createdAt: data.createdAt,
  }
  if (canvas.width <= CANVAS_SIZE_MAX && canvas.height <= CANVAS_SIZE_MAX) {
    return {
      ...common,
      type: 'single',
      cols: canvas.width,
      rows: canvas.height,
      ...legacySnapshot(grid),
    }
  }
  // Keep every pixel of the legacy 1024-grid canvas using the existing v4 group
  // format. Only the final tiles are padded with empty cells.
  const subSize = CANVAS_SIZE_MAX
  const groupCols = Math.ceil(canvas.width / subSize)
  const groupRows = Math.ceil(canvas.height / subSize)
  const canvases = Array.from({ length: groupRows }, (_, row) =>
    Array.from({ length: groupCols }, (_, col) =>
      legacySnapshot(
        Array.from({ length: subSize }, (_, y) =>
          Array.from(
            { length: subSize },
            (_, x) => grid[row * subSize + y]?.[col * subSize + x] ?? '',
          ),
        ),
        `legacy_${row}_${col}`,
      ),
    ),
  )
  return {
    ...common,
    type: 'group',
    groupCols,
    groupRows,
    subSize,
    canvases,
    activeGroupRow: 0,
    activeGroupCol: 0,
    openGroupTabs: [{ row: 0, col: 0 }],
  }
}

function validateGrid(grid: unknown) {
  if (
    !Array.isArray(grid) ||
    !grid.every((row) => Array.isArray(row) && row.every((pixel) => typeof pixel === 'string'))
  )
    throw new Error('工程文件中的像素数据无效。')
}

function validateLayers(data: Record<string, unknown>) {
  if (Array.isArray(data.layers) && data.layers.length) {
    for (const layer of data.layers) {
      if (!isRecord(layer)) throw new Error('工程文件中的图层数据无效。')
      validateGrid(layer.grid)
    }
  } else {
    validateGrid(data.grid)
  }
}

export function parseProjectJson(json: string, fallbackName = '导入项目') {
  const parsed = JSON.parse(json.replace(/^\uFEFF/, ''))
  const data: unknown = parsed
  if (!isRecord(data)) throw new Error('工程文件格式无效。')
  if ('canvas' in data) return convertLegacyProject(data, fallbackName)
  if (data.type === 'group') {
    if (
      !validSize(data.groupCols, GROUP_SIZE_MAX) ||
      !validSize(data.groupRows, GROUP_SIZE_MAX) ||
      !validSize(data.subSize, CANVAS_SIZE_MAX) ||
      !Array.isArray(data.canvases) ||
      data.canvases.length !== data.groupRows
    )
      throw new Error('工程文件中的画布组数据无效。')
    for (const row of data.canvases) {
      if (!Array.isArray(row) || row.length !== data.groupCols)
        throw new Error('工程文件中的画布组数据无效。')
      for (const snap of row) {
        if (!isRecord(snap)) throw new Error('工程文件中的画布组数据无效。')
        validateLayers(snap)
      }
    }
  } else {
    if (!validSize(data.cols, CANVAS_SIZE_MAX) || !validSize(data.rows, CANVAS_SIZE_MAX)) {
      throw new Error('单画布工程宽、高必须为 1–64 格。')
    }
    validateLayers(data)
  }
  if (data.colorCard && !validateColorCard(data.colorCard)) {
    throw new Error('工程文件中的色卡数据无效。')
  }
  // Retain the existing JSON data shape for all Vue project versions.
  return parsed
}
