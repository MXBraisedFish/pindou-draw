import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  clampCanvasSize,
  clampGroupSize,
  clampInteger,
  rawPixelGrid,
  useCanvasStore,
} from '@/stores/canvas'
import { usePaletteStore } from '@/stores/palette'
import {
  getStoredProject,
  listStoredProjects,
  saveStoredProject,
  type ProjectSlot,
  type StoredProject,
} from '@/ts/projectStorage'

export const useProjectStore = defineStore('project', () => {
  const projectName = ref('未命名项目')
  const createdAt = ref(new Date().toLocaleDateString('zh-CN'))

  function createProjectJson(): string {
    const canvasStore = useCanvasStore()
    const paletteStore = usePaletteStore()

    if (canvasStore.canvasGroup) {
      canvasStore.saveActiveToGroup()
      const g = canvasStore.canvasGroup
      const data = {
        version: 3,
        type: 'group',
        name: g.name,
        groupCols: g.groupCols,
        groupRows: g.groupRows,
        subSize: g.subSize,
        canvases: g.canvases.map((row) =>
          row.map((snap) => ({
            layers: snap.layers.map((l) => ({
              id: l.id,
              name: l.name,
              visible: l.visible,
              grid: l.grid.map((r) => [...r]),
            })),
            activeLayerId: snap.activeLayerId,
            renderMode: snap.renderMode,
            symmetry: snap.symmetry,
            pixelShape: snap.pixelShape,
            showColorIds: snap.showColorIds,
            showColorIdsHighlightOnly: snap.showColorIdsHighlightOnly,
            backgroundColor: snap.backgroundColor,
            showGrid: snap.showGrid,
            thickLineH: { ...snap.thickLineH },
            thickLineV: { ...snap.thickLineV },
          })),
        ),
        activeGroupRow: canvasStore.activeGroupRow,
        activeGroupCol: canvasStore.activeGroupCol,
        openGroupTabs: canvasStore.openGroupTabs.map((t) => ({ ...t })),
        colorCard: paletteStore.activeCard
          ? {
              name: paletteStore.activeCard.name,
              author: paletteStore.activeCard.author,
              version: paletteStore.activeCard.version ?? 1,
              colors: paletteStore.activeCard.colors.map((c) => ({ ...c })),
            }
          : null,
        currentColorId: paletteStore.currentColorId,
        recentColorIds: [...paletteStore.recentColorIds],
        createdAt: new Date().toISOString(),
      }
      return JSON.stringify(data)
    }

    const data = {
      version: 3,
      type: 'single',
      name: projectName.value,
      cols: canvasStore.cols,
      rows: canvasStore.rows,
      layers: canvasStore.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        grid: l.grid.map((row) => [...row]),
      })),
      activeLayerId: canvasStore.activeLayerId,
      renderMode: canvasStore.renderMode,
      symmetry: canvasStore.symmetry,
      pixelShape: canvasStore.pixelShape,
      showColorIds: canvasStore.showColorIds,
      showColorIdsHighlightOnly: canvasStore.showColorIdsHighlightOnly,
      backgroundColor: canvasStore.backgroundColor,
      showGrid: canvasStore.showGrid,
      thickLineH: { ...canvasStore.thickLineH },
      thickLineV: { ...canvasStore.thickLineV },
      colorCard: paletteStore.activeCard
        ? {
            name: paletteStore.activeCard.name,
            author: paletteStore.activeCard.author,
            version: paletteStore.activeCard.version ?? 1,
            colors: paletteStore.activeCard.colors.map((c) => ({ ...c })),
          }
        : null,
      currentColorId: paletteStore.currentColorId,
      recentColorIds: [...paletteStore.recentColorIds],
      createdAt: new Date().toISOString(),
    }
    return JSON.stringify(data)
  }

  function saveProject() {
    const blob = new Blob([createProjectJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.value}.pindou.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function createProjectPreview(): string {
    const canvasStore = useCanvasStore()
    const group = canvasStore.canvasGroup
    if (group) canvasStore.saveActiveToGroup()
    const cols = group ? group.groupCols * group.subSize : canvasStore.cols
    const rows = group ? group.groupRows * group.subSize : canvasStore.rows
    const maxEdge = 280
    const scale = Math.max(0.1, Math.min(maxEdge / Math.max(cols, rows), 8))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(cols * scale))
    canvas.height = Math.max(1, Math.round(rows * scale))
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    const drawGrid = (grid: string[][], offsetCol: number, offsetRow: number) => {
      for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
          const color = grid[row]?.[col]
          if (!color) continue
          context.fillStyle = color
          context.fillRect(
            Math.floor((offsetCol + col) * scale),
            Math.floor((offsetRow + row) * scale),
            Math.ceil(scale),
            Math.ceil(scale),
          )
        }
      }
    }

    if (group) {
      for (let groupRow = 0; groupRow < group.groupRows; groupRow++) {
        for (let groupCol = 0; groupCol < group.groupCols; groupCol++) {
          const snapshot = group.canvases[groupRow]?.[groupCol]
          if (!snapshot) continue
          for (const layer of snapshot.layers) {
            if (layer.visible) {
              drawGrid(layer.grid, groupCol * group.subSize, groupRow * group.subSize)
            }
          }
        }
      }
    } else {
      drawGrid(canvasStore.compositeGrid, 0, 0)
    }
    return canvas.toDataURL('image/webp', 0.78)
  }

  function importFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pindou.json,image/png,image/jpeg'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      if (file.name.endsWith('.pindou.json')) {
        await loadProject(file)
      } else {
        await importImage(file)
      }
    }
    input.click()
  }

  async function loadProject(file: File) {
    const text = await file.text()
    try {
      const data = JSON.parse(text)
      const canvasStore = useCanvasStore()
      const paletteStore = usePaletteStore()
      const fileVersion = data.version ?? 1

      projectName.value = data.name ?? '导入项目'

      // --- 画布组加载 (v3) ---
      if (fileVersion >= 3 && data.type === 'group') {
        const gCols = clampGroupSize(data.groupCols ?? 1, 1)
        const gRows = clampGroupSize(data.groupRows ?? 1, 1)
        const gSubSize = clampCanvasSize(data.subSize ?? 16)
        canvasStore.createCanvasGroup(data.name ?? '导入画布组', gCols, gRows, gSubSize)
        const g = canvasStore.canvasGroup!
        if (Array.isArray(data.canvases)) {
          for (let r = 0; r < Math.min(gRows, data.canvases.length); r++) {
            const row = data.canvases[r]
            if (!Array.isArray(row)) continue
            for (let c = 0; c < Math.min(gCols, row.length); c++) {
              const snap = row[c]
              if (!snap) continue
              const target = g.canvases[r]![c]!
              if (Array.isArray(snap.layers)) {
                target.layers = snap.layers.map(
                  (l: { id?: string; name?: string; visible?: boolean; grid?: string[][] }) => ({
                    id: l.id ?? '',
                    name: l.name ?? '图层',
                    visible: l.visible ?? true,
                    grid: rawPixelGrid((l.grid ?? []).map((row2: string[]) => [...row2])),
                  }),
                )
                target.activeLayerId = snap.activeLayerId || target.layers[0]?.id || ''
              }
              target.renderMode = snap.renderMode ?? 'day'
              target.symmetry = snap.symmetry ?? 'off'
              target.pixelShape = snap.pixelShape ?? 'square'
              target.showColorIds = snap.showColorIds ?? false
              target.showColorIdsHighlightOnly = snap.showColorIdsHighlightOnly ?? false
              target.backgroundColor = snap.backgroundColor ?? '#ffffff'
              target.showGrid = snap.showGrid ?? true
              if (snap.thickLineH) target.thickLineH = { ...snap.thickLineH }
              if (snap.thickLineV) target.thickLineV = { ...snap.thickLineV }
            }
          }
        }
        canvasStore.activeGroupRow = clampInteger(data.activeGroupRow, 0, gRows - 1, 0)
        canvasStore.activeGroupCol = clampInteger(data.activeGroupCol, 0, gCols - 1, 0)
        if (Array.isArray(data.openGroupTabs)) {
          canvasStore.openGroupTabs = data.openGroupTabs.map(
            (t: { row?: number; col?: number }) => ({
              row: clampInteger(t.row, 0, gRows - 1, 0),
              col: clampInteger(t.col, 0, gCols - 1, 0),
            }),
          )
        }
        // 恢复活跃画布
        const activeSnap = g.canvases[canvasStore.activeGroupRow]?.[canvasStore.activeGroupCol]
        if (activeSnap) canvasStore.restoreCanvasSnapshot(activeSnap)
        canvasStore.showGroupPreview = true
        canvasStore.buildComposite()
        // 继续恢复色卡...
        if (data.colorCard) {
          const existing = paletteStore.cardList.find((c) => c.name === data.colorCard.name)
          if (!existing) paletteStore.registerCard(data.colorCard)
          paletteStore.loadCard(existing ?? data.colorCard)
          if (data.currentColorId) paletteStore.setColor(data.currentColorId)
          if (Array.isArray(data.recentColorIds)) {
            paletteStore.recentColorIds = data.recentColorIds.filter(
              (id: unknown): id is string => typeof id === 'string',
            )
          }
        }
        return
      }

      const newCols = clampCanvasSize(data.cols ?? 16)
      const newRows = clampCanvasSize(data.rows ?? 16)

      // --- 图层恢复 ---
      canvasStore.layers = []
      if (fileVersion >= 2 && Array.isArray(data.layers) && data.layers.length > 0) {
        for (const l of data.layers) {
          const grid: string[][] = []
          for (let r = 0; r < newRows; r++) {
            const savedRow: string[] = l.grid?.[r] ?? []
            const newRow: string[] = []
            for (let c = 0; c < newCols; c++) {
              newRow.push(savedRow[c] ?? '')
            }
            grid.push(newRow)
          }
          canvasStore.layers.push({
            id: l.id ?? '',
            name: l.name ?? '图层',
            visible: l.visible ?? true,
            grid: rawPixelGrid(grid),
          })
        }
        canvasStore.activeLayerId = data.activeLayerId || canvasStore.layers[0]?.id || ''
      } else if (data.grid) {
        // 旧版 v1：单图层
        const grid: string[][] = []
        for (let r = 0; r < newRows; r++) {
          const savedRow: string[] = data.grid[r] ?? []
          const newRow: string[] = []
          for (let c = 0; c < newCols; c++) {
            newRow.push(savedRow[c] ?? '')
          }
          grid.push(newRow)
        }
        canvasStore.layers = [
          {
            id: 'layer_1',
            name: '主图层',
            visible: true,
            grid: rawPixelGrid(grid),
          },
        ]
        canvasStore.activeLayerId = 'layer_1'
      }

      if (canvasStore.layers.length === 0) {
        // 兜底：至少有一个空图层
        canvasStore.newCanvas(newCols, newRows)
      }

      canvasStore.cols = newCols
      canvasStore.rows = newRows

      // --- 绘制设置恢复 ---
      if (fileVersion >= 2) {
        canvasStore.renderMode = data.renderMode ?? 'day'
        canvasStore.symmetry = data.symmetry ?? 'off'
        canvasStore.pixelShape = data.pixelShape ?? 'square'
        canvasStore.showColorIds = data.showColorIds ?? false
        canvasStore.showColorIdsHighlightOnly = data.showColorIdsHighlightOnly ?? false
        canvasStore.backgroundColor = data.backgroundColor ?? '#ffffff'
        canvasStore.showGrid = data.showGrid ?? true
        if (data.thickLineH) {
          canvasStore.thickLineH = {
            enabled: data.thickLineH.enabled ?? false,
            interval: data.thickLineH.interval ?? 5,
            thickness: data.thickLineH.thickness ?? 1,
            startOffset: data.thickLineH.startOffset ?? 0,
          }
        }
        if (data.thickLineV) {
          canvasStore.thickLineV = {
            enabled: data.thickLineV.enabled ?? false,
            interval: data.thickLineV.interval ?? 5,
            thickness: data.thickLineV.thickness ?? 1,
            startOffset: data.thickLineV.startOffset ?? 0,
          }
        }
      }

      // --- 色卡恢复 ---
      if (fileVersion >= 2 && data.colorCard) {
        const existing = paletteStore.cardList.find((c) => c.name === data.colorCard.name)
        if (!existing) {
          paletteStore.registerCard(data.colorCard)
        }
        paletteStore.loadCard(existing ?? data.colorCard)
        if (data.currentColorId) {
          paletteStore.setColor(data.currentColorId)
        }
        if (Array.isArray(data.recentColorIds)) {
          paletteStore.recentColorIds = data.recentColorIds.filter(
            (id: unknown): id is string => typeof id === 'string',
          )
        }
      }

      canvasStore.buildComposite()
    } catch {
      // ignore invalid file
    }
  }

  async function loadProjectJson(json: string) {
    await loadProject(new File([json], '浏览器存储.pindou.json', { type: 'application/json' }))
  }

  function describeCurrentProject() {
    const canvasStore = useCanvasStore()
    const group = canvasStore.canvasGroup
    if (group) {
      return {
        projectType: 'group' as const,
        summary: `${group.groupCols}x${group.groupRows} · 每格 ${group.subSize}x${group.subSize}`,
      }
    }
    return {
      projectType: 'single' as const,
      summary: `${canvasStore.cols}x${canvasStore.rows}`,
    }
  }

  async function saveToBrowser(slot: ProjectSlot): Promise<StoredProject> {
    const description = describeCurrentProject()
    const project: StoredProject = {
      slot,
      name: projectName.value,
      savedAt: new Date().toISOString(),
      projectType: description.projectType,
      summary: description.summary,
      preview: createProjectPreview(),
      data: createProjectJson(),
    }
    await saveStoredProject(project)
    return project
  }

  async function loadFromBrowser(slot: ProjectSlot) {
    const project = await getStoredProject(slot)
    if (!project) throw new Error('这个存储槽位中没有工程。')
    await loadProjectJson(project.data)
    return project
  }

  async function importImage(file: File) {
    const paletteStore = usePaletteStore()
    const canvasStore = useCanvasStore()
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject()
    })
    const offCanvas = document.createElement('canvas')
    const size = Math.min(img.width, img.height, 100)
    offCanvas.width = size
    offCanvas.height = size
    const ctx = offCanvas.getContext('2d')!
    // draw image scaled to a manageable size for pixelization
    const scale = size / Math.max(img.width, img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = (size - dw) / 2
    const dy = (size - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
    const imageData = ctx.getImageData(0, 0, size, size)
    // pixelize: scale down to target grid size
    const targetSize = 50
    canvasStore.resizeCanvas(targetSize, targetSize)
    for (let r = 0; r < targetSize; r++) {
      for (let c = 0; c < targetSize; c++) {
        const sx = Math.floor((c / targetSize) * size)
        const sy = Math.floor((r / targetSize) * size)
        const i = (sy * size + sx) * 4
        const hex =
          '#' +
          [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]]
            .map((v) => v!.toString(16).padStart(2, '0'))
            .join('')
        const closest = paletteStore.findClosestColor(hex)
        canvasStore.setCell(c, r, closest)
      }
    }
    projectName.value = file.name.replace(/\.[^.]+$/, '')
    URL.revokeObjectURL(url)
  }

  function exportFile() {
    const canvasStore = useCanvasStore()
    const size = Math.max(canvasStore.cols, canvasStore.rows)
    const cellSize = Math.max(1, Math.floor(512 / size))
    const w = canvasStore.cols * cellSize
    const h = canvasStore.rows * cellSize
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = w
    exportCanvas.height = h
    const ctx = exportCanvas.getContext('2d')!
    for (let r = 0; r < canvasStore.rows; r++) {
      for (let c = 0; c < canvasStore.cols; c++) {
        const color = canvasStore.getCell(c, r)
        if (color) {
          ctx.fillStyle = color
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize)
        }
      }
    }
    exportCanvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName.value}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return {
    projectName,
    createdAt,
    createProjectJson,
    createProjectPreview,
    saveProject,
    importFile,
    loadProjectJson,
    saveToBrowser,
    loadFromBrowser,
    listBrowserProjects: listStoredProjects,
    exportFile,
  }
})
