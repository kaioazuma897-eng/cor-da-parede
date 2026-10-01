import { describe, expect, it } from 'vitest'
import { D65_WHITE, hexToLab, hexToRgb, linearToSrgb, srgbToLinear, type Mat3 } from './color'
import { deltaE2000 } from './deltaE'
import { regionColor, sampleLab, type PixelBuffer } from './image'
import { PAPER_Y, applyMatrix, bradfordAdaptation, calibrate, correctionMatrix } from './whiteBalance'

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const expectMatClose = (m: Mat3, expected: Mat3, digits = 3) =>
  m.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits))

/** Folha sulfite: cinza neutro com Y ≈ PAPER_Y. */
const PAPER = '#F1F1F1'

const WALLS = ['#B8603E', '#7E9BB5', '#A3B39A', '#EADFC4', '#55585A', '#E97FA4', '#1F7A43', '#F6D24B']

/**
 * Cena sintética: metade de cima é a folha, metade de baixo uma parede.
 * `light` simula a iluminação multiplicando cada canal em RGB linear (cor da luz × exposição).
 */
function scene(wall: string, light: [number, number, number], size = 40): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4)
  const lit = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    return [r, g, b].map((c, k) => Math.round(linearToSrgb(Math.min(1, srgbToLinear(c) * light[k]))))
  }
  const paper = lit(PAPER)
  const w = lit(wall)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) data.set([...(y < size / 2 ? paper : w), 255], (y * size + x) * 4)
  return { data, width: size, height: size }
}

const wallLab = (img: PixelBuffer) =>
  regionColor(sampleLab(img, { x: 0, y: img.height / 2, w: img.width, h: img.height / 2 }))!.lab
const paperRect = (img: PixelBuffer) => ({ x: 0, y: 0, w: img.width, h: img.height / 2 })

describe('bradfordAdaptation', () => {
  it('é a identidade quando a luz de origem e destino são iguais', () => {
    expectMatClose(bradfordAdaptation(D65_WHITE, D65_WHITE), IDENTITY, 6)
  })

  it('leva o branco de origem exatamente ao branco de destino', () => {
    const illuminantA = [1.0985, 1, 0.35585] as const
    const m = bradfordAdaptation(illuminantA, D65_WHITE)
    const out = [0, 1, 2].map((i) => m[i * 3] * 1.0985 + m[i * 3 + 1] + m[i * 3 + 2] * 0.35585)
    out.forEach((v, i) => expect(v).toBeCloseTo(D65_WHITE[i], 6))
  })
})

describe('correctionMatrix', () => {
  it('não altera nada se a folha já está neutra e com a luminância esperada', () => {
    expectMatClose(correctionMatrix([PAPER_Y, PAPER_Y, PAPER_Y]), IDENTITY, 3)
  })
})

describe('calibrate', () => {
  it('sem luz colorida, a foto praticamente não muda', () => {
    const img = scene('#B8603E', [1, 1, 1])
    const cal = calibrate(img, paperRect(img))!
    expect(cal.warnings).toEqual([])
    expect(deltaE2000(wallLab(applyMatrix(img, cal.matrix)), hexToLab('#B8603E'))).toBeLessThan(0.5)
  })

  it.each([
    ['lâmpada incandescente', [0.95, 0.72, 0.42]],
    ['luz fria / dia nublado', [0.7, 0.8, 0.95]],
    ['cômodo escuro', [0.35, 0.33, 0.3]],
  ] as const)('%s: recupera as cores com muito mais precisão', (_, light) => {
    let sumBefore = 0
    let sumAfter = 0
    for (const wall of WALLS) {
      const img = scene(wall, [...light])
      const truth = hexToLab(wall)
      const before = deltaE2000(wallLab(img), truth)
      const cal = calibrate(img, paperRect(img))!
      const after = deltaE2000(wallLab(applyMatrix(img, cal.matrix)), truth)
      const msg = `${wall}: antes ${before.toFixed(1)}, depois ${after.toFixed(1)}`
      // A simulação multiplica canais RGB e a correção atua no espaço LMS: sobra um erro pequeno
      expect(after, msg).toBeLessThan(3)
      expect(after, msg).toBeLessThan(before)
      sumBefore += before
      sumAfter += after
    }
    expect(sumAfter * 4).toBeLessThan(sumBefore)
  })

  it('avisa quando a folha estoura (branco puro)', () => {
    const img = scene('#B8603E', [1.4, 1.3, 1.2])
    expect(calibrate(img, paperRect(img))!.warnings).toContain('clipped')
  })

  it('avisa quando a folha está escura demais', () => {
    const img = scene('#B8603E', [0.02, 0.02, 0.02])
    expect(calibrate(img, paperRect(img))?.warnings ?? ['dark']).toContain('dark')
  })

  it('avisa quando a área marcada mistura folha e parede', () => {
    const img = scene('#1F7A43', [1, 1, 1])
    const cal = calibrate(img, { x: 0, y: 0, w: img.width, h: img.height })!
    expect(cal.warnings).toContain('mixed')
  })

  it('recusa uma área que é parede colorida, não folha', () => {
    const img = scene('#B8603E', [1, 1, 1])
    const wall = { x: 0, y: img.height / 2, w: img.width, h: img.height / 2 }
    expect(calibrate(img, wall)!.warnings).toContain('notWhite')
  })

  it('detecta mistura mesmo quando a maior parte da área é parede', () => {
    const img = scene('#B8603E', [1, 1, 1])
    // 30% folha, 70% parede: a mediana sozinha seria só "parede"
    const cal = calibrate(img, { x: 0, y: img.height * 0.35, w: img.width, h: img.height * 0.5 })!
    expect(cal.warnings).toContain('mixed')
  })

  it.each([
    ['lâmpada incandescente', [0.95, 0.72, 0.42]],
    ['luz fria', [0.7, 0.8, 0.95]],
  ] as const)('aceita a folha sob %s', (_, light) => {
    const img = scene('#B8603E', [...light])
    expect(calibrate(img, paperRect(img))!.warnings).toEqual([])
  })

  it('retorna null para área fora da imagem', () => {
    const img = scene('#B8603E', [1, 1, 1])
    expect(calibrate(img, { x: 100, y: 100, w: 5, h: 5 })).toBeNull()
  })
})
