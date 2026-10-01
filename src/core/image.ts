import { rgbToLab, type Lab } from './color'
import { deltaE76 } from './deltaE'

/** Subconjunto estrutural de ImageData, para o core não depender do DOM. */
export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number }
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Lê os pixels de uma região e converte para Lab.
 * Regiões grandes são amostradas em grade para limitar o custo (~maxSamples pixels).
 * Pixels transparentes são ignorados.
 */
export function sampleLab(img: PixelBuffer, rect?: Rect, maxSamples = 20_000): Lab[] {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0))
  const y0 = Math.max(0, Math.floor(rect?.y ?? 0))
  const x1 = Math.min(img.width, Math.ceil(rect ? rect.x + rect.w : img.width))
  const y1 = Math.min(img.height, Math.ceil(rect ? rect.y + rect.h : img.height))
  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const step = Math.max(1, Math.round(Math.sqrt(area / maxSamples)))

  const out: Lab[] = []
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * 4
      if (img.data[i + 3] < 128) continue
      out.push(rgbToLab({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] }))
    }
  }
  return out
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type RegionColor = {
  lab: Lab
  /** Mediana da distância (ΔE76) de cada pixel à cor final: quanto menor, mais uniforme a região. */
  spread: number
  samples: number
}

/**
 * Cor representativa de uma região: mediana por canal em Lab.
 * Diferente da média, a mediana ignora sombras, reflexos e pequenos objetos
 * que caem dentro da seleção.
 */
export function regionColor(pixels: Lab[]): RegionColor | null {
  if (pixels.length === 0) return null
  const lab = {
    L: median(pixels.map((p) => p.L)),
    a: median(pixels.map((p) => p.a)),
    b: median(pixels.map((p) => p.b)),
  }
  const spread = median(pixels.map((p) => deltaE76(p, lab)))
  return { lab, spread, samples: pixels.length }
}
