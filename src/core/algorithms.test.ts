import { describe, expect, it } from 'vitest'
import { hexToLab, labToHex } from './color'
import { regionColor, sampleLab } from './image'
import { buildKDTree, kNearest, type Vec3 } from './kdtree'
import { kMeans, seededRandom } from './kmeans'
import { bruteForceClosest, createMatcher, indexCatalog, type CatalogColor } from './matcher'

const rand = seededRandom(123)
const randomHex = () =>
  '#' + Array.from({ length: 3 }, () => Math.floor(rand() * 256).toString(16).padStart(2, '0')).join('')

describe('kNearest', () => {
  it('coincide com a força bruta', () => {
    const points: Vec3[] = Array.from({ length: 2000 }, () => [rand() * 100, rand() * 100, rand() * 100])
    const tree = buildKDTree(points, (p) => p)
    for (let t = 0; t < 100; t++) {
      const q: Vec3 = [rand() * 100, rand() * 100, rand() * 100]
      const expected = points
        .map((p) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)
        .sort((a, b) => a - b)
        .slice(0, 7)
      expect(kNearest(tree, q, 7).map((n) => n.distSq)).toEqual(expected)
    }
  })

  it('lida com k maior que a árvore e árvore vazia', () => {
    expect(kNearest(buildKDTree([[0, 0, 0] as Vec3], (p) => p), [1, 1, 1], 5)).toHaveLength(1)
    expect(kNearest(buildKDTree([] as Vec3[], (p) => p), [1, 1, 1], 5)).toHaveLength(0)
  })
})

describe('createMatcher', () => {
  const catalog: CatalogColor[] = Array.from({ length: 1500 }, (_, i) => ({
    marca: 'Teste',
    codigo: String(i),
    nome: `Cor ${i}`,
    hex: randomHex(),
  }))
  const indexed = indexCatalog(catalog)
  // Alvos realistas: cores que uma foto consegue produzir (dentro do gamut sRGB)
  const targets = Array.from({ length: 1000 }, () => hexToLab(randomHex()))

  it('ordena por ΔE00 crescente e encontra a própria cor com ΔE 0', () => {
    const matches = createMatcher(catalog).findClosest(indexed[10].lab, 5)
    expect(matches[0].deltaE).toBeCloseTo(0, 6)
    for (let i = 1; i < matches.length; i++) expect(matches[i].deltaE).toBeGreaterThanOrEqual(matches[i - 1].deltaE)
  })

  it('modo k-d tree acerta o top 5 exato em pelo menos 99% dos casos', () => {
    const fast = createMatcher(catalog, { strategy: 'kdtree', candidates: 100 })
    let hits = 0
    for (const target of targets) {
      const a = fast.findClosest(target, 5).map((m) => m.color.codigo)
      const b = bruteForceClosest(indexed, target, 5).map((m) => m.color.codigo)
      if (a.join() === b.join()) hits++
    }
    expect(hits / targets.length).toBeGreaterThanOrEqual(0.99)
  })

  it('modo k-d tree sempre acerta a melhor cor quando ela é praticamente idêntica (ΔE < 2)', () => {
    const fast = createMatcher(catalog, { strategy: 'kdtree', candidates: 100 })
    for (const target of targets) {
      const [exact] = bruteForceClosest(indexed, target, 1)
      if (exact.deltaE < 2) expect(fast.findClosest(target, 1)[0].color.codigo).toBe(exact.color.codigo)
    }
  })
})

/** Imagem sintética: fundo de uma cor, com um "defeito" de outra cor. */
function fakeImage(w: number, h: number, base: number[], spot: number[], spotSize: number) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x < spotSize && y < spotSize ? spot : base
      data.set([...c, 255], (y * w + x) * 4)
    }
  return { data, width: w, height: h }
}

describe('regionColor', () => {
  it('mediana ignora um reflexo que ocupa parte da região', () => {
    // 30% da área é um reflexo branco; a média seria puxada, a mediana não
    const img = fakeImage(100, 100, [180, 90, 60], [255, 255, 255], 55)
    const region = regionColor(sampleLab(img))!
    expect(labToHex(region.lab)).toBe('#B45A3C')
  })

  it('respeita o retângulo selecionado', () => {
    const img = fakeImage(100, 100, [180, 90, 60], [20, 40, 200], 20)
    const region = regionColor(sampleLab(img, { x: 0, y: 0, w: 10, h: 10 }))!
    expect(labToHex(region.lab)).toBe('#1428C8')
    expect(region.spread).toBeCloseTo(0, 6)
  })

  it('retorna null para região vazia', () => {
    const img = fakeImage(10, 10, [0, 0, 0], [0, 0, 0], 0)
    expect(regionColor(sampleLab(img, { x: 50, y: 50, w: 5, h: 5 }))).toBeNull()
  })
})

describe('kMeans', () => {
  it('separa grupos bem definidos e ordena por tamanho', () => {
    const around = (c: { L: number; a: number; b: number }, n: number) =>
      Array.from({ length: n }, () => ({ L: c.L + rand() - 0.5, a: c.a + rand() - 0.5, b: c.b + rand() - 0.5 }))
    const points = [
      ...around({ L: 30, a: 40, b: 20 }, 600),
      ...around({ L: 80, a: -10, b: 60 }, 300),
      ...around({ L: 50, a: 0, b: -50 }, 100),
    ]
    const clusters = kMeans(points, 3)
    expect(clusters.map((c) => Math.round(c.weight * 10))).toEqual([6, 3, 1])
    expect(clusters[0].lab.L).toBeCloseTo(30, 0)
    expect(clusters[2].lab.b).toBeCloseTo(-50, 0)
  })

  it('não quebra com menos cores distintas que k', () => {
    const points = Array.from({ length: 50 }, () => ({ L: 10, a: 10, b: 10 }))
    expect(kMeans(points, 5)).toHaveLength(1)
  })
})
