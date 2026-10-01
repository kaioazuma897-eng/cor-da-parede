import { useRef, useState, type DragEvent } from 'react'

type Props = {
  onFile: (file: Blob) => void
  onDemo: () => void
  busy: boolean
}

export function PhotoPicker({ onFile, onDemo, busy }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files: FileList | null) => {
    const file = files?.[0]
    if (file && file.type.startsWith('image/')) onFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files)
  }

  return (
    <div
      className={`picker ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="picker-swatches" aria-hidden>
        <span style={{ background: '#B8603E' }} />
        <span style={{ background: '#A3B39A' }} />
        <span style={{ background: '#7E9BB5' }} />
        <span style={{ background: '#EADFC4' }} />
      </div>
      <h2>Fotografe uma parede ou objeto</h2>
      <p>
        A gente extrai a cor e encontra as tintas mais próximas do catálogo.
        <br />A foto é processada no seu aparelho e não é enviada para lugar nenhum.
      </p>

      <div className="picker-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => cameraInput.current?.click()}>
          Tirar foto
        </button>
        <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
          Escolher imagem
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onDemo}>
          Usar foto de exemplo
        </button>
      </div>
      <p className="picker-hint">ou arraste uma imagem para cá</p>
      <p className="picker-hint">
        Tem a paleta oficial de uma marca de tinta? Use <strong>Importar paleta</strong> no topo (arquivo .ase ou .zip).
      </p>

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  )
}
