/**
 * Calibração de balanço de branco usando uma referência neutra (folha A4) na foto.
 *
 * A folha e a parede recebem a mesma luz. Medindo o quanto a folha saiu "colorida"
 * e escura/clara demais, calculamos a transformação que a leva de volta a um branco
 * neutro e aplicamos a mesma transformação na foto inteira.
 *
 * A correção é uma adaptação cromática de von Kries no espaço de cones LMS de Bradford,
 * que modela como o olho se adapta à cor da iluminação.
 */
import {
  D65_WHITE,
  RGB_TO_XYZ,
  XYZ_TO_RGB,
  linearToSrgb,
  mulMat,
  rgbToLab,
  mulMatVec,
  rgbToHex,
  srgbToLinear,
  type Mat3,
  type Vec3,
} from './color'
import { deltaE76 } from './deltaE'
import { sampleLab, type PixelBuffer, type Rect } from './image'

const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]
const BRADFORD_INV: Mat3 = [
  0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287, 0.0400428, 0.9684867,
]

/**
 * Luminância (Y) atribuída à folha depois da correção. Papel sulfite comum reflete
 * ~85–90% da luz; 0,88 equivale a L* ≈ 95.
 */
export const PAPER_Y = 0.88

/** Matriz XYZ → XYZ que leva cores vistas sob `srcWhite` para como seriam sob `dstWhite`. */
export function bradfordAdaptation(srcWhite: Vec3, dstWhite: Vec3): Mat3 {
  const s = mulMatVec(BRADFORD, srcWhite)
  const d = mulMatVec(BRADFORD, dstWhite)
  const gain: Mat3 = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]]
  return mulMat(BRADFORD_INV, mulMat(gain, BRADFORD))
}

/**
 * Matriz em RGB linear que transforma a cor medida da folha num branco neutro D65
 * com luminância `paperY`. Corrige ao mesmo tempo a cor da luz e a exposição.
 */
export function correctionMatrix(paperLinear: Vec3, paperY = PAPER_Y): Mat3 {
  const src = mulMatVec(RGB_TO_XYZ, paperLinear)
  const dst: Vec3 = [D65_WHITE[0] * paperY, D65_WHITE[1] * paperY, D65_WHITE[2] * paperY]
  return mulMat(XYZ_TO_RGB, mulMat(bradfordAdaptation(src, dst), RGB_TO_XYZ))
}

// Tabelas de conversão: evitam ~6 milhões de Math.pow por foto
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i))
const ENCODE_STEPS = 16384
const TO_SRGB = Uint8ClampedArray.from({ length: ENCODE_STEPS + 1 }, (_, i) =>
  Math.round(linearToSrgb(i / ENCODE_STEPS)),
)
const encode = (v: number) => TO_SRGB[v <= 0 ? 0 : v >= 1 ? ENCODE_STEPS : Math.round(v * ENCODE_STEPS)]

/** Aplica uma matriz de RGB linear a todos os pixels. Valores acima de 1 são cortados. */
export function applyMatrix(img: PixelBuffer, m: Mat3): PixelBuffer {
  const src = img.data
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const r = TO_LINEAR[src[i]]
    const g = TO_LINEAR[src[i + 1]]
    const b = TO_LINEAR[src[i + 2]]
    out[i] = encode(m[0] * r + m[1] * g + m[2] * b)
    out[i + 1] = encode(m[3] * r + m[4] * g + m[5] * b)
    out[i + 2] = encode(m[6] * r + m[7] * g + m[8] * b)
    out[i + 3] = src[i + 3]
  }
  return { data: out, width: img.width, height: img.height }
}

export type CalibrationWarning =
  /** Parte da folha saiu branco puro: a câmera perdeu a informação de cor ali. */
  | 'clipped'
  /** A folha está escura demais para medir com confiança. */
  | 'dark'
  /** A área marcada não é uniforme (pegou sombra, borda ou parede junto). */
  | 'mixed'
  /** A cor medida é saturada demais para ser papel branco, mesmo sob luz colorida. */
  | 'notWhite'

/** Avisos que impedem a calibração: aplicar a correção pioraria a foto. */
export const BLOCKING_WARNINGS: readonly CalibrationWarning[] = ['notWhite']

export type Calibration = {
  matrix: Mat3
  /** Cor da folha como saiu na foto. */
  paperHex: string
  warnings: CalibrationWarning[]
}

const CLIPPED_FRACTION = 0.1
const DARK_Y = 0.03
/** Pixels a mais de ΔE76 12 da cor medida contam como "outra coisa" dentro da área. */
const OUTLIER_DE = 12
const MIXED_FRACTION = 0.15
/**
 * Croma (C*ab) máximo aceito para a folha na foto. Papel branco sob lâmpada
 * incandescente sem balanço de branco fica em torno de 25; paredes coloridas passam de 40.
 */
const MAX_PAPER_CHROMA = 35

function median(values: number[]): number {
  const s = values.sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Mede a folha dentro de `rect` e calcula a correção. Retorna null se não houver pixels. */
export function calibrate(img: PixelBuffer, rect: Rect): Calibration | null {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w))
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h))
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 20_000)))

  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  let clipped = 0
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4
      const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]]
      if (r >= 250 || g >= 250 || b >= 250) clipped++
      rs.push(TO_LINEAR[r])
      gs.push(TO_LINEAR[g])
      bs.push(TO_LINEAR[b])
    }
  }
  if (rs.length === 0) return null

  // Mediana em RGB linear: robusta a pequenos riscos, texto impresso ou sombra na borda
  const paper: Vec3 = [median(rs), median(gs), median(bs)]
  const Y = mulMatVec(RGB_TO_XYZ, paper)[1]

  const warnings: CalibrationWarning[] = []
  if (clipped / rs.length > CLIPPED_FRACTION) warnings.push('clipped')
  if (Y < DARK_Y || Math.min(...paper) <= 1e-4) warnings.push('dark')
  // Fração de pixels muito diferentes da cor medida: a mediana sozinha esconderia a mistura
  const paperLab = rgbToLab({ r: linearToSrgb(paper[0]), g: linearToSrgb(paper[1]), b: linearToSrgb(paper[2]) })
  const samples = sampleLab(img, rect, 5000)
  const outliers = samples.filter((p) => deltaE76(p, paperLab) > OUTLIER_DE).length
  if (outliers / samples.length > MIXED_FRACTION) warnings.push('mixed')
  if (Math.hypot(paperLab.a, paperLab.b) > MAX_PAPER_CHROMA) warnings.push('notWhite')

  // Sem um dos canais não há como estimar a luz: não corrige
  if (Math.min(...paper) <= 1e-4) return null

  return {
    matrix: correctionMatrix(paper),
    paperHex: rgbToHex({ r: encode(paper[0]), g: encode(paper[1]), b: encode(paper[2]) }),
    warnings,
  }
}
