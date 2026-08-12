import { renderCanvas } from '@/ts/canvasRenderer'
import type { ColorEntry } from '@/ts/colorCard'
import type { PixelShape, RenderMode, ThickLineConfig } from '@/stores/canvas'

export type ExportDocumentContent = 'full' | 'sketch-only' | 'stats-only'
export type ExportTableLayout = 'block' | 'table' | 'compact'

export interface ExportDocumentSource {
  name: string
  cols: number
  rows: number
  grid: string[][]
}

export interface ExportDocumentOptions {
  content: ExportDocumentContent
  cellSize: number
  showColorIds: boolean
  showColorIdsHighlightOnly: boolean
  showGrid: boolean
  gridThickness: number
  gridOpacity: number
  thickLineH: ThickLineConfig
  thickLineV: ThickLineConfig
  coordDisplay: 'none' | 'single' | 'dual'
  coordAxisStyle: 'direct' | 'cell'
  pixelShape: PixelShape
  sketchBg: string
  pageBg: string
  renderMode: RenderMode
  fontFamily: string
  tableLayout: ExportTableLayout
  colorMap: Map<string, ColorEntry>
  highlightMask?: boolean[][] | null
  highlightNumberMode?: 'off' | 'row' | 'col' | 'global'
  filteredGrid?: string[][] | null
}

export interface ExportColorStat {
  hex: string
  id: string
  count: number
}

export interface ExportDocumentResult {
  canvas: HTMLCanvasElement
  stats: ExportColorStat[]
  total: number
}

interface FlowItem {
  stat: ExportColorStat
  width: number
  height: number
  x: number
  y: number
}

const MAX_CANVAS_EDGE = 32767
const MAX_CANVAS_AREA = 268_000_000

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function isBright(hex: string) {
  return (
    parseInt(hex.slice(1, 3), 16) * 299 +
      parseInt(hex.slice(3, 5), 16) * 587 +
      parseInt(hex.slice(5, 7), 16) * 114 >
    140000
  )
}

