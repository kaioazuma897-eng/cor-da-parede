import { LIGHTS } from '../core/lighting'
import type { CatalogColor } from '../core/matcher'

export type LayerInfo = {
  id: number
  color: CatalogColor
  seeds: number
  /** Fração da foto pintada (0–1); null enquanto não há toque ou o cálculo não terminou. */
  coverage: number | null
}

type Props = {
  layers: LayerInfo[]
  active: number
  onSelectLayer: (index: number) => void
  onAddLayer: () => void
  onRemoveLayer: (index: number) => void
  tolerance: number
  onTolerance: (value: number) => void
  /** Id em LIGHTS da iluminação simulada. */
  light: string
  onLight: (id: string) => void
  /** Foto calibrada pela folha: a base é de fato luz neutra, não só o ajuste automático da câmera. */
  calibrated: boolean
  /** O worker ainda está calculando a prévia. */
  working: boolean
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
/** Mais que isso fica difícil de acompanhar na tela do celular. */
export const MAX_LAYERS = 6

export function PaintBar(props: Props) {
  const { layers, active, onSelectLayer, onAddLayer, onRemoveLayer, tolerance, onTolerance, working } = props
  const { light, onLight, calibrated } = props
  const { showOriginal, onShowOriginal, onUndo, onClose, exportLabel, exporting, onExport } = props
  const layer = layers[active]
  const { color, seeds, coverage } = layer
  const anyPainted = layers.some((l) => l.seeds > 0)

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

      <div className="paint-layers" role="tablist" aria-label="Paredes">
        {layers.map((l, i) => (
          <div key={l.id} className={`paint-layer ${i === active ? 'is-active' : ''}`}>
            <button
              role="tab"
              aria-selected={i === active}
              className="paint-layer-pick"
              title={`Parede ${i + 1}: ${l.color.nome}`}
              onClick={() => onSelectLayer(i)}
            >
              <span className="paint-layer-swatch" style={{ background: l.color.hex }} aria-hidden />
              Parede {i + 1}
              {l.seeds === 0 && <span className="paint-layer-empty"> · sem toque</span>}
            </button>
            {layers.length > 1 && (
              <button
                className="paint-layer-remove"
                aria-label={`Remover parede ${i + 1}`}
                title="Remover esta parede"
                onClick={() => onRemoveLayer(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {layers.length < MAX_LAYERS && (
          <button className="paint-layer-add" disabled={seeds === 0} onClick={onAddLayer}>
            + Outra parede
          </button>
        )}
      </div>

      <div className="paint-lights">
        <span className="paint-lights-label" id="paint-lights-label">
          Luz
        </span>
        <div className="paint-lights-options" role="radiogroup" aria-labelledby="paint-lights-label">
          {LIGHTS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={light === l.id}
              className="paint-light"
              onClick={() => onLight(l.id)}
            >
              {l.kelvin === null && !calibrated ? 'Como na foto' : l.label}
            </button>
          ))}
        </div>
      </div>
      {light !== LIGHTS[0].id && !calibrated && (
        <p className="paint-note">
          Simulação aproximada: parte do princípio de que a foto está com a cor da luz neutra. Para mais precisão,
          calibre a foto com a folha branca antes de abrir a prévia.
        </p>
      )}

      <p className="paint-help">
        {seeds === 0
          ? layers.length > 1
            ? 'Toque na próxima parede e escolha a cor dela na lista.'
            : 'Toque na parede que você quer pintar.'
          : 'Toque em outras partes desta parede para incluí-las. Reflexos de luz ficaram de fora? Toque neles ou aumente o alcance.'}
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
          <span className={`paint-working ${working ? 'is-on' : ''}`} role="status">
            {working ? 'Pintando…' : ''}
          </span>
        </label>
        <div className="paint-actions">
          <button className="btn btn-small" disabled={seeds === 0} onClick={onUndo}>
            Desfazer toque
          </button>
          <button
            className="btn btn-small"
            disabled={!anyPainted}
            aria-pressed={showOriginal}
            onPointerDown={() => onShowOriginal(true)}
            onPointerUp={() => onShowOriginal(false)}
            onPointerLeave={() => onShowOriginal(false)}
            onKeyDown={(e) => e.key === ' ' && onShowOriginal(true)}
            onKeyUp={() => onShowOriginal(false)}
          >
            Segure para ver antes
          </button>
          <button className="btn btn-small btn-primary" disabled={!anyPainted || exporting} onClick={onExport}>
            {exporting ? 'Gerando…' : exportLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
