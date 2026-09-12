import { describe, expect, it } from 'vitest'
import { fitPhoneOutput, validatePhoneProject } from '@/ts/phoneProject'

describe('phone single canvas limits', () => {
  it('fits large image output proportionally in a single canvas', () => {
    expect(fitPhoneOutput(1000, 500)).toEqual({ width: 64, height: 32 })
    expect(fitPhoneOutput(20, 60)).toEqual({ width: 20, height: 60 })
    expect(fitPhoneOutput(1, 4000)).toEqual({ width: 1, height: 64 })
  })
  it('rejects groups and oversize or corrupt projects before loading', () => {
    expect(() =>
      validatePhoneProject(JSON.stringify({ type: 'group', cols: 16, rows: 16 })),
    ).toThrow('画布组')
    expect(() => validatePhoneProject(JSON.stringify({ cols: 65, rows: 16, grid: [] }))).toThrow(
      '1–64',
    )
    expect(() =>
      validatePhoneProject(JSON.stringify({ cols: 16, rows: 16, layers: [null] })),
    ).toThrow('像素')
    expect(() =>
      validatePhoneProject(JSON.stringify({ cols: 16, rows: 16, grid: [['#ffffff']] })),
    ).not.toThrow()
  })
})