export function collectExportStats(
  grid: string[][],
  colorMap: Map<string, ColorEntry>,
  mask?: boolean[][] | null,
): { stats: ExportColorStat[]; total: number } {
  const counts = new Map<string, number>()
  let total = 0
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
      const hex = grid[row]![col]
      if (!hex || (mask && !mask[row]?.[col])) continue
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
      total++
    }
  }
  const stats = [...counts.entries()]
    .map(([hex, count]) => ({ hex, id: colorMap.get(hex)?.id ?? '?', count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
  return { stats, total }
}

function measureCoordinateMargins(
  ctx: CanvasRenderingContext2D,
  source: ExportDocumentSource,
  options: ExportDocumentOptions,
) {
  if (options.coordDisplay === 'none' || options.content === 'stats-only') {
    return { left: 0, right: 0, top: 0, bottom: 0, fontSize: 0 }
  }
  const fontSize = Math.max(13, Math.min(24, Math.round(options.cellSize * 0.38)))
  ctx.font = `600 ${fontSize}px ${options.fontFamily}`
  const rowLabelWidth = Math.ceil(ctx.measureText(String(source.rows)).width)
  const cellAxis = options.coordAxisStyle === 'cell'
  const left = cellAxis ? Math.max(options.cellSize, rowLabelWidth + 20) : rowLabelWidth + 12
  const top = cellAxis ? Math.max(options.cellSize, fontSize + 18) : fontSize + 12
  const right = options.coordDisplay === 'dual' ? left : 0
  const bottom = options.coordDisplay === 'dual' ? top : 0
  return { left, right, top, bottom, fontSize }
}

function makeFlowItems(
  ctx: CanvasRenderingContext2D,
  stats: ExportColorStat[],
  layout: ExportTableLayout,
  maxWidth: number,
  fontFamily: string,
) {
  const idFont = 20
  const countFont = 16
  ctx.font = `600 ${idFont}px ${fontFamily}`
  const idWidths = stats.map((stat) => Math.ceil(ctx.measureText(stat.id).width))
  ctx.font = `${countFont}px ${fontFamily}`
  const countWidths = stats.map((stat) => Math.ceil(ctx.measureText(`x${stat.count}`).width))
  const gapX = 14
  const gapY = 14
  const items: FlowItem[] = stats.map((stat, index) => {
    const idWidth = idWidths[index]!
    const countWidth = countWidths[index]!
    if (layout === 'table') {
      return { stat, width: 54 + 14 + Math.max(idWidth, countWidth) + 20, height: 58, x: 0, y: 0 }
    }
    if (layout === 'compact') {
      return { stat, width: Math.max(58, idWidth + 20, countWidth + 14), height: 82, x: 0, y: 0 }
    }
    return { stat, width: Math.max(76, idWidth + 18, countWidth + 18), height: 112, x: 0, y: 0 }
  })

  let x = 0
  let y = 0
  let rowHeight = 0
  let usedWidth = 0
  for (const item of items) {
    if (x > 0 && x + item.width > maxWidth) {
      x = 0
      y += rowHeight + gapY
      rowHeight = 0
    }
    item.x = x
    item.y = y
    x += item.width + gapX
    rowHeight = Math.max(rowHeight, item.height)
    usedWidth = Math.max(usedWidth, x - gapX)
  }
  return { items, width: usedWidth, height: items.length ? y + rowHeight : 0 }
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  flow: ReturnType<typeof makeFlowItems>,
  offsetX: number,
  offsetY: number,
  layout: ExportTableLayout,
  fontFamily: string,
) {
  for (const item of flow.items) {
    const x = offsetX + item.x
    const y = offsetY + item.y
    const stat = item.stat
    if (layout === 'table') {
      roundedRect(ctx, x, y, 54, 54, 10)
      ctx.fillStyle = stat.hex
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.16)'
      ctx.stroke()
      ctx.fillStyle = isBright(stat.hex) ? '#111827' : '#ffffff'
      ctx.font = `600 ${Math.min(17, Math.max(10, 48 / Math.max(2, stat.id.length)))}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(stat.id, x + 27, y + 27, 48)
      ctx.fillStyle = '#374151'
      ctx.font = `600 18px ${fontFamily}`
      ctx.textAlign = 'left'
      ctx.fillText(stat.id, x + 68, y + 18, item.width - 78)
      ctx.fillStyle = '#6b7280'
      ctx.font = `16px ${fontFamily}`
      ctx.fillText(`x${stat.count}`, x + 68, y + 41, item.width - 78)
      continue
    }

    if (layout === 'compact') {
      const swatchHeight = 54
      roundedRect(ctx, x, y, item.width, swatchHeight, 16)
      ctx.fillStyle = stat.hex
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.16)'
      ctx.stroke()
      ctx.fillStyle = isBright(stat.hex) ? '#111827' : '#ffffff'
      ctx.font = `600 18px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(stat.id, x + item.width / 2, y + swatchHeight / 2, item.width - 12)
      ctx.fillStyle = '#6b7280'
      ctx.font = `15px ${fontFamily}`
      ctx.fillText(`x${stat.count}`, x + item.width / 2, y + 70, item.width - 8)
      continue
    }

    ctx.fillStyle = '#374151'
    ctx.font = `600 19px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(stat.id, x + item.width / 2, y, item.width - 8)
    roundedRect(ctx, x, y + 29, item.width, 54, 16)
    ctx.fillStyle = stat.hex
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,.16)'
    ctx.stroke()
    ctx.fillStyle = '#6b7280'
    ctx.font = `15px ${fontFamily}`
    ctx.fillText(`x${stat.count}`, x + item.width / 2, y + 91, item.width - 8)
  }
}

function drawCoordinates(
  ctx: CanvasRenderingContext2D,
  source: ExportDocumentSource,
  options: ExportDocumentOptions,
  margins: ReturnType<typeof measureCoordinateMargins>,
  gridX: number,
  gridY: number,
) {
  if (options.coordDisplay === 'none' || options.content === 'stats-only') return
  const dual = options.coordDisplay === 'dual'
  const cellAxis = options.coordAxisStyle === 'cell'
  ctx.font = `600 ${margins.fontSize}px ${options.fontFamily}`
  ctx.fillStyle = '#4b5563'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (cellAxis) {
    ctx.fillStyle = '#ebe8e3'
    ctx.fillRect(
      gridX - margins.left,
      gridY - margins.top,
      source.cols * options.cellSize + margins.left + margins.right,
      margins.top,
    )
    ctx.fillRect(gridX - margins.left, gridY, margins.left, source.rows * options.cellSize)
    if (dual) {
      ctx.fillRect(
        gridX + source.cols * options.cellSize,
        gridY,
        margins.right,
        source.rows * options.cellSize,
      )
      ctx.fillRect(
        gridX - margins.left,
        gridY + source.rows * options.cellSize,
        source.cols * options.cellSize + margins.left + margins.right,
        margins.bottom,
      )
    }
  }

  ctx.fillStyle = '#4b5563'
  for (let col = 0; col < source.cols; col++) {
    const x = gridX + col * options.cellSize + options.cellSize / 2
    ctx.fillText(String(col + 1), x, gridY - margins.top / 2, options.cellSize - 4)
    if (dual)
      ctx.fillText(
        String(col + 1),
        x,
        gridY + source.rows * options.cellSize + margins.bottom / 2,
        options.cellSize - 4,
      )
  }
  for (let row = 0; row < source.rows; row++) {
    const y = gridY + row * options.cellSize + options.cellSize / 2
    ctx.fillText(String(row + 1), gridX - margins.left / 2, y, margins.left - 8)
    if (dual)
      ctx.fillText(
        String(row + 1),
        gridX + source.cols * options.cellSize + margins.right / 2,
        y,
        margins.right - 8,
      )
  }
}

export function renderExportDocument(
  source: ExportDocumentSource,
  options: ExportDocumentOptions,
): ExportDocumentResult {
  const { stats, total } = collectExportStats(source.grid, options.colorMap, options.highlightMask)
  const measureCanvas = document.createElement('canvas')
  const measureCtx = measureCanvas.getContext('2d')!
  const pad = 40
  const titleFont = 28
  const totalFont = 18
  const gridWidth = source.cols * options.cellSize
  const gridHeight = source.rows * options.cellSize
  const margins = measureCoordinateMargins(measureCtx, source, options)
  const gridAreaWidth = gridWidth + margins.left + margins.right
  const gridAreaHeight = gridHeight + margins.top + margins.bottom

  measureCtx.font = `700 ${titleFont}px ${options.fontFamily}`
  const titleWidth = Math.ceil(measureCtx.measureText(source.name).width)
  const preferredStatsWidth = Math.max(
    640,
    Math.min(1800, Math.ceil(Math.sqrt(Math.max(1, stats.length)) * 180)),
  )
  const initialContentWidth = options.content === 'stats-only' ? preferredStatsWidth : gridAreaWidth
  const flowWidth = Math.max(initialContentWidth, titleWidth + 20)
  const flow = makeFlowItems(measureCtx, stats, options.tableLayout, flowWidth, options.fontFamily)
  const contentWidth = Math.max(initialContentWidth, flow.width, titleWidth + 20)
  const titleHeight = options.content === 'sketch-only' ? 0 : titleFont + 22
  const totalHeight = options.content === 'sketch-only' ? 0 : totalFont + 24
  const sectionGap = options.content === 'full' && flow.height > 0 ? 30 : 0
  const gridSectionHeight = options.content === 'stats-only' ? 0 : gridAreaHeight
  const tableSectionHeight = options.content === 'sketch-only' ? 0 : flow.height
  const width = Math.ceil(contentWidth + pad * 2)
  const height = Math.ceil(
    pad * 2 + titleHeight + gridSectionHeight + totalHeight + sectionGap + tableSectionHeight,
  )

  if (width > MAX_CANVAS_EDGE || height > MAX_CANVAS_EDGE || width * height > MAX_CANVAS_AREA) {
    throw new Error(`导出图片尺寸 ${width}x${height} 超过浏览器可生成范围，请改用“单独导出”。`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const background = options.content === 'sketch-only' ? options.sketchBg : options.pageBg
  if (background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }

  let cursorY = pad
  if (options.content !== 'sketch-only') {
    ctx.fillStyle = '#1f2937'
    ctx.font = `700 ${titleFont}px ${options.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(source.name, width / 2, cursorY, width - pad * 2)
    cursorY += titleHeight
  }

  if (options.content !== 'stats-only') {
    const areaX = Math.round((width - gridAreaWidth) / 2)
    const gridX = areaX + margins.left
    const gridY = cursorY + margins.top
    const gridCanvas = document.createElement('canvas')
    renderCanvas(
      gridCanvas,
      {
        cols: source.cols,
        rows: source.rows,
        zoom: 1,
        panX: 0,
        panY: 0,
        showGrid: options.showGrid,
        compositeGrid: options.filteredGrid ?? source.grid,
      },
      {
        colorMap: options.colorMap,
        renderMode: options.renderMode,
        pixelShape: options.pixelShape,
        showColorIds: options.showColorIds && options.highlightNumberMode === 'off',
        showColorIdsHighlightOnly: options.showColorIdsHighlightOnly,
        backgroundColor: options.sketchBg,
        symmetry: 'off',
        thickLineH: options.thickLineH,
        thickLineV: options.thickLineV,
        gridThickness: options.gridThickness,
        gridOpacity: options.gridOpacity,
        selectionMask: null,
        highlightMask: options.highlightMask ?? null,
        highlightNumberMode: options.highlightNumberMode ?? 'off',
        previewShape: null,
        geoPreview: null,
      },
      { width: gridWidth, height: gridHeight, dpr: 1 },
    )
    ctx.drawImage(gridCanvas, gridX, gridY)
    drawCoordinates(ctx, source, options, margins, gridX, gridY)
    cursorY += gridAreaHeight
  }

  if (options.content !== 'sketch-only') {
    ctx.fillStyle = '#6b7280'
    ctx.font = `${totalFont}px ${options.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`总像素：${total}`, width / 2, cursorY + totalHeight / 2)
    cursorY += totalHeight + sectionGap
    drawStats(
      ctx,
      flow,
      Math.round((width - flow.width) / 2),
      cursorY,
      options.tableLayout,
      options.fontFamily,
    )
  }

  return { canvas, stats, total }
}
