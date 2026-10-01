import { AseError, aseToCatalog, dedupeByCode, parseAse } from '../core/ase'
import { ZipError, extractZip, isZip } from '../core/zip'
import type { Catalog } from '../data/catalogs'

export type ImportResult = { catalog: Catalog; removed: number; conflicts: string[] }

/** "SUVINIL_Leque_de_Cores.ase" → "SUVINIL Leque de Cores" */
export function labelFromFileName(name: string): string {
  const base = name.split('/').pop() ?? name
  return base.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Paleta importada'
}

/**
 * Lê um .ase, ou um .zip com um ou mais .ase dentro (como os fabricantes distribuem),
 * e devolve um catálogo por paleta. Tudo acontece no aparelho.
 */
export async function importPaletteFile(file: File): Promise<ImportResult[]> {
  const buffer = await file.arrayBuffer()

  let palettes: { name: string; data: ArrayBuffer }[]
  if (isZip(buffer)) {
    palettes = await extractZip(buffer, (n) => n.toLowerCase().endsWith('.ase'))
    if (palettes.length === 0) throw new Error('Esse .zip não tem nenhuma paleta .ase dentro.')
  } else {
    palettes = [{ name: file.name, data: buffer }]
  }

  try {
    return palettes.map(({ name, data }) => {
      const label = labelFromFileName(name)
      const colors = parseAse(data)
      if (colors.length === 0) throw new Error(`A paleta "${label}" está vazia.`)
      const { catalog, removed, conflicts } = dedupeByCode(aseToCatalog(colors, label))
      return { catalog: { id: `import:${Date.now()}:${name}`, label, colors: catalog }, removed, conflicts }
    })
  } catch (e) {
    if (e instanceof AseError || e instanceof ZipError) {
      throw new Error(`Não consegui ler esse arquivo como paleta .ase (${e.message}).`)
    }
    throw e
  }
}
