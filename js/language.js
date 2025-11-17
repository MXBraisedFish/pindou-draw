export const TEXT = {
  meta: {
    title: '拼豆像素画工具 - 免费在线拼豆草图制作'
  },
  app: {
    initFailed: '应用初始化失败'
  },
  aria: {
    updateManual: '查看更新说明',
    openDocs: '打开使用说明'
  },
  buttons: {
    updateManual: '更新说明',
    docs: '使用说明',
    importBase: '导入底图',
    clearBase: '移除底图',
    export: '打开导出窗口',
    exportHighlight: '导出高亮图',
    importProject: '导入 .pd',
    referenceWindow: '参考图窗',
    createCanvas: '新建画布',
    resizeCanvas: '扩裁画布',
    loadDefaultPalette: '加载内置 DMC',
    importPalette: '导入色卡 JSON',
    deletePalette: '删除色卡',
    colorManage: '颜色管理',
    colorHighlight: '颜色高亮',
    replaceHighlight: '替换高亮颜色',
    baseEdit: '编辑底图',
    baseRecenter: '底图居中',
    baseSnap: '贴合画布',
    selectAll: '全选',
    deselectAll: '取消全选',
    cancel: '取消',
    confirm: '确认',
    confirmExport: '开始导出',
    exporting: '导出中...',
    exportHighlightBatch: '批量导出高亮图',
    convertPalette: '转换色卡',
    resetCanvas: '新建画布'
  },
  labels: {
    widthInput: '宽度（像素）',
    heightInput: '高度（像素）',
    resolutionInput: '像素比例 1 : N',
    baseLayerOptions: {
      under: '底图在画布下方',
      over: '底图在画布上方',
      hidden: '隐藏底图'
    }
  },
  placeholders: {
    paletteFilter: '输入色号或关键字',
    colorManageSearch: '输入色号、名称或 RGB'
  },
  status: {
    canvasNotCreated: '未创建',
    paletteNotLoaded: '未加载',
    colorCodeNone: '未选择'
  },
  base: {
    notLoaded: '未导入底图',
    editingEnabled: '底图编辑模式已开启。',
    editingDisabled: '底图编辑模式已关闭。',
    exitEdit: '退出底图编辑',
    enterEdit: '进入底图编辑',
    anchors: {
      center: '画布中心',
      topLeft: '左上角',
      topRight: '右上角',
      bottomLeft: '左下角',
      bottomRight: '右下角'
    },
    locateLabel: (anchorLabel) => `贴合 ${anchorLabel}`,
    locateAria: (anchorLabel) => `将底图贴合到 ${anchorLabel}`
  },
  canvasHighlight: {
    empty: '暂无可高亮的颜色…',
    replace: {
      button: '替换选中颜色',
      panelTitle: '选择替换色',
      panelHint: '从色卡中挑选新的替换色，可多选，之后会顺序替换当前高亮颜色。',
      filterPlaceholder: '输入色号或关键字',
      confirmButton: '开始替换',
      cancelButton: '取消',
      sourceCount: (count) => `已选 ${count} 个高亮颜色`,
      targetCount: (count) => `已选 ${count} 个替换颜色`,
      noSelection: '请先选中一个高亮颜色',
      noTargets: '请先选中一个替换颜色',
      success: (count) => `已替换 ${count} 个像素`,
      noChange: '所选颜色已与替换颜色一致，无需替换',
      empty: '当前无可用于替换的颜色',
      noPalette: '请先加载色卡再进行替换'
    }
  },
  highlight: {
    noMatch: '未找到可用颜色。',
    colorCount: (count) => `像素数量：${count}`,
    noSelection: '请至少选择一个颜色后再导出。',
    formatUnsupported: '当前导出格式不支持此功能。',
    formatAutoSwitched: '已自动切换为 PNG 以保留透明背景。',
    progressGenerating: '正在整理高亮颜色...',
    progressExportingColor: (code) => `正在导出颜色 ${code} ...`,
    progressAllDone: '导出完成。',
    defaultFilename: 'highlight',
    exportFinished: '已完成高亮导出。',
    exportErrorConsole: '导出高亮图失败',
    exportErrorMessage: (message) => `导出失败：${message}`,
    noExportableColors: '没有可导出的颜色层。',
    zipMissing: '当前环境不支持 ZIP，无法批量导出。',
    jpgBackgroundWarning: 'JPG 需要纯色背景，已自动填充。',
    stateSelected: '已选',
    stateUnselected: '未选',
    canvasTitle: '高亮颜色预览',
    canvasTotalLabel: (count) => `总像素：${count}`,
    canvasSectionTitle: '选中的颜色',
    canvasEmptyHint: '请至少选择一个颜色再导出。',
    canvasPaletteLabel: (label) => `使用色卡：${label || '未命名'}`,
    unnamedPalette: '未命名色卡'
  },
  importer: {
    defaultPaletteLabel: '文件色卡',
    pdApplyConfirm: (label) => `即将切换到 ${label || '文件色卡'}，画布颜色保持原样，是否继续？`,
    pdPaletteApplied: (label) => `${label || '文件色卡'} 已应用，画布颜色未转换。`,
    pdConvertConfirm: '将把 .pd 内容转换为当前色卡，部分像素颜色会重新映射，是否继续？',
    pdConvertedNotice: '.pd 内容已转换为当前色卡。'
  },
  exporter: {
    heading: '导出设置',
    noCanvasAlert: '请先创建画布后再导出。',
    paletteLabel: (label) => `使用色卡：${label || '未命名'}`,
    sectionTitle: '画布统计',
    total: (count) => `像素总量：${count}`,
    empty: '没有可导出的内容。',
    pdfErrorConsole: '导出 PDF 时出错',
    pdfErrorMessage: '暂时无法导出 PDF，请稍后再试。',
    svgUnavailable: 'SVG 导出暂不可用，请稍后重试。'
  },
  exportWindow: {
    noCanvas: '当前没有可导出的画布。'
  },
  console: {
    imageOperations: {
      flipHorizontal: '已执行水平翻转。',
      flipVertical: '已执行垂直翻转。',
      rotate: '已执行旋转操作。'
    }
  }
};
