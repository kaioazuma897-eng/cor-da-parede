import { useMemo } from 'react'
import { hexToLab } from '../core/color'
import { harmonies } from '../core/harmony'
import type { CatalogColor, Matcher } from '../core/matcher'

type Props = {
  /** Tinta de referência: a parede 1 da prévia ou a mais próxima da cor medida. */
  base: CatalogColor
  /** De onde vem a base, quando não é óbvio (ex.: "parede 1"). */
  baseLabel: string | null
  matcher: Matcher
  /** Código da cor sendo exibida na prévia da parede, se houver. */
  painted: string | null
  onPaint: (color: CatalogColor) => void
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function HarmonyPanel({ base, baseLabel, matcher, painted, onPaint }: Props) {
  const groups = useMemo(() => harmonies({ ...base, lab: hexToLab(base.hex) }, matcher), [base, matcher])
  if (groups.length === 0) return null
  const onlyTones = groups.every((g) => g.kind === 'tom-sobre-tom')

  return (
    <section className="harmony">
      <h3 className="results-title">
        Combina com <span className="harmony-base">{base.nome}</span>
        {baseLabel && <span className="harmony-from"> · {baseLabel}</span>}
      </h3>
      {onlyTones && (
        <p className="muted harmony-note">
          Cores neutras combinam com quase tudo. Aqui vão tons da mesma família; para contraste, escolha livremente
          no catálogo abaixo.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.kind} className="harmony-group">
          <div className="harmony-head">
            <strong>{g.label}</strong>
            <span>{g.hint}</span>
          </div>
          <ul className="harmony-row">
            <li>
              <span className="harmony-ref" title={`${base.nome} (referência)`}>
                <span className="browser-swatch" style={{ background: base.hex }} aria-hidden />
              </span>
            </li>
            {g.suggestions.map(({ color, deltaE }) => (
              <li key={color.codigo}>
                <button
                  className="browser-chip"
                  aria-pressed={painted === color.codigo}
                  title={`${color.nome} · ${color.codigo} · ${color.hex}\nΔE ${fmt(deltaE)} da cor ideal da harmonia`}
                  onClick={() => onPaint(color)}
                >
                  <span className="browser-swatch" style={{ background: color.hex }} aria-hidden />
                  <span className="browser-name">{color.nome}</span>
                  <span className="browser-code">{color.codigo}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
