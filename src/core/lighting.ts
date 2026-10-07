/**
 * Simulação da parede sob outra luz (lâmpada amarela, neutra…).
 *
 * É o caminho inverso da calibração: a foto (corrigida pela folha, ou ajustada pelo balanço de
 * branco automático da câmera) representa as cores sob um branco neutro D65. Para mostrar como
 * ficariam sob uma lâmpada de temperatura T, aplicamos a adaptação de Bradford do branco D65
 * para o branco dessa lâmpada.
 *
 * O olho humano se adapta em boa parte à cor da luz: depois de alguns minutos num quarto com
 * lâmpada amarela, o branco volta a parecer quase branco. Uma câmera com balanço fixo mostraria o
 * desvio inteiro, o que exagera o efeito. Por isso mostramos só uma fração do desvio
 * (`VISIBLE_SHIFT`), um meio-termo entre "câmera" e "olho totalmente adaptado".
 */
import { D65_WHITE, RGB_TO_XYZ, XYZ_TO_RGB, mulMat, type Mat3, type Vec3 } from './color'
import { bradfordAdaptation } from './whiteBalance'

/** Fração do desvio de cor da lâmpada que aparece na simulação (0 = nenhum, 1 = câmera sem ajuste). */
export const VISIBLE_SHIFT = 0.5

/** Cromaticidade xy do D65. */
const D65_SUM = D65_WHITE[0] + D65_WHITE[1] + D65_WHITE[2]
const D65_XY = [D65_WHITE[0] / D65_SUM, D65_WHITE[1] / D65_SUM] as const

/**
 * Cromaticidade xy de um corpo negro (lâmpada incandescente, ou o "K" anunciado de uma lâmpada LED)
 * na temperatura `kelvin`. Aproximação cúbica de Kim et al. (2002), válida de 1667 K a 25 000 K.
 */
export function planckianXy(kelvin: number): [number, number] {
  const T = Math.min(25_000, Math.max(1667, kelvin))
  const t1 = 1e3 / T
  const t2 = t1 * t1
  const t3 = t2 * t1
  const x =
    T <= 4000
      ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t1 + 0.17991
      : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t1 + 0.24039
  const x2 = x * x
  const x3 = x2 * x
  const y =
    T <= 2222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : T <= 4000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483
  return [x, y]
}

/** Branco XYZ com luminância Y = 1 para a cromaticidade xy. */
const whiteFromXy = (x: number, y: number): Vec3 => [x / y, 1, (1 - x - y) / y]

/**
 * Matriz em RGB linear que mostra a foto (branco D65) sob uma lâmpada de `kelvin`.
 * A luminância do branco é preservada: muda a cor da luz, não a exposição.
 */
export function lightingMatrix(kelvin: number, shift = VISIBLE_SHIFT): Mat3 {
  const [lx, ly] = planckianXy(kelvin)
  const x = D65_XY[0] + (lx - D65_XY[0]) * shift
  const y = D65_XY[1] + (ly - D65_XY[1]) * shift
  return mulMat(XYZ_TO_RGB, mulMat(bradfordAdaptation(D65_WHITE, whiteFromXy(x, y)), RGB_TO_XYZ))
}

export type Light = { id: string; label: string; kelvin: number | null }

/** Opções da prévia. `kelvin: null` = como a foto está (branco neutro). */
export const LIGHTS: readonly Light[] = [
  { id: 'dia', label: 'Luz do dia', kelvin: null },
  { id: 'neutra', label: 'Neutra 4000 K', kelvin: 4000 },
  { id: 'amarela', label: 'Amarela 2700 K', kelvin: 2700 },
]
