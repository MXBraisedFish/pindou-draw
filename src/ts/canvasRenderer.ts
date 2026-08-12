import type { ColorEntry } from '@/ts/colorCard'
import type { RenderMode, PixelShape, ThickLineConfig } from '@/stores/canvas'

const CELL_MIN_SIZE = 4
const CELL_MAX_SIZE = 80

export function getCellSize(
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
  zoom: number,
): number {
  const maxW = viewW / cols
  const maxH = viewH / rows
  const base = Math.min(maxW, maxH)
  return Math.max(CELL_MIN_SIZE, Math.min(CELL_MAX_SIZE, base * zoom))
}

export function screenToGrid(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  cols: number,
  rows: number,
  zoom: number,
  panX: number,
  panY: number,
): { col: number; row: number } | null {
  const rect = canvas.getBoundingClientRect()
  const viewW = rect.width
  const viewH = rect.height
  const mx = clientX - rect.left
  const my = clientY - rect.top

  const cellSize = getCellSize(viewW, viewH, cols, rows, zoom)
  const gridW = cellSize * cols
  const gridH = cellSize * rows
  const ox = (viewW - gridW) / 2 + panX
  const oy = (viewH - gridH) / 2 + panY

  const col = Math.floor((mx - ox) / cellSize)
  const row = Math.floor((my - oy) / cellSize)

  if (col < 0 || col >= cols || row < 0 || row >= rows) return null
  return { col, row }
}

