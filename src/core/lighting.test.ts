import { describe, expect, it } from 'vitest'
import { RGB_TO_XYZ, hexToRgb, linearToSrgb, mulMatVec, rgbToLab, srgbToLinear, type Lab, type Mat3 } from './color'
import { lightingMatrix, planckianXy } from './lighting'

/** Aplica a matriz (RGB linear) numa cor hex e devolve o Lab resultante. */
function under(m: Mat3, hex: string): Lab {
  const { r, g, b } = hexToRgb(hex)
  const lin = mulMatVec(m, [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)])
  const [R, G, B] = lin.map((v) => Math.min(255, Math.max(0, linearToSrgb(v))))
  return rgbToLab({ r: R, g: G, b: B })
}

describe('planckianXy', () => {
  it.each([
    // Valores de referência do lugar geométrico de Planck (CIE 1931)
    [2700, 0.4599, 0.4106],
    [4000, 0.3805, 0.3768],
    [6500, 0.3135, 0.3236],
  ])('%i K', (kelvin, x, y) => {
    const [cx, cy] = planckianXy(kelvin)
    expect(cx).toBeCloseTo(x, 2)
    expect(cy).toBeCloseTo(y, 2)
  })
})

describe('lightingMatrix', () => {
  it('sem desvio (shift 0) não muda nada', () => {
    const m = lightingMatrix(2700, 0)
    ;[1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 6))
  })

  it('preserva a luminância do branco', () => {
    const [, Y] = mulMatVec(RGB_TO_XYZ, mulMatVec(lightingMatrix(2700), [1, 1, 1]))
    expect(Y).toBeCloseTo(1, 3)
  })

  it('lâmpada amarela deixa um cinza neutro amarelado; mais quente = mais amarelo', () => {
    const neutro = under(lightingMatrix(6504, 0), '#B3B3AE')
    const neutra = under(lightingMatrix(4000), '#B3B3AE')
    const amarela = under(lightingMatrix(2700), '#B3B3AE')
    expect(neutra.b).toBeGreaterThan(neutro.b + 3)
    expect(amarela.b).toBeGreaterThan(neutra.b + 3)
    expect(amarela.a).toBeGreaterThan(0)
  })

  it('um azul perde saturação sob luz amarela', () => {
    const croma = (c: Lab) => Math.hypot(c.a, c.b)
    expect(croma(under(lightingMatrix(2700), '#6F95B5'))).toBeLessThan(croma(under(lightingMatrix(6504, 0), '#6F95B5')))
  })
})
