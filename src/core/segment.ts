/**
 * Segmentação da parede por crescimento de região (region growing) a partir de toques.
 *
 * 1. A foto é reduzida para uma grade de no máximo ~800 px de lado (média por bloco em RGB
 *    linear) e convertida para Lab, com um desfoque 3×3 que atenua ruído e textura.
 * 2. A partir de cada toque, uma busca em largura (BFS) aceita o vizinho quando:
 *    - ele é parecido com a cor de referência da parede, dando POUCO peso à luminosidade e
 *      normalizando a* e b* pela luminosidade (a mesma parede tem sombras e degradês de luz,
 *      mas mantém o tom); e
 *    - não há uma borda entre ele e o pixel atual (mudança brusca = rodapé, quadro, móvel).
 * 3. Um fechamento morfológico (dilatação + erosão) tapa buraquinhos de ruído, e um
 *    desfoque leve suaviza a borda da máscara para a repintura não ficar serrilhada.
 */
import { RGB_TO_XYZ, D65_WHITE } from './color'
import type { PixelBuffer } from './image'

export type LabGrid = {
  width: number
  height: number
  L: Float32Array
  A: Float32Array
  B: Float32Array
}

/** Máscara na resolução da grade; valores de 0 (fora) a 1 (parede). */
export type Mask = { width: number; height: number; data: Float32Array }

/** Ponto em frações da imagem (0–1), como a interface trabalha. */
export type Seed = { x: number; y: number }

/** Peso da diferença de luminosidade: baixo, para atravessar sombras da mesma parede. */
const L_WEIGHT = 0.35
/** Uma borda bloqueia o crescimento quando a mudança local passa desta fração da tolerância. */
const EDGE_RATIO = 0.55
const MIN_EDGE = 3

const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

const EPS = 216 / 24389
const KAPPA = 24389 / 27
const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

export function buildLabGrid(img: PixelBuffer, maxSide = 800): LabGrid {
  const step = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxSide))
  const width = Math.ceil(img.width / step)
  const height = Math.ceil(img.height / step)
  const n = width * height
  const L = new Float32Array(n)
  const A = new Float32Array(n)
  const B = new Float32Array(n)
  const m = RGB_TO_XYZ

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      const y1 = Math.min(img.height, (gy + 1) * step)
      const x1 = Math.min(img.width, (gx + 1) * step)
      for (let y = gy * step; y < y1; y++) {
        for (let x = gx * step; x < x1; x++) {
          const i = (y * img.width + x) * 4
          r += TO_LINEAR[img.data[i]]
          g += TO_LINEAR[img.data[i + 1]]
          b += TO_LINEAR[img.data[i + 2]]
          count++
        }
      }
      r /= count
      g /= count
      b /= count
      const fx = f((m[0] * r + m[1] * g + m[2] * b) / D65_WHITE[0])
      const fy = f(m[3] * r + m[4] * g + m[5] * b)
      const fz = f((m[6] * r + m[7] * g + m[8] * b) / D65_WHITE[2])
      const k = gy * width + gx
      L[k] = 116 * fy - 16
      A[k] = 500 * (fx - fy)
      B[k] = 200 * (fy - fz)
    }
  }
  return { width, height, L: blur3(L, width, height), A: blur3(A, width, height), B: blur3(B, width, height) }
}

/** Desfoque de caixa 3×3 (bordas usam só os vizinhos que existem). */
function blur3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          sum += src[yy * w + xx]
          n++
        }
      }
      out[y * w + x] = sum / n
    }
  }
  return out
}

