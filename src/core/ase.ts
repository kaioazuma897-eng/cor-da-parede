/**
 * Leitor de Adobe Swatch Exchange (.ase), o formato de paletas que fabricantes de tinta
 * distribuem para Photoshop/Illustrator.
 *
 * Estrutura (tudo big-endian):
 *   "ASEF" | versão u16.u16 | nº de blocos u32
 *   bloco:  tipo u16 | tamanho u32 | dados
 *     0xC001 início de grupo: nome
 *     0xC002 fim de grupo
 *     0x0001 cor: nome | modelo (4 bytes ASCII) | valores float32 | tipo u16
 *   nome:   nº de unidades UTF-16 (inclui o \0 final) u16 | texto UTF-16BE
 *
 * Os imports usam extensão .ts explícita para o módulo rodar também direto no Node
 * (scripts/ase-to-catalog.ts), sem bundler.
 */
import { labToHex, rgbToHex } from './color.ts'
import type { CatalogColor } from './matcher.ts'

export type AseModel = 'RGB' | 'LAB' | 'CMYK' | 'Gray'

export type AseColor = {
  name: string
  group: string | null
  model: AseModel
  /** RGB/CMYK/Gray em 0–1; LAB como L* 0–100, a* e b* sem escala. */
  values: number[]
  kind: 'global' | 'spot' | 'normal'
}

const BLOCK_GROUP_START = 0xc001
const BLOCK_GROUP_END = 0xc002
const BLOCK_COLOR = 0x0001

const MODELS: Record<string, { model: AseModel; channels: number }> = {
  'RGB ': { model: 'RGB', channels: 3 },
  'LAB ': { model: 'LAB', channels: 3 },
  CMYK: { model: 'CMYK', channels: 4 },
  Gray: { model: 'Gray', channels: 1 },
}

const KINDS = ['global', 'spot', 'normal'] as const

export class AseError extends Error {}

export function parseAse(buffer: ArrayBuffer): AseColor[] {
  const view = new DataView(buffer)
  let pos = 0

  const need = (n: number) => {
    if (pos + n > view.byteLength) throw new AseError(`Arquivo ASE truncado na posição ${pos}`)
  }
  const u16 = () => (need(2), (pos += 2), view.getUint16(pos - 2))
  const u32 = () => (need(4), (pos += 4), view.getUint32(pos - 4))
  const f32 = () => (need(4), (pos += 4), view.getFloat32(pos - 4))
  const ascii = (n: number) => {
    need(n)
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(pos + i))
    pos += n
    return s
  }
  const utf16 = () => {
    const units = u16()
    need(units * 2)
    const codes: number[] = []
    for (let i = 0; i < units; i++) codes.push(view.getUint16(pos + i * 2))
    pos += units * 2
    while (codes.length && codes[codes.length - 1] === 0) codes.pop()
    return String.fromCharCode(...codes)
  }

  if (ascii(4) !== 'ASEF') throw new AseError('Não é um arquivo ASE (assinatura ASEF ausente)')
  pos += 4 // versão: não muda nada na leitura
  const blocks = u32()

  const colors: AseColor[] = []
  let group: string | null = null
  for (let b = 0; b < blocks; b++) {
    const type = u16()
    const length = u32()
    const end = pos + length
    need(length)

    if (type === BLOCK_GROUP_START) {
      group = length > 0 ? utf16() : null
    } else if (type === BLOCK_GROUP_END) {
      group = null
    } else if (type === BLOCK_COLOR) {
      const name = utf16()
      const spec = MODELS[ascii(4)]
      if (!spec) throw new AseError(`Modelo de cor desconhecido em "${name}"`)
      const values = Array.from({ length: spec.channels }, f32)
      if (spec.model === 'LAB') values[0] *= 100 // ASE guarda L* em 0–1
      colors.push({ name, group, model: spec.model, values, kind: KINDS[u16()] ?? 'normal' })
    }
    pos = end // pula blocos desconhecidos e eventuais bytes extras
  }
  return colors
}

const to255 = (v: number) => Math.min(255, Math.max(0, Math.round(v * 255)))

/** Converte uma cor ASE para hex sRGB. CMYK usa a conversão ingênua (sem perfil ICC). */
export function aseColorToHex(color: AseColor): string {
  const v = color.values
  switch (color.model) {
    case 'RGB':
      return rgbToHex({ r: to255(v[0]), g: to255(v[1]), b: to255(v[2]) })
    case 'Gray':
      return rgbToHex({ r: to255(v[0]), g: to255(v[0]), b: to255(v[0]) })
    case 'CMYK': {
      const k = 1 - v[3]
      return rgbToHex({ r: to255((1 - v[0]) * k), g: to255((1 - v[1]) * k), b: to255((1 - v[2]) * k) })
    }
    case 'LAB':
      return labToHex({ L: v[0], a: v[1], b: v[2] })
  }
}

/**
 * Nomes de fabricantes costumam vir como "CÓDIGO - Nome" (ex.: "P208 - Pergaminho").
 * Sem esse padrão, o nome inteiro vira o código.
 */
export function splitCodeAndName(raw: string): { codigo: string; nome: string } {
  const match = raw.match(/^\s*(\S+)\s+[-–]\s+(.+?)\s*$/)
  return match ? { codigo: match[1], nome: match[2] } : { codigo: raw.trim(), nome: raw.trim() }
}

export function aseToCatalog(colors: AseColor[], marca: string): CatalogColor[] {
  return colors.map((c) => ({ marca, ...splitCodeAndName(c.name), hex: aseColorToHex(c) }))
}

export type DedupeReport = { catalog: CatalogColor[]; removed: number; conflicts: string[] }

/**
 * Paletas oficiais às vezes repetem cores (ex.: a mesma cor numa seção de coleção).
 * Cópias idênticas são removidas. Mesmo código com cor diferente é um conflito na fonte:
 * mantemos todas as versões, numeradas, em vez de escolher uma no chute.
 */
export function dedupeByCode(catalog: CatalogColor[]): DedupeReport {
  const byCode = new Map<string, CatalogColor[]>()
  let removed = 0
  for (const c of catalog) {
    const list = byCode.get(c.codigo) ?? []
    if (list.some((x) => x.hex === c.hex && x.nome === c.nome)) {
      removed++
      continue
    }
    list.push(c)
    byCode.set(c.codigo, list)
  }
  const conflicts = [...byCode].filter(([, list]) => list.length > 1).map(([code]) => code)
  const out = [...byCode.values()].flatMap((list) =>
    list.length === 1 ? list : list.map((c, i) => (i === 0 ? c : { ...c, codigo: `${c.codigo} (${i + 1})` })),
  )
  return { catalog: out, removed, conflicts }
}
