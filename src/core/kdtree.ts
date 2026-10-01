/**
 * k-d tree 3D para busca dos k vizinhos mais próximos (distância euclidiana).
 * Construção O(n log² n) com corte na mediana; consulta ~O(log n) em média.
 */

export type Vec3 = readonly [number, number, number]

type KDNode<T> = {
  point: Vec3
  item: T
  axis: 0 | 1 | 2
  left: KDNode<T> | null
  right: KDNode<T> | null
}

export type KDTree<T> = { root: KDNode<T> | null; size: number }
export type Neighbor<T> = { item: T; distSq: number }

export function buildKDTree<T>(items: readonly T[], getPoint: (item: T) => Vec3): KDTree<T> {
  const entries = items.map((item) => ({ item, point: getPoint(item) }))

  function build(list: typeof entries, depth: number): KDNode<T> | null {
    if (list.length === 0) return null
    const axis = (depth % 3) as 0 | 1 | 2
    list.sort((p, q) => p.point[axis] - q.point[axis])
    const mid = list.length >> 1
    return {
      ...list[mid],
      axis,
      left: build(list.slice(0, mid), depth + 1),
      right: build(list.slice(mid + 1), depth + 1),
    }
  }

  return { root: build(entries, 0), size: entries.length }
}

function distSq(p: Vec3, q: Vec3): number {
  const dx = p[0] - q[0]
  const dy = p[1] - q[1]
  const dz = p[2] - q[2]
  return dx * dx + dy * dy + dz * dz
}

/** Retorna os k pontos mais próximos de `query`, do mais perto para o mais longe. */
export function kNearest<T>(tree: KDTree<T>, query: Vec3, k: number): Neighbor<T>[] {
  // `best` fica ordenada de forma crescente; k é pequeno, inserção linear basta
  const best: Neighbor<T>[] = []
  if (k <= 0) return best

  const consider = (node: KDNode<T>) => {
    const d = distSq(query, node.point)
    if (best.length === k && d >= best[k - 1].distSq) return
    let i = best.length
    while (i > 0 && best[i - 1].distSq > d) i--
    best.splice(i, 0, { item: node.item, distSq: d })
    if (best.length > k) best.pop()
  }

  const search = (node: KDNode<T> | null) => {
    if (!node) return
    consider(node)
    const diff = query[node.axis] - node.point[node.axis]
    const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left]
    search(near)
    // Só visita o outro lado se a hiperesfera de busca cruzar o plano de corte
    if (best.length < k || diff * diff < best[best.length - 1].distSq) search(far)
  }

  search(tree.root)
  return best
}
