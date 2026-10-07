import { describe, expect, it } from 'vitest'
import exemplo from '../data/catalogo-exemplo.json'
import { hexToLab } from './color'
import { deltaE2000 } from './deltaE'
import { MAX_DELTA, harmonies, labToLch, lchToLab } from './harmony'
import { createMatcher, indexCatalog } from './matcher'

const matcher = createMatcher(exemplo)
const catalogo = indexCatalog(exemplo)
const cor = (nome: string) => catalogo.find((c) => c.nome === nome)!

describe('LCh', () => {
  it('ida e volta preserva o Lab', () => {
    const lab = hexToLab('#B8603E')
    const back = lchToLab(labToLch(lab))
    expect(back.L).toBeCloseTo(lab.L, 6)
    expect(back.a).toBeCloseTo(lab.a, 6)
    expect(back.b).toBeCloseTo(lab.b, 6)
  })

  it('matiz sempre entre 0 e 360', () => {
    const { h } = labToLch({ L: 50, a: 10, b: -10 })
    expect(h).toBeCloseTo(315, 6)
  })
})

describe('harmonies', () => {
  const terracota = cor('Terracota')
  const resultado = harmonies(terracota, matcher)
  const todas = resultado.flatMap((h) => h.suggestions)

  it('nunca sugere a própria cor nem repete tinta', () => {
    const codigos = todas.map((s) => s.color.codigo)
    expect(codigos).not.toContain(terracota.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('toda sugestão está perto da cor ideal', () => {
    for (const s of todas) expect(s.deltaE).toBeLessThanOrEqual(MAX_DELTA)
  })

  it('a complementar de um tom quente é fria (matiz do outro lado do círculo)', () => {
    const comp = resultado.find((h) => h.kind === 'complementar')!.suggestions[0]
    const diff = Math.abs(labToLch(comp.color.lab).h - labToLch(terracota.lab).h)
    expect(Math.min(diff, 360 - diff)).toBeGreaterThan(120)
  })

  it('tom sobre tom mantém a família e muda a luminosidade', () => {
    const tons = resultado.find((h) => h.kind === 'tom-sobre-tom')!.suggestions
    const base = labToLch(terracota.lab)
    for (const { color } of tons) {
      const c = labToLch(color.lab)
      const diff = Math.abs(c.h - base.h)
      expect(Math.min(diff, 360 - diff)).toBeLessThan(30)
      expect(Math.abs(c.L - base.L)).toBeGreaterThan(4)
    }
  })

  it('cor neutra só recebe tom sobre tom', () => {
    const kinds = harmonies(cor('Cinza Concreto'), matcher).map((h) => h.kind)
    expect(kinds).toEqual(['tom-sobre-tom'])
  })

  it('catálogo sem cores por perto: a harmonia fica de fora em vez de sugerir qualquer coisa', () => {
    const soQuentes = createMatcher(exemplo.filter((c) => ['Terracota', 'Tijolo', 'Coral', 'Damasco'].includes(c.nome)))
    const r = harmonies(terracota, soQuentes)
    expect(r.find((h) => h.kind === 'complementar')).toBeUndefined()
    for (const s of r.flatMap((h) => h.suggestions)) {
      expect(deltaE2000(s.color.lab, terracota.lab)).toBeGreaterThan(0)
    }
  })
})
