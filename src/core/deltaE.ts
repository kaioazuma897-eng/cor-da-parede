import type { Lab } from './color'

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (deg: number) => (deg * Math.PI) / 180

/** ΔE*ab (CIE76): distância euclidiana no espaço Lab. Rápida, mas pouco fiel à percepção. */
export function deltaE76(c1: Lab, c2: Lab): number {
  return Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b)
}

function hueAngle(b: number, aPrime: number): number {
  if (b === 0 && aPrime === 0) return 0
  const h = deg(Math.atan2(b, aPrime))
  return h >= 0 ? h : h + 360
}

const POW25_7 = 25 ** 7

/**
 * ΔE00 (CIEDE2000), seguindo Sharma, Wu & Dalal (2005),
 * "The CIEDE2000 Color-Difference Formula: Implementation Notes".
 *
 * Corrige distorções do Lab: compressão de croma, rotação de matiz
 * na região dos azuis e menor sensibilidade em cores escuras/claras.
 *
 * Obs.: ΔE00 NÃO é uma métrica (viola a desigualdade triangular),
 * por isso o índice espacial usa ΔE76 e o ΔE00 só reordena candidatos.
 */
export function deltaE2000(c1: Lab, c2: Lab, kL = 1, kC = 1, kH = 1): number {
  const { L: L1, a: a1, b: b1 } = c1
  const { L: L2, a: a2, b: b2 } = c2

  // 1. Ajuste do eixo a' (compensa a baixa sensibilidade em cores neutras)
  const Cab = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const Cab7 = Cab ** 7
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + POW25_7)))

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = hueAngle(b1, a1p)
  const h2p = hueAngle(b2, a2p)

  // 2. Diferenças de luminosidade, croma e matiz
  const dLp = L2 - L1
  const dCp = C2p - C1p

  const chromaProduct = C1p * C2p
  let dhp = 0
  if (chromaProduct !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(chromaProduct) * Math.sin(rad(dhp / 2))

  // 3. Médias e funções de ponderação
  const Lbp = (L1 + L2) / 2
  const Cbp = (C1p + C2p) / 2

  let hbp: number
  if (chromaProduct === 0) hbp = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2
  else hbp = (h1p + h2p - 360) / 2

  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63))

  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2))
  const Cbp7 = Cbp ** 7
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7))
  const Lm50sq = (Lbp - 50) ** 2
  const SL = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq)
  const SC = 1 + 0.045 * Cbp
  const SH = 1 + 0.015 * Cbp * T
  const RT = -Math.sin(rad(2 * dTheta)) * RC

  const l = dLp / (kL * SL)
  const c = dCp / (kC * SC)
  const h = dHp / (kH * SH)
  return Math.sqrt(l * l + c * c + h * h + RT * c * h)
}

export type Perception = { label: string; level: 0 | 1 | 2 | 3 | 4 }

/** Interpretação aproximada de um ΔE00 para pessoas comuns. */
export function describeDeltaE(dE: number): Perception {
  if (dE < 1) return { label: 'Imperceptível', level: 0 }
  if (dE < 2) return { label: 'Só de muito perto', level: 1 }
  if (dE < 5) return { label: 'Bem próxima', level: 2 }
  if (dE < 10) return { label: 'Parecida', level: 3 }
  return { label: 'Diferente', level: 4 }
}
