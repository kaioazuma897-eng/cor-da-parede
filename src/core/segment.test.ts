import { describe, expect, it } from 'vitest'
import { hexToLab, hexToRgb, linearToSrgb, rgbToLab, srgbToLinear } from './color'
import { deltaE2000 } from './deltaE'
import type { PixelBuffer } from './image'
import { paintRegion } from './recolor'
import { buildLabGrid, closeMask, growRegion, segmentWall, type Mask } from './segment'

const W = 200
const H = 150

type Part = 'wall' | 'frame' | 'sofa' | 'baseboard'

/** Cena sintética: parede terracota com luz caindo da esquerda (100%) para a direita (40%),
 *  um quadro escuro, um sofá verde-oliva e um rodapé claro. */
function partAt(x: number, y: number): Part {
  if (x >= 30 && x < 70 && y >= 30 && y < 80) return 'frame'
  if (x >= 130 && y >= 95) return 'sofa'
  if (y >= 138) return 'baseboard'
  return 'wall'
}

const COLORS: Record<Part, string> = { wall: '#B8603E', frame: '#2B2A28', sofa: '#76784A', baseboard: '#EFE9E1' }

function scene(): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const { r, g, b } = hexToRgb(COLORS[partAt(x, y)])
      const light = 1 - 0.6 * (x / (W - 1))
      const lit = [r, g, b].map((c) => Math.round(linearToSrgb(srgbToLinear(c) * light)))
      data.set([...lit, 255], (y * W + x) * 4)
    }
  }
  return { data, width: W, height: H }
}

function coverageOf(mask: Mask, part: Part) {
  let inPart = 0
  let covered = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (partAt(x, y) !== part) continue
      inPart++
      covered += mask.data[y * W + x]
    }
  }
  return covered / inPart
}

describe('segmentWall', () => {
  const img = scene()
  const grid = buildLabGrid(img)
  const mask = segmentWall(grid, [{ x: 0.5, y: 0.3 }], 15)

  it('pega a parede inteira, inclusive o lado na sombra (40% da luz)', () => {
    expect(coverageOf(mask, 'wall')).toBeGreaterThan(0.95)
    // Só a parte mais escura da parede, acima do sofá
    let dark = 0
    let n = 0
    for (let y = 0; y < 90; y++)
      for (let x = 175; x < W; x++) {
        dark += mask.data[y * W + x]
        n++
      }
    expect(dark / n).toBeGreaterThan(0.95)
  })

  it('atravessa a sombra mesmo com tolerância baixa (graças à normalização de a* e b*)', () => {
    const tight = segmentWall(grid, [{ x: 0.1, y: 0.3 }], 8)
    expect(coverageOf(tight, 'wall')).toBeGreaterThan(0.95)
    expect(coverageOf(tight, 'sofa')).toBeLessThan(0.05)
  })

  it('para nas bordas: não invade quadro, sofá nem rodapé', () => {
    expect(coverageOf(mask, 'frame')).toBeLessThan(0.05)
    expect(coverageOf(mask, 'sofa')).toBeLessThan(0.05)
    expect(coverageOf(mask, 'baseboard')).toBeLessThan(0.05)
  })

  it('um toque no sofá pinta o sofá, não a parede', () => {
    const sofa = segmentWall(grid, [{ x: 0.85, y: 0.8 }], 15)
    expect(coverageOf(sofa, 'sofa')).toBeGreaterThan(0.9)
    expect(coverageOf(sofa, 'wall')).toBeLessThan(0.05)
  })

  it('vários toques somam regiões', () => {
    const both = segmentWall(grid, [{ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.97 }], 15)
    expect(coverageOf(both, 'wall')).toBeGreaterThan(0.95)
    expect(coverageOf(both, 'baseboard')).toBeGreaterThan(0.9)
  })

  it('reduz fotos grandes para uma grade de no máximo 800 px de lado', () => {
    const big = { data: new Uint8ClampedArray(1600 * 1200 * 4), width: 1600, height: 1200 }
    const g = buildLabGrid(big)
    expect([g.width, g.height]).toEqual([800, 600])
  })
})

describe('growRegion', () => {
  it('toque fora da imagem não pinta nada', () => {
    const grid = buildLabGrid(scene())
    expect(growRegion(grid, -1, 5, 15).some((v) => v)).toBe(false)
  })
})

describe('closeMask', () => {
  it('tapa buracos pequenos de ruído sem engordar a região', () => {
    const w = 20
    const h = 20
    const m = new Uint8Array(w * h)
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1
    m[10 * w + 10] = 0 // buraco
    const closed = closeMask(m, w, h, 1)
    expect(closed[10 * w + 10]).toBe(1)
    expect(closed[4 * w + 10]).toBe(0) // não cresceu para fora
    expect(closed[5 * w + 5]).toBe(1)
  })
})

describe('paintRegion', () => {
  const img = scene()
  const mask = segmentWall(buildLabGrid(img), [{ x: 0.5, y: 0.3 }], 15)
  const painted = paintRegion(img, mask, '#7E9BB5')
  const labAt = (buf: PixelBuffer, x: number, y: number) => {
    const i = (y * W + x) * 4
    return rgbToLab({ r: buf.data[i], g: buf.data[i + 1], b: buf.data[i + 2] })
  }

  it('na luz típica da parede, o pixel vira exatamente a tinta escolhida', () => {
    // A mediana da luminância da parede fica perto do meio da imagem
    expect(deltaE2000(labAt(painted, 95, 20), hexToLab('#7E9BB5'))).toBeLessThan(3)
  })

  it('preserva a sombra: o lado escuro continua escuro, com o mesmo tom', () => {
    const lit = labAt(painted, 10, 20)
    const shade = labAt(painted, 190, 20)
    expect(shade.L).toBeLessThan(lit.L - 15)
    const hue = (c: { a: number; b: number }) => (Math.atan2(c.b, c.a) * 180) / Math.PI
    expect(Math.abs(hue(shade) - hue(lit))).toBeLessThan(6)
  })

  it('não mexe no que está fora da máscara', () => {
    for (const [x, y] of [
      [50, 55],
      [160, 120],
      [20, 145],
    ]) {
      const i = (y * W + x) * 4
      expect([...painted.data.subarray(i, i + 4)]).toEqual([...img.data.subarray(i, i + 4)])
    }
  })
})
