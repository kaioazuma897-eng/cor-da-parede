import { hexToLab } from './color'
import type { CatalogColor } from './matcher'

/** Abaixo deste croma a cor é tratada como neutra (branco, cinza, preto) e vem antes das demais. */
const NEUTRAL_CHROMA = 8
/** Largura das faixas de matiz, em graus: dentro de cada faixa as cores vão da mais clara à mais escura. */
const HUE_BAND = 30

/** Minúsculas e sem acento: "Camurça" é encontrada por "camurca". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Ordena o catálogo como num mostruário: neutros primeiro (do claro ao escuro) e depois por faixa
 * de matiz em LCh, do claro ao escuro dentro de cada faixa. Não altera o array recebido.
 */
export function sortByHue<T extends CatalogColor>(colors: readonly T[]): T[] {
  const keyed = colors.map((color) => {
    const { L, a, b } = hexToLab(color.hex)
    const chroma = Math.hypot(a, b)
    const hue = (Math.atan2(b, a) * 180) / Math.PI
    // A faixa 0 começa nos vermelhos (≈ 0°) para que vermelho e rosa não fiquem em pontas opostas
    const band = chroma < NEUTRAL_CHROMA ? -1 : Math.floor(((hue + 360 + HUE_BAND / 2) % 360) / HUE_BAND)
    return { color, band, L }
  })
  return keyed.sort((x, y) => x.band - y.band || y.L - x.L).map((k) => k.color)
}

/**
 * Filtra por nome ou código. Cada palavra da busca precisa aparecer em algum lugar
 * ("azul 03" acha "Azul Sereno · EX-030"). Busca vazia devolve tudo.
 */
export function searchColors<T extends CatalogColor>(colors: readonly T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...colors]
  return colors.filter((c) => {
    const text = normalize(`${c.nome} ${c.codigo}`)
    return words.every((w) => text.includes(w))
  })
}