function dimColor(hex: string): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.45)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.45)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.45)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function lerpColor(a: string, b: string, t: number): string {
  const r1 = parseInt(a.slice(1, 3), 16)
  const g1 = parseInt(a.slice(3, 5), 16)
  const b1 = parseInt(a.slice(5, 7), 16)
  const r2 = parseInt(b.slice(1, 3), 16)
  const g2 = parseInt(b.slice(3, 5), 16)
  const b2 = parseInt(b.slice(5, 7), 16)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bk = Math.round(b1 + (b2 - b1) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bk.toString(16).padStart(2, '0')}`
}

function getEffectiveColor(
  hex: string,
  entry: ColorEntry | undefined,
  mode: RenderMode,
  prevMode?: RenderMode,
  progress?: number,
): string {
  if (!entry) return hex
  const raw = getRawModeColor(entry, mode)
  if (prevMode == null || progress == null || progress >= 1) return raw
  const prevRaw = getRawModeColor(entry, prevMode)
  return lerpColor(prevRaw, raw, progress)
}

function getRawModeColor(entry: ColorEntry, mode: RenderMode): string {
  const { type, color1, color2 } = entry
  switch (mode) {
    case 'day':
      return color1
    case 'night':
      if (type === 'glow' && color2) return color2
      return dimColor(color1)
    case 'thermo':
      if (type === 'thermo' && color2) return color2
      return color1
    case 'photo':
      if (type === 'photo' && color2) return color2
      return color1
    case 'thermo-photo':
      if ((type === 'thermo' || type === 'photo') && color2) return color2
      return color1
  }
}

function isColorBright(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 140
}

function drawCheckerBg(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cSize = 6
  for (let row = 0; row * cSize < h; row++) {
    for (let col = 0; col * cSize < w; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#e8e8e8' : '#f5f5f5'
      ctx.fillRect(x + col * cSize, y + row * cSize, Math.min(cSize, w - col * cSize), Math.min(cSize, h - row * cSize))
    }
  }
}

function drawThickLines(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  cols: number, rows: number,
  cellSize: number,
  gridW: number, gridH: number,
  cfg: ThickLineConfig,
  direction: 'horizontal' | 'vertical',
) {
  if (!cfg.enabled) return
  const { interval, thickness, startOffset } = cfg
  if (interval <= 0 || thickness <= 0) return
  const count = direction === 'horizontal' ? rows : cols

  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = thickness
  ctx.beginPath()

  for (let i = startOffset; i <= count; i += interval) {
    if (i < 0 || i > count) continue
    const pos = direction === 'horizontal'
      ? oy + i * cellSize
      : ox + i * cellSize

    if (direction === 'horizontal') {
      ctx.moveTo(ox, pos)
      ctx.lineTo(ox + gridW, pos)
    } else {
      ctx.moveTo(pos, oy)
      ctx.lineTo(pos, oy + gridH)
    }
  }
  ctx.stroke()
}

function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  cellSize: number,
  rows: number, cols: number,
  preview: { shape: string; c1: number; r1: number; c2: number; r2: number; points: [number, number][] },
) {
  ctx.save()
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 2])

  if (preview.shape === 'lasso') {
    if (preview.points.length < 2) { ctx.restore(); return }
    ctx.beginPath()
    const first = preview.points[0]!
    ctx.moveTo(ox + first[0] * cellSize + cellSize / 2, oy + first[1] * cellSize + cellSize / 2)
    for (let i = 1; i < preview.points.length; i++) {
      const [c, r] = preview.points[i]!
      ctx.lineTo(ox + c * cellSize + cellSize / 2, oy + r * cellSize + cellSize / 2)
    }
    // 闭合线
    ctx.closePath()
    ctx.stroke()
  } else {
    const cMin = Math.min(preview.c1, preview.c2)
    const rMin = Math.min(preview.r1, preview.r2)
    const cMax = Math.max(preview.c1, preview.c2)
    const rMax = Math.max(preview.r1, preview.r2)
    const x = ox + cMin * cellSize
    const y = oy + rMin * cellSize
    const w = (cMax - cMin + 1) * cellSize
    const h = (rMax - rMin + 1) * cellSize

    if (preview.shape === 'rect') {
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.stroke()
    } else if (preview.shape === 'ellipse') {
      const cx = ox + (cMin + cMax + 1) * cellSize / 2
      const cy = oy + (rMin + rMax + 1) * cellSize / 2
      const rx = (cMax - cMin + 1) * cellSize / 2
      const ry = (rMax - rMin + 1) * cellSize / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (preview.shape === 'line') {
      const x1 = ox + preview.c1 * cellSize + cellSize / 2
      const y1 = oy + preview.r1 * cellSize + cellSize / 2
      const x2 = ox + preview.c2 * cellSize + cellSize / 2
      const y2 = oy + preview.r2 * cellSize + cellSize / 2
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
  }

  ctx.setLineDash([])
  ctx.restore()
}

function drawHighlightOverlay(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  rows: number, cols: number,
  cellSize: number,
  gridW: number, gridH: number,
  mask: boolean[][],
) {
  // 1. 对未高亮区域绘制灰蒙版 + 斜线
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, gridW, gridH)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (mask[r]?.[c]) {
        ctx.rect(ox + c * cellSize, oy + r * cellSize, cellSize, cellSize)
      }
    }
  }
  ctx.clip('evenodd')

  ctx.fillStyle = 'rgba(150,150,150,0.4)'
  ctx.fillRect(ox, oy, gridW, gridH)

  ctx.strokeStyle = 'rgba(180,180,180,0.5)'
  ctx.lineWidth = 1
  const spacing = cellSize * 1.2
  const startX = ox - gridH
  const endX = ox + gridW + gridH
  for (let x = startX; x < endX; x += spacing) {
    ctx.beginPath()
    ctx.moveTo(x, oy)
    ctx.lineTo(x + gridH, oy + gridH)
    ctx.stroke()
  }
  ctx.restore()

  // 2. 高亮区域边界描边（仅外边界，同选区逻辑）
  ctx.save()
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.setLineDash([3, 2])
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r]?.[c]) continue
      const x = ox + c * cellSize
      const y = oy + r * cellSize
      const hl = (nr: number, nc: number) => mask[nr]?.[nc] ?? false
      if (!hl(r - 1, c))     { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y) }
      if (!hl(r + 1, c))     { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize) }
      if (!hl(r, c - 1))     { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize) }
      if (!hl(r, c + 1))     { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize) }
    }
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  rows: number, cols: number,
  cellSize: number,
  gridW: number, gridH: number,
  mask: boolean[][],
) {
  // 1. 对未选区绘制灰蒙版 + 斜线（clip 限制在未选区）
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, gridW, gridH)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (mask[r]?.[c]) {
        // 挖掉选区格子（evenodd: 选区格被排除在 clip 外）
        ctx.rect(ox + c * cellSize, oy + r * cellSize, cellSize, cellSize)
      }
    }
  }
  ctx.clip('evenodd')

  // 半透明灰蒙版
  ctx.fillStyle = 'rgba(150,150,150,0.4)'
  ctx.fillRect(ox, oy, gridW, gridH)

  // 连续 45° 斜线
  ctx.strokeStyle = 'rgba(180,180,180,0.5)'
  ctx.lineWidth = 1
  const spacing = cellSize * 1.2
  const startX = ox - gridH
  const endX = ox + gridW + gridH
  for (let x = startX; x < endX; x += spacing) {
    ctx.beginPath()
    ctx.moveTo(x, oy)
    ctx.lineTo(x + gridH, oy + gridH)
    ctx.stroke()
  }
  ctx.restore()

  // 2. 选区边界虚线（画在选区边缘）
  ctx.save()
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 2
  ctx.setLineDash([3, 2])
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r]?.[c]) continue
      const x = ox + c * cellSize
      const y = oy + r * cellSize
      const sel = (nr: number, nc: number) => mask[nr]?.[nc] ?? false
      if (!sel(r - 1, c))     { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y) }
      if (!sel(r + 1, c))     { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize) }
      if (!sel(r, c - 1))     { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize) }
      if (!sel(r, c + 1))     { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize) }
    }
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function drawPearlSheen(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, cellSize: number,
) {
  // 左上角高光向四周渐变
  const grad = ctx.createRadialGradient(
    cx + cellSize * 0.3, cy + cellSize * 0.3, 0,
    cx + cellSize * 0.5, cy + cellSize * 0.5, cellSize * 0.65,
  )
  grad.addColorStop(0, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.1)')
  grad.addColorStop(1, 'rgba(0,0,0,0.05)')
  ctx.fillStyle = grad
  ctx.fillRect(cx, cy, cellSize, cellSize)
}

function drawSymmetryGuides(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  cols: number, rows: number,
  cellSize: number, gridW: number, gridH: number,
  symmetry: string,
) {
  if (symmetry === 'off') return
  ctx.save()
  ctx.strokeStyle = 'rgba(99,102,241,0.38)'
  ctx.lineWidth = 0.8
  ctx.setLineDash([4, 2.5])
  const cx = ox + gridW / 2
  const cy = oy + gridH / 2

  const drawH = () => {
    ctx.beginPath()
    ctx.moveTo(ox, cy)
    ctx.lineTo(ox + gridW, cy)
    ctx.stroke()
  }
  const drawV = () => {
    ctx.beginPath()
    ctx.moveTo(cx, oy)
    ctx.lineTo(cx, oy + gridH)
    ctx.stroke()
  }
  const drawDiag45 = () => {
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + gridW, oy + gridH)
    ctx.stroke()
  }
  const drawDiag135 = () => {
    ctx.beginPath()
    ctx.moveTo(ox + gridW, oy)
    ctx.lineTo(ox, oy + gridH)
    ctx.stroke()
  }
  const drawDot = () => {
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(99,102,241,0.5)'
    ctx.beginPath()
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.setLineDash([4, 2.5])
  }

  if (symmetry === 'center') { drawDot() }
  else if (symmetry === 'vertical') { drawV() }
  else if (symmetry === 'horizontal') { drawH() }
  else if (symmetry === 'diag45') { drawDiag45() }
  else if (symmetry === 'diag135') { drawDiag135() }
  else if (symmetry === 'cross') { drawV(); drawH() }
  else if (symmetry === 'x') { drawDiag45(); drawDiag135() }
  else if (symmetry === 'all8') { drawV(); drawH(); drawDiag45(); drawDiag135(); drawDot() }

  ctx.setLineDash([])
  ctx.restore()
}

function drawGeoPreview(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,
  cellSize: number,
  prev: { shape: string; sides?: number; c1: number; r1: number; c2: number; r2: number },
) {
  ctx.save()
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 2])

  const c1 = prev.c1; const r1 = prev.r1; const c2 = prev.c2; const r2 = prev.r2

  if (prev.shape === 'line') {
    const x1 = ox + c1 * cellSize + cellSize / 2
    const y1 = oy + r1 * cellSize + cellSize / 2
    const x2 = ox + c2 * cellSize + cellSize / 2
    const y2 = oy + r2 * cellSize + cellSize / 2
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  } else if (prev.shape === 'ellipse') {
    const cMin = Math.min(c1, c2); const cMax = Math.max(c1, c2)
    const rMin = Math.min(r1, r2); const rMax = Math.max(r1, r2)
    const cx = ox + (cMin + cMax + 1) * cellSize / 2
    const cy = oy + (rMin + rMax + 1) * cellSize / 2
    const rx = (cMax - cMin + 1) * cellSize / 2
    const ry = (rMax - rMin + 1) * cellSize / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (prev.shape === 'rect') {
    const cMin = Math.min(c1, c2); const cMax = Math.max(c1, c2)
    const rMin = Math.min(r1, r2); const rMax = Math.max(r1, r2)
    const x = ox + cMin * cellSize
    const y = oy + rMin * cellSize
    const w = (cMax - cMin + 1) * cellSize
    const h = (rMax - rMin + 1) * cellSize
    ctx.strokeRect(x, y, w, h)
  }

  ctx.setLineDash([])
  ctx.restore()
}

export interface RenderOptions {
  colorMap: Map<string, ColorEntry>
  renderMode: RenderMode
  prevRenderMode?: RenderMode
  transitionProgress?: number
  pixelShape: PixelShape
  showColorIds: boolean
  showColorIdsHighlightOnly: boolean
  backgroundColor: string
  symmetry: string
  thickLineH: ThickLineConfig
  thickLineV: ThickLineConfig
  gridThickness?: number
  gridOpacity?: number
  selectionMask: boolean[][] | null
  highlightMask: boolean[][] | null
  highlightNumberMode: 'off' | 'row' | 'col' | 'global'
  previewCols?: number
  previewRows?: number
  previewShape: {
    shape: string
    c1: number; r1: number
    c2: number; r2: number
    points: [number, number][]
  } | null
  geoPreview: {
    shape: string; sides: number
    c1: number; r1: number; c2: number; r2: number
  } | null
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  store: {
    cols: number; rows: number; zoom: number; panX: number; panY: number
    showGrid: boolean; compositeGrid: string[][]
  },
  opts: RenderOptions,
  exportSize?: { width: number; height: number; dpr?: number },
) {
  const ctx = canvas.getContext('2d')!
  let w: number, h: number, dpr: number

  if (exportSize) {
    dpr = exportSize.dpr ?? 1
    w = exportSize.width
    h = exportSize.height
    canvas.width = w * dpr
    canvas.height = h * dpr
    // 不设置 canvas.style — offscreen canvas 无 DOM
  } else {
    dpr = window.devicePixelRatio || 1
    const parent = canvas.parentElement!
    w = parent.clientWidth
    h = parent.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // full background (only for on-screen rendering)
  if (!exportSize) {
    ctx.fillStyle = '#e0e0e0'
    ctx.fillRect(0, 0, w, h)
  }

  const { zoom, panX, panY, showGrid, compositeGrid: grid } = store
  const cols = opts.previewCols ?? store.cols
  const rows = opts.previewRows ?? store.rows
  const cellSize = getCellSize(w, h, cols, rows, exportSize ? 1 : zoom)
  const gridW = cellSize * cols
  const gridH = cellSize * rows
  const ox = (w - gridW) / 2 + panX
  const oy = (h - gridH) / 2 + panY

  // grid-area background
  if (opts.backgroundColor === 'transparent') {
    if (!exportSize) {
      drawCheckerBg(ctx, ox, oy, gridW, gridH)
    }
    // export: leave real transparency (alpha channel)
  } else {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(ox, oy, gridW, gridH)
  }

  // draw cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = grid[r]?.[c]
      if (color) {
        const entry = opts.colorMap.get(color)
        const effective = getEffectiveColor(color, entry, opts.renderMode,
          opts.prevRenderMode, opts.transitionProgress)
        ctx.fillStyle = effective

        if (entry?.type === 'transparent') {
          ctx.globalAlpha = 0.45
        }

        const cx = ox + c * cellSize
        const cy = oy + r * cellSize
        if (opts.pixelShape === 'circle') {
          const radius = cellSize * 0.42
          ctx.beginPath()
          ctx.arc(cx + cellSize / 2, cy + cellSize / 2, radius, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(cx, cy, cellSize, cellSize)
        }

        if (entry?.type === 'transparent') {
          ctx.globalAlpha = 1.0
        }

        // 珠光像素闪光
        if (entry?.type === 'pearl') {
          drawPearlSheen(ctx, cx, cy, cellSize)
        }
      }
      // empty cells are already handled by background fill
    }
  }

  // grid lines
  if (showGrid && cellSize >= 4) {
    const gAlpha = opts.gridOpacity != null ? opts.gridOpacity / 100 : (cellSize <= 8 ? 0.08 : 0.12)
    ctx.strokeStyle = `rgba(0,0,0,${gAlpha})`
    ctx.lineWidth = opts.gridThickness ?? 1
    ctx.beginPath()
    for (let r = 0; r <= rows; r++) {
      const y = oy + r * cellSize
      ctx.moveTo(ox, y)
      ctx.lineTo(ox + gridW, y)
    }
    for (let c = 0; c <= cols; c++) {
      const x = ox + c * cellSize
      ctx.moveTo(x, oy)
      ctx.lineTo(x, oy + gridH)
    }
    ctx.stroke()
  }

  // thick lines
  drawThickLines(ctx, ox, oy, cols, rows, cellSize, gridW, gridH, opts.thickLineH, 'horizontal')
  drawThickLines(ctx, ox, oy, cols, rows, cellSize, gridW, gridH, opts.thickLineV, 'vertical')

  // grid border
  ctx.strokeStyle = '#999'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox, oy, gridW, gridH)

  // -- 对称基准线 --
  drawSymmetryGuides(ctx, ox, oy, cols, rows, cellSize, gridW, gridH, opts.symmetry)

  // -- 选区形状预览（拖拽中显示轮廓线） --
  if (opts.previewShape) {
    drawShapePreview(ctx, ox, oy, cellSize, rows, cols, opts.previewShape)
  }

  // -- 几何形状预览 --
  if (opts.geoPreview) {
    drawGeoPreview(ctx, ox, oy, cellSize, opts.geoPreview)
  }

  // -- 选区渲染 --
  if (opts.selectionMask) {
    drawSelectionOverlay(ctx, ox, oy, rows, cols, cellSize, gridW, gridH, opts.selectionMask)
  }

  // -- 高亮渲染 --
  if (opts.highlightMask && (!opts.selectionMask || opts.selectionMask.length === 0)) {
    drawHighlightOverlay(ctx, ox, oy, rows, cols, cellSize, gridW, gridH, opts.highlightMask)
  }

  // 高亮序号标记
  if (opts.highlightMask && opts.highlightNumberMode !== 'off' && cellSize >= 10) {
    const mask = opts.highlightMask
    const mode = opts.highlightNumberMode
    const fontSize = Math.max(8, Math.round(cellSize * 0.42))
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (mode === 'global') {
      let seq = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!mask[r]?.[c]) continue
          seq++
          const cx = ox + c * cellSize + cellSize / 2
          const cy = oy + r * cellSize + cellSize / 2
          ctx.fillStyle = isColorBright(grid[r]?.[c] ?? '') ? '#000' : '#fff'
          ctx.fillText(String(seq), cx, cy)
        }
      }
    } else if (mode === 'row') {
      for (let r = 0; r < rows; r++) {
        let seq = 0
        for (let c = 0; c < cols; c++) {
          if (!mask[r]?.[c]) continue
          seq++
          const cx = ox + c * cellSize + cellSize / 2
          const cy = oy + r * cellSize + cellSize / 2
          ctx.fillStyle = isColorBright(grid[r]?.[c] ?? '') ? '#000' : '#fff'
          ctx.fillText(String(seq), cx, cy)
        }
      }
    } else if (mode === 'col') {
      for (let c = 0; c < cols; c++) {
        let seq = 0
        for (let r = 0; r < rows; r++) {
          if (!mask[r]?.[c]) continue
          seq++
          const cx = ox + c * cellSize + cellSize / 2
          const cy = oy + r * cellSize + cellSize / 2
          ctx.fillStyle = isColorBright(grid[r]?.[c] ?? '') ? '#000' : '#fff'
          ctx.fillText(String(seq), cx, cy)
        }
      }
    }
  }

  // color IDs on cells（高亮序号激活时不渲染色号）
  if (opts.showColorIds && cellSize >= 14 && (opts.highlightNumberMode === 'off')) {
    const hlOnly = opts.showColorIdsHighlightOnly && opts.highlightMask
    ctx.font = '8px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const color = grid[r]?.[c]
        if (!color) continue
        if (hlOnly && !opts.highlightMask![r]?.[c]) continue
        const entry = opts.colorMap.get(color)
        if (!entry) continue
        const cx = ox + c * cellSize + cellSize / 2
        const cy = oy + r * cellSize + cellSize / 2
        ctx.fillStyle = isColorBright(color) ? '#000' : '#fff'
        ctx.fillText(entry.id, cx, cy)
      }
    }
  }

  // coordinate labels
  const LABEL_FONT = '10px "PingFang SC", "Microsoft YaHei", sans-serif'
  const labelInterval = Math.max(1, Math.ceil(30 / cellSize))
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const labelPadTop = 14
  ctx.fillStyle = '#e0e0e0'
  ctx.fillRect(ox, oy - labelPadTop, gridW, labelPadTop)
  ctx.fillStyle = '#666'
  for (let c = 0; c < cols; c += labelInterval) {
    const lx = ox + c * cellSize + cellSize / 2
    const ly = oy - 7
    ctx.fillText(String(c + 1), lx, ly)
  }

  const labelPadLeft = 22
  ctx.fillStyle = '#e0e0e0'
  ctx.fillRect(ox - labelPadLeft, oy, labelPadLeft, gridH)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#666'
  for (let r = 0; r < rows; r += labelInterval) {
    const lx = ox - 4
    const ly = oy + r * cellSize + cellSize / 2
    ctx.fillText(String(r + 1), lx, ly)
  }
}
