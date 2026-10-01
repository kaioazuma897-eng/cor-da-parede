import { linearToSrgb, srgbToLinear } from '../core/color'
import type { PixelBuffer } from '../core/image'

/** Maior lado da imagem usada na análise. Fotos de celular (12 MP+) são reduzidas. */
const MAX_SIDE = 1600

/**
 * Decodifica a foto e extrai os pixels.
 * `createImageBitmap` já aplica a orientação EXIF, então fotos em retrato do celular
 * não chegam deitadas.
 */
export async function loadPhoto(blob: Blob): Promise<PixelBuffer> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponível')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return ctx.getImageData(0, 0, width, height)
}

/**
 * Foto de demonstração gerada por código: parede terracota (#B8603E) com uma folha A4
 * colada, um quadro, rodapé e um reflexo de luminária, tudo sob luz de lâmpada
 * amarelada. Sem calibrar, a cor da parede sai errada; calibrando pela folha, volta.
 */
export function demoPhoto(): PixelBuffer {
  const w = 1200
  const h = 900
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  ctx.fillStyle = '#B8603E'
  ctx.fillRect(0, 0, w, h)

  // Rodapé
  ctx.fillStyle = '#EFE9E1'
  ctx.fillRect(0, h - 90, w, 90)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, h - 92, w, 4)

  // Quadro
  ctx.fillStyle = '#2B2A28'
  ctx.fillRect(140, 200, 260, 330)
  ctx.fillStyle = '#7E9BB5'
  ctx.fillRect(160, 220, 220, 290)
  ctx.fillStyle = '#F4E1A1'
  ctx.beginPath()
  ctx.arc(270, 330, 55, 0, Math.PI * 2)
  ctx.fill()

  // Folha A4 (proporção 1:√2) levemente torta, com sombra
  ctx.save()
  ctx.translate(930, 520)
  ctx.rotate(0.06)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(-82, -112, 170, 240)
  ctx.fillStyle = '#F1F1F1'
  ctx.fillRect(-85, -120, 170, 240)
  ctx.restore()

  // A luz é uniforme de propósito: com luz desigual, a folha e a parede recebem
  // iluminações diferentes e a calibração deixa de ser exata (limitação real do método).

  // Reflexo da luminária
  const spot = ctx.createRadialGradient(w * 0.55, h * 0.18, 0, w * 0.55, h * 0.18, 220)
  spot.addColorStop(0, 'rgba(255, 255, 255, 0.75)')
  spot.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, w, h)

  // Luz de lâmpada incandescente: cada canal multiplicado em RGB linear, mais ruído de sensor
  const LIGHT = [0.92, 0.7, 0.42]
  const img = ctx.getImageData(0, 0, w, h)
  let seed = 7
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const noise = ((seed >>> 24) - 128) / 64
    for (let k = 0; k < 3; k++) {
      img.data[i + k] = linearToSrgb(srgbToLinear(img.data[i + k]) * LIGHT[k]) + noise
    }
  }
  return img
}
