import { describe, expect, it } from 'vitest'
import { CATALOGS } from './catalogs'

// Valida todos os catálogos, inclusive os *.local.json presentes na sua máquina
describe.each(CATALOGS.map((c) => [c.label, c.colors] as const))('catálogo %s', (_, catalog) => {
  it('não está vazio', () => {
    expect(catalog.length).toBeGreaterThan(0)
  })

  it('todas as cores têm marca, código, nome e hex válido', () => {
    for (const c of catalog) {
      expect(c.marca, JSON.stringify(c)).toBeTruthy()
      expect(c.codigo, JSON.stringify(c)).toBeTruthy()
      expect(c.nome, JSON.stringify(c)).toBeTruthy()
      expect(c.hex, JSON.stringify(c)).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('não tem códigos repetidos', () => {
    const seen = new Set<string>()
    const dup = catalog.filter((c) => seen.size === seen.add(`${c.marca}/${c.codigo}`).size)
    expect(dup).toEqual([])
  })
})
