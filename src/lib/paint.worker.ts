/// <reference lib="webworker" />
/**
 * Segmentação e repintura fora da thread principal: a tela continua respondendo
 * (controle de alcance, rolagem) enquanto fotos grandes são processadas.
 */
import type { PixelBuffer } from '../core/image'
import { paintScene, type LayerSpec, type MaskCache } from '../core/scene'
import { buildLabGrid, type LabGrid } from '../core/segment'

export type PainterRequest =
  | { type: 'photo'; photo: PixelBuffer }
  | { type: 'paint'; id: number; layers: LayerSpec[] }

export type PainterResponse =
  | { type: 'painted'; id: number; pixels: PixelBuffer; coverages: (number | null)[] }
  | { type: 'error'; id: number; message: string }

declare const self: DedicatedWorkerGlobalScope

let photo: PixelBuffer | null = null
let grid: LabGrid | null = null
let cache: MaskCache = new Map()

self.onmessage = ({ data: msg }: MessageEvent<PainterRequest>) => {
  if (msg.type === 'photo') {
    photo = msg.photo
    grid = null // calculada no primeiro pedido de pintura
    cache = new Map()
    return
  }
  try {
    if (!photo) throw new Error('Nenhuma foto carregada')
    grid ??= buildLabGrid(photo)
    const { pixels, coverages } = paintScene(photo, grid, msg.layers, cache)
    // A própria foto volta só quando nada foi pintado: copia para não transferir o original
    const data = pixels === photo ? new Uint8ClampedArray(photo.data) : pixels.data
    const response: PainterResponse = {
      type: 'painted',
      id: msg.id,
      pixels: { data, width: pixels.width, height: pixels.height },
      coverages,
    }
    self.postMessage(response, [data.buffer])
  } catch (e) {
    self.postMessage({ type: 'error', id: msg.id, message: String(e) } satisfies PainterResponse)
  }
}
