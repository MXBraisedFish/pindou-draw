import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import { useProjectStore } from '@/stores/project'
import {
  renderExportDocument,
  type ExportDocumentSource,
  type ExportColorStat,
} from '@/ts/exportRenderer'
import type { CanvasSnapshot, ThickLineConfig } from '@/stores/canvas'

export type ExportFormat = 'png' | 'jpg' | 'pindou'
export type ExportContent = 'full' | 'sketch-only' | 'stats-only'
export type GroupExportMode = 'separate' | 'combined'
export type GroupSeparateDownloadMode = 'zip' | 'files'

interface ExportSource extends ExportDocumentSource {
  groupCol?: number
  groupRow?: number
}

const EXPORT_CELL_SIZE = 50
const PREVIEW_MAX_GRID_EDGE = 1600

function cloneThickLine(config: ThickLineConfig): ThickLineConfig {
  return { ...config }
}

function calcOffset(position: 'center' | 'start' | 'end', total: number, interval: number) {
  const safeInterval = Math.max(1, interval)
  const remainder = total % safeInterval
  if (position === 'start') return 0
  if (position === 'end') return remainder
  return Math.floor(remainder / 2)
}

function safeFilename(name: string) {
  return (name.trim() || '未命名').replace(/[\\/:*?"<>|]/g, '_')
}

function composeLayers(snapshot: CanvasSnapshot, size: number): string[][] {
  const grid = Array.from({ length: size }, () => Array<string>(size).fill(''))
  for (const layer of snapshot.layers) {
    if (!layer.visible) continue
    for (let row = 0; row < size; row++) {
      const sourceRow = layer.grid[row]
      const targetRow = grid[row]!
      for (let col = 0; col < size; col++) {
        const color = sourceRow?.[col]
        if (color) targetRow[col] = color
      }
    }
  }
  return grid
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function canvasToBlob(canvas: HTMLCanvasElement, format: 'png' | 'jpg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
    let output = canvas
    if (format === 'jpg') {
      output = document.createElement('canvas')
      output.width = canvas.width
      output.height = canvas.height
      const context = output.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, output.width, output.height)
      context.drawImage(canvas, 0, 0)
    }
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器未能生成导出图片。'))),
      mime,
      format === 'jpg' ? 0.94 : undefined,
    )
  })
}

