import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToolType = 'move' | 'pencil' | 'eraser' | 'bucket' | 'select' | 'picker' | 'geometry'
export type SelectShape = 'rect' | 'ellipse' | 'line' | 'lasso'
export type SelectMode = 'replace' | 'add' | 'remove'
export type GeometryShape = 'line' | 'rect' | 'ellipse'

export const useToolStore = defineStore('tool', () => {
  const activeTool = ref<ToolType>('pencil')
  const pencilSize = ref(1)
  const eraserSize = ref(1)

  const selectShape = ref<SelectShape>('rect')
  const selectMode = ref<SelectMode>('replace')

  const geometryShape = ref<GeometryShape>('line')
  const geometryFill = ref(false)

  function setTool(tool: ToolType) {
    activeTool.value = tool
  }

  function setPencilSize(size: number) {
    pencilSize.value = size
  }

  function setEraserSize(size: number) {
    eraserSize.value = size
  }

  function setSelectShape(shape: SelectShape) {
    selectShape.value = shape
  }

  function setSelectMode(mode: SelectMode) {
    selectMode.value = mode
  }

  function setGeometryShape(shape: GeometryShape) {
    geometryShape.value = shape
  }

  return {
    activeTool,
    pencilSize,
    eraserSize,
    selectShape,
    selectMode,
    geometryShape,
    geometryFill,
    setTool,
    setPencilSize,
    setEraserSize,
    setSelectShape,
    setSelectMode,
    setGeometryShape,
  }
})
