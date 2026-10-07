/**
 * Prévia com várias paredes: cada camada tem seus toques, seu alcance e sua cor.
 *
 * A segmentação é a parte cara (BFS na grade inteira), então as máscaras ficam em cache por
 * toques + alcance: trocar a cor de uma parede ou mexer em outra camada não segmenta de novo.
 */
import type { PixelBuffer } from './image'
import { paintLayers, type PaintLayer } from './recolor'
import { coverage, segmentWall, type LabGrid, type Mask, type Seed } from './segment'

export type LayerSpec = { seeds: readonly Seed[]; tolerance: number; hex: string }

export type SceneResult = {
  pixels: PixelBuffer
  /** Fração da foto coberta por camada (0–1); null para camada ainda sem toque. */
  coverages: (number | null)[]
}

export type MaskCache = Map<string, Mask>

const maskKey = (seeds: readonly Seed[], tolerance: number) =>
  `${tolerance}|${seeds.map((s) => `${s.x},${s.y}`).join(';')}`

/** Máximo de máscaras guardadas: cada uma tem até 800×800 floats (~2,5 MB). */
const CACHE_LIMIT = 12

export function paintScene(
  img: PixelBuffer,
  grid: LabGrid,
  layers: readonly LayerSpec[],
  cache: MaskCache = new Map(),
): SceneResult {
  const painted: PaintLayer[] = []
  const coverages = layers.map(({ seeds, tolerance, hex }) => {
    if (seeds.length === 0) return null
    const key = maskKey(seeds, tolerance)
    let mask = cache.get(key)
    if (mask) {
      // Reinsere para o mapa ficar em ordem de uso (o mais antigo sai primeiro)
      cache.delete(key)
    } else {
      mask = segmentWall(grid, [...seeds], tolerance)
    }
    cache.set(key, mask)
    painted.push({ mask, hex })
    return coverage(mask)
  })
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)

  return { pixels: painted.length ? paintLayers(img, painted) : img, coverages }
}
