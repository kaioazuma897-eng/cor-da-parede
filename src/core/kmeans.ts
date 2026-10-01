import type { Lab } from './color'

export type Cluster = { lab: Lab; weight: number }

/** PRNG determinístico (mulberry32): mesma foto → mesma paleta. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const sq = (p: Lab, q: Lab) => (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2

/**
 * k-means em Lab com inicialização k-means++.
 * Lab é (aproximadamente) perceptualmente uniforme, então os grupos
 * correspondem melhor a "cores que a gente vê" do que em RGB.
 * Retorna os grupos do maior para o menor; `weight` é a fração de pixels.
 */
export function kMeans(points: Lab[], k: number, { maxIter = 25, seed = 42 } = {}): Cluster[] {
  if (points.length === 0 || k <= 0) return []
  const rand = seededRandom(seed)
  k = Math.min(k, points.length)

  // k-means++: cada novo centro é sorteado com probabilidade ∝ distância² ao centro mais próximo
  const centers: Lab[] = [points[Math.floor(rand() * points.length)]]
  const nearestSq = points.map((p) => sq(p, centers[0]))
  while (centers.length < k) {
    const total = nearestSq.reduce((s, d) => s + d, 0)
    if (total === 0) break // menos cores distintas do que k
    let r = rand() * total
    let idx = 0
    while (idx < points.length - 1 && (r -= nearestSq[idx]) > 0) idx++
    const c = points[idx]
    centers.push(c)
    for (let i = 0; i < points.length; i++) nearestSq[i] = Math.min(nearestSq[i], sq(points[i], c))
  }

  const assign = new Int32Array(points.length).fill(-1)
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = sq(points[i], centers[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        changed = true
      }
    }
    if (!changed) break

    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]]
      s.L += points[i].L
      s.a += points[i].a
      s.b += points[i].b
      s.n++
    }
    sums.forEach((s, c) => {
      if (s.n > 0) centers[c] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n }
    })
  }

  const counts = new Array(centers.length).fill(0)
  for (const a of assign) counts[a]++
  return centers
    .map((lab, c) => ({ lab, weight: counts[c] / points.length }))
    .filter((c) => c.weight > 0)
    .sort((x, y) => y.weight - x.weight)
}
