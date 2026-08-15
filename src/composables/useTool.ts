import { toRaw, type Ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useToolStore } from '@/stores/tool'
import { usePaletteStore } from '@/stores/palette'
import { useHistoryStore } from '@/stores/history'
import { useSelectionStore } from '@/stores/selection'
import { getCellSize, screenToGrid } from '@/ts/canvasRenderer'
import type { SymmetryMode } from '@/stores/canvas'
import { useDevice } from '@/composables/useDevice'

export function useTool(
  canvasRef: Ref<HTMLCanvasElement | null>,
  viewportRef: Ref<HTMLDivElement | null>,
) {
  const canvasStore = useCanvasStore()
  const toolStore = useToolStore()
  const paletteStore = usePaletteStore()
  const historyStore = useHistoryStore()
  const selectionStore = useSelectionStore()
  const { device } = useDevice()

  let isDrawing = false
  let lastCol = -1
  let lastRow = -1
  let isPanning = false
  let isMoving = false
  let isGeometry = false
  let historyActionActive = false
  let geoStartCol = 0
  let geoStartRow = 0
  let panStartX = 0
  let panStartY = 0
  let panStartPanX = 0
  let panStartPanY = 0
  const touchPointers = new Map<number, { x: number; y: number }>()
  let pinchStart: {
    distance: number
    centerX: number
    centerY: number
    zoom: number
    panX: number
    panY: number
  } | null = null
  const underlayPointers = new Map<number, { x: number; y: number }>()
  let underlayDragging = false
  let underlayPointerId: number | null = null
  let underlayStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }
  let underlayPinchStart: {
    distance: number
    centerX: number
    centerY: number
    scale: number
    offsetX: number
    offsetY: number
  } | null = null

  // 移动工具
  let moveStartCol = 0
  let moveStartRow = 0
  let moveSnapCol = 0
  let moveSnapRow = 0
  // 保存原始状态用于 restore+reapply
  let moveLayerSnap: string[][] | null = null
  let moveSelSnap: boolean[][] | null = null

  function getCanvas() {
    return canvasRef.value
  }

  function saveHistory() {
    const snap = canvasStore.getActiveLayerSnapshot()
    if (!snap) return
    historyStore.push({
      layerId: snap.layerId,
      grid: snap.grid,
      cols: canvasStore.cols,
      rows: canvasStore.rows,
    })
    historyActionActive = true
  }

  function finishHistory() {
    if (!historyActionActive) return
    const snap = canvasStore.getActiveLayerSnapshot()
    if (snap) {
      historyStore.push({
        layerId: snap.layerId,
        grid: snap.grid,
        cols: canvasStore.cols,
        rows: canvasStore.rows,
      })
    }
    historyActionActive = false
  }

  function viewCellSize(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    return getCellSize(
      rect.width,
      rect.height,
      canvasStore.cols,
      canvasStore.rows,
      canvasStore.zoom,
    )
  }

  function beginUnderlayInteraction(e: PointerEvent, canvas: HTMLCanvasElement) {
    if (e.button !== 0 || !canvasStore.underlay) return false
    canvas.setPointerCapture?.(e.pointerId)
    if (device.value === 'tb' && e.pointerType === 'touch') {
      underlayPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (underlayPointers.size >= 2) {
        const [first, second] = [...underlayPointers.values()].slice(0, 2) as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        underlayDragging = false
        underlayPointerId = null
        underlayPinchStart = {
          distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          centerX: (first.x + second.x) / 2,
          centerY: (first.y + second.y) / 2,
          scale: canvasStore.underlay.scale,
          offsetX: canvasStore.underlay.offsetX,
          offsetY: canvasStore.underlay.offsetY,
        }
        return true
      }
    }
    underlayDragging = true
    underlayPointerId = e.pointerId
    underlayStart = {
      x: e.clientX,
      y: e.clientY,
      offsetX: canvasStore.underlay.offsetX,
      offsetY: canvasStore.underlay.offsetY,
    }
    return true
  }

  function moveUnderlayInteraction(e: PointerEvent, canvas: HTMLCanvasElement) {
    const state = canvasStore.underlay
    if (!state) return false
    if (device.value === 'tb' && e.pointerType === 'touch') {
      if (!underlayPointers.has(e.pointerId)) return false
      underlayPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (underlayPinchStart && underlayPointers.size >= 2) {
        const [first, second] = [...underlayPointers.values()].slice(0, 2) as [
          { x: number; y: number },
          { x: number; y: number },
        ]
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        const centerX = (first.x + second.x) / 2
        const centerY = (first.y + second.y) / 2
        const cellSize = viewCellSize(canvas)
        canvasStore.updateUnderlay({
          scale: underlayPinchStart.scale * (distance / underlayPinchStart.distance),
          offsetX: underlayPinchStart.offsetX + (centerX - underlayPinchStart.centerX) / cellSize,
          offsetY: underlayPinchStart.offsetY + (centerY - underlayPinchStart.centerY) / cellSize,
        })
        return true
      }
    }
    if (!underlayDragging || underlayPointerId !== e.pointerId) return false
    const cellSize = viewCellSize(canvas)
    canvasStore.updateUnderlay({
      offsetX: underlayStart.offsetX + (e.clientX - underlayStart.x) / cellSize,
      offsetY: underlayStart.offsetY + (e.clientY - underlayStart.y) / cellSize,
    })
    return true
  }

  function endUnderlayInteraction(e: PointerEvent) {
    const tracked = underlayPointers.has(e.pointerId) || underlayPointerId === e.pointerId
    underlayPointers.delete(e.pointerId)
    if (underlayPinchStart) {
      if (underlayPointers.size < 2) underlayPinchStart = null
      if (underlayPointers.size === 1 && canvasStore.underlay) {
        const remaining = underlayPointers.entries().next().value as
          | [number, { x: number; y: number }]
          | undefined
        if (remaining) {
          underlayDragging = true
          underlayPointerId = remaining[0]
          underlayStart = {
            x: remaining[1].x,
            y: remaining[1].y,
            offsetX: canvasStore.underlay.offsetX,
            offsetY: canvasStore.underlay.offsetY,
          }
        }
      }
    } else if (underlayPointerId === e.pointerId) {
      underlayDragging = false
      underlayPointerId = null
    }
    return tracked
  }

  function syncPaintColor(col: number, row: number) {
    if (!canvasStore.autoPickUnderlayColor || !canvasStore.underlay) return
    const sampled = canvasStore.sampleUnderlayColor(col, row)
    if (!sampled) return
    const closestHex = paletteStore.findClosestColor(sampled)
    const entry = paletteStore.colorMap.get(closestHex)
    if (entry) paletteStore.setColor(entry.id)
  }

  function getSymmetryPoints(c: number, r: number): [number, number][] {
    const { cols, rows } = canvasStore
    const mode = canvasStore.symmetry
    if (mode === 'off') return [[c, r]]
    const points = new Map<string, [number, number]>()
    const add = (col: number, row: number) => {
      if (col >= 0 && col < cols && row >= 0 && row < rows) {
        points.set(`${col},${row}`, [col, row])
      }
    }
    const cm = cols - 1 - c
    const rm = rows - 1 - r

    // 矩形画布：单位正方形映射，避免复合舍入
    const Cm = Math.max(1, cols - 1)
    const Rm = Math.max(1, rows - 1)
    // 映射到单位正方形再映射回来
    const dia45 = (c1: number, r1: number): [number, number] => [
      Math.round((r1 / Rm) * Cm),
      Math.round((c1 / Cm) * Rm),
    ]
    const dia135 = (c1: number, r1: number): [number, number] => [
      Math.round((1 - r1 / Rm) * Cm),
      Math.round((1 - c1 / Cm) * Rm),
    ]
    const dia180 = (c1: number, r1: number): [number, number] => [
      Math.round((1 - c1 / Cm) * Cm),
      Math.round((1 - r1 / Rm) * Rm),
    ]

    add(c, r)
    if (mode === 'center') {
      add(cm, rm)
    } else if (mode === 'vertical') {
      add(cm, r)
    } else if (mode === 'horizontal') {
      add(c, rm)
    } else if (mode === 'diag45') {
      add(...dia45(c, r))
    } else if (mode === 'diag135') {
      add(...dia135(c, r))
    } else if (mode === 'cross') {
      add(cm, r)
      add(c, rm)
      add(cm, rm)
    } else if (mode === 'x') {
      add(...dia45(c, r))
      add(...dia135(c, r))
      add(...dia180(c, r))
    } else if (mode === 'all8') {
      add(cm, r)
      add(c, rm)
      add(cm, rm)
      add(...dia45(c, r))
      add(...dia135(c, r))
      add(...dia45(cm, r))
      add(...dia135(cm, r))
    }
    return [...points.values()]
  }

  function floodFill(startCol: number, startRow: number, targetColor: string) {
    const { cols, rows } = canvasStore
    const layer = canvasStore.activeLayer()
    if (!layer) return
    const grid = toRaw(layer.grid)
    const replacementColor = paletteStore.currentColor
    if (targetColor === replacementColor) return
    if (!isInSelection(startCol, startRow)) return

    // Integer indices and a byte mask are considerably cheaper than a Set of
    // strings. A scanline fill also pushes spans instead of four neighbours for
    // every single pixel, keeping both allocations and stack size small.
    const visited = new Uint8Array(cols * rows)
    const stack: number[] = [startRow * cols + startCol]
    const hasSelection = selectionStore.hasSelection
    const selectionMask = hasSelection ? toRaw(selectionStore.selectionMask) : null
    const symmetricFill = canvasStore.symmetry !== 'off' ? ([] as number[]) : null
    const canFill = (c: number, r: number) =>
      visited[r * cols + c] === 0 &&
      grid[r]![c] === targetColor &&
      (!selectionMask || selectionMask[r]?.[c] === true)

    while (stack.length > 0) {
      const index = stack.pop()!
      const r = Math.floor(index / cols)
      const seed = index - r * cols
      if (!canFill(seed, r)) continue

      let left = seed
      let right = seed
      while (left > 0 && canFill(left - 1, r)) left--
      while (right + 1 < cols && canFill(right + 1, r)) right++

      for (let c = left; c <= right; c++) {
        visited[r * cols + c] = 1
        if (!symmetricFill) {
          grid[r]![c] = replacementColor
        } else {
          // Defer symmetric writes so they cannot change an unvisited target
          // pixel and accidentally cut off the original connected region.
          symmetricFill.push(r * cols + c)
        }
      }

      for (const nr of [r - 1, r + 1]) {
        if (nr < 0 || nr >= rows) continue
        let c = left
        while (c <= right) {
          while (c <= right && !canFill(c, nr)) c++
          if (c > right) break
          stack.push(nr * cols + c)
          while (c <= right && canFill(c, nr)) c++
        }
      }
    }

    if (symmetricFill) {
      for (const index of symmetricFill) {
        const r = Math.floor(index / cols)
        const c = index - r * cols
        for (const [sc, sr] of getSymmetryPoints(c, r)) {
          if (!selectionMask || selectionMask[sr]?.[sc] === true) {
            grid[sr]![sc] = replacementColor
          }
        }
      }
    }
    canvasStore.flushComposite()
  }

  function onPointerDown(e: PointerEvent) {
    const canvas = getCanvas()
    if (!canvas) return

    if (canvasStore.underlayEditMode && canvasStore.underlay) {
      beginUnderlayInteraction(e, canvas)
      return
    }

    if (device.value === 'tb' && e.pointerType === 'touch') {
      touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      canvas.setPointerCapture?.(e.pointerId)
      if (touchPointers.size >= 2) {
        if (isDrawing || isGeometry || isMoving) {
          const entry = historyStore.stack[historyStore.index]
          if (entry) canvasStore.applyLayerSnapshot(entry.layerId, entry.grid)
        }
        isDrawing = false
        isGeometry = false
        isMoving = false
        isPanning = false
        canvasStore.geoPreview = null
        historyActionActive = false
        if (selectionStore.isSelecting) selectionStore.endSelection()
        const points = [...touchPointers.values()].slice(0, 2)
        const first = points[0]!
        const second = points[1]!
        pinchStart = {
          distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          centerX: (first.x + second.x) / 2,
          centerY: (first.y + second.y) / 2,
          zoom: canvasStore.zoom,
          panX: canvasStore.panX,
          panY: canvasStore.panY,
        }
        return
      }
    }

    // 若正在扩裁画布，任何工具操作都取消扩裁
    if (canvasStore.resizePreview) {
      canvasStore.cancelResize()
    }

    if (e.button === 1) {
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      panStartPanX = canvasStore.panX
      panStartPanY = canvasStore.panY
      return
    }

    if (e.button !== 0) return

    const pos = screenToGrid(
      canvas,
      e.clientX,
      e.clientY,
      canvasStore.cols,
      canvasStore.rows,
      canvasStore.zoom,
      canvasStore.panX,
      canvasStore.panY,
    )
    if (!pos) return

    // 几何工具：绘制几何形状
    if (toolStore.activeTool === 'geometry') {
      syncPaintColor(pos.col, pos.row)
      saveHistory()
      isGeometry = true
      geoStartCol = pos.col
      geoStartRow = pos.row
      canvasStore.geoPreview = {
        shape: toolStore.geometryShape,
        sides: 4,
        c1: pos.col,
        r1: pos.row,
        c2: pos.col,
        r2: pos.row,
      }
      return
    }

    // 移动工具：移动当前图层内容（或选区内容）
    if (toolStore.activeTool === 'move') {
      saveHistory()
      isMoving = true
      moveStartCol = pos.col
      moveStartRow = pos.row
      moveSnapCol = 0
      moveSnapRow = 0
      // 保存活跃图层快照
      const snap = canvasStore.getActiveLayerSnapshot()
      moveLayerSnap = snap ? snap.grid.map((row) => [...row]) : null
      moveSelSnap = selectionStore.hasSelection
        ? selectionStore.selectionMask.map((row) => [...row])
        : null
      return
    }

    if (toolStore.activeTool === 'select') {
      selectionStore.beginSelection(pos.col, pos.row)
      return
    }

    if (toolStore.activeTool === 'picker') {
      // 从顶层向底层遍历可见图层，取第一个有颜色的
      const layers = canvasStore.layers
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i]!
        if (!layer.visible) continue
        const hex = layer.grid[pos.row]?.[pos.col]
        if (hex) {
          const entry = paletteStore.colorMap.get(hex)
          if (entry) paletteStore.setColor(entry.id)
          return
        }
      }
      return
    }

    saveHistory()
    isDrawing = true
    lastCol = pos.col
    lastRow = pos.row

    if (toolStore.activeTool === 'pencil') {
      paintCell(pos.col, pos.row)
    } else if (toolStore.activeTool === 'eraser') {
      eraseCell(pos.col, pos.row)
    } else if (toolStore.activeTool === 'bucket') {
      syncPaintColor(pos.col, pos.row)
      const layer = canvasStore.activeLayer()
      const targetColor = layer?.grid[pos.row]?.[pos.col] ?? ''
      floodFill(pos.col, pos.row, targetColor)
    }
  }

  function onPointerMove(e: PointerEvent) {
    const canvas = getCanvas()
    if (!canvas) return

    if (canvasStore.underlayEditMode && canvasStore.underlay) {
      moveUnderlayInteraction(e, canvas)
      return
    }

    if (device.value === 'tb' && e.pointerType === 'touch' && touchPointers.has(e.pointerId)) {
      touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinchStart && touchPointers.size >= 2) {
        const points = [...touchPointers.values()].slice(0, 2)
        const first = points[0]!
        const second = points[1]!
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        const centerX = (first.x + second.x) / 2
        const centerY = (first.y + second.y) / 2
        canvasStore.setZoom(pinchStart.zoom * (distance / pinchStart.distance))
        canvasStore.setPan(
          pinchStart.panX + centerX - pinchStart.centerX,
          pinchStart.panY + centerY - pinchStart.centerY,
        )
        return
      }
    }

    if (isPanning) {
      canvasStore.setPan(
        panStartPanX + (e.clientX - panStartX),
        panStartPanY + (e.clientY - panStartY),
      )
      return
    }

    const pos = screenToGrid(
      canvas,
      e.clientX,
      e.clientY,
      canvasStore.cols,
      canvasStore.rows,
      canvasStore.zoom,
      canvasStore.panX,
      canvasStore.panY,
    )
    if (pos) canvasStore.updateCursor(pos.col, pos.row)

    if (isGeometry && pos) {
      canvasStore.geoPreview = {
        shape: toolStore.geometryShape,
        sides: 4,
        c1: geoStartCol,
        r1: geoStartRow,
        c2: pos.col,
        r2: pos.row,
      }
      canvasStore.bumpVersion()
      return
    }

    if (isMoving && pos) {
      const dCol = pos.col - moveStartCol
      const dRow = pos.row - moveStartRow
      if (dCol !== moveSnapCol || dRow !== moveSnapRow) {
        moveSnapCol = dCol
        moveSnapRow = dRow
        applyMoveOffset(dCol, dRow)
      }
      return
    }

    if (selectionStore.isSelecting && pos) {
      selectionStore.updateSelection(pos.col, pos.row)
      return
    }

    if (!isDrawing || !pos) return
    if (pos.col === lastCol && pos.row === lastRow) return

    lastCol = pos.col
    lastRow = pos.row

    if (toolStore.activeTool === 'pencil') {
      paintCell(pos.col, pos.row)
    } else if (toolStore.activeTool === 'eraser') {
      eraseCell(pos.col, pos.row)
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (endUnderlayInteraction(e)) return
    if (device.value === 'tb' && e.pointerType === 'touch') {
      touchPointers.delete(e.pointerId)
      if (pinchStart) {
        if (touchPointers.size < 2) pinchStart = null
        isDrawing = false
        isPanning = false
        lastCol = -1
        lastRow = -1
        return
      }
    }
    if (isGeometry) {
      isGeometry = false
      const preview = canvasStore.geoPreview
      canvasStore.geoPreview = null
      if (preview) {
        applyGeometry(preview)
      }
      finishHistory()
      return
    }
    if (isMoving) {
      isMoving = false
      moveLayerSnap = null
      moveSelSnap = null
      finishHistory()
      return
    }
    if (selectionStore.isSelecting) {
      selectionStore.endSelection()
      return
    }
    isDrawing = false
    isPanning = false
    lastCol = -1
    lastRow = -1
    finishHistory()
  }

  function onWheel(e: WheelEvent) {
    const canvas = getCanvas()
    if (!canvas) return
    if (canvasStore.underlayEditMode && canvasStore.underlay) {
      const factor = Math.exp(-e.deltaY * 0.0015)
      canvasStore.updateUnderlay({ scale: canvasStore.underlay.scale * factor })
      return
    }
    if (e.ctrlKey || e.metaKey) {
      canvasStore.setZoom(canvasStore.zoom - e.deltaY * 0.002)
    } else {
      canvasStore.setPan(canvasStore.panX - e.deltaX, canvasStore.panY - e.deltaY)
    }
  }

  function applyMoveOffset(dCol: number, dRow: number) {
    if (!moveLayerSnap) return
    const layer = canvasStore.activeLayer()
    if (!layer) return

    // 恢复快照
    for (let r = 0; r < moveLayerSnap.length; r++) {
      const src = moveLayerSnap[r]!
      const dst = layer.grid[r]
      if (!dst) continue
      for (let c = 0; c < src.length; c++) {
        dst[c] = src[c]!
      }
    }

    // 恢复选区快照
    if (moveSelSnap) {
      const selMask = selectionStore.selectionMask
      for (let r = 0; r < Math.min(moveSelSnap.length, selMask.length); r++) {
        const src = moveSelSnap[r]!
        const dst = selMask[r]!
        for (let c = 0; c < Math.min(src.length, dst.length); c++) {
          dst[c] = src[c]!
        }
      }
    }

    if (dCol === 0 && dRow === 0) return

    const { cols, rows } = canvasStore
    const hasSel = moveSelSnap !== null

    // 选区移动包含透明格，确保透明部分同样能覆盖目标区域。
    const moves: { c: number; r: number; color: string }[] = []
    for (let r = 0; r < rows; r++) {
      const snapshotRow = moveLayerSnap[r]
      const row = layer.grid[r]
      if (!snapshotRow || !row) continue
      for (let c = 0; c < cols; c++) {
        if (hasSel) {
          if (!moveSelSnap![r]?.[c]) continue
          moves.push({ c, r, color: snapshotRow[c] ?? '' })
          row[c] = ''
        } else if (snapshotRow[c]) {
          moves.push({ c, r, color: snapshotRow[c]! })
          row[c] = ''
        }
      }
    }

    if (hasSel) {
      // 更新选区位置
      const newMask = makeMoveMask(cols, rows)
      for (let r = 0; r < Math.min(rows, moveSelSnap!.length); r++) {
        const selRow = moveSelSnap![r]!
        for (let c = 0; c < Math.min(cols, selRow.length); c++) {
          if (selRow[c]) {
            const nc = c + dCol
            const nr = r + dRow
            if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
              const row = newMask[nr]
              if (row) row[nc] = true
            }
          }
        }
      }
      const selMask = selectionStore.selectionMask
      for (let r = 0; r < Math.min(rows, newMask.length); r++) {
        const src = newMask[r]!
        const dst = selMask[r]!
        for (let c = 0; c < Math.min(cols, src.length); c++) {
          dst[c] = src[c]!
        }
      }
    }

    // 写入新位置
    for (const m of moves) {
      const nc = m.c + dCol
      const nr = m.r + dRow
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
        const row = layer.grid[nr]
        if (row) row[nc] = m.color
      }
    }

    canvasStore.buildComposite()
    if (hasSel) selectionStore.bumpVersion()
  }

  function makeMoveMask(c: number, r: number): boolean[][] {
    const m: boolean[][] = []
    for (let i = 0; i < r; i++) m.push(new Array<boolean>(c).fill(false))
    return m
  }

  function applyGeometry(prev: {
    shape: string
    sides: number
    c1: number
    r1: number
    c2: number
    r2: number
  }) {
    const color = paletteStore.currentColor
    const sel = selectionStore.hasSelection
      ? selectionStore.isSelected.bind(selectionStore)
      : () => true
    const set = (c: number, r: number) => {
      if (sel(c, r)) canvasStore.setCellSilent(c, r, color)
    }

    const c1 = prev.c1
    const r1 = prev.r1
    const c2 = prev.c2
    const r2 = prev.r2
    const fill = toolStore.geometryFill

    if (prev.shape === 'line') {
      drawBresenhamLine(c1, r1, c2, r2, set)
    } else if (prev.shape === 'ellipse') {
      const cMin = Math.min(c1, c2)
      const cMax = Math.max(c1, c2)
      const rMin = Math.min(r1, r2)
      const rMax = Math.max(r1, r2)
      const cx = (cMin + cMax) / 2
      const cy = (rMin + rMax) / 2
      const rx = (cMax - cMin) / 2
      const ry = (rMax - rMin) / 2
      if (rx < 0.5 && ry < 0.5) {
        set(cMin, rMin)
        canvasStore.flushComposite()
        return
      }

      if (fill) {
        const rcMin = Math.max(0, Math.round(cx - rx))
        const rcMax = Math.min(canvasStore.cols - 1, Math.round(cx + rx))
        const rrMin = Math.max(0, Math.round(cy - ry))
        const rrMax = Math.min(canvasStore.rows - 1, Math.round(cy + ry))
        for (let rr = rrMin; rr <= rrMax; rr++) {
          for (let cc = rcMin; cc <= rcMax; cc++) {
            const dx = (cc - cx) / Math.max(rx, 0.01)
            const dy = (rr - cy) / Math.max(ry, 0.01)
            if (dx * dx + dy * dy <= 1) set(cc, rr)
          }
        }
      } else {
        // 中点椭圆算法（Bresenham 风格）
        const outerSet = new Set<string>()
        const outer = (ex: number, ey: number) => {
          const k = `${Math.round(cx + ex)},${Math.round(cy + ey)}`
          if (!outerSet.has(k)) {
            outerSet.add(k)
            set(Math.round(cx + ex), Math.round(cy + ey))
          }
        }
        const rxx = Math.max(rx, 0.5)
        const ryy = Math.max(ry, 0.5)
        const rx2 = rxx * rxx
        const ry2 = ryy * ryy
        let x = 0
        let y = Math.round(ryy)
        let d1 = ry2 - rx2 * ryy + 0.25 * rx2
        while (ry2 * x < rx2 * y) {
          outer(x, y)
          outer(-x, y)
          outer(x, -y)
          outer(-x, -y)
          if (d1 < 0) {
            d1 += ry2 * (2 * x + 3)
            x++
          } else {
            d1 += ry2 * (2 * x + 3) + rx2 * (-2 * y + 2)
            x++
            y--
          }
        }
        let d2 = ry2 * (x + 0.5) ** 2 + rx2 * (y - 1) ** 2 - rx2 * ry2
        while (y >= 0) {
          outer(x, y)
          outer(-x, y)
          outer(x, -y)
          outer(-x, -y)
          if (d2 > 0) {
            d2 += rx2 * (-2 * y + 3)
            y--
          } else {
            d2 += ry2 * (2 * x + 2) + rx2 * (-2 * y + 3)
            x++
            y--
          }
        }
      }
    } else if (prev.shape === 'rect') {
      const cMin = Math.min(c1, c2)
      const cMax = Math.max(c1, c2)
      const rMin = Math.min(r1, r2)
      const rMax = Math.max(r1, r2)
      const rcMin = Math.max(0, cMin)
      const rcMax = Math.min(canvasStore.cols - 1, cMax)
      const rrMin = Math.max(0, rMin)
      const rrMax = Math.min(canvasStore.rows - 1, rMax)
      if (fill) {
        for (let rr = rrMin; rr <= rrMax; rr++) {
          for (let cc = rcMin; cc <= rcMax; cc++) {
            set(cc, rr)
          }
        }
      } else {
        // 边框：四边 + 四角（去重）
        for (let cc = rcMin; cc <= rcMax; cc++) {
          set(cc, rrMin)
          set(cc, rrMax)
        }
        for (let rr = rrMin + 1; rr < rrMax; rr++) {
          set(rcMin, rr)
          set(rcMax, rr)
        }
      }
    }
    canvasStore.flushComposite()
  }

  function drawBresenhamLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    set: (c: number, r: number) => void,
  ) {
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let x = x0
    let y = y0
    while (true) {
      set(x, y)
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
    }
  }

  function isInSelection(col: number, row: number): boolean {
    return !selectionStore.hasSelection || selectionStore.isSelected(col, row)
  }

  function applyPencilSize(col: number, row: number) {
    syncPaintColor(col, row)
    const syms = getSymmetryPoints(col, row)
    const size = toolStore.pencilSize
    const half = Math.floor(size / 2)
    for (const [sc, sr] of syms) {
      for (let dr = -half; dr <= half; dr++) {
        for (let dc = -half; dc <= half; dc++) {
          const tc = sc + dc
          const tr = sr + dr
          if (isInSelection(tc, tr)) {
            canvasStore.setCellSilent(tc, tr, paletteStore.currentColor)
          }
        }
      }
    }
    canvasStore.flushComposite()
  }

  function applyEraserSize(col: number, row: number) {
    const syms = getSymmetryPoints(col, row)
    const size = toolStore.eraserSize
    const half = Math.floor(size / 2)
    for (const [sc, sr] of syms) {
      for (let dr = -half; dr <= half; dr++) {
        for (let dc = -half; dc <= half; dc++) {
          const tc = sc + dc
          const tr = sr + dr
          if (isInSelection(tc, tr)) {
            canvasStore.setCellSilent(tc, tr, '')
          }
        }
      }
    }
    canvasStore.flushComposite()
  }

  function paintCell(col: number, row: number) {
    applyPencilSize(col, row)
  }
  function eraseCell(col: number, row: number) {
    applyEraserSize(col, row)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onWheel }
}
