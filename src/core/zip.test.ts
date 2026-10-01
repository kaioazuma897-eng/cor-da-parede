import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ZipError, extractZip, isZip } from './zip'

/** Monta um ZIP real (cabeçalhos locais + diretório central + EOCD). */
function makeZip(files: { name: string; content: string; deflate?: boolean }[]): ArrayBuffer {
  const enc = new TextEncoder()
  const chunks: number[] = []
  const central: number[] = []
  const u16 = (v: number) => [v & 255, (v >> 8) & 255]
  const u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]

  for (const f of files) {
    const name = [...enc.encode(f.name)]
    const raw = enc.encode(f.content)
    const data = [...(f.deflate ? deflateRawSync(raw) : raw)]
    const method = f.deflate ? 8 : 0
    const offset = chunks.length
    // CRC fica 0: o leitor não valida (a descompressão já falharia com dados corrompidos)
    chunks.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0), ...u32(0))
    chunks.push(...u32(data.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...name, ...data)
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0))
    central.push(...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0))
    central.push(...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name)
  }
  const cdOffset = chunks.length
  chunks.push(...central)
  chunks.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length))
  chunks.push(...u32(central.length), ...u32(cdOffset), ...u16(0))
  return new Uint8Array(chunks).buffer
}

const text = (b: ArrayBuffer) => new TextDecoder().decode(b)

describe('extractZip', () => {
  const zip = makeZip([
    { name: 'leia-me.txt', content: 'oi' },
    { name: 'paletas/', content: '' },
    { name: 'paletas/Cores.ase', content: 'conteúdo comprimido '.repeat(50), deflate: true },
    { name: '__MACOSX/paletas/._Cores.ase', content: 'lixo do macOS' },
    { name: 'Outra.ASE', content: 'sem compressão' },
  ])

  it('reconhece a assinatura de ZIP', () => {
    expect(isZip(zip)).toBe(true)
    expect(isZip(new TextEncoder().encode('ASEF').buffer)).toBe(false)
  })

  it('extrai só os arquivos pedidos, descomprimindo deflate e ignorando metadados do macOS', async () => {
    const files = await extractZip(zip, (n) => n.toLowerCase().endsWith('.ase'))
    expect(files.map((f) => f.name)).toEqual(['paletas/Cores.ase', 'Outra.ASE'])
    expect(text(files[0].data)).toBe('conteúdo comprimido '.repeat(50))
    expect(text(files[1].data)).toBe('sem compressão')
  })

  it('rejeita arquivos que não são ZIP', async () => {
    await expect(extractZip(new TextEncoder().encode('não é zip nenhum').buffer, () => true)).rejects.toThrow(
      ZipError,
    )
  })
})
