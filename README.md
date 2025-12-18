# 拼豆草图制作网页

## 目录
- [开发感言](#开发感言)  
- [开发版本](#开发版本)
- [项目功能](#项目功能与技术栈)  
- [项目目录](#项目目录)
- [主要算法介绍](#主要算法介绍)

---

## 开发感言

该项目是我的第一个巨大项目，代码量真的非常大，开发过程跨度将近四个月，中间遇到了无数困难，但最后也都是一一解决。  
总归是要体验一次写大型代码的感觉，现在明白要维护和更新大型项目是多么的不容易，真的很累很麻烦，中间有数次想放弃，不过也是坚持了下来。  

感谢您能查看该仓库，代码部分写的很乱，到后面因为文件太多、函数太多、变量复杂，我自己都处理不过来，有些内容是 AI 帮我写的。  
开发这个项目的原因是因为自己发现没有好用的拼豆草图绘制软件，就打算自己做个，顺水推舟就做的非常大，而且总的来说功能也十分全面。  

如果能帮助到您，还请点一颗星星 ⭐，这是对我这个程序员最大的鼓励 (*´I`*)

访问链接：[拼豆草图制作网页](https://mxbraisedfish.github.io/pindou-draw/)

---

## 开发版本

**v1.0**
- 实现最基础的像素绘画功能
- 可根据底图自动绘制像素
- 支持1024\*1024像素画布
- 支持PD工程导出

**v1.1**
- 支持像素分辨率自定义
- 支持色卡自定义导入
- 修复网页有时会因为绘制像素过快导致卡死的Bug

**v1.2**
- 添加图像旋转操作
- 修正色卡颜色减少误差
- 优化自动贴合底图颜色算法
- 底图改为无极缩放

**v1.3**
- 添加参考图窗口
- 支持PDF导出
- 优化PD文件格式
- 添加吸管工具
- 添加选区工具
- 优化全屏显示

**v1.4**
- 优化使用说明书
- 优化绘画逻辑代码

**v1.5**
- 添加颜色管理面板
- 添加快捷键逻辑

**v1.6**
- 优化代码防止卡顿

**v2.0**
- UI界面完全重做
- 新增简洁模式
- 快捷键全面支持
- 支持SVG导出
- 优化导出和调色板窗口
- 支持特殊像素绘制
- 增加以图生草图功能
- 完全重写说明书
- 新增官方制作色卡页面
- 优化画布缩放算法
- 坐标系可自定义间距 / 加粗 / 透明度
- 像素可渲染为空心圆形
- 支持对称绘画

**v2.1**
- 平板端测试上线
- 平板端有自己的说明书
- 优化以图生草图算法，现在不再会填充透明部分
- 添加使用提示

---

## 项目功能与技术栈

该项目是一个 **纯前端的拼豆草图生成 / 绘制网页**。
技术栈：
- HTML
- CSS
- JS

第三方库：
- jszip
- jspdf

本网页不具备专业的像素图绘制功能，但基本上可以满足拼豆手工草图绘制的所有需求。  
支持调色、导出、参考图、对称绘制、色卡管理、平板端适配等功能，致力于让拼豆创作更轻松、更有趣。

---

## 项目目录

```
拼豆色卡/
├ css/
│ ├ buttons.css                 # 通用按钮样式（主按钮 / 幽灵按钮 / 图标按钮等）
│ ├ color-display.css
│ ├ color-maker.css
│ ├ color-management.css        # 颜色管理与颜色高亮 / 替换窗口样式
│ ├ export-window.css           # 导出窗口样式（预览区 / 设置区 / 平板 tab 布局等）
│ ├ floating-windows.css        # 浮动窗口通用样式（参考窗 / 调色盘等，拖拽 / 缩放状态）
│ ├ forms.css
│ ├ inline-controls.css
│ ├ manual-docs.css             # 说明书页面样式（电脑端 / 平板端共用）
│ ├ modal-windows.css           # 模态窗口与 overlay 通用样式（遮罩 / dialog / 层级）
│ ├ panels.css                  # 各类面板 / 工具面板 / 弹窗内容区布局样式
│ ├ project-import.css          # .pd 导入设置 overlay 样式
│ ├ reference-images.css        # 参考图列表内容区样式（卡片 / 图片 / 操作按钮）
│ ├ reset.css
│ ├ resize-canvas.css           # 扩裁画布 overlay 样式
│ ├ status-bar.css              # 顶部 / 底部状态栏样式（色号 / 缩放 / 提示）
│ ├ toolbar.css                 # 工具栏样式（左右 / 底部 / 平板撤销栏 / 弹出工具框）
│ ├ update-log.css              # 更新说明 / 更新日志窗口样式
│ └ workspace.css               # 工作区布局与画布舞台区域样式
├ doc-image/                    # 电脑端说明书所用图片资源
├ doc-tablet-image/             # 平板端说明书所用图片资源
├ icon/                         # 浏览器站点图标（favicon 等）
├ js/
│ ├ app/
│ │ ├ app-initializer.js        # 应用初始化流程编排（模块初始化顺序 / 启动行为）
│ │ ├ localization.js           # 界面文案注入 / 本地化逻辑
│ │ └ resolution.js             # 分辨率 / 像素比输入解析与应用
│ ├ ui/
│ │ └ ui-bindings.js            # UI 事件绑定与状态同步（按钮 / 面板 / 平板模式等）
│ ├ app.js                      # 应用入口脚本，汇总模块并触发初始化
│ ├ base-image.js               # 底图逻辑（导入 / 显示 / 缩放 / 移动 / 编辑模式）
│ ├ canvas-highlight.js         # 颜色高亮与替换窗口的数据 / 交互 / 渲染逻辑
│ ├ canvas.js                   # 画布核心逻辑（绘制 / 填充 / 缩放 / 平移 / 撤销重做等）
│ ├ color-maker.js              # 颜色生成 / 解析 / 展示辅助逻辑
│ ├ color-usage-cache.js
│ ├ constants.js                # 全局常量与参数配置
│ ├ elements.js                 # DOM 元素统一引用与查询
│ ├ export-highlight-enhancements.js # 高亮导出增强逻辑（筛选 / 列表联动）
│ ├ export-highlight.js         # 高亮导出核心逻辑（选择颜色 / 生成高亮图）
│ ├ export-window.js            # 导出窗口逻辑（预览 / 设置 / 平板 tab / 缩放拖动）
│ ├ exporter.js                 # 实际导出渲染与文件生成（PNG / JPG / SVG / PDF / PD）
│ ├ floating-window-stack.js    # 浮动窗口层级 / 置顶 / 拖拽 / 尺寸管理
│ ├ grid-overlay.js
│ ├ highlight-outline.js
│ ├ image-operations.js         # 图像操作功能（翻转 / 旋转 / 对齐等）
│ ├ language.js                 # 文案与多语言文本资源
│ ├ palette-switch-dialog.js    # 切换色卡提示弹窗逻辑
│ ├ palette-window.js           # 调色盘窗口行为（打开 / 关闭 / 渲染 / 筛选）
│ ├ palette.js                  # 色卡数据管理（加载 / 保存 / 导入 / 删除 / 启用状态）
│ ├ pd.js                       # .pd 工程文件导入 / 导出 / 解析逻辑
│ ├ photo-sketch.js             # 图片转像素图逻辑（参数 / 抖动 / 预览 / 应用）
│ ├ project-import-dialog.js    # .pd 导入时的设置 / 提示弹窗逻辑
│ ├ reference.js                # 参考图窗口（列表管理 / 置顶 / 平板拖拽缩放）
│ ├ resize-canvas.js
│ ├ selection-layer.js          # 选区图层渲染与叠加显示（mask / outline）
│ ├ selection.js                # 选区数据与操作（创建 / 反选 / 移动 / 提交）
│ ├ shortcuts.js                # 快捷键与按键绑定
│ ├ state.js                    # 全局状态管理（工具 / 模式 / 窗口开关等）
│ ├ symmetry.js                 # 对称绘制模式逻辑
│ ├ toolbar-anchor.js           # 工具栏 / 弹出框锚点定位计算
│ ├ update.js                   # 更新说明（公告栏）窗口逻辑
│ ├ utils.js                    # 通用工具函数（数值 / 颜色 / DOM / 布局）
│ └ workspace.js                # 工作区 / 画布容器布局与交互辅助
├ output/                       # 默认色卡与内置数据存储目录
├ svg/                          # SVG 图标资源
├ color-maker.html              # 色卡制作与编辑页面
├ index.html                    # 应用主页面（首页）
├ manual-tablet.html            # 平板端使用说明书页面
└ manual.html                   # 电脑端使用说明书页面
```

---

## 主要算法介绍

### 1）以图生草图（以图生像素图 / 自动生图）

**js/photo-sketch.js：核心流程**
- 读取用户选择的图片文件，创建 `Image` 对象，并将相关信息记录到 `photoSketchState`
- 根据用户设置生成生成配置，包括目标宽高、像素比、缩放比例、裁剪区域、对齐方式、抖动模式、目标色卡等
- 将原图按裁剪/缩放结果绘制到离屏 `sampleCanvas`（`drawImage`），再通过 `getImageData()` 获取 RGBA 像素数据
- **颜色量化（Quantize）**：逐像素将原图颜色映射到“最接近的色卡颜色”（最近邻匹配）
  - **透明处理**：当源像素 `alpha === 0` 时直接输出透明像素并跳过匹配，避免透明区域被量化为黑色
  - **抖动（可选）**：如 Floyd–Steinberg 误差扩散算法，将量化误差分配到周围像素，使整体观感更平滑
- 生成两份结果数据：
  - `grid[y][x]`：每个像素对应的色号/颜色信息（用于应用到主画布）
  - `buffer`：RGBA 像素缓冲（用于预览与导出）
- 预览渲染：将 `buffer` 转换为 `ImageData` 绘制到预览 canvas，并根据界面状态切换显示原图或像素图
- 应用到画布：根据 `grid` 新建画布并填充 `state.grid`，随后执行 `redrawCanvas()` 与 `saveHistory()`，完成渲染与历史记录写入

**js/palette.js / js/color-maker.js：色卡数据与颜色匹配依赖**
- 提供当前色卡的可用颜色列表（色号 → RGB / 类型）
- 提供颜色解析与展示等辅助能力，供量化阶段使用 `paletteEntries`

**js/canvas.js：生成结果写入主画布**
- 维护画布的网格数据结构 `state.grid`
- 提供重绘、渲染与历史记录（撤销 / 重做）等基础能力，承接 photo-sketch 的生成结果


---

### 2）自动贴合底图颜色（底图采样 → 最近邻匹配 → 写入画布）

**js/base-image.js：底图数据准备与采样入口**
- 导入底图后，将底图绘制到离屏 / 隐藏 canvas
- 缓存 `state.baseImageData = ctx.getImageData(...)` 以供后续快速采样
- 提供按坐标取色的能力：将画布 cell 坐标换算为底图像素坐标后读取 RGBA
- 维护底图的缩放、偏移与对齐数据，确保取色点随底图变换同步变化

**js/base-image.js：取色与匹配逻辑**
- `getNearestColorFromBase(x, y)`：在指定 cell / 像素位置从 `state.baseImageData` 中读取 RGBA
- 根据读取到的 RGBA（包含透明度）确定需要进行匹配的目标颜色

**js/palette.js / js/color-maker.js：色卡与最近邻匹配**
- 维护当前色卡映射关系：色号 → RGB / 类型（普通 / 夜光 / 温变等）
- 最近邻匹配流程：遍历色卡中的颜色，计算其与底图颜色之间的距离（通常为 RGB 欧氏距离或近似度量），选出距离最小的色号

**js/canvas.js：匹配结果写入与渲染**
- 将匹配得到的色号 / 颜色写入 `state.grid[y][x]`
- 调用 `redrawCanvas()` 将新颜色渲染到画布
- 若为批量贴合（如自动贴合 / 吸附模式），则对区域或全画布循环执行：采样 → 匹配 → 写入 → 重绘

**透明度处理（关键点）**
- 底图像素的 `alpha` 值参与判断
- 当像素透明或接近透明时通常跳过上色，保持画布空白，避免透明区域被错误填充为黑色或其他颜色


---

### 3）特殊像素渲染与光效模式切换

**js/state.js：像素单元数据结构**
- 在像素 cell 中记录特殊像素信息，如 `cell.type`、`cell.rgb`、可选的 `cell.alpha`
- 对于双态颜色（光变 / 温变），使用 `cell.transition { from, to }` 存储基础态与激活态颜色

**js/palette.js：特殊类型解析与归一化**
- 解析并统一处理色卡中的特殊类型：
  - `light`（光变）
  - `temperatrue`（温变）
  - `glow`（夜光）
  - `pearlescent`（珠光）
  - `transparent`（透明）
- 将类型与颜色信息整理为画布渲染可直接使用的数据结构

**js/canvas.js：按显示模式计算最终颜色**
- 根据 `state.displayMode`（`standard / light / temperature / special / night`）决定每个像素最终显示颜色
- 关键逻辑函数：
  - `resolveCellFill()`：在绘制像素前计算最终填充色
  - `resolveCellColorForMode()`：核心分支逻辑
    - **双态色（光变 / 温变）**：当 `cell.type` 支持切换且存在 `cell.transition` 时，根据模式选择 `transition.from` 或 `transition.to`
    - `getSpecialColorStage(type, mode)`：模式规则映射  
      - `light`：在 `light` 或 `special` 模式下使用激活态，其余使用基础态  
      - `temperatrue`：在 `temperature` 或 `special` 模式下使用激活态，其余使用基础态
    - **夜光（glow）**：在 `night` 模式下保持原色不变，以体现发光效果
    - **夜间压暗**：当 `mode === 'night' && type !== 'glow'` 时，对 RGB 乘以系数（`applyNightTone`）模拟整体变暗
  - **珠光（pearlescent）**：先绘制基础颜色，再叠加渐变高光（`applyPearlescentGloss`）模拟反光
  - **模式切换动画**：通过 `startDisplayModeAnimation()` 与 `interpolateCellColor()` 在模式切换时进行颜色插值，降低突兀感

**js/color-maker.js：色卡预览渲染**
- 色卡预览同样遵循与画布一致的模式规则，按当前显示模式展示基础态、激活态与夜间效果

**js/exporter.js：导出时的特殊像素处理**
- 导出渲染阶段同样基于 `state.exportSettings` 与 `cell.type` 处理特殊像素，确保导出结果与画布显示一致


---

### 4）导出图片算法

**js/export-window.js：导出 UI 与预览调度**
- 读取导出设置（格式、是否包含色号 / 坐标轴、背景、高亮导出等）
- 构造 `snapshot`（包含 `signature`）以判断是否需要重新生成预览
- 创建临时 `tempCanvas`，调用 `renderExportCanvas()` 或高亮渲染路径生成导出源画布
- 预览逻辑本质为：将导出源画布缩放、平移后绘制到 `#exportPreviewCanvas`
- 提供预览交互：拖拽平移、滚轮 / 双指缩放、视图重置等

**js/exporter.js：导出渲染核心**
- `renderExportCanvas(exportCanvas, options)`：
  - 根据 `state.width / height` 与导出选项计算整体布局（留白、标题区、坐标轴区、像素区、统计区等）
  - 绘制背景（纯色或透明棋盘格）
  - 绘制标题（使用 `state.exportSettings.filename`，高亮导出会附加后缀）
  - 遍历 `state.grid[y][x]` 绘制像素主体，根据颜色与特殊类型决定最终绘制效果
  - 按选项附加绘制色号文本、坐标轴、网格线与色卡统计信息
  - 将结果输出到 `exportCanvas` 的 2D 上下文

**js/export-highlight.js：高亮导出渲染**
- 根据用户选择的高亮色号生成仅高亮或遮罩效果的导出画布
- 本质仍是遍历 `state.grid`，但对未选中像素进行压暗或忽略处理

**js/export-window.js：生成文件并下载**
- PNG / JPG：将渲染后的 canvas 转换为 Blob / DataURL 下载
- SVG / PDF：调用对应的矢量或文档生成函数输出
- `.pd`：调用工程导出逻辑

**js/pd.js：.pd 工程文件导出**
- 不进行图像渲染，而是将工程数据（画布尺寸、网格色号、色卡信息等）序列化为 `.pd` 文件，用于再次导入

**整体流程总结**
- 导出时先将当前 `state.grid` 按导出设置渲染到“导出专用 canvas”
- 预览只是该 canvas 的缩放显示
- 实际导出则将该 canvas 转换为目标文件格式，或序列化为 `.pd` 工程文件


---

### 5）高亮像素算法（区域连通聚合 + 边界描边）

**js/highlight-outline.js：高亮边缘算法**
- 该算法并非 Sobel / Canny 等图像边缘检测，而是针对“像素格子区域”的边界描边
- `computeHighlightRegions(selectedColors)`：
  - 遍历 `state.grid`
  - 对命中选中色号的格子进行 **4 邻域 BFS 泛洪填充**
  - 将同色号且相邻连通的格子聚合为一个 `region`（由多个 `(x, y)` 点组成）
- `drawHighlightRegionOutline(ctx, region, originX, originY, cellSize)`：
  - 计算区域的最小外接矩形（`minX / minY / maxX / maxY`）
  - 在该范围内构建布尔 `mask`（区域内为 `true`）
  - 遍历所有 `true` 格子，检查其上下左右邻格：
    - 若某方向邻格不存在或不在区域内，则该方向为边缘
    - 在 canvas 上绘制对应方向的线段
  - 最终通过多条短线段拼接出区域外轮廓，并统一 `ctx.stroke()` 输出

**算法复用位置**
- `js/selection-layer.js`：选区轮廓绘制（选区 mask → region → 描边）
- `js/export-highlight.js`：高亮导出时的区域边框绘制

---

### 6）色卡存储

本项目支持 **JSON** 与 **CSV** 两种色卡文件格式，用于描述拼豆颜色及其特殊属性（光变、温变、夜光等）。

---

#### JSON 色卡格式

**整体结构**

- 根结构为一个对象（Map）
- 键为色号 `num`（字符串）
- 值为颜色条目对象（entry）

**颜色条目字段（entry）**

- `num`  
  色号 / 颜色编号（字符串，如 `"A1"`、`"DMC-310"`）

- `type`  
  颜色类型（字符串）  
  常见取值：
  - `normal`：普通颜色  
  - `transparent`：透明  
  - `light`：光变  
  - `temperatrue`：温变  
  - `glow`：夜光  
  - `pearlescent`：珠光  

- `color1`  
  基础颜色（字符串，CSS 颜色格式：`rgb(...)` / `rgba(...)` / `#RRGGBB`）

- `color`  
  与 `color1` 等价的兼容字段（用于旧格式兼容）

- `color2`（可选）  
  激活态颜色（字符串，CSS 颜色格式），用于 `light` / `temperatrue` 等“双态色”

**示例**

```json
{
  "A1": {
    "num": "A1",
    "type": "normal",
    "color1": "rgb(250,245,205)",
    "color": "rgb(250,245,205)"
  },
  "L1": {
    "num": "L1",
    "type": "light",
    "color1": "rgb(80,120,255)",
    "color": "rgb(80,120,255)",
    "color2": "rgb(200,220,255)"
  }
}
```

---

#### CSV 色卡格式

**表头要求**

* 前两列必须为：`num`, `type`
* 必须包含 `color1`（或旧兼容列 `color`）

**推荐表头顺序**

``` csv
num,type,color1,color2
```

**列字段说明**

* `num`
  色号（字符串）

* `type`
  颜色类型（同 JSON 格式中的 `type`）

* `color1`
  基础颜色（CSS 颜色字符串）

* `color2`（可选）
  激活态颜色（CSS 颜色字符串，用于双态色）

* `color`
  旧兼容字段，可替代 `color1`

**示例**

```csv
num,type,color1,color2
A1,normal,rgb(250,245,205),
L1,light,rgb(80,120,255),rgb(200,220,255)
```

---

#### 备注（实现依据）

* 色卡导入解析：

  * `js/palette.js`

    * `parseCsvPalette()`
    * `parseJsonPalette()`

* 色卡制作页导出：

  * `js/color-maker.js`

    * `exportJson()`
    * `exportCsv()`