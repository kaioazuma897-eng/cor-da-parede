import { useDeferredValue, useMemo, useState } from 'react'
import { searchColors, sortByHue } from '../core/catalogSearch'
import type { CatalogColor } from '../core/matcher'

type Props = {
  colors: readonly CatalogColor[]
  /** Código da cor sendo exibida na prévia da parede, se houver. */
  painted: string | null
  onPaint: (color: CatalogColor) => void
}

/** Catálogos importados podem ter milhares de cores: mostra em lotes. */
const PAGE = 60

export function CatalogBrowser({ colors, painted, onPaint }: Props) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const sorted = useMemo(() => sortByHue(colors), [colors])
  const deferredQuery = useDeferredValue(query)
  const found = useMemo(() => searchColors(sorted, deferredQuery), [sorted, deferredQuery])
  const shown = found.slice(0, limit)

  return (
    <section className="browser">
      <h3 className="results-title">Escolher qualquer cor</h3>
      <input
        className="browser-search"
        type="search"
        placeholder="Buscar por nome ou código"
        aria-label="Buscar cor no catálogo"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setLimit(PAGE)
        }}
      />
      {found.length === 0 ? (
        <p className="muted browser-empty">Nenhuma cor com “{query.trim()}” neste catálogo.</p>
      ) : (
        <ul className="browser-grid">
          {shown.map((color) => (
            <li key={color.codigo}>
              <button
                className="browser-chip"
                aria-pressed={painted === color.codigo}
                title={`${color.nome} · ${color.codigo} · ${color.hex}`}
                onClick={() => onPaint(color)}
              >
                <span className="browser-swatch" style={{ background: color.hex }} aria-hidden />
                <span className="browser-name">{color.nome}</span>
                <span className="browser-code">{color.codigo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {found.length > limit && (
        <button className="btn btn-small btn-ghost browser-more" onClick={() => setLimit(limit + PAGE)}>
          Mostrar mais ({(found.length - limit).toLocaleString('pt-BR')} restantes)
        </button>
      )}
    </section>
  )
}
