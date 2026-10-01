import { useState } from 'react'
import { CATALOGS, type Catalog } from '../data/catalogs'
import { importPaletteFile } from './importPalette'
import { loadImportedCatalogs, loadSelectedCatalog, saveImportedCatalogs, saveSelectedCatalog } from './storage'

export type Notice = { kind: 'success' | 'error'; text: string }

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Catálogos embutidos + paletas importadas pelo usuário (salvas só no aparelho). */
export function useCatalogs() {
  const [imported, setImported] = useState<Catalog[]>(loadImportedCatalogs)
  const all = [...imported, ...CATALOGS]
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = loadSelectedCatalog()
    return all.some((c) => c.id === saved) ? saved! : all[0].id
  })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  const selected = all.find((c) => c.id === selectedId) ?? all[0]

  const select = (id: string) => {
    setSelectedId(id)
    saveSelectedCatalog(id)
  }

  const importFile = async (file: File) => {
    setBusy(true)
    setNotice(null)
    try {
      const results = await importPaletteFile(file)
      const next = [...results.map((r) => r.catalog), ...imported]
      setImported(next)
      select(results[0].catalog.id)

      const parts = results.map((r) => {
        let text = `${fmt(r.catalog.colors.length)} cores de “${r.catalog.label}”`
        if (r.removed) text += ` (${r.removed} repetidas removidas)`
        if (r.conflicts.length) text += `. Atenção: ${r.conflicts.length} códigos aparecem com cores diferentes no arquivo (${r.conflicts.join(', ')}); mantive todas as versões`
        return text
      })
      const saved = saveImportedCatalogs(next)
      setNotice({
        kind: 'success',
        text:
          `Importado: ${parts.join('; ')}.` +
          (saved ? ' Salvo só neste aparelho.' : ' Não deu para salvar no aparelho: a paleta some ao fechar o app.'),
      })
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Não consegui importar esse arquivo.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: string) => {
    const next = imported.filter((c) => c.id !== id)
    setImported(next)
    saveImportedCatalogs(next)
    if (selectedId === id) select([...next, ...CATALOGS][0].id)
  }

  const isImported = (id: string) => imported.some((c) => c.id === id)

  return { all, selected, select, importFile, remove, isImported, notice, dismissNotice: () => setNotice(null), busy }
}
