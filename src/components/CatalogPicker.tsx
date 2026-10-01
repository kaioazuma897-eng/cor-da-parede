import { useRef } from 'react'
import type { Catalog } from '../data/catalogs'

type Props = {
  catalogs: Catalog[]
  selected: Catalog
  canRemove: boolean
  busy: boolean
  onSelect: (id: string) => void
  onImport: (file: File) => void
  onRemove: (id: string) => void
}

export function CatalogPicker({ catalogs, selected, canRemove, busy, onSelect, onImport, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="catalog-picker">
      <label className="catalog-select">
        <span>Catálogo</span>
        <select value={selected.id} onChange={(e) => onSelect(e.target.value)}>
          {catalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.colors.length.toLocaleString('pt-BR')})
            </option>
          ))}
        </select>
      </label>
      {canRemove && (
        <button
          className="btn btn-small btn-ghost"
          aria-label={`Remover a paleta ${selected.label} deste aparelho`}
          title="Remover esta paleta do aparelho"
          onClick={() => {
            if (confirm(`Remover “${selected.label}” deste aparelho?`)) onRemove(selected.id)
          }}
        >
          Remover
        </button>
      )}
      <button
        className="btn btn-small"
        disabled={busy}
        title="Importar paleta oficial de um fabricante (.ase ou .zip)"
        onClick={() => input.current?.click()}
      >
        {busy ? 'Importando…' : 'Importar paleta'}
      </button>
      {/* Sem `accept`: o iPhone esconde arquivos .ase quando a extensão não tem tipo registrado */}
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImport(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