export const useExportStore = defineStore('export', () => {
  const exportName = ref('')
  const exportFormat = ref<ExportFormat>('png')
  const showColorIds = ref(false)
  const showColorIdsHighlightOnly = ref(false)
  const showGrid = ref(true)
  const gridThickness = ref(1)
  const gridOpacity = ref(12)
  const thickLineH: Ref<ThickLineConfig> = ref({
    enabled: false,
    interval: 5,
    thickness: 1,
    startOffset: 0,
  })
  const thickLineV: Ref<ThickLineConfig> = ref({
    enabled: false,
    interval: 5,
    thickness: 1,
    startOffset: 0,
  })
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
  const exportContent = ref<ExportContent>('full')
  const groupExportMode = ref<GroupExportMode>('separate')
  const groupSeparateDownloadMode = ref<GroupSeparateDownloadMode>('zip')
  const groupPreviewRow = ref(0)
  const groupPreviewCol = ref(0)
  const exportHighlightActive = ref(false)
  const exportHighlightOnly = ref(false)
  const exportHighlightedColorIds = ref<Set<string>>(new Set())
  const exportHighlightNumberMode = ref<'off' | 'row' | 'col' | 'global'>('off')
  const showModal = ref(false)
  const exportLayerId = ref<string | null>(null)

  const previewDataUrl = ref('')
  const previewError = ref('')
  const colorStats = ref<ExportColorStat[]>([])
  const totalPixelCount = ref(0)
  const previewZoom = ref(1)
  const previewPanX = ref(0)
  const previewPanY = ref(0)
  let combinedSourceCache: { key: string; source: ExportSource } | null = null

  function getSubCanvasSource(row: number, col: number): ExportSource | null {
    const canvasStore = useCanvasStore()
    const group = canvasStore.canvasGroup
    const snapshot = group?.canvases[row]?.[col]
    if (!group || !snapshot) return null
    return {
      name: `${exportName.value}(${col + 1},${row + 1})`,
      cols: group.subSize,
      rows: group.subSize,
      grid: composeLayers(snapshot, group.subSize),
      groupCol: col,
      groupRow: row,
    }
  }

  function getGroupSources(): ExportSource[] {
    const canvasStore = useCanvasStore()
    const group = canvasStore.canvasGroup
    if (!group) return []
    canvasStore.saveActiveToGroup()
    const sources: ExportSource[] = []
    for (let row = 0; row < group.groupRows; row++) {
      for (let col = 0; col < group.groupCols; col++) {
        const source = getSubCanvasSource(row, col)
        if (source) sources.push(source)
      }
    }
    return sources
  }

  function getCombinedGroupSource(): ExportSource | null {
    const canvasStore = useCanvasStore()
    const group = canvasStore.canvasGroup
    if (!group) return null
    canvasStore.saveActiveToGroup()
    const cacheKey = [
      canvasStore.groupVersion,
      canvasStore.gridVersion,
      canvasStore.activeGroupRow,
      canvasStore.activeGroupCol,
      group.groupCols,
      group.groupRows,
      group.subSize,
      exportName.value,
    ].join(':')
    if (combinedSourceCache?.key === cacheKey) return combinedSourceCache.source

    const cols = group.groupCols * group.subSize
    const rows = group.groupRows * group.subSize
    const grid = Array.from({ length: rows }, () => Array<string>(cols).fill(''))
    for (let groupRow = 0; groupRow < group.groupRows; groupRow++) {
      for (let groupCol = 0; groupCol < group.groupCols; groupCol++) {
        const source = getSubCanvasSource(groupRow, groupCol)
        if (!source) continue
        const rowOffset = groupRow * group.subSize
        const colOffset = groupCol * group.subSize
        for (let row = 0; row < source.rows; row++) {
          const targetRow = grid[rowOffset + row]!
          const sourceRow = source.grid[row]!
          for (let col = 0; col < source.cols; col++) targetRow[colOffset + col] = sourceRow[col]!
        }
      }
    }
    const source: ExportSource = { name: exportName.value, cols, rows, grid }
    combinedSourceCache = { key: cacheKey, source }
    return source
  }

  function resolveExportSource(): ExportSource {
    const canvasStore = useCanvasStore()
    if (exportLayerId.value) {
      const layer = canvasStore.layers.find((item) => item.id === exportLayerId.value)
      if (layer) {
        return {
          name: `${exportName.value}_${layer.name}`,
          cols: canvasStore.cols,
          rows: canvasStore.rows,
          grid: layer.grid,
        }
      }
    }
    if (canvasStore.canvasGroup) {
      if (groupExportMode.value === 'combined') return getCombinedGroupSource()!
      canvasStore.saveActiveToGroup()
      return getSubCanvasSource(groupPreviewRow.value, groupPreviewCol.value)!
    }
    return {
      name: exportName.value,
      cols: canvasStore.cols,
      rows: canvasStore.rows,
      grid: canvasStore.compositeGrid,
    }
  }

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
    if (canvasStore.canvasGroup) groupExportMode.value = 'separate'
    previewZoom.value = 1
    previewPanX.value = 0
    previewPanY.value = 0
    previewError.value = ''
    groupSeparateDownloadMode.value = 'zip'
    groupPreviewRow.value = canvasStore.activeGroupRow
    groupPreviewCol.value = canvasStore.activeGroupCol
  }

  function selectGroupPreview(row: number, col: number) {
    const group = useCanvasStore().canvasGroup
    if (!group) return
    groupPreviewRow.value = Math.max(0, Math.min(group.groupRows - 1, Math.round(row)))
    groupPreviewCol.value = Math.max(0, Math.min(group.groupCols - 1, Math.round(col)))
  }

  function computeExportHighlightMask(grid: string[][]): boolean[][] | null {
    if (!exportHighlightActive.value || exportHighlightedColorIds.value.size === 0) return null
    const paletteStore = usePaletteStore()
    const selectedHex = new Set(
      paletteStore.colorEntries
        .filter((entry) => exportHighlightedColorIds.value.has(entry.id))
        .map((entry) => entry.color1),
    )
    if (selectedHex.size === 0) return null
    return grid.map((row) => row.map((hex) => Boolean(hex) && selectedHex.has(hex)))
  }

  function getFontFamily() {
    if (exportFont.value === 'pixel') return 'MinecraftTen, monospace'
    if (exportFont.value === 'pixelfont') return 'PixelFont, monospace'
    return 'Arial, "Microsoft YaHei", sans-serif'
  }

  function renderSource(source: ExportSource, final: boolean, updateSummary = false) {
    const paletteStore = usePaletteStore()
    const highlightMask = computeExportHighlightMask(source.grid)
    const filteredGrid =
      highlightMask && exportHighlightOnly.value
        ? source.grid.map((row, rowIndex) =>
            row.map((hex, colIndex) => (highlightMask[rowIndex]?.[colIndex] ? hex : '')),
          )
        : null
    const previewCell = Math.max(
      1,
      Math.min(
        EXPORT_CELL_SIZE,
        Math.floor(PREVIEW_MAX_GRID_EDGE / Math.max(source.cols, source.rows)),
      ),
    )
    const horizontal = cloneThickLine(thickLineH.value)
    const vertical = cloneThickLine(thickLineV.value)
    horizontal.startOffset = calcOffset(hStartPos.value, source.rows, horizontal.interval)
    vertical.startOffset = calcOffset(vStartPos.value, source.cols, vertical.interval)

    const result = renderExportDocument(source, {
      content: exportContent.value,
      cellSize: final ? EXPORT_CELL_SIZE : previewCell,
      showColorIds: showColorIds.value,
      showColorIdsHighlightOnly: showColorIdsHighlightOnly.value,
      showGrid: showGrid.value,
      gridThickness: gridThickness.value,
      gridOpacity: gridOpacity.value,
      thickLineH: horizontal,
      thickLineV: vertical,
      coordDisplay: coordDisplay.value,
      coordAxisStyle: coordAxisStyle.value,
      pixelShape: pixelShape.value,
      sketchBg: sketchBg.value,
      pageBg: pageBg.value,
      renderMode: exportRenderMode.value,
      fontFamily: getFontFamily(),
      tableLayout: tableLayout.value,
      colorMap: paletteStore.colorMap,
      highlightMask,
      highlightNumberMode: highlightMask ? exportHighlightNumberMode.value : 'off',
      filteredGrid,
    })
    if (updateSummary) {
      colorStats.value = result.stats
      totalPixelCount.value = result.total
    }
    return result.canvas
  }

  function refreshPreview() {
    try {
      const canvas = renderSource(resolveExportSource(), false, true)
      previewDataUrl.value = canvas.toDataURL('image/png')
      previewError.value = ''
    } catch (error) {
      previewDataUrl.value = ''
      previewError.value = error instanceof Error ? error.message : '预览生成失败。'
    }
  }

  async function exportGroupSeparately() {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const format = exportFormat.value === 'jpg' ? 'jpg' : 'png'
    for (const source of getGroupSources()) {
      const canvas = renderSource(source, true)
      zip.file(`${safeFilename(source.name)}.${format}`, await canvasToBlob(canvas, format))
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    downloadBlob(blob, `${safeFilename(exportName.value)}_子画布.zip`)
  }

  async function exportGroupAsFiles() {
    const format = exportFormat.value === 'jpg' ? 'jpg' : 'png'
    const files: { blob: Blob; filename: string }[] = []
    for (const source of getGroupSources()) {
      const canvas = renderSource(source, true)
      files.push({
        blob: await canvasToBlob(canvas, format),
        filename: `${safeFilename(source.name)}.${format}`,
      })
    }
    for (const file of files) downloadBlob(file.blob, file.filename)
  }

  async function doExport() {
    previewError.value = ''
    try {
      if (exportFormat.value === 'pindou') {
        useProjectStore().saveProject()
        return
      }
      const canvasStore = useCanvasStore()
      if (canvasStore.canvasGroup && !exportLayerId.value && groupExportMode.value === 'separate') {
        if (groupSeparateDownloadMode.value === 'zip') await exportGroupSeparately()
        else await exportGroupAsFiles()
        return
      }
      const source = resolveExportSource()
      const format = exportFormat.value === 'jpg' ? 'jpg' : 'png'
      const canvas = renderSource(source, true, true)
      downloadBlob(await canvasToBlob(canvas, format), `${safeFilename(source.name)}.${format}`)
    } catch (error) {
      previewError.value = error instanceof Error ? error.message : '导出失败。'
      throw error
    }
  }

  async function batchExportHighlight() {
    previewError.value = ''
    const paletteStore = usePaletteStore()
    const source = resolveExportSource()
    const usedHex = new Set(source.grid.flat().filter(Boolean))
    const entries = paletteStore.colorEntries.filter((entry) => usedHex.has(entry.color1))
    if (entries.length === 0) throw new Error('当前画布没有可导出的颜色。')
    const originalActive = exportHighlightActive.value
    const originalIds = new Set(exportHighlightedColorIds.value)
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const format = exportFormat.value === 'jpg' ? 'jpg' : 'png'
    try {
      exportHighlightActive.value = true
      for (const entry of entries) {
        exportHighlightedColorIds.value = new Set([entry.id])
        const canvas = renderSource(source, true)
        zip.file(
          `${safeFilename(source.name)}_${safeFilename(entry.id)}.${format}`,
          await canvasToBlob(canvas, format),
        )
      }
      downloadBlob(
        await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
        `${safeFilename(source.name)}_高亮.zip`,
      )
    } catch (error) {
      previewError.value = error instanceof Error ? error.message : '批量导出失败。'
      throw error
    } finally {
      exportHighlightActive.value = originalActive
      exportHighlightedColorIds.value = originalIds
      refreshPreview()
    }
  }

  async function exportLayer(layerId: string) {
    exportLayerId.value = layerId
    await doExport()
  }

  return {
    exportName,
    exportFormat,
    showColorIds,
    showColorIdsHighlightOnly,
    showGrid,
    gridThickness,
    gridOpacity,
    thickLineH,
    thickLineV,
    hStartPos,
    vStartPos,
    coordDisplay,
    coordAxisStyle,
    pixelShape,
    sketchBg,
    pageBg,
    exportRenderMode,
    exportFont,
    tableLayout,
    exportContent,
    groupExportMode,
    groupSeparateDownloadMode,
    groupPreviewRow,
    groupPreviewCol,
    exportHighlightActive,
    exportHighlightOnly,
    exportHighlightedColorIds,
    exportHighlightNumberMode,
    previewDataUrl,
    previewError,
    colorStats,
    totalPixelCount,
    showModal,
    exportLayerId,
    previewZoom,
    previewPanX,
    previewPanY,
    initFromCanvas,
    refreshPreview,
    doExport,
    batchExportHighlight,
    exportLayer,
    getGroupSources,
    getCombinedGroupSource,
    selectGroupPreview,
  }
})
