/**
 * "Pinta" a região da máscara com uma cor nova, preservando sombras e textura.
 *
 * Modelo físico simples: cada pixel da parede = refletância da tinta × luz que chega ali.
 * A razão entre a luminância do pixel e a luminância típica da parede (mediana) estima a
 * luz local: 1 na área bem iluminada, 0,5 numa sombra, >1 num reflexo. A cor nova é a
 * tinta escolhida (em RGB linear) multiplicada por essa mesma razão.
 */
import { hexToRgb, linearToSrgb, srgbToLinear } from './color'
import type { PixelBuffer } from './image'
import type { Mask } from './segment'

const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i))
const STEPS = 16384
const TO_SRGB = Uint8ClampedArray.from({ length: STEPS + 1 }, (_, i) => Math.round(linearToSrgb(i / STEPS)))
const encode = (v: number) => TO_SRGB[v <= 0 ? 0 : v >= 1 ? STEPS : Math.round(v * STEPS)]

/** Luminância relativa (Y) de um pixel em RGB linear. */
const luminance = (r: number, g: number, b: number) => 0.2126729 * r + 0.7151522 * g + 0.072175 * b

/** Valor da máscara na posição do pixel (interpolação bilinear da grade). */
function maskSampler(mask: Mask, imgWidth: number, imgHeight: number) {
  const sx = mask.width / imgWidth
  const sy = mask.height / imgHeight
  const { width: w, height: h, data } = mask
  return (x: number, y: number) => {
    const gx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5))
    const gy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const x1 = Math.min(w - 1, x0 + 1)
    const y1 = Math.min(h - 1, y0 + 1)
    const fx = gx - x0
    const fy = gy - y0
    const top = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx
    const bottom = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx
    return top * (1 - fy) + bottom * fy
  }
}

/** Luminância típica da parede: mediana dentro da máscara (ignora reflexos e sombras fortes). */
export function referenceLuminance(img: PixelBuffer, mask: Mask, maxSamples = 20_000): number {
  const sample = maskSampler(mask, img.width, img.height)
  const step = Math.max(1, Math.round(Math.sqrt((img.width * img.height) / maxSamples)))
  const ys: number[] = []
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      if (sample(x, y) < 0.5) continue
      const i = (y * img.width + x) * 4
      ys.push(luminance(TO_LINEAR[img.data[i]], TO_LINEAR[img.data[i + 1]], TO_LINEAR[img.data[i + 2]]))
    }
  }
  if (ys.length === 0) return 0
  ys.sort((a, b) => a - b)
  return ys[ys.length >> 1]
}

export type PaintLayer = { mask: Mask; hex: string }

/**
 * Pinta várias regiões, cada uma com sua cor. A luz local é sempre estimada na foto original,
 * então uma camada não interfere no sombreamento da outra. Onde as máscaras se sobrepõem,
 * a camada posterior fica por cima.
 */
export function paintLayers(img: PixelBuffer, layers: readonly PaintLayer[]): PixelBuffer {
  const out = new Uint8ClampedArray(img.data)
  for (const { mask, hex } of layers) {
    const yRef = referenceLuminance(img, mask)
    if (yRef <= 0) continue

    const { r, g, b } = hexToRgb(hex)
    const tr = TO_LINEAR[r]
    const tg = TO_LINEAR[g]
    const tb = TO_LINEAR[b]
    const sample = maskSampler(mask, img.width, img.height)

    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const m = sample(x, y)
        if (m <= 0.001) continue
        const i = (y * img.width + x) * 4
        const light = luminance(TO_LINEAR[img.data[i]], TO_LINEAR[img.data[i + 1]], TO_LINEAR[img.data[i + 2]]) / yRef
        // Mistura na borda suave da máscara, sobre o que já foi pintado
        out[i] = out[i] * (1 - m) + encode(tr * light) * m
        out[i + 1] = out[i + 1] * (1 - m) + encode(tg * light) * m
        out[i + 2] = out[i + 2] * (1 - m) + encode(tb * light) * m
      }
    }
  }
  return { data: out, width: img.width, height: img.height }
}

export function paintRegion(img: PixelBuffer, mask: Mask, targetHex: string): PixelBuffer {
  return paintLayers(img, [{ mask, hex: targetHex }])
}
