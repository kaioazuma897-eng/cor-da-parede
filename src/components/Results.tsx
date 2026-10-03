import { isDark, labToHex, type Lab } from '../core/color'
import { describeDeltaE } from '../core/deltaE'
import type { Cluster } from '../core/kmeans'
import type { CatalogColor, Match } from '../core/matcher'

const fmt = (n: number, digits = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Acima disso a área marcada mistura cores demais (sombra, objetos, textura forte). */
const MIXED_SPREAD = 8

export function SampleCard({ lab, spread, source }: { lab: Lab; spread: number | null; source: string }) {
  const hex = labToHex(lab)
  return (
    <section className="sample">
      <div className={`sample-swatch ${isDark(lab) ? 'on-dark' : ''}`} style={{ background: hex }}>
        <span className="sample-hex">{hex}</span>
        <span className="sample-source">{source}</span>
      </div>
      <dl className="sample-lab">
        <div>
          <dt>L*</dt>
          <dd>{fmt(lab.L)}</dd>
        </div>
        <div>
          <dt>a*</dt>
          <dd>{fmt(lab.a)}</dd>
        </div>
        <div>
          <dt>b*</dt>
          <dd>{fmt(lab.b)}</dd>
        </div>
      </dl>
      {spread !== null && spread > MIXED_SPREAD && (
        <p className="warning">
          A área marcada tem cores bem variadas. Tente selecionar só a parte lisa da parede, longe de sombras e
          reflexos.
        </p>
      )}
    </section>
  )
}

type MatchListProps = {
  target: Lab
  matches: Match[]
  /** Código da cor sendo exibida na prévia da parede, se houver. */
  painted: string | null
  onPaint: (color: CatalogColor) => void
}

export function MatchList({ target, matches, painted, onPaint }: MatchListProps) {
  const targetHex = labToHex(target)
  return (
    <ol className="matches">
      {matches.map(({ color, deltaE }, i) => {
        const perception = describeDeltaE(deltaE)
        return (
          <li
            key={color.codigo}
            className={`match ${painted === color.codigo ? 'is-painted' : ''}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="match-pair" aria-hidden>
              <span style={{ background: targetHex }} />
              <span style={{ background: color.hex }} />
            </div>
            <div className="match-info">
              <strong>{color.nome}</strong>
              <span className="match-meta">
                {color.codigo} · {color.hex}
              </span>
              <button className="match-paint" aria-pressed={painted === color.codigo} onClick={() => onPaint(color)}>
                {painted === color.codigo ? 'Na parede' : 'Ver na parede'}
              </button>
            </div>
            <div className="match-score">
              <span className="match-delta" title="Diferença de cor CIEDE2000">
                ΔE {fmt(deltaE)}
              </span>
              <span className={`pill level-${perception.level}`}>{perception.label}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function Palette({
  clusters,
  active,
  onPick,
}: {
  clusters: Cluster[]
  active: number | null
  onPick: (index: number) => void
}) {
  return (
    <div className="palette">
      <div className="palette-head">
        <h3>Cores dominantes da foto</h3>
        <span>k-means em Lab</span>
      </div>
      <div className="palette-bar">
        {clusters.map((c, i) => {
          const hex = labToHex(c.lab)
          return (
            <button
              key={i}
              className={`palette-chip ${active === i ? 'is-active' : ''}`}
              style={{ background: hex, flexGrow: Math.max(c.weight, 0.06) }}
              onClick={() => onPick(i)}
              title={`${hex} · ${Math.round(c.weight * 100)}% da foto`}
            >
              <span className={isDark(c.lab) ? 'on-dark' : ''}>{Math.round(c.weight * 100)}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
