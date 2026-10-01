import { describe, expect, it } from 'vitest'
import { AseError, aseColorToHex, aseToCatalog, dedupeByCode, parseAse, splitCodeAndName } from './ase'

// ---------- codificador mínimo, só para os testes ----------

type Block =
  | { group: string }
  | { endGroup: true }
  | { name: string; model: 'RGB ' | 'LAB ' | 'CMYK' | 'Gray'; values: number[]; kind?: number }

function utf16(s: string): number[] {
  const units = [...s].map((c) => c.charCodeAt(0)).concat(0)
  return [units.length >> 8, units.length & 255, ...units.flatMap((u) => [u >> 8, u & 255])]
}

function encodeAse(blocks: Block[]): ArrayBuffer {
  const bytes: number[] = [...'ASEF'].map((c) => c.charCodeAt(0))
  const u16 = (v: number) => [v >> 8, v & 255]
  const u32 = (v: number) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
  const f32 = (v: number) => {
    const dv = new DataView(new ArrayBuffer(4))
    dv.setFloat32(0, v)
    return [0, 1, 2, 3].map((i) => dv.getUint8(i))
  }
  bytes.push(...u16(1), ...u16(0), ...u32(blocks.length))
  for (const b of blocks) {
    let type: number
    let data: number[]
    if ('group' in b) [type, data] = [0xc001, utf16(b.group)]
    else if ('endGroup' in b) [type, data] = [0xc002, []]
    else {
      type = 1
      data = [...utf16(b.name), ...[...b.model].map((c) => c.charCodeAt(0)), ...b.values.flatMap(f32), ...u16(b.kind ?? 2)]
    }
    bytes.push(...u16(type), ...u32(data.length), ...data)
  }
  return new Uint8Array(bytes).buffer
}

// ---------- testes ----------

describe('parseAse', () => {
  it('lê cores RGB com nomes acentuados', () => {
    const buf = encodeAse([{ name: 'P526 - Névoa da Manhã', model: 'RGB ', values: [184 / 255, 96 / 255, 62 / 255] }])
    const [c] = parseAse(buf)
    expect(c.name).toBe('P526 - Névoa da Manhã')
    expect(c.model).toBe('RGB')
    expect(c.kind).toBe('normal')
    expect(aseColorToHex(c)).toBe('#B8603E')
  })

  it('lê grupos e associa cada cor ao seu grupo', () => {
    const colors = parseAse(
      encodeAse([
        { name: 'Solta', model: 'Gray', values: [0.5] },
        { group: 'Azuis' },
        { name: 'Céu', model: 'RGB ', values: [0.5, 0.7, 0.9], kind: 0 },
        { endGroup: true },
        { name: 'Depois', model: 'Gray', values: [1] },
      ]),
    )
    expect(colors.map((c) => [c.name, c.group, c.kind])).toEqual([
      ['Solta', null, 'normal'],
      ['Céu', 'Azuis', 'global'],
      ['Depois', null, 'normal'],
    ])
  })

  it('converte Lab (L* guardado em 0–1), CMYK e cinza', () => {
    const [lab, cmyk, gray] = parseAse(
      encodeAse([
        { name: 'lab', model: 'LAB ', values: [0.5324, 80.09, 67.2] },
        { name: 'cmyk', model: 'CMYK', values: [0, 1, 1, 0] },
        { name: 'gray', model: 'Gray', values: [0.5] },
      ]),
    )
    expect(lab.values[0]).toBeCloseTo(53.24, 2)
    expect(aseColorToHex(lab)).toBe('#FF0000')
    expect(aseColorToHex(cmyk)).toBe('#FF0000')
    expect(aseColorToHex(gray)).toBe('#808080')
  })

  it('rejeita arquivos que não são ASE', () => {
    expect(() => parseAse(new TextEncoder().encode('PK\x03\x04 zip').buffer)).toThrow(AseError)
  })

  it('rejeita arquivos truncados em vez de inventar cores', () => {
    const buf = encodeAse([{ name: 'X', model: 'RGB ', values: [1, 0, 0] }])
    expect(() => parseAse(buf.slice(0, buf.byteLength - 5))).toThrow(AseError)
  })

  it('rejeita modelo de cor desconhecido', () => {
    const buf = encodeAse([{ name: 'X', model: 'RGB ', values: [1, 0, 0] }])
    const bytes = new Uint8Array(buf)
    const at = bytes.indexOf('R'.charCodeAt(0), 14) // primeiro "R" depois do nome
    bytes.set([...'HSV '].map((c) => c.charCodeAt(0)), at)
    expect(() => parseAse(bytes.buffer)).toThrow(/desconhecido/)
  })
})

describe('splitCodeAndName', () => {
  it.each([
    ['P208 - Pergaminho', 'P208', 'Pergaminho'],
    ['C161 – Prata', 'C161', 'Prata'],
    ['  E001 - Branco Neve - Fosco ', 'E001', 'Branco Neve - Fosco'],
    ['Sem Código', 'Sem Código', 'Sem Código'],
  ])('%s', (raw, codigo, nome) => {
    expect(splitCodeAndName(raw)).toEqual({ codigo, nome })
  })
})

describe('aseToCatalog', () => {
  it('gera o formato do catálogo', () => {
    const colors = parseAse(encodeAse([{ name: 'P208 - Pergaminho', model: 'RGB ', values: [0.8706, 0.8784, 0.8627] }]))
    expect(aseToCatalog(colors, 'Marca')).toEqual([
      { marca: 'Marca', codigo: 'P208', nome: 'Pergaminho', hex: '#DEE0DC' },
    ])
  })
})

describe('dedupeByCode', () => {
  const c = (codigo: string, nome: string, hex: string) => ({ marca: 'M', codigo, nome, hex })

  it('remove cópias idênticas e numera conflitos sem descartar nenhuma cor', () => {
    const { catalog, removed, conflicts } = dedupeByCode([
      c('A1', 'Prata', '#C0C0BA'),
      c('B2', 'Areia', '#D3BFA9'),
      c('A1', 'Prata', '#C0C0BA'),
      c('B2', 'Areia', '#EEE0C7'),
    ])
    expect(removed).toBe(1)
    expect(conflicts).toEqual(['B2'])
    expect(catalog.map((x) => `${x.codigo} ${x.hex}`)).toEqual(['A1 #C0C0BA', 'B2 #D3BFA9', 'B2 (2) #EEE0C7'])
  })
})