function median(values: number[]): number {
  const s = values.sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** Cresce uma região a partir de (sx, sy) na grade. Retorna 1 para pixels da região. */
export function growRegion(grid: LabGrid, sx: number, sy: number, tolerance: number): Uint8Array {
  const { width: w, height: h, L, A, B } = grid
  const region = new Uint8Array(w * h)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return region

  // Cor de referência: mediana de uma janela 5×5 em volta do toque (robusta a um pixel ruim)
  const ls: number[] = []
  const as: number[] = []
  const bs: number[] = []
  for (let y = Math.max(0, sy - 2); y <= Math.min(h - 1, sy + 2); y++) {
    for (let x = Math.max(0, sx - 2); x <= Math.min(w - 1, sx + 2); x++) {
      const k = y * w + x
      ls.push(L[k])
      as.push(A[k])
      bs.push(B[k])
    }
  }
  const rL = median(ls)
  const rA = median(as)
  const rB = median(bs)

  const tol2 = tolerance * tolerance
  const edge = Math.max(MIN_EDGE, tolerance * EDGE_RATIO)
  const edge2 = edge * edge

  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const start = sy * w + sx
  region[start] = 1
  queue[tail++] = start

  const tryVisit = (from: number, to: number) => {
    if (region[to]) return
    const dl = (L[to] - rL) * L_WEIGHT
    // Invariância a sombras: escurecer uma cor multiplica a*, b* e (L*+16) pelo mesmo fator
    // (fora da faixa quase preta), então reescalar a*, b* para a luminosidade de referência
    // faz a mesma tinta, mais ou menos iluminada, ter o mesmo "tom".
    const scale = (rL + 16) / (L[to] + 16)
    const da = A[to] * scale - rA
    const db = B[to] * scale - rB
    if (dl * dl + da * da + db * db > tol2) return
    const el = L[to] - L[from]
    const ea = A[to] - A[from]
    const eb = B[to] - B[from]
    if (el * el + ea * ea + eb * eb > edge2) return
    region[to] = 1
    queue[tail++] = to
  }

  while (head < tail) {
    const k = queue[head++]
    const x = k % w
    if (x > 0) tryVisit(k, k - 1)
    if (x < w - 1) tryVisit(k, k + 1)
    if (k >= w) tryVisit(k, k - w)
    if (k < w * (h - 1)) tryVisit(k, k + w)
  }
  return region
}

/** Dilatação (grow = true) ou erosão 3×3 de uma máscara binária. */
function morph(src: Uint8Array, w: number, h: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = !grow
      for (let dy = -1; dy <= 1 && hit !== grow; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx))
          if (grow ? src[yy * w + xx] : !src[yy * w + xx]) {
            hit = grow
            break
          }
        }
      }
      out[y * w + x] = hit ? 1 : 0
    }
  }
  return out
}

/** Fechamento morfológico: tapa buracos de até ~2 células sem engordar a região. */
export function closeMask(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  let m = mask
  for (let i = 0; i < radius; i++) m = morph(m, w, h, true)
  for (let i = 0; i < radius; i++) m = morph(m, w, h, false)
  return m
}

/** União das regiões de todos os toques, limpa e com borda suave. */
export function segmentWall(grid: LabGrid, seeds: Seed[], tolerance: number): Mask {
  const { width: w, height: h } = grid
  let union: Uint8Array = new Uint8Array(w * h)
  for (const s of seeds) {
    const gx = Math.min(w - 1, Math.max(0, Math.floor(s.x * w)))
    const gy = Math.min(h - 1, Math.max(0, Math.floor(s.y * h)))
    if (union[gy * w + gx]) continue // toque dentro de uma região já pintada
    const region = growRegion(grid, gx, gy, tolerance)
    for (let k = 0; k < union.length; k++) union[k] |= region[k]
  }
  union = closeMask(union, w, h, 2)
  const soft = new Float32Array(union.length)
  for (let k = 0; k < union.length; k++) soft[k] = union[k]
  return { width: w, height: h, data: blur3(soft, w, h) }
}

/** Fração da imagem coberta pela máscara (para a interface). */
export function coverage(mask: Mask): number {
  let sum = 0
  for (const v of mask.data) sum += v
  return sum / mask.data.length
}
