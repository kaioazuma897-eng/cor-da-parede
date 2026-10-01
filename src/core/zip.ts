/**
 * Leitor mínimo de ZIP: lista e extrai arquivos usando o diretório central.
 * A descompressão (deflate) usa DecompressionStream, nativo nos navegadores
 * modernos (inclusive Safari do iPhone) e no Node; nenhuma biblioteca é necessária.
 *
 * Fabricantes distribuem paletas .ase dentro de .zip; assim o usuário importa o
 * arquivo baixado sem precisar descompactar.
 */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const METHOD_STORED = 0
const METHOD_DEFLATE = 8

export class ZipError extends Error {}

export type ZipEntry = { name: string; data: ArrayBuffer }

export function isZip(buffer: ArrayBuffer): boolean {
  return buffer.byteLength >= 4 && new DataView(buffer).getUint32(0, true) === LOCAL_SIGNATURE
}

async function inflateRaw(data: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).arrayBuffer()
}

/** Extrai os arquivos cujo nome satisfaz `wanted`. Pastas e metadados do macOS são ignorados. */
export async function extractZip(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<ZipEntry[]> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // O registro final (EOCD) fica nos últimos 22 bytes + até 64 KB de comentário
  let eocd = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipError('Arquivo ZIP inválido ou corrompido')

  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const out: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.byteLength || view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Diretório do ZIP corrompido')
    }
    const method = view.getUint16(pos + 10, true)
    const compressedSize = view.getUint32(pos + 20, true)
    const nameLength = view.getUint16(pos + 28, true)
    const extraLength = view.getUint16(pos + 30, true)
    const commentLength = view.getUint16(pos + 32, true)
    const localOffset = view.getUint32(pos + 42, true)
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength))
    pos += 46 + nameLength + extraLength + commentLength

    const base = name.split('/').pop() ?? ''
    const skip = name.endsWith('/') || name.startsWith('__MACOSX/') || base.startsWith('._')
    if (skip || !wanted(name)) continue

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new ZipError(`Entrada corrompida: ${name}`)
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const raw = bytes.subarray(start, start + compressedSize)

    if (method === METHOD_STORED) out.push({ name, data: raw.slice().buffer })
    else if (method === METHOD_DEFLATE) out.push({ name, data: await inflateRaw(raw) })
    else throw new ZipError(`Compressão não suportada (${method}) em ${name}`)
  }
  return out
}
