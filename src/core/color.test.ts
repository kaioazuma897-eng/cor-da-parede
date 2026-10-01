import { describe, expect, it } from 'vitest'
import { hexToLab, hexToRgb, labToRgb, rgbToHex, rgbToLab } from './color'

describe('rgbToLab', () => {
  it.each([
    ['#FFFFFF', 100, 0, 0],
    ['#000000', 0, 0, 0],
    ['#FF0000', 53.2408, 80.0925, 67.2032],
    ['#00FF00', 87.7347, -86.1827, 83.1793],
    ['#0000FF', 32.297, 79.1875, -107.8602],
    ['#808080', 53.5851, 0, 0],
  ])('%s', (hex, L, a, b) => {
    const lab = hexToLab(hex)
    expect(lab.L).toBeCloseTo(L, 2)
    expect(lab.a).toBeCloseTo(a, 2)
    expect(lab.b).toBeCloseTo(b, 2)
  })
})

describe('labToRgb', () => {
  it('ida e volta preserva a cor', () => {
    for (let r = 0; r <= 255; r += 51)
      for (let g = 0; g <= 255; g += 51)
        for (let b = 0; b <= 255; b += 51) {
          expect(labToRgb(rgbToLab({ r, g, b }))).toEqual({ r, g, b })
        }
  })

  it('corta cores fora do gamut', () => {
    const { r, g, b } = labToRgb({ L: 50, a: 200, b: -200 })
    for (const v of [r, g, b]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})

describe('hex', () => {
  it('aceita forma curta e longa', () => {
    expect(hexToRgb('#fa0')).toEqual({ r: 255, g: 170, b: 0 })
    expect(hexToRgb('1E90FF')).toEqual({ r: 30, g: 144, b: 255 })
    expect(rgbToHex({ r: 30, g: 144, b: 255 })).toBe('#1E90FF')
  })

  it('rejeita hex inválido', () => {
    expect(() => hexToRgb('#12345G')).toThrow()
  })
})
