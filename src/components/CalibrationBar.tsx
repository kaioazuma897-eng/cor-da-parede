import { BLOCKING_WARNINGS, type Calibration, type CalibrationWarning } from '../core/whiteBalance'

export type Mode = 'target' | 'reference'

const WARNINGS: Record<CalibrationWarning, string> = {
  clipped:
    'A folha saiu estourada (branco puro) na foto, então a correção pode ficar fraca. Fotografe de novo tocando na folha na tela da câmera para ajustar a exposição.',
  dark: 'A folha está muito escura. Acenda uma luz ou chegue mais perto da janela e fotografe de novo.',
  mixed: 'A área marcada não parece ser só a folha. Marque só o miolo do papel, sem bordas e sem sombra.',
  notWhite:
    'Essa área tem cor forte demais para ser uma folha branca, então a calibração não foi aplicada. Marque só o papel.',
}

type Props = {
  mode: Mode
  onMode: (mode: Mode) => void
  /** Calibração aplicada (null se não há ou se foi recusada). */
  calibration: Calibration | null
  /** Última medição da folha, aplicada ou não: fonte dos avisos. */
  measured: Calibration | null
  /** A folha foi marcada mas não deu para medir. */
  failed: boolean
  showOriginal: boolean
  onShowOriginal: (show: boolean) => void
  onClear: () => void
}

export function CalibrationBar({ mode, onMode, calibration, measured, failed, showOriginal, onShowOriginal, onClear }: Props) {
  // Se a calibração foi recusada, só o motivo da recusa importa
  const all = measured?.warnings ?? []
  const blocking = all.filter((w) => BLOCKING_WARNINGS.includes(w))
  const warnings = blocking.length ? blocking : all

  return (
    <div className="calibration">
      <div className="calibration-row">
        <div className="segmented" role="tablist" aria-label="O que marcar na foto">
          <button role="tab" aria-selected={mode === 'target'} onClick={() => onMode('target')}>
            Marcar cor
          </button>
          <button role="tab" aria-selected={mode === 'reference'} onClick={() => onMode('reference')}>
            Calibrar com folha
          </button>
        </div>

        {calibration && (
          <div className="calibration-status">
            <span className="calibration-badge" title={`Folha medida: ${calibration.paperHex}`}>
              <i style={{ background: calibration.paperHex }} aria-hidden />
              Calibrado
            </span>
            <button
              className="btn btn-small"
              aria-pressed={showOriginal}
              onPointerDown={() => onShowOriginal(true)}
              onPointerUp={() => onShowOriginal(false)}
              onPointerLeave={() => onShowOriginal(false)}
              onKeyDown={(e) => e.key === ' ' && onShowOriginal(true)}
              onKeyUp={() => onShowOriginal(false)}
            >
              Segure para ver o original
            </button>
            <button className="btn btn-small btn-ghost" onClick={onClear}>
              Remover
            </button>
          </div>
        )}
      </div>

      {mode === 'reference' && (
        <p className="calibration-help">
          Fotografe a parede com uma <strong>folha branca de papel</strong> encostada nela e arraste sobre a folha. O
          app usa o branco do papel para descobrir a cor da luz e corrigir a foto inteira.
        </p>
      )}

      {failed && <p className="warning">Não consegui medir a folha nessa área. Tente marcar de novo.</p>}
      {warnings.map((w) => (
        <p key={w} className="warning">
          {WARNINGS[w]}
        </p>
      ))}
    </div>
  )
}
