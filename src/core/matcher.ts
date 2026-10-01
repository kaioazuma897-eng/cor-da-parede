import { hexToLab, type Lab } from './color'
import { deltaE2000 } from './deltaE'
import { buildKDTree, kNearest } from './kdtree'

export type CatalogColor = {
  marca: string
  codigo: string
  nome: string
  hex: string
}

export type IndexedColor = CatalogColor & { lab: Lab }
export type Match = { color: IndexedColor; deltaE: number }

export type Matcher = {
  size: number
  findClosest: (target: Lab, n?: number) => Match[]
}

export type MatcherOptions =
  /** Compara com todas as cores. Exato; ~1 ms para 2 000 cores. */
  | { strategy: 'exact' }
  /**
   * k-d tree em Lab traz os `candidates` vizinhos por ΔE76 e eles são reordenados por ΔE00.
   * ΔE00 não é uma métrica (viola a desigualdade triangular), então não dá para indexar
   * direto com ele, e o resultado é aproximado: com 100 candidatos, ~99,7% dos top 5
   * coincidem com a busca exata. Útil para consultas em massa (ex.: prévia ao vivo).
   */
  | { strategy: 'kdtree'; candidates?: number }

export function indexCatalog(catalog: readonly CatalogColor[]): IndexedColor[] {
  return catalog.map((c) => ({ ...c, lab: hexToLab(c.hex) }))
}

const byDeltaE = (x: Match, y: Match) => x.deltaE - y.deltaE

/** Busca exata O(n). */
export function bruteForceClosest(catalog: readonly IndexedColor[], target: Lab, n = 5): Match[] {
  return catalog
    .map((color) => ({ color, deltaE: deltaE2000(target, color.lab) }))
    .sort(byDeltaE)
    .slice(0, n)
}

export function createMatcher(
  catalog: readonly CatalogColor[],
  options: MatcherOptions = { strategy: 'exact' },
): Matcher {
  const indexed = indexCatalog(catalog)

  if (options.strategy === 'exact') {
    return { size: indexed.length, findClosest: (target, n = 5) => bruteForceClosest(indexed, target, n) }
  }

  const tree = buildKDTree(indexed, (c) => [c.lab.L, c.lab.a, c.lab.b])
  const candidates = options.candidates ?? 100
  return {
    size: indexed.length,
    findClosest(target, n = 5) {
      return kNearest(tree, [target.L, target.a, target.b], Math.max(n, candidates))
        .map(({ item }) => ({ color: item, deltaE: deltaE2000(target, item.lab) }))
        .sort(byDeltaE)
        .slice(0, n)
    },
  }
}
