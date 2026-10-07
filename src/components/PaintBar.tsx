import type { CatalogColor } from '../core/matcher'

type Props = {
  color: CatalogColor
  tolerance: number
  onTolerance: (value: number) => void
  seeds: number
  /** Fração da foto pintada (0–1); null enquanto não há toque. */
  coverage: number | null
  showOriginal: boolean
  onShowOriginal: (show: boolean) => void
  onUndo: () => void
  onClose: () => void
  /** Rótulo do botão de exportar: "Compartilhar" no celular, "Baixar imagem" no computador. */
  exportLabel: string
  exporting: boolean
  onExport: () => void
}

export const TOLERANCE_MIN = 4
export const TOLERANCE_MAX = 30
export const TOLERANCE_DEFAULT = 14

export function PaintBar(props: Props) {
  const { color, tolerance, onTolerance, seeds, coverage, showOriginal, onShowOriginal, onUndo, onClose } = props
  const { exportLabel, exporting, onExport } = props
  return (
    <div className="paint-bar">
      <div className="paint-head">
        <span className="paint-swatch" style={{ background: color.hex }} aria-hidden />
        <div className="paint-name">
          <strong>{color.nome}</strong>
          <span>
            {color.codigo} · {color.hex}
          </span>
        </div>
        <button className="btn btn-small btn-ghost" onClick={onClose}>
          Sair da prévia
        </button>
      </div>

      <p className="paint-help">
        {seeds === 0
          ? 'Toque na parede que você quer pintar.'
          : 'Toque em outras partes da parede para incluí-las. Reflexos de luz ficaram de fora? Toque neles ou aumente o alcance.'}
        {coverage !== null && coverage < 0.01 && seeds > 0 && ' Quase nada foi pintado: aumente o alcance.'}
      </p>

      <div className="paint-controls">
        <label className="paint-range">
          <span>Alcance</span>
          <input
            type="range"
            min={TOLERANCE_MIN}
            max={TOLERANCE_MAX}
            step={1}
            value={tolerance}
            onChange={(e) => onTolerance(Number(e.target.value))}
            aria-valuetext={`${tolerance}`}
          />
        </label>
        <div className="paint-actions">
          <button className="btn btn-small" disabled={seeds === 0} onClick={onUndo}>
            Desfazer toque
          </button>
          <button
            className="btn btn-small"
            disabled={seeds === 0}
            aria-pressed={showOriginal}
            onPointerDown={() => onShowOriginal(true)}
            onPointerUp={() => onShowOriginal(false)}
            onPointerLeave={() => onShowOriginal(false)}
            onKeyDown={(e) => e.key === ' ' && onShowOriginal(true)}
            onKeyUp={() => onShowOriginal(false)}
          >
            Segure para ver antes
          </button>
          <button className="btn btn-small btn-primary" disabled={seeds === 0 || exporting} onClick={onExport}>
            {exporting ? 'Gerando…' : exportLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
