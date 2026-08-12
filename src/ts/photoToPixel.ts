// 以图生图 — optimized, exact palette quantization

export interface QuantizeOptions {
  palette: { hex: string; type: string }[]
  useSpecial: boolean
  ditherMode: 'none' | 'floyd-steinberg' | 'blue-noise'
  pixelRatio: number
}

export interface QuantizeResult {
  width: number
  height: number
  grid: string[][]
  pixels: Uint8ClampedArray
}

interface RgbEntry {
  r: number
  g: number
  b: number
  hex: string
  point: [number, number, number]
}

interface KdNode {
  entry: RgbEntry
  axis: 0 | 1 | 2
  left: KdNode | null
  right: KdNode | null
}

const BLUE_NOISE_8x8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

const WEIGHTS: [number, number, number] = [Math.sqrt(0.3), Math.sqrt(0.59), Math.sqrt(0.11)]

function clampChannel(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function buildKdTree(entries: RgbEntry[], depth = 0): KdNode | null {
  if (entries.length === 0) return null
  const axis = (depth % 3) as 0 | 1 | 2
  entries.sort((a, b) => a.point[axis] - b.point[axis])
  const middle = entries.length >> 1
  return {
    entry: entries[middle]!,
    axis,
    left: buildKdTree(entries.slice(0, middle), depth + 1),
    right: buildKdTree(entries.slice(middle + 1), depth + 1),
  }
}

function findClosest(r: number, g: number, b: number, root: KdNode): RgbEntry {
  const point: [number, number, number] = [r * WEIGHTS[0], g * WEIGHTS[1], b * WEIGHTS[2]]
  let best = root.entry
  let bestDistance = Infinity

  const visit = (node: KdNode | null) => {
    if (!node) return
    const candidate = node.entry.point
    const dr = point[0] - candidate[0]
    const dg = point[1] - candidate[1]
    const db = point[2] - candidate[2]
    const distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) {
      bestDistance = distance
      best = node.entry
    }

    const delta = point[node.axis] - candidate[node.axis]
    const near = delta < 0 ? node.left : node.right
    const far = delta < 0 ? node.right : node.left
    visit(near)
    if (delta * delta < bestDistance) visit(far)
  }

  visit(root)
  return best
}

let sampleCanvas: HTMLCanvasElement | null = null
let sampleCtx: CanvasRenderingContext2D | null = null

function getSampleCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement('canvas')
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!sampleCtx) return null
  if (sampleCanvas.width !== w || sampleCanvas.height !== h) {
    sampleCanvas.width = w
    sampleCanvas.height = h
  }
  return sampleCtx
}

export function quantizeImage(
  editedCanvas: HTMLCanvasElement,
  opts: QuantizeOptions,
): QuantizeResult {
  const { ditherMode, pixelRatio } = opts
  const srcW = editedCanvas.width
  const srcH = editedCanvas.height
  const outW = Math.max(1, Math.floor(srcW / pixelRatio))
  const outH = Math.max(1, Math.floor(srcH / pixelRatio))
  const pixelCount = outW * outH
  const empty = (): QuantizeResult => ({
    width: outW,
    height: outH,
    grid: Array.from({ length: outH }, () => Array.from({ length: outW }, () => '')),
    pixels: new Uint8ClampedArray(pixelCount * 4),
  })

  const entries: RgbEntry[] = opts.palette
    .filter((entry) => opts.useSpecial || entry.type === 'solid')
    .map((entry) => {
      const r = parseInt(entry.hex.slice(1, 3), 16)
      const g = parseInt(entry.hex.slice(3, 5), 16)
      const b = parseInt(entry.hex.slice(5, 7), 16)
      return { r, g, b, hex: entry.hex, point: [r * WEIGHTS[0], g * WEIGHTS[1], b * WEIGHTS[2]] }
    })
  const tree = buildKdTree(entries)
  if (!tree) return empty()

  const ctx = getSampleCtx(outW, outH)
  if (!ctx) return empty()
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, outW, outH)
  ctx.drawImage(editedCanvas, 0, 0, srcW, srcH, 0, 0, outW, outH)
  const source = ctx.getImageData(0, 0, outW, outH).data

  const grid: string[][] = Array.from({ length: outH }, () =>
    Array.from({ length: outW }, () => ''),
  )
  const pixels = new Uint8ClampedArray(pixelCount * 4)
  const working = ditherMode === 'floyd-steinberg' ? new Float32Array(pixelCount * 3) : null
  if (working) {
    for (let i = 0; i < pixelCount; i++) {
      working[i * 3] = source[i * 4]!
      working[i * 3 + 1] = source[i * 4 + 1]!
      working[i * 3 + 2] = source[i * 4 + 2]!
    }
  }

  const writeResult = (pixelIndex: number, x: number, y: number, entry: RgbEntry) => {
    grid[y]![x] = entry.hex
    const pi = pixelIndex * 4
    pixels[pi] = entry.r
    pixels[pi + 1] = entry.g
    pixels[pi + 2] = entry.b
    pixels[pi + 3] = 255
  }

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const pixelIndex = y * outW + x
      const sourceIndex = pixelIndex * 4
      if (source[sourceIndex + 3] === 0) continue

      const workIndex = pixelIndex * 3
      let r = working ? working[workIndex]! : source[sourceIndex]!
      let g = working ? working[workIndex + 1]! : source[sourceIndex + 1]!
      let b = working ? working[workIndex + 2]! : source[sourceIndex + 2]!
      if (ditherMode === 'blue-noise' || ditherMode === 'floyd-steinberg') {
        const strength = ditherMode === 'blue-noise' ? 48 : 24
        const noise = (BLUE_NOISE_8x8[y & 7]![x & 7]! / 64 - 0.5) * strength
        r += noise
        g += noise
        b += noise
      }

      const closest = findClosest(clampChannel(r), clampChannel(g), clampChannel(b), tree)
      writeResult(pixelIndex, x, y, closest)
      if (!working) continue

      const errorR = r - closest.r
      const errorG = g - closest.g
      const errorB = b - closest.b
      const spread = (nx: number, ny: number, weight: number) => {
        if (nx < 0 || nx >= outW || ny >= outH) return
        const index = (ny * outW + nx) * 3
        working[index]! += errorR * weight
        working[index + 1]! += errorG * weight
        working[index + 2]! += errorB * weight
      }
      spread(x + 1, y, 7 / 16)
      spread(x - 1, y + 1, 3 / 16)
      spread(x, y + 1, 5 / 16)
      spread(x + 1, y + 1, 1 / 16)
    }
  }

  return { width: outW, height: outH, grid, pixels }
}
