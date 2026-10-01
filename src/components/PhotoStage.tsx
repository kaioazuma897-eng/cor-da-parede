import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PixelBuffer } from '../core/image'

/** Seleção em frações da imagem (0–1), independente do tamanho exibido. */
export type Selection = { x: number; y: number; w: number; h: number }

export type Marker = { selection: Selection; label: string }

type Props = {
  pixels: PixelBuffer
  /** Seleção sendo editada agora. */
  selection: Selection | null
  /** Outra marcação exibida de forma discreta (ex.: a folha, enquanto se marca a parede). */
  marker?: Marker | null
  tone: 'target' | 'reference'
  tip: string
  onSelect: (sel: Selection) => void
}

/** Lado do quadrado usado quando o usuário só toca/clica, em fração do menor lado. */
const TAP_SIZE = 0.04

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const boxStyle = (s: Selection) => ({
  left: `${s.x * 100}%`,
  top: `${s.y * 100}%`,
  width: `${s.w * 100}%`,
  height: `${s.h * 100}%`,
})

export function PhotoStage({ pixels, selection, marker, tone, tip, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<Selection | null>(null)
  const aspect = pixels.width / pixels.height

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    el.width = pixels.width
    el.height = pixels.height
    const data = new Uint8ClampedArray(pixels.data)
    el.getContext('2d')!.putImageData(new ImageData(data, pixels.width, pixels.height), 0, 0)
  }, [pixels])

  const toFraction = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }

  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Selection => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  })

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = toFraction(e)
    setDraft(null)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (start.current) setDraft(rectFrom(start.current, toFraction(e)))
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!start.current) return
    const end = toFraction(e)
    let sel = rectFrom(start.current, end)
    const r = box.current!.getBoundingClientRect()
    // Arrasto curto = toque: usa um quadradinho em volta do ponto
    if (sel.w * r.width < 6 && sel.h * r.height < 6) {
      const sw = TAP_SIZE * Math.min(1, 1 / aspect)
      const sh = TAP_SIZE * Math.min(1, aspect)
      sel = { x: clamp01(end.x - sw / 2), y: clamp01(end.y - sh / 2), w: sw, h: sh }
    }
    start.current = null
    setDraft(null)
    onSelect(sel)
  }

  const shown = draft ?? selection

  return (
    <div
      ref={box}
      className={`stage tone-${tone}`}
      // Largura derivada da altura máxima: a caixa mantém a proporção exata da foto
      style={{ aspectRatio: aspect, width: `min(100%, calc(72vh * ${aspect}))` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null
        setDraft(null)
      }}
    >
      <canvas ref={canvas} aria-label="Foto enviada" />
      {marker && (
        <div className="stage-marker" style={boxStyle(marker.selection)}>
          <span>{marker.label}</span>
        </div>
      )}
      {shown && <div className={`stage-selection ${draft ? 'is-draft' : ''}`} style={boxStyle(shown)} />}
      {!selection && !draft && <div className="stage-tip">{tip}</div>}
    </div>
  )
}
