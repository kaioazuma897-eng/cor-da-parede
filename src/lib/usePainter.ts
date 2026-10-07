import { useEffect, useState } from 'react'
import type { PixelBuffer } from '../core/image'
import type { LayerSpec } from '../core/scene'
import type { PainterRequest, PainterResponse } from './paint.worker'

type Result = { photo: PixelBuffer; pixels: PixelBuffer; coverages: (number | null)[] }

/**
 * Conversa com o worker de pintura. Só um pedido fica em andamento por vez: enquanto o worker
 * trabalha, pedidos novos (ex.: arrastando o controle de alcance) substituem o pendente, e
 * apenas o mais recente é processado em seguida.
 */
function createPainterClient(onResult: (r: Result) => void, onBusy: (busy: boolean) => void) {
  type Job = { photo: PixelBuffer; layers: LayerSpec[] }
  let worker: Worker | null = null
  let sentPhoto: PixelBuffer | null = null
  let pending: Job | null = null
  let inFlight: (Job & { id: number }) | null = null
  let nextId = 0
  /** Respostas com id até aqui foram canceladas (prévia fechada). */
  let cancelledUpTo = 0

  function onMessage({ data }: MessageEvent<PainterResponse>) {
    const done = inFlight
    inFlight = null
    if (done && done.id === data.id && data.id > cancelledUpTo) {
      if (data.type === 'painted') onResult({ photo: done.photo, pixels: data.pixels, coverages: data.coverages })
      else console.error('Falha ao pintar a prévia:', data.message)
    }
    if (!pending) onBusy(false)
    pump()
  }

  function pump() {
    if (inFlight || !pending) return
    const job = pending
    pending = null
    if (!worker) {
      worker = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = onMessage
    }
    const post = (msg: PainterRequest) => worker!.postMessage(msg)
    if (sentPhoto !== job.photo) {
      post({ type: 'photo', photo: job.photo })
      sentPhoto = job.photo
    }
    inFlight = { ...job, id: ++nextId }
    onBusy(true)
    post({ type: 'paint', id: inFlight.id, layers: job.layers })
  }

  return {
    request(photo: PixelBuffer, layers: LayerSpec[]) {
      pending = { photo, layers }
      pump()
    },
    cancel() {
      pending = null
      cancelledUpTo = nextId
      onBusy(false)
    },
    dispose() {
      worker?.terminate()
      // Um worker novo não tem a foto nem o pedido que estava em andamento
      worker = null
      sentPhoto = null
      inFlight = null
    },
  }
}

/** Pinta as camadas num Web Worker e devolve a última prévia pronta para esta foto. */
export function usePainter(photo: PixelBuffer | null, layers: LayerSpec[] | null) {
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [client] = useState(() => createPainterClient(setResult, setBusy))

  useEffect(() => {
    if (photo && layers) client.request(photo, layers)
    else client.cancel()
  }, [client, photo, layers])

  useEffect(() => () => client.dispose(), [client])

  // Prévia fechada ou foto trocada: o resultado antigo não vale mais
  const current = photo && layers && result?.photo === photo ? result : null
  return { painted: current?.pixels ?? null, coverages: current?.coverages ?? null, busy }
}
