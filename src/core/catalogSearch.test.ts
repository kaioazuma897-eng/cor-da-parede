import { describe, expect, it } from 'vitest'
import { normalize, searchColors, sortByHue } from './catalogSearch'
import type { CatalogColor } from './matcher'

const cor = (codigo: string, nome: string, hex: string): CatalogColor => ({ marca: 'Teste', codigo, nome, hex })

const catalogo = [
  cor('T-01', 'Azul Sereno', '#6F95B5'),
  cor('T-02', 'Camurça', '#C9AF88'),
  cor('T-03', 'Branco Neve', '#F7F6F2'),
  cor('T-04', 'Grafite', '#55585A'),
  cor('T-05', 'Azul Petróleo', '#1F4E5F'),
  cor('T-06', 'Terracota', '#B8603E'),
  cor('T-07', 'Rosa Quartzo', '#EBC9C5'),
]

describe('normalize', () => {
  it('remove acentos e caixa', () => {
    expect(normalize('  Camurça PETRÓLEO ')).toBe('camurca petroleo')
  })
})

describe('searchColors', () => {
  it('busca vazia devolve tudo, em uma cópia', () => {
    const r = searchColors(catalogo, '   ')
    expect(r).toEqual(catalogo)
    expect(r).not.toBe(catalogo)
  })

  it('ignora acentos', () => {
    expect(searchColors(catalogo, 'camurca').map((c) => c.codigo)).toEqual(['T-02'])
    expect(searchColors(catalogo, 'petroleo').map((c) => c.codigo)).toEqual(['T-05'])
  })

  it('acha pelo código', () => {
    expect(searchColors(catalogo, 't-04').map((c) => c.nome)).toEqual(['Grafite'])
  })

  it('exige todas as palavras, em qualquer campo', () => {
    expect(searchColors(catalogo, 'azul').length).toBe(2)
    expect(searchColors(catalogo, 'azul 05').map((c) => c.nome)).toEqual(['Azul Petróleo'])
    expect(searchColors(catalogo, 'azul verde')).toEqual([])
  })
})

describe('sortByHue', () => {
  const ordem = sortByHue(catalogo).map((c) => c.nome)

  it('neutros primeiro, do claro ao escuro', () => {
    expect(ordem.slice(0, 2)).toEqual(['Branco Neve', 'Grafite'])
  })

  it('agrupa por matiz: rosa e terracota juntos, azuis juntos', () => {
    const azuis = [ordem.indexOf('Azul Sereno'), ordem.indexOf('Azul Petróleo')]
    expect(Math.abs(azuis[0] - azuis[1])).toBe(1)
    expect(ordem.indexOf('Terracota')).toBeLessThan(ordem.indexOf('Camurça'))
  })

  it('dentro da mesma faixa, do claro ao escuro', () => {
    const azuis = sortByHue([cor('A', 'Marinho', '#1E3A5F'), cor('B', 'Céu', '#A9C4DA')]).map((c) => c.nome)
    expect(azuis).toEqual(['Céu', 'Marinho'])
  })

  it('não altera o array original', () => {
    const copia = [...catalogo]
    sortByHue(catalogo)
    expect(catalogo).toEqual(copia)
  })
})
