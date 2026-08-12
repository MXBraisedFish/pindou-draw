import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'
import { renderCanvas } from '@/ts/canvasRenderer'
import type { ThickLineConfig } from '@/stores/canvas'

export type ExportFormat = 'png' | 'jpg' | 'pindou'

function computeScale(cols: number, rows: number): number {
  const mag = Math.sqrt(Math.max(1, cols) * Math.max(1, rows))
  return Math.max(0.8, Math.min(3.5, mag / 32))
}

function cloneThickLine(cfg: ThickLineConfig): ThickLineConfig {
  return { ...cfg }
}

function calcOffset(pos: 'center' | 'start' | 'end', total: number, interval: number): number {
  const rem = total % interval
  if (pos === 'start') return 0
  if (pos === 'end') return rem
  return Math.floor(rem / 2)
}

export const useExportStore = defineStore('export', () => {
  const exportName = ref('')
  const exportFormat = ref<ExportFormat>('png')
  const showColorIds = ref(false)
  const showColorIdsHighlightOnly = ref(false)
  const showGrid = ref(true)
  const gridThickness = ref(1)
  const gridOpacity = ref(12)
  const thickLineH: Ref<ThickLineConfig> = ref({ enabled: false, interval: 5, thickness: 1, startOffset: 0 })
  const thickLineV: Ref<ThickLineConfig> = ref({ enabled: false, interval: 5, thickness: 1, startOffset: 0 })
  const hStartPos = ref<'center' | 'start' | 'end'>('center')
  const vStartPos = ref<'center' | 'start' | 'end'>('center')
  const coordDisplay = ref<'none' | 'single' | 'dual'>('single')
  const coordAxisStyle = ref<'direct' | 'cell'>('direct')
  const pixelShape = ref<'square' | 'circle'>('square')
  const sketchBg = ref('#ffffff')
  const pageBg = ref('#ffffff')
  const exportRenderMode = ref<'day' | 'night' | 'thermo' | 'photo' | 'thermo-photo'>('day')
  const exportFont = ref<'pixel' | 'pixelfont' | 'default'>('pixelfont')
  const tableLayout = ref<'block' | 'table' | 'compact'>('block')
  const exportContent = ref<'full' | 'sketch-only'>('full')
  const exportHighlightActive = ref(false)
  const exportHighlightOnly = ref(false)
  const exportHighlightedColorIds = ref<Set<string>>(new Set())
  const exportHighlightNumberMode = ref<'off' | 'row' | 'col' | 'global'>('off')
  const showModal = ref(false)
  const exportLayerId = ref<string | null>(null)

  const previewDataUrl = ref('')
  const colorStats = ref<{ hex: string; id: string; count: number }[]>([])
  const totalPixelCount = ref(0)

  const previewZoom = ref(1)
  const previewPanX = ref(0)
  const previewPanY = ref(0)

  function initFromCanvas() {
    const canvasStore = useCanvasStore()
    const projectStore = useProjectStore()
    exportName.value = projectStore.projectName
    showGrid.value = canvasStore.showGrid
    thickLineH.value = cloneThickLine(canvasStore.thickLineH)
    thickLineV.value = cloneThickLine(canvasStore.thickLineV)
    coordDisplay.value = 'single'
    pixelShape.value = canvasStore.pixelShape
    sketchBg.value = canvasStore.backgroundColor
    pageBg.value = '#ffffff'
    exportRenderMode.value = canvasStore.renderMode
    previewZoom.value = 1
    previewPanX.value = 0
    previewPanY.value = 0
  }

  function computeColorStats(hlMask?: boolean[][] | null, gridOverride?: string[][]) {
    const canvasStore = useCanvasStore()
    const paletteStore = usePaletteStore()
    const counts = new Map<string, number>()
    let total = 0
    const grid = gridOverride ?? canvasStore.compositeGrid
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]!
      for (let c = 0; c < row.length; c++) {
        const hex = row[c]
        if (!hex) continue
        if (hlMask && !hlMask[r]?.[c]) continue
        counts.set(hex, (counts.get(hex) ?? 0) + 1)
        total++
      }
    }
    const stats: { hex: string; id: string; count: number }[] = []
    for (const [hex, count] of counts) {
      const entry = paletteStore.colorMap.get(hex)
      stats.push({ hex, id: entry?.id ?? '?', count })
    }
    stats.sort((a, b) => b.count - a.count)
    colorStats.value = stats
    totalPixelCount.value = total
  }

  function computeExportHighlightMask(grid: string[][]): boolean[][] | null {
    if (!exportHighlightActive.value || exportHighlightedColorIds.value.size === 0) return null
    const paletteStore = usePaletteStore()
    const idSet = exportHighlightedColorIds.value
    const hexSet = new Set<string>()
    for (const entry of paletteStore.colorEntries) {
      if (idSet.has(entry.id)) hexSet.add(entry.color1)
    }
    if (hexSet.size === 0) return null
    return grid.map(row => row.map(hex => hex !== '' && hexSet.has(hex)))
  }

  function renderGridTo(
    canvas: HTMLCanvasElement, w: number, h: number,
    gridOverride?: string[][],
    hlMask?: boolean[][] | null,
  ) {
    const canvasStore = useCanvasStore()
    const paletteStore = usePaletteStore()
    const isHlActive = hlMask && hlMask.length > 0
    renderCanvas(canvas, {
      cols: canvasStore.cols, rows: canvasStore.rows,
      zoom: 1, panX: 0, panY: 0,
      showGrid: showGrid.value,
      compositeGrid: gridOverride ?? canvasStore.compositeGrid,
    }, {
      colorMap: paletteStore.colorMap,
      renderMode: exportRenderMode.value,
      pixelShape: pixelShape.value,
      showColorIds: showColorIds.value && (exportHighlightNumberMode.value === 'off'),
      showColorIdsHighlightOnly: showColorIdsHighlightOnly.value,
      backgroundColor: sketchBg.value,
      symmetry: 'off',
      thickLineH: showGrid.value ? thickLineH.value : { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
      thickLineV: showGrid.value ? thickLineV.value : { enabled: false, interval: 5, thickness: 1, startOffset: 0 },
      gridThickness: gridThickness.value,
      gridOpacity: gridOpacity.value,
      selectionMask: null,
      highlightMask: isHlActive ? hlMask : null,
      highlightNumberMode: isHlActive ? exportHighlightNumberMode.value : 'off',
      previewShape: null,
      geoPreview: null,
    }, { width: w, height: h, dpr: 2 })
  }

  function refreshPreview() {
    const canvasStore = useCanvasStore()
    const cols = canvasStore.cols
    const rows = canvasStore.rows

    // 单图层导出：使用指定图层的 grid 作为源
    const sourceGrid = exportLayerId.value
      ? (canvasStore.layers.find(l => l.id === exportLayerId.value)?.grid ?? canvasStore.compositeGrid)
      : canvasStore.compositeGrid

    // 应用粗线对齐偏移
    thickLineH.value.startOffset = calcOffset(hStartPos.value, rows, thickLineH.value.interval)
    thickLineV.value.startOffset = calcOffset(vStartPos.value, cols, thickLineV.value.interval)

    const isSketchOnly = exportContent.value === 'sketch-only'

    // 导出高亮（独立于画布高亮）
    const hlActive = exportHighlightActive.value && exportHighlightedColorIds.value.size > 0
    const hlOnly = hlActive && exportHighlightOnly.value
    const hlMask = hlActive ? computeExportHighlightMask(sourceGrid) : null
    let filteredGrid: string[][] | null = null
    if (hlOnly && hlMask) {
      filteredGrid = sourceGrid.map((row, r) =>
        row.map((hex, c) => (hlMask![r]![c] ? hex : ''))
      )
    }

    if (!isSketchOnly) {
      computeColorStats(hlOnly ? hlMask : null, sourceGrid)
    }
    const scale = computeScale(cols, rows)
    const factor = 40 // base px unit
    const cellSize = Math.max(4, Math.round(factor * scale))
    const gridW = cols * cellSize
    const gridH = rows * cellSize

    // 自适应文字和间距
    const headingFont = Math.max(22, Math.round(factor * 0.6 * scale))
    const labelFont = Math.max(12, Math.round(factor * 0.35 * scale))
    const tableFont = Math.max(14, Math.round(factor * 0.38 * scale))
    const pad = Math.max(30, Math.round(factor * 0.7 * scale))
    const headingGap = Math.max(20, Math.round(factor * 0.45 * scale))
    const sectionGap = Math.max(20, Math.round(factor * 0.5 * scale))
    const swatchW = Math.max(60, Math.round(factor * 1.2 * scale))
    const swatchH = Math.max(40, Math.round(factor * 0.8 * scale))
    const swatchGapX = Math.max(20, Math.round(factor * 0.4 * scale))
    const swatchGapY = Math.max(16, Math.round(factor * 0.3 * scale))
    const swatchRadius = Math.round(Math.min(swatchW, swatchH) * 0.35)

    // 坐标显示与边距（先计算，供 totalW 使用）
    const showCoords = coordDisplay.value !== 'none'
    const isDual = coordDisplay.value === 'dual'
    const isCellAxis = coordAxisStyle.value === 'cell'

    // 方格坐标轴占用额外的 cellSize 边距；直接渲染预留文字高度
    const coordLeftPad = showCoords ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordTopPad = showCoords ? (isCellAxis ? cellSize : labelFont + 6) : 0
    const coordRightPad = showCoords && isDual ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordBottomPad = showCoords && isDual ? (isCellAxis ? cellSize : labelFont + 6) : 0

    const stats = colorStats.value

    function swatchLabelFont() { return Math.max(16, Math.round(factor * 0.38 * scale)) }
    const sFont = swatchLabelFont()
    const cFont = Math.round(sFont * 0.85)
    const tgap = Math.max(6, Math.round(factor * 0.14 * scale))

    // 色号表布局（仅成图模式）
    const layout = tableLayout.value
    let itemH = 0
    let cellW = 0
    let cellGapX = 0
    let cellGapY = 0
    let colsPerRowFinal = 1
    let tableH = 0
    let tableSwatchW = 0 // 表格布局动态色块宽度

    // 计算 totalW（仅草图模式只考虑网格+坐标；成图模式还要考虑色号表）
    let totalW: number
    if (isSketchOnly) {
      totalW = Math.max(gridW + coordLeftPad + coordRightPad + pad * 2, 300)
    } else {
      const MIN_COLS = 4
      const rawCols = stats.length > 0
        ? Math.max(MIN_COLS, Math.ceil(Math.sqrt(stats.length * (swatchW + swatchGapX) / (swatchH + swatchLabelFont() + swatchGapY))))
        : 1
      const neededTableW = stats.length > 0 ? rawCols * (swatchW + swatchGapX) - swatchGapX + pad * 2 : 0
      totalW = Math.max(gridW + pad * 2, neededTableW, 300)
      const colsPerRow = stats.length > 0
        ? Math.max(1, Math.min(stats.length, Math.floor((totalW - pad * 2 + swatchGapX) / (swatchW + swatchGapX))))
        : 1

      if (stats.length > 0) {
        // 动态尺寸基础：最大色号长度 & 最大数量位数
        const maxIdLen = Math.max(...stats.map(st => st.id.length), 1)
        const maxCount = Math.max(...stats.map(st => st.count), 1)
        const maxCountDigits = String(maxCount).length

        if (layout === 'compact') {
          const s = Math.max(26, Math.round(swatchH * 0.65))
          const ctgap = Math.max(3, Math.round(tgap * 0.5))
          // 数量文字宽度
          const countTextW = Math.ceil(cFont * 0.6 * (maxCountDigits + 1))
          // 色号渲染在色块内部，字宽按色块尺寸估算
          const idFontInSwatch = Math.max(10, Math.round(s * 0.4))
          const idTextW = Math.ceil(idFontInSwatch * 0.6 * maxIdLen)
          const compactCellW = Math.max(s, countTextW + 6, idTextW + 4)
          itemH = s + ctgap + cFont
          cellW = compactCellW
          cellGapX = Math.max(6, Math.round(swatchGapX * 0.3))
          cellGapY = Math.max(4, Math.round(swatchGapY * 0.25))
          colsPerRowFinal = stats.length > 0
            ? Math.max(1, Math.min(stats.length, Math.floor((totalW - pad * 2 + cellGapX) / (cellW + cellGapX))))
            : 1
        } else if (layout === 'table') {
          // 表格：色块内色号 + 右侧数量
          const countTextW = Math.ceil(sFont * 0.6 * (maxCountDigits + 1))
          // 色号在色块内渲染，色块为 swatchH x swatchH，字宽按色块尺寸估算
          const tableIdFont = Math.max(10, Math.round(swatchH * 0.4))
          const idTextW = Math.ceil(tableIdFont * 0.6 * maxIdLen)
          // 色块宽度至少能容纳色号文字
          tableSwatchW = Math.max(swatchH, idTextW + 4)
          const tableMinW = tableSwatchW + tgap + countTextW + 4
          itemH = Math.max(swatchH, sFont + tgap + cFont)
          cellW = Math.max(swatchW, tableMinW)
          cellGapX = swatchGapX
          cellGapY = swatchGapY
          colsPerRowFinal = colsPerRow
        } else {
          // block：色号上 + 色块中 + 数量下
          const countTextW = Math.ceil(cFont * 0.6 * (maxCountDigits + 1))
          // 色号在上方，使用 sFont 渲染
          const idTextW = Math.ceil(sFont * 0.55 * maxIdLen)
          cellW = Math.max(swatchW, countTextW + 8, idTextW + 8)
          itemH = sFont + tgap + swatchH + tgap + cFont
          cellGapX = swatchGapX
          cellGapY = swatchGapY
          colsPerRowFinal = colsPerRow
        }
        const tableRows = Math.ceil(stats.length / colsPerRowFinal)
        tableH = tableRows * (itemH + cellGapY)
      }
    }

    const gridAreaOx = Math.round((totalW - (gridW + coordLeftPad + coordRightPad)) / 2)
    const gridAreaOy = isSketchOnly ? pad : pad + headingFont + headingGap
    const gridDrawOx = gridAreaOx + coordLeftPad
    const gridDrawOy = gridAreaOy + coordTopPad

    const effectiveGridH = gridH + coordTopPad + coordBottomPad
    const showTotalLabel = !isSketchOnly && totalPixelCount.value > 0
    const totalLabelH = showTotalLabel ? tableFont + 16 : 0
    const tableOy = gridAreaOy + effectiveGridH + sectionGap + totalLabelH
    const totalH = isSketchOnly
      ? gridAreaOy + effectiveGridH + pad
      : tableOy + tableH + pad

    const fontFamily = exportFont.value === 'pixel'
      ? '"MinecraftTen", "PixelFont", monospace'
      : exportFont.value === 'pixelfont'
        ? '"PixelFont", monospace'
        : '"PingFang SC", "Microsoft YaHei", sans-serif'

    // 渲染
    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = totalW * dpr
    canvas.height = totalH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    // 透明背景不填充，保留 alpha 通道（JPG 导出时在 doExport 中单独处理白底）
    const fillColor = isSketchOnly
      ? (sketchBg.value === 'transparent' ? null : sketchBg.value)
      : (pageBg.value === 'transparent' ? null : pageBg.value)
    if (fillColor !== null) {
      ctx.fillStyle = fillColor
      ctx.fillRect(0, 0, totalW, totalH)
    }

    // 标题（仅成图模式）
    if (!isSketchOnly) {
      ctx.fillStyle = '#222'
      ctx.font = `bold ${headingFont}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(exportName.value, totalW / 2, pad + headingFont / 2)
    }

    // 草图（渲染到离屏 canvas，再贴到布局）
    const gridCanvas = document.createElement('canvas')
    const gdpr = 2
    gridCanvas.width = gridW * gdpr
    gridCanvas.height = gridH * gdpr
    renderGridTo(gridCanvas, gridW, gridH, filteredGrid ?? sourceGrid, hlMask)
    ctx.drawImage(gridCanvas, gridDrawOx, gridDrawOy, gridW, gridH)

    // 坐标轴
    const labelInterval = Math.max(1, Math.ceil(25 / cellSize))
    const coordBg = '#e9e5df'
    const coordTextColor = '#555'

    if (showCoords && isCellAxis) {
      // --- 方格坐标轴：坐标占据独立单元格 ---
      const drawCoordCell = (cx: number, cy: number, label: string) => {
        ctx.fillStyle = coordBg
        ctx.fillRect(cx, cy, cellSize, cellSize)
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(cx, cy, cellSize, cellSize)
        ctx.fillStyle = coordTextColor
        ctx.font = `bold ${Math.max(10, Math.round(cellSize * 0.42))}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, cx + cellSize / 2, cy + cellSize / 2)
      }

      for (let c = 0; c < cols; c += labelInterval) {
        drawCoordCell(gridDrawOx + c * cellSize, gridAreaOy, String(c + 1))
        if (isDual) {
          drawCoordCell(gridDrawOx + c * cellSize, gridDrawOy + gridH, String(c + 1))
        }
      }
      for (let r = 0; r < rows; r += labelInterval) {
        drawCoordCell(gridAreaOx, gridDrawOy + r * cellSize, String(r + 1))
        if (isDual) {
          drawCoordCell(gridDrawOx + gridW, gridDrawOy + r * cellSize, String(r + 1))
        }
      }
      // 四角方格
      drawCoordCell(gridAreaOx, gridAreaOy, '')
      if (isDual) {
        drawCoordCell(gridDrawOx + gridW, gridAreaOy, '')
        drawCoordCell(gridAreaOx, gridDrawOy + gridH, '')
        drawCoordCell(gridDrawOx + gridW, gridDrawOy + gridH, '')
      }

      // 外边框包裹网格 + 坐标格
      const borderW = gridW + coordLeftPad + coordRightPad
      const borderH = gridH + coordTopPad + coordBottomPad
      ctx.strokeStyle = '#999'
      ctx.lineWidth = 1.5
      ctx.strokeRect(gridAreaOx, gridAreaOy, borderW, borderH)
    } else if (showCoords) {
      // --- 直接渲染坐标轴：文字标注在网格外侧 ---
      ctx.font = `${labelFont}px ${fontFamily}`
      ctx.fillStyle = '#666'
      // 上方列号
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      for (let c = 0; c < cols; c += labelInterval) {
        ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy - 2)
      }
      // 左侧行号
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let r = 0; r < rows; r += labelInterval) {
        ctx.fillText(String(r + 1), gridDrawOx - 4, gridDrawOy + r * cellSize + cellSize / 2)
      }
      if (isDual) {
        // 下方列号
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        for (let c = 0; c < cols; c += labelInterval) {
          ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy + gridH + 2)
        }
        // 右侧行号
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        for (let r = 0; r < rows; r += labelInterval) {
          ctx.fillText(String(r + 1), gridDrawOx + gridW + 4, gridDrawOy + r * cellSize + cellSize / 2)
        }
      }
    }

    // 总像素使用量
    if (showTotalLabel) {
      const totalLabelY = gridAreaOy + effectiveGridH + sectionGap + 4
      ctx.fillStyle = '#888'
      ctx.font = `${tableFont}px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`总像素：${totalPixelCount.value}`, totalW / 2, totalLabelY)
    }

    // 色号表（仅成图模式）
    if (!isSketchOnly && stats.length > 0) {
      const tableContentW = colsPerRowFinal * (cellW + cellGapX) - cellGapX
      const tableStartX = Math.round((totalW - tableContentW) / 2)

      ctx.textAlign = 'center'
      for (let i = 0; i < stats.length; i++) {
        const s = stats[i]!
        const col = i % colsPerRowFinal
        const row = Math.floor(i / colsPerRowFinal)
        const ix = tableStartX + col * (cellW + cellGapX)
        const iy = tableOy + row * (itemH + cellGapY)

        if (layout === 'compact') {
          // 紧凑：圆角小方块（内显色号），数量在下方
          const cs = cellW
          const ctgap = Math.max(3, Math.round(tgap * 0.5))
          ctx.fillStyle = s.hex
          ctx.beginPath()
          const r = cs * 0.3
          ctx.moveTo(ix + r, iy)
          ctx.arcTo(ix + cs, iy, ix + cs, iy + cs, r)
          ctx.arcTo(ix + cs, iy + cs, ix, iy + cs, r)
          ctx.arcTo(ix, iy + cs, ix, iy, r)
          ctx.arcTo(ix, iy, ix + cs, iy, r)
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke()

          const bright = parseInt(s.hex.slice(1,3),16)*299+parseInt(s.hex.slice(3,5),16)*587+parseInt(s.hex.slice(5,7),16)*114 > 140000
          ctx.fillStyle = bright ? '#000' : '#fff'
          ctx.font = `bold ${Math.round(cs * 0.4)}px ${fontFamily}`
          ctx.textBaseline = 'middle'
          ctx.fillText(s.id, ix + cs / 2, iy + cs / 2)

          ctx.fillStyle = '#666'
          ctx.font = `${cFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + cs / 2, iy + cs + ctgap + cFont / 2)
        } else if (layout === 'table') {
          // 表格：色块 + 色号文字 + 数量
          const th = swatchH
          const tw = tableSwatchW || swatchH
          ctx.fillStyle = s.hex
          ctx.fillRect(ix, iy, tw, th)
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(ix, iy, tw, th)

          const bright = parseInt(s.hex.slice(1,3),16)*299+parseInt(s.hex.slice(3,5),16)*587+parseInt(s.hex.slice(5,7),16)*114 > 140000
          ctx.fillStyle = bright ? '#000' : '#fff'
          ctx.font = `bold ${Math.round(th * 0.4)}px ${fontFamily}`
          ctx.textBaseline = 'middle'
          ctx.fillText(s.id, ix + tw / 2, iy + th / 2)

          ctx.textAlign = 'left'
          ctx.fillStyle = '#444'
          ctx.font = `${sFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + tw + tgap, iy + th / 2)
          ctx.textAlign = 'center'
        } else {
          // block：大色块 + 色号上 + 数量下
          ctx.fillStyle = '#555'
          ctx.font = `${sFont}px ${fontFamily}`
          ctx.textBaseline = 'top'
          ctx.fillText(s.id, ix + swatchW / 2, iy)

          const sy = iy + sFont + tgap
          ctx.fillStyle = s.hex
          ctx.beginPath()
          ctx.moveTo(ix + swatchRadius, sy)
          ctx.arcTo(ix + swatchW, sy, ix + swatchW, sy + swatchH, swatchRadius)
          ctx.arcTo(ix + swatchW, sy + swatchH, ix, sy + swatchH, swatchRadius)
          ctx.arcTo(ix, sy + swatchH, ix, sy, swatchRadius)
          ctx.arcTo(ix, sy, ix + swatchW, sy, swatchRadius)
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke()

          ctx.fillStyle = '#888'
          ctx.font = `${cFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + swatchW / 2, sy + swatchH + tgap)
        }
      }
    }

    previewDataUrl.value = canvas.toDataURL()
  }

  function doExport() {
    if (exportFormat.value === 'pindou') {
      useProjectStore().saveProject()
      return
    }
    if (!previewDataUrl.value) return

    if (exportFormat.value === 'jpg') {
      // JPG 不支持透明度，绘制白底后导出
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, 0, 0)
        c.toBlob(blob => {
          if (!blob) return
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `${exportName.value}.jpg`
          a.click()
          URL.revokeObjectURL(a.href)
        }, 'image/jpeg', 0.95)
      }
      img.src = previewDataUrl.value
      return
    }

    const a = document.createElement('a')
    a.href = previewDataUrl.value
    a.download = `${exportName.value}.${exportFormat.value}`
    a.click()
  }

  async function batchExportHighlight() {
    const paletteStore = usePaletteStore()
    const canvasStore = useCanvasStore()

    // 未选择高亮色时自动全选画布已有颜色
    let hlHexes: string[] = []
    if (exportHighlightedColorIds.value.size === 0) {
      const usedHexSet = new Set<string>()
      for (const row of canvasStore.compositeGrid) {
        for (const hex of row) {
          if (hex) usedHexSet.add(hex)
        }
      }
      for (const entry of paletteStore.colorEntries) {
        if (usedHexSet.has(entry.color1)) {
          hlHexes.push(entry.color1)
        }
      }
    } else {
      const idSet = exportHighlightedColorIds.value
      for (const entry of paletteStore.colorEntries) {
        if (idSet.has(entry.id)) {
          hlHexes.push(entry.color1)
        }
      }
    }
    if (hlHexes.length === 0) return

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    const cols = canvasStore.cols
    const rows = canvasStore.rows
    const scale = computeScale(cols, rows)
    const factor = 40
    const cellSize = Math.max(4, Math.round(factor * scale))
    const gridW = cols * cellSize
    const gridH = rows * cellSize
    const fontFamily = exportFont.value === 'pixel'
      ? '"MinecraftTen", "PixelFont", monospace'
      : exportFont.value === 'pixelfont'
        ? '"PixelFont", monospace'
        : '"PingFang SC", "Microsoft YaHei", sans-serif'
    const headingFont = Math.max(22, Math.round(factor * 0.6 * scale))
    const labelFont = Math.max(12, Math.round(factor * 0.35 * scale))
    const tableFont = Math.max(14, Math.round(factor * 0.38 * scale))
    const pad = Math.max(30, Math.round(factor * 0.7 * scale))
    const headingGap = Math.max(20, Math.round(factor * 0.45 * scale))
    const sectionGap = Math.max(20, Math.round(factor * 0.5 * scale))
    const swatchW = Math.max(60, Math.round(factor * 1.2 * scale))
    const swatchH = Math.max(40, Math.round(factor * 0.8 * scale))
    const swatchRadius = Math.round(Math.min(swatchW, swatchH) * 0.35)

    const showCoords = coordDisplay.value !== 'none'
    const isDual = coordDisplay.value === 'dual'
    const isCellAxis = coordAxisStyle.value === 'cell'
    const coordLeftPad = showCoords ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordTopPad = showCoords ? (isCellAxis ? cellSize : labelFont + 6) : 0
    const coordRightPad = showCoords && isDual ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordBottomPad = showCoords && isDual ? (isCellAxis ? cellSize : labelFont + 6) : 0

    const isFull = exportContent.value === 'full'
    const totalW = Math.max(gridW + coordLeftPad + coordRightPad + pad * 2, 200)

    const labelInterval = Math.max(1, Math.ceil(25 / cellSize))
    const dpr = 2

    for (const targetHex of hlHexes) {
      const entry = paletteStore.colorMap.get(targetHex)
      const colorLabel = entry?.id ?? targetHex

      // 构建仅含目标颜色的 grid + 统计
      let count = 0
      const singleGrid = canvasStore.compositeGrid.map(row =>
        row.map(hex => {
          if (hex === targetHex) { count++; return hex }
          return ''
        })
      )

      // 计算布局
      const headingH = isFull ? headingFont + headingGap : 0
      const gridAreaOx = Math.round((totalW - (gridW + coordLeftPad + coordRightPad)) / 2)
      const gridAreaOy = pad + headingH
      const gridDrawOx = gridAreaOx + coordLeftPad
      const gridDrawOy = gridAreaOy + coordTopPad
      const effectiveGridH = gridH + coordTopPad + coordBottomPad
      const totalLabelH = isFull ? tableFont + 16 : 0
      const tableOy = gridAreaOy + effectiveGridH + sectionGap + totalLabelH
      const tableH = isFull ? (swatchH + 30) : 0
      const totalH = isFull
        ? tableOy + tableH + pad
        : gridAreaOy + effectiveGridH + pad

      const canvas = document.createElement('canvas')
      canvas.width = totalW * dpr
      canvas.height = totalH * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)

      // 背景
      const bgColor = isFull
        ? (pageBg.value === 'transparent' ? null : pageBg.value)
        : (sketchBg.value === 'transparent' ? null : sketchBg.value)
      if (bgColor !== null) {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, totalW, totalH)
      }

      // 标题（成图）
      if (isFull) {
        ctx.fillStyle = '#222'
        ctx.font = `bold ${headingFont}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(exportName.value, totalW / 2, pad + headingFont / 2)
      }

      // 草图
      const gridCanvas = document.createElement('canvas')
      gridCanvas.width = gridW * dpr
      gridCanvas.height = gridH * dpr
      renderGridTo(gridCanvas, gridW, gridH, singleGrid)
      ctx.drawImage(gridCanvas, gridDrawOx, gridDrawOy, gridW, gridH)

      // 坐标轴
      if (showCoords) {
        ctx.font = `${labelFont}px ${fontFamily}`
        ctx.fillStyle = '#666'
        if (isCellAxis) {
          const coordBg = '#e9e5df'
          const drawCoordCell = (cx: number, cy: number, lab: string) => {
            ctx.fillStyle = coordBg
            ctx.fillRect(cx, cy, cellSize, cellSize)
            ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5
            ctx.strokeRect(cx, cy, cellSize, cellSize)
            ctx.fillStyle = '#555'
            ctx.font = `bold ${Math.max(10, Math.round(cellSize * 0.42))}px ${fontFamily}`
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(lab, cx + cellSize / 2, cy + cellSize / 2)
          }
          for (let c = 0; c < cols; c += labelInterval) {
            drawCoordCell(gridDrawOx + c * cellSize, gridAreaOy, String(c + 1))
            if (isDual) drawCoordCell(gridDrawOx + c * cellSize, gridDrawOy + gridH, String(c + 1))
          }
          for (let r = 0; r < rows; r += labelInterval) {
            drawCoordCell(gridAreaOx, gridDrawOy + r * cellSize, String(r + 1))
            if (isDual) drawCoordCell(gridDrawOx + gridW, gridDrawOy + r * cellSize, String(r + 1))
          }
          drawCoordCell(gridAreaOx, gridAreaOy, '')
          if (isDual) {
            drawCoordCell(gridDrawOx + gridW, gridAreaOy, '')
            drawCoordCell(gridAreaOx, gridDrawOy + gridH, '')
            drawCoordCell(gridDrawOx + gridW, gridDrawOy + gridH, '')
          }
          ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5
          ctx.strokeRect(gridAreaOx, gridAreaOy, gridW + coordLeftPad + coordRightPad, gridH + coordTopPad + coordBottomPad)
        } else {
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          for (let c = 0; c < cols; c += labelInterval) {
            ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy - 2)
          }
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
          for (let r = 0; r < rows; r += labelInterval) {
            ctx.fillText(String(r + 1), gridDrawOx - 4, gridDrawOy + r * cellSize + cellSize / 2)
          }
          if (isDual) {
            ctx.textAlign = 'center'; ctx.textBaseline = 'top'
            for (let c = 0; c < cols; c += labelInterval) {
              ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy + gridH + 2)
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
            for (let r = 0; r < rows; r += labelInterval) {
              ctx.fillText(String(r + 1), gridDrawOx + gridW + 4, gridDrawOy + r * cellSize + cellSize / 2)
            }
          }
        }
      }

      // 成图模式：总像素 + 色号表
      if (isFull) {
        const totalLabelY = gridAreaOy + effectiveGridH + sectionGap + 4
        ctx.fillStyle = '#888'
        ctx.font = `${tableFont}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`总像素：${count}`, totalW / 2, totalLabelY)

        // 单色色号表
        const tableStartX = Math.round((totalW - swatchW) / 2)
        const ix = tableStartX
        const iy = tableOy
        const sFont2 = Math.max(16, Math.round(factor * 0.38 * scale))
        const cFont2 = Math.round(sFont2 * 0.85)
        const tgap2 = Math.max(6, Math.round(factor * 0.14 * scale))

        // 色块
        const sy = iy + sFont2 + tgap2
        ctx.fillStyle = targetHex
        ctx.beginPath()
        ctx.moveTo(ix + swatchRadius, sy)
        ctx.arcTo(ix + swatchW, sy, ix + swatchW, sy + swatchH, swatchRadius)
        ctx.arcTo(ix + swatchW, sy + swatchH, ix, sy + swatchH, swatchRadius)
        ctx.arcTo(ix, sy + swatchH, ix, sy, swatchRadius)
        ctx.arcTo(ix, sy, ix + swatchW, sy, swatchRadius)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke()

        ctx.fillStyle = '#555'
        ctx.font = `${sFont2}px ${fontFamily}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(colorLabel, ix + swatchW / 2, iy)

        ctx.fillStyle = '#888'
        ctx.font = `${cFont2}px ${fontFamily}`
        ctx.fillText(`x${count}`, ix + swatchW / 2, sy + swatchH + tgap2)
      } else {
        // 仅草图：右上角色号标签
        ctx.fillStyle = '#333'
        ctx.font = `bold ${Math.round(labelFont * 1.1)}px ${fontFamily}`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        ctx.fillText(colorLabel, totalW - pad, pad + 2)
      }

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (blob) {
        zip.file(`${colorLabel}.png`, blob)
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportName.value}_高亮批量.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportLayer(layerId: string) {
    const canvasStore = useCanvasStore()
    const paletteStore = usePaletteStore()
    const layer = canvasStore.layers.find(l => l.id === layerId)
    if (!layer) return

    const cols = canvasStore.cols
    const rows = canvasStore.rows
    const scale = computeScale(cols, rows)
    const factor = 40
    const cellSize = Math.max(4, Math.round(factor * scale))
    const gridW = cols * cellSize
    const gridH = rows * cellSize

    const headingFont = Math.max(22, Math.round(factor * 0.6 * scale))
    const labelFont = Math.max(12, Math.round(factor * 0.35 * scale))
    const tableFont = Math.max(14, Math.round(factor * 0.38 * scale))
    const pad = Math.max(30, Math.round(factor * 0.7 * scale))
    const headingGap = Math.max(20, Math.round(factor * 0.45 * scale))
    const sectionGap = Math.max(20, Math.round(factor * 0.5 * scale))
    const swatchW = Math.max(60, Math.round(factor * 1.2 * scale))
    const swatchH = Math.max(40, Math.round(factor * 0.8 * scale))
    const swatchRadius = Math.round(Math.min(swatchW, swatchH) * 0.35)
    const swatchGapX = Math.max(20, Math.round(factor * 0.4 * scale))
    const swatchGapY = Math.max(16, Math.round(factor * 0.3 * scale))

    const showCoords = coordDisplay.value !== 'none'
    const isDual = coordDisplay.value === 'dual'
    const isCellAxis = coordAxisStyle.value === 'cell'
    const coordLeftPad = showCoords ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordTopPad = showCoords ? (isCellAxis ? cellSize : labelFont + 6) : 0
    const coordRightPad = showCoords && isDual ? (isCellAxis ? cellSize : Math.max(labelFont + 4, Math.round(cellSize * 0.6))) : 0
    const coordBottomPad = showCoords && isDual ? (isCellAxis ? cellSize : labelFont + 6) : 0
    const fontFamily = exportFont.value === 'pixel'
      ? '"MinecraftTen", "PixelFont", monospace'
      : exportFont.value === 'pixelfont'
        ? '"PixelFont", monospace'
        : '"PingFang SC", "Microsoft YaHei", sans-serif'

    // 统计该图层颜色
    const counts = new Map<string, number>()
    let total = 0
    for (const row of layer.grid) {
      for (const hex of row) {
        if (hex) { counts.set(hex, (counts.get(hex) ?? 0) + 1); total++ }
      }
    }
    const stats: { hex: string; id: string; count: number }[] = []
    for (const [hex, count] of counts) {
      const entry = paletteStore.colorMap.get(hex)
      stats.push({ hex, id: entry?.id ?? '?', count })
    }
    stats.sort((a, b) => b.count - a.count)

    function swatchLabelFont() { return Math.max(16, Math.round(factor * 0.38 * scale)) }
    const sFont = swatchLabelFont()
    const cFont = Math.round(sFont * 0.85)
    const tgap = Math.max(6, Math.round(factor * 0.14 * scale))

    // 色号表
    const layout = tableLayout.value
    const isFull = exportContent.value === 'full'
    let totalW: number
    let tableH = 0; let itemH = 0; let cellW = 0; let cellGapX = 0; let cellGapY = 0
    let colsPerRowFinal = 1
    let tableSwatchW = swatchH

    if (isFull && stats.length > 0) {
      const maxIdLen = Math.max(...stats.map(s => s.id.length), 1)
      const maxCount = Math.max(...stats.map(s => s.count), 1)
      const maxCountDigits = String(maxCount).length
      const MIN_COLS = 4
      const rawCols = Math.max(MIN_COLS, Math.ceil(Math.sqrt(stats.length * (swatchW + swatchGapX) / (swatchH + swatchLabelFont() + swatchGapY))))
      const neededTableW = rawCols * (swatchW + swatchGapX) - swatchGapX + pad * 2
      totalW = Math.max(gridW + pad * 2, neededTableW, 300)
      const colsPerRow = Math.max(1, Math.min(stats.length, Math.floor((totalW - pad * 2 + swatchGapX) / (swatchW + swatchGapX))))

      if (layout === 'compact') {
        const s = Math.max(26, Math.round(swatchH * 0.65))
        const ctgap = Math.max(3, Math.round(tgap * 0.5))
        const countTextW = Math.ceil(cFont * 0.6 * (maxCountDigits + 1))
        const idFontInSwatch = Math.max(10, Math.round(s * 0.4))
        const idTextW = Math.ceil(idFontInSwatch * 0.6 * maxIdLen)
        itemH = s + ctgap + cFont
        cellW = Math.max(s, countTextW + 6, idTextW + 4)
        cellGapX = Math.max(6, Math.round(swatchGapX * 0.3))
        cellGapY = Math.max(4, Math.round(swatchGapY * 0.25))
        colsPerRowFinal = Math.max(1, Math.min(stats.length, Math.floor((totalW - pad * 2 + cellGapX) / (cellW + cellGapX))))
      } else if (layout === 'table') {
        const countTextW = Math.ceil(sFont * 0.6 * (maxCountDigits + 1))
        const tableIdFont = Math.max(10, Math.round(swatchH * 0.4))
        const idTextW = Math.ceil(tableIdFont * 0.6 * maxIdLen)
        tableSwatchW = Math.max(swatchH, idTextW + 4)
        const tableMinW = tableSwatchW + tgap + countTextW + 4
        itemH = Math.max(swatchH, sFont + tgap + cFont)
        cellW = Math.max(swatchW, tableMinW)
        cellGapX = swatchGapX; cellGapY = swatchGapY
        colsPerRowFinal = colsPerRow
      } else {
        const countTextW = Math.ceil(cFont * 0.6 * (maxCountDigits + 1))
        const idTextW = Math.ceil(sFont * 0.55 * maxIdLen)
        itemH = sFont + tgap + swatchH + tgap + cFont
        cellW = Math.max(swatchW, countTextW + 8, idTextW + 8)
        cellGapX = swatchGapX; cellGapY = swatchGapY
        colsPerRowFinal = colsPerRow
      }
      const tableRows = Math.ceil(stats.length / colsPerRowFinal)
      tableH = tableRows * (itemH + cellGapY)
    } else {
      totalW = Math.max(gridW + coordLeftPad + coordRightPad + pad * 2, 300)
    }

    const gridAreaOx = Math.round((totalW - (gridW + coordLeftPad + coordRightPad)) / 2)
    const headingH = isFull ? headingFont + headingGap : 0
    const gridAreaOy = pad + headingH
    const gridDrawOx = gridAreaOx + coordLeftPad
    const gridDrawOy = gridAreaOy + coordTopPad
    const effectiveGridH = gridH + coordTopPad + coordBottomPad
    const totalLabelH = isFull ? tableFont + 16 : 0
    const tableOy = gridAreaOy + effectiveGridH + sectionGap + totalLabelH
    const totalH = isFull ? tableOy + tableH + pad : gridAreaOy + effectiveGridH + pad

    const dpr = 2
    const canvas = document.createElement('canvas')
    canvas.width = totalW * dpr
    canvas.height = totalH * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const bgColor = isFull
      ? (pageBg.value === 'transparent' ? null : pageBg.value)
      : (sketchBg.value === 'transparent' ? null : sketchBg.value)
    if (bgColor !== null) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, totalW, totalH) }

    if (isFull) {
      ctx.fillStyle = '#222'
      ctx.font = `bold ${headingFont}px ${fontFamily}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(`${exportName.value} - ${layer.name}`, totalW / 2, pad + headingFont / 2)
    }

    const gridCanvas = document.createElement('canvas')
    gridCanvas.width = gridW * dpr
    gridCanvas.height = gridH * dpr
    renderGridTo(gridCanvas, gridW, gridH, layer.grid)
    ctx.drawImage(gridCanvas, gridDrawOx, gridDrawOy, gridW, gridH)

    // 坐标轴
    const labelInterval = Math.max(1, Math.ceil(25 / cellSize))
    if (showCoords) {
      ctx.font = `${labelFont}px ${fontFamily}`; ctx.fillStyle = '#666'
      if (isCellAxis) {
        const coordBg = '#e9e5df'
        const drawCoordCell = (cx: number, cy: number, lab: string) => {
          ctx.fillStyle = coordBg; ctx.fillRect(cx, cy, cellSize, cellSize)
          ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.5
          ctx.strokeRect(cx, cy, cellSize, cellSize)
          ctx.fillStyle = '#555'
          ctx.font = `bold ${Math.max(10, Math.round(cellSize * 0.42))}px ${fontFamily}`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(lab, cx + cellSize / 2, cy + cellSize / 2)
        }
        for (let c = 0; c < cols; c += labelInterval) {
          drawCoordCell(gridDrawOx + c * cellSize, gridAreaOy, String(c + 1))
          if (isDual) drawCoordCell(gridDrawOx + c * cellSize, gridDrawOy + gridH, String(c + 1))
        }
        for (let r = 0; r < rows; r += labelInterval) {
          drawCoordCell(gridAreaOx, gridDrawOy + r * cellSize, String(r + 1))
          if (isDual) drawCoordCell(gridDrawOx + gridW, gridDrawOy + r * cellSize, String(r + 1))
        }
        drawCoordCell(gridAreaOx, gridAreaOy, '')
        if (isDual) { drawCoordCell(gridDrawOx + gridW, gridAreaOy, ''); drawCoordCell(gridAreaOx, gridDrawOy + gridH, ''); drawCoordCell(gridDrawOx + gridW, gridDrawOy + gridH, '') }
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5
        ctx.strokeRect(gridAreaOx, gridAreaOy, gridW + coordLeftPad + coordRightPad, gridH + coordTopPad + coordBottomPad)
      } else {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
        for (let c = 0; c < cols; c += labelInterval) ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy - 2)
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
        for (let r = 0; r < rows; r += labelInterval) ctx.fillText(String(r + 1), gridDrawOx - 4, gridDrawOy + r * cellSize + cellSize / 2)
        if (isDual) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top'
          for (let c = 0; c < cols; c += labelInterval) ctx.fillText(String(c + 1), gridDrawOx + c * cellSize + cellSize / 2, gridDrawOy + gridH + 2)
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          for (let r = 0; r < rows; r += labelInterval) ctx.fillText(String(r + 1), gridDrawOx + gridW + 4, gridDrawOy + r * cellSize + cellSize / 2)
        }
      }
    }

    if (isFull && stats.length > 0) {
      const totalLabelY = gridAreaOy + effectiveGridH + sectionGap + 4
      ctx.fillStyle = '#888'
      ctx.font = `${tableFont}px ${fontFamily}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillText(`总像素：${total}`, totalW / 2, totalLabelY)

      const tableContentW = colsPerRowFinal * (cellW + cellGapX) - cellGapX
      const tableStartX = Math.round((totalW - tableContentW) / 2)
      ctx.textAlign = 'center'

      for (let i = 0; i < stats.length; i++) {
        const s = stats[i]!
        const col = i % colsPerRowFinal; const row = Math.floor(i / colsPerRowFinal)
        const ix = tableStartX + col * (cellW + cellGapX)
        const iy = tableOy + row * (itemH + cellGapY)

        if (layout === 'compact') {
          const cs = cellW; const ctgap = Math.max(3, Math.round(tgap * 0.5))
          ctx.fillStyle = s.hex
          ctx.beginPath(); const r = cs * 0.3
          ctx.moveTo(ix + r, iy); ctx.arcTo(ix + cs, iy, ix + cs, iy + cs, r)
          ctx.arcTo(ix + cs, iy + cs, ix, iy + cs, r); ctx.arcTo(ix, iy + cs, ix, iy, r); ctx.arcTo(ix, iy, ix + cs, iy, r)
          ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke()
          const bright = parseInt(s.hex.slice(1,3),16)*299+parseInt(s.hex.slice(3,5),16)*587+parseInt(s.hex.slice(5,7),16)*114 > 140000
          ctx.fillStyle = bright ? '#000' : '#fff'
          ctx.font = `bold ${Math.round(cs * 0.4)}px ${fontFamily}`; ctx.textBaseline = 'middle'
          ctx.fillText(s.id, ix + cs / 2, iy + cs / 2)
          ctx.fillStyle = '#666'; ctx.font = `${cFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + cs / 2, iy + cs + ctgap + cFont / 2)
        } else if (layout === 'table') {
          const tw = tableSwatchW; const th = swatchH
          ctx.fillStyle = s.hex; ctx.fillRect(ix, iy, tw, th)
          ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(ix, iy, tw, th)
          const bright = parseInt(s.hex.slice(1,3),16)*299+parseInt(s.hex.slice(3,5),16)*587+parseInt(s.hex.slice(5,7),16)*114 > 140000
          ctx.fillStyle = bright ? '#000' : '#fff'
          ctx.font = `bold ${Math.round(th * 0.4)}px ${fontFamily}`; ctx.textBaseline = 'middle'
          ctx.fillText(s.id, ix + tw / 2, iy + th / 2)
          ctx.textAlign = 'left'; ctx.fillStyle = '#444'
          ctx.font = `${sFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + tw + tgap, iy + th / 2)
          ctx.textAlign = 'center'
        } else {
          ctx.fillStyle = '#555'; ctx.font = `${sFont}px ${fontFamily}`; ctx.textBaseline = 'top'
          ctx.fillText(s.id, ix + swatchW / 2, iy)
          const sy = iy + sFont + tgap
          ctx.fillStyle = s.hex
          ctx.beginPath()
          ctx.moveTo(ix + swatchRadius, sy); ctx.arcTo(ix + swatchW, sy, ix + swatchW, sy + swatchH, swatchRadius)
          ctx.arcTo(ix + swatchW, sy + swatchH, ix, sy + swatchH, swatchRadius); ctx.arcTo(ix, sy + swatchH, ix, sy, swatchRadius)
          ctx.arcTo(ix, sy, ix + swatchW, sy, swatchRadius)
          ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke()
          ctx.fillStyle = '#888'; ctx.font = `${cFont}px ${fontFamily}`
          ctx.fillText(`x${s.count}`, ix + swatchW / 2, sy + swatchH + tgap)
        }
      }
    }

    canvas.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportName.value}_${layer.name}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return {
    exportName, exportFormat,
    showColorIds, showColorIdsHighlightOnly, showGrid, gridThickness, gridOpacity, thickLineH, thickLineV, hStartPos, vStartPos, coordDisplay, coordAxisStyle,
    pixelShape, sketchBg, pageBg, exportRenderMode, exportFont, tableLayout, exportContent,
    exportHighlightActive, exportHighlightOnly,
    exportHighlightedColorIds, exportHighlightNumberMode,
    previewDataUrl, colorStats, totalPixelCount,
    showModal, exportLayerId,
    previewZoom, previewPanX, previewPanY,
    initFromCanvas, refreshPreview, doExport, batchExportHighlight, exportLayer,
  }
})
