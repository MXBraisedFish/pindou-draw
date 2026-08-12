// sRGB → CIE LAB (D65) 颜色空间转换 + deltaE 1976

import type { ColorEntry } from '@/ts/colorCard'

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  // sRGB → XYZ (D65)
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  ]
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  // D65 白点
  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883

  const f = (t: number) =>
    t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116)

  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)

  return [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ]
}

export function deltaE(hex1: string, hex2: string): number {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  const [l1, a1, b1l] = xyzToLab(...rgbToXyz(r1, g1, b1))
  const [l2, a2, b2l] = xyzToLab(...rgbToXyz(r2, g2, b2))
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1l - b2l) ** 2)
}

export function findBestMatch(
  hex: string,
  candidates: ColorEntry[],
): ColorEntry {
  let best = candidates[0]!
  let bestDist = Infinity
  for (const entry of candidates) {
    const dist = deltaE(hex, entry.color1)
    if (dist < bestDist) {
      bestDist = dist
      best = entry
    }
  }
  return best
}
