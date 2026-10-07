import { describe, expect, it } from 'vitest'
import { hexToLab, hexToRgb, rgbToLab } from './color'
import { deltaE2000 } from './deltaE'
import type { PixelBuffer } from './image'
import { paintScene, type MaskCache } from './scene'
import { buildLabGrid } from './segment'

const W = 120
const H = 80

/** Duas paredes de cores diferentes lado a lado, com um batente escuro entre elas. */
function scene(): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hex = x < 55 ? '#B8603E' : x < 65 ? '#2B2A28' : '#DDCBAA'
      const { r, g, b } = hexToRgb(hex)
      data.set([r, g, b, 255], (y * W + x) * 4)
    }
  }
  return { data, width: W, height: H }
}

const labAt = (buf: PixelBuffer, x: number, y: number) => {
  const i = (y * W + x) * 4
  return rgbToLab({ r: buf.data[i], g: buf.data[i + 1], b: buf.data[i + 2] })
}

describe('paintScene', () => {
  const img = scene()
  const grid = buildLabGrid(img)
  const esquerda = { seeds: [{ x: 0.2, y: 0.5 }], tolerance: 14, hex: '#7E9BB5' }
  const direita = { seeds: [{ x: 0.8, y: 0.5 }], tolerance: 14, hex: '#5E7D5A' }

  it('pinta cada parede com sua cor, sem tocar no batente', () => {
    const { pixels, coverages } = paintScene(img, grid, [esquerda, direita])
    expect(deltaE2000(labAt(pixels, 20, 40), hexToLab('#7E9BB5'))).toBeLessThan(2)
    expect(deltaE2000(labAt(pixels, 100, 40), hexToLab('#5E7D5A'))).toBeLessThan(2)
    const i = (40 * W + 60) * 4
    expect([...pixels.data.subarray(i, i + 3)]).toEqual([...img.data.subarray(i, i + 3)])
    expect(coverages[0]).toBeGreaterThan(0.35)
    expect(coverages[1]).toBeGreaterThan(0.35)
  })

  it('camada sem toque não pinta e tem cobertura null', () => {
    const { pixels, coverages } = paintScene(img, grid, [esquerda, { ...direita, seeds: [] }])
    expect(coverages[1]).toBeNull()
    const i = (40 * W + 100) * 4
    expect([...pixels.data.subarray(i, i + 3)]).toEqual([...img.data.subarray(i, i + 3)])
  })

  it('na sobreposição, a camada posterior fica por cima', () => {
    const { pixels } = paintScene(img, grid, [esquerda, { ...esquerda, hex: '#5E7D5A' }])
    expect(deltaE2000(labAt(pixels, 20, 40), hexToLab('#5E7D5A'))).toBeLessThan(2)
  })

  it('sem camadas pintadas, devolve a própria foto', () => {
    expect(paintScene(img, grid, []).pixels).toBe(img)
  })

  it('reaproveita a máscara quando só a cor muda', () => {
    const cache: MaskCache = new Map()
    paintScene(img, grid, [esquerda], cache)
    const antes = [...cache.values()][0]
    paintScene(img, grid, [{ ...esquerda, hex: '#C99293' }], cache)
    expect(cache.size).toBe(1)
    expect([...cache.values()][0]).toBe(antes)
    // alcance diferente = nova segmentação
    paintScene(img, grid, [{ ...esquerda, tolerance: 20 }], cache)
    expect(cache.size).toBe(2)
  })
})
