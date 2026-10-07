/**
 * Harmonias de cor a partir de uma tinta: gira o matiz no espaço LCh (derivado do Lab, então
 * "girar 180°" dá a complementar percebida, e não a do círculo RGB) e busca a tinta real mais
 * próxima no catálogo para cada cor ideal. Toda sugestão é uma tinta que dá para comprar.
 */
import type { Lab } from './color'
import type { CatalogColor, IndexedColor, Matcher } from './matcher'

export type Lch = { L: number; C: number; h: number }

export const labToLch = ({ L, a, b }: Lab): Lch => ({
  L,
  C: Math.hypot(a, b),
  h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
})

export const lchToLab = ({ L, C, h }: Lch): Lab => {
  const rad = (h * Math.PI) / 180
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) }
}

/** Abaixo deste croma a cor é neutra (branco, cinza, bege bem claro): o matiz não diz nada. */
export const NEUTRAL_CHROMA = 8
/** Passo de luminosidade do "tom sobre tom". */
const TONE_STEP = 14
/**
 * Tinta mais longe que isso da cor ideal não representa a harmonia (catálogo sem cor por ali):
 * melhor não sugerir do que sugerir uma cor que não combina.
 */
export const MAX_DELTA = 18
/**
 * Se o catálogo não tem a cor ideal tão saturada (comum em complementares de cores vivas: tinta de
 * parede raramente é tão intensa), tenta a mesma cor mais suave antes de desistir.
 */
const SOFTEN = [1, 0.75, 0.5]
/** Quantos vizinhos olhar no catálogo para achar um que ainda não foi sugerido. */
const CANDIDATES = 8

export type HarmonyKind = 'complementar' | 'analogas' | 'triade' | 'tom-sobre-tom'

export type Suggestion = {
  color: IndexedColor
  /** Distância (ΔE00) entre a cor ideal da harmonia e a tinta sugerida. */
  deltaE: number
}

export type Harmony = { kind: HarmonyKind; label: string; hint: string; suggestions: Suggestion[] }

type Rule = { kind: HarmonyKind; label: string; hint: string; targets: (c: Lch) => Lch[] }

const rotate = (c: Lch, deg: number): Lch => ({ ...c, h: (c.h + deg + 360) % 360 })

const clampL = (L: number) => Math.min(96, Math.max(8, L))

const RULES: Rule[] = [
  {
    kind: 'tom-sobre-tom',
    label: 'Tom sobre tom',
    hint: 'Mesma cor, mais clara e mais escura: parede de destaque sem errar.',
    targets: (c) => [
      { ...c, L: clampL(c.L + TONE_STEP) },
      { ...c, L: clampL(c.L - TONE_STEP) },
    ],
  },
  {
    kind: 'analogas',
    label: 'Análogas',
    hint: 'Vizinhas no círculo de cores: combinação calma e harmoniosa.',
    targets: (c) => [rotate(c, -30), rotate(c, 30)],
  },
  {
    kind: 'complementar',
    label: 'Complementar',
    hint: 'O oposto no círculo: contraste forte, bom para detalhes e portas.',
    targets: (c) => [rotate(c, 180)],
  },
  {
    kind: 'triade',
    label: 'Tríade',
    hint: 'Três cores equidistantes: alegre e vibrante.',
    targets: (c) => [rotate(c, 120), rotate(c, -120)],
  },
]

/**
 * Sugestões de harmonia para `base`, todas tiradas do catálogo do `matcher`. Uma mesma tinta
 * nunca aparece duas vezes nem repete a base. Para cores neutras só faz sentido "tom sobre tom".
 * Harmonias sem nenhuma tinta próxima o bastante no catálogo (nem numa versão mais suave) ficam de fora.
 */
export function harmonies(base: CatalogColor & { lab: Lab }, matcher: Matcher): Harmony[] {
  const lch = labToLch(base.lab)
  const neutral = lch.C < NEUTRAL_CHROMA
  const used = new Set([base.codigo])

  return RULES.filter((r) => !neutral || r.kind === 'tom-sobre-tom')
    .map(({ kind, label, hint, targets }) => {
      const suggestions: Suggestion[] = []
      for (const target of targets(lch)) {
        let pick: Suggestion | undefined
        for (const k of SOFTEN) {
          pick = matcher
            .findClosest(lchToLab({ ...target, C: target.C * k }), CANDIDATES)
            .find((m) => m.deltaE <= MAX_DELTA && !used.has(m.color.codigo))
          if (pick) break
        }
        if (!pick) continue
        used.add(pick.color.codigo)
        suggestions.push(pick)
      }
      return { kind, label, hint, suggestions }
    })
    .filter((h) => h.suggestions.length > 0)
}
