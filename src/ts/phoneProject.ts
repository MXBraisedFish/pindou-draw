import { validateColorCard } from '@/ts/colorCard'

// Validate before touching the current project: a group must never be silently truncated.
export function validatePhoneProject(json: string): void {
  const data = JSON.parse(json)
  if (!data || typeof data !== 'object' || data.type === 'group' || data.canvases) {
    throw new Error('手机端仅支持单画布工程，请使用电脑或平板打开画布组。')
  }
  if (![data.cols, data.rows].every((n) => Number.isInteger(n) && n >= 1 && n <= 64)) {
    throw new Error('手机端支持宽、高均为 1–64 格的单画布工程。')
  }
  const grids =
    Array.isArray(data.layers) && data.layers.length
      ? data.layers.map((layer: { grid?: unknown } | null) => layer?.grid)
      : [data.grid]
  if (
    !grids.every(
      (grid: unknown) =>
        Array.isArray(grid) &&
        grid.every(
          (row: unknown) => Array.isArray(row) && row.every((pixel) => typeof pixel === 'string'),
        ),
    )
  ) {
    throw new Error('工程文件中的像素数据无效。')
  }
  if (data.colorCard && !validateColorCard(data.colorCard)) {
    throw new Error('工程文件中的色卡数据无效。')
  }
}

export function fitPhoneOutput(width: number, height: number) {
  const scale = Math.min(1, 64 / Math.max(width, height))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}
