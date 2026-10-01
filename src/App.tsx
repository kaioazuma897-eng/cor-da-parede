import { useEffect, useMemo, useRef, useState } from 'react'
import { CalibrationBar, type Mode } from './components/CalibrationBar'
import { CatalogPicker } from './components/CatalogPicker'
import { PhotoPicker } from './components/PhotoPicker'
import { PhotoStage, type Selection } from './components/PhotoStage'
import { MatchList, Palette, SampleCard } from './components/Results'
import type { Lab } from './core/color'
import { regionColor, sampleLab, type PixelBuffer, type Rect } from './core/image'
import { kMeans } from './core/kmeans'
import { createMatcher } from './core/matcher'
import { BLOCKING_WARNINGS, applyMatrix, calibrate, type Calibration } from './core/whiteBalance'
import { demoPhoto, loadPhoto } from './lib/loadImage'
import { useCatalogs } from './lib/useCatalogs'

type Target = { kind: 'region'; selection: Selection } | { kind: 'palette'; index: number }
type Paper = { selection: Selection; result: Calibration | null }

const toRect = (s: Selection, img: PixelBuffer): Rect => ({
  x: s.x * img.width,
  y: s.y * img.height,
  w: s.w * img.width,
  h: s.h * img.height,
})

export default function App() {
  const [photo, setPhoto] = useState<PixelBuffer | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [mode, setMode] = useState<Mode>('target')
  const [paper, setPaper] = useState<Paper | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogs = useCatalogs()
  const catalog = catalogs.selected
  const matcher = useMemo(() => createMatcher(catalog.colors), [catalog])

  const replacePhoto = (next: PixelBuffer | null) => {
    setPhoto(next)
    setTarget(null)
    setPaper(null)
    setMode('target')
  }

  const open = async (load: () => PixelBuffer | Promise<PixelBuffer>) => {
    setBusy(true)
    setError(null)
    try {
      replacePhoto(await load())
    } catch {
      setError('Não consegui abrir essa imagem. Tente outro arquivo (JPG, PNG ou WebP).')
    } finally {
      setBusy(false)
    }
  }

  const measured = paper?.result ?? null
  const blocked = measured?.warnings.some((w) => BLOCKING_WARNINGS.includes(w)) ?? false
  const calibration = blocked ? null : measured

  // Foto usada em toda a análise: a original ou a corrigida pela folha
  const working = useMemo(
    () => (photo && calibration ? applyMatrix(photo, calibration.matrix) : photo),
    [photo, calibration],
  )

  const palette = useMemo(() => (working ? kMeans(sampleLab(working, undefined, 6000), 6) : []), [working])

  const sample = useMemo((): { lab: Lab; spread: number | null; source: string } | null => {
    if (!working || !target) return null
    const suffix = calibration ? ' · calibrado' : ''
    if (target.kind === 'palette') {
      const c = palette[target.index]
      return c ? { lab: c.lab, spread: null, source: `Cor dominante${suffix}` } : null
    }
    const region = regionColor(sampleLab(working, toRect(target.selection, working)))
    return (
      region && {
        lab: region.lab,
        spread: region.spread,
        source: `Mediana de ${region.samples.toLocaleString('pt-BR')} pixels${suffix}`,
      }
    )
  }, [working, target, palette, calibration])

  const matches = useMemo(() => (sample ? matcher.findClosest(sample.lab, 5) : []), [sample, matcher])

  const onSelect = (selection: Selection) => {
    if (!photo) return
    if (mode === 'target') {
      setTarget({ kind: 'region', selection })
      return
    }
    // A folha é sempre medida na foto original
    const result = calibrate(photo, toRect(selection, photo))
    setPaper({ selection, result })
    if (result && !result.warnings.some((w) => BLOCKING_WARNINGS.includes(w))) setMode('target')
  }

  // No celular os resultados ficam abaixo da foto: rola até eles após cada seleção
  const resultsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (target && window.matchMedia('(max-width: 820px)').matches) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [target])

  const regionSelection = target?.kind === 'region' ? target.selection : null

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <h1>Cor da Parede</h1>
        </div>
        <div className="header-actions">
          <CatalogPicker
            catalogs={catalogs.all}
            selected={catalog}
            canRemove={catalogs.isImported(catalog.id)}
            busy={catalogs.busy}
            onSelect={catalogs.select}
            onImport={catalogs.importFile}
            onRemove={catalogs.remove}
          />
          {photo && (
            <button className="btn btn-ghost" onClick={() => replacePhoto(null)}>
              Trocar foto
            </button>
          )}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {catalogs.notice && (
        <div className={`notice notice-${catalogs.notice.kind}`} role="status">
          <p>{catalogs.notice.text}</p>
          <button className="btn btn-small btn-ghost" onClick={catalogs.dismissNotice} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      {!photo || !working ? (
        <PhotoPicker busy={busy} onFile={(f) => open(() => loadPhoto(f))} onDemo={() => open(demoPhoto)} />
      ) : (
        <main className="workspace">
          <div className="workspace-photo">
            <CalibrationBar
              mode={mode}
              onMode={setMode}
              calibration={calibration}
              measured={measured}
              failed={paper !== null && paper.result === null}
              showOriginal={showOriginal}
              onShowOriginal={setShowOriginal}
              onClear={() => setPaper(null)}
            />
            <PhotoStage
              pixels={showOriginal ? photo : working}
              tone={mode}
              selection={mode === 'target' ? regionSelection : (paper?.selection ?? null)}
              marker={
                mode === 'target'
                  ? paper && { selection: paper.selection, label: 'Folha' }
                  : regionSelection && { selection: regionSelection, label: 'Cor' }
              }
              tip={
                mode === 'target'
                  ? 'Toque num ponto ou arraste para marcar uma área'
                  : 'Arraste sobre a folha branca'
              }
              onSelect={onSelect}
            />
            <Palette
              clusters={palette}
              active={target?.kind === 'palette' ? target.index : null}
              onPick={(index) => setTarget({ kind: 'palette', index })}
            />
          </div>

          <aside ref={resultsRef} className="workspace-results">
            {sample ? (
              <>
                <SampleCard {...sample} />
                <h3 className="results-title">Mais próximas no catálogo</h3>
                <MatchList target={sample.lab} matches={matches} />
              </>
            ) : (
              <div className="results-empty">
                <p>Marque um ponto da foto ou escolha uma das cores dominantes.</p>
                <p className="muted">
                  Dica: marque uma área em vez de um ponto. A cor final é a mediana da área, o que descarta sombras e
                  reflexos. Para mais precisão, use “Calibrar com folha”.
                </p>
              </div>
            )}
          </aside>
        </main>
      )}

      <footer className="footer">
        Projeto de estudo, sem vínculo com fabricantes de tinta. Cores de tela são aproximações: confira sempre com a
        amostra física. Paletas importadas ficam só no seu aparelho. Catálogo: {matcher.size.toLocaleString('pt-BR')}{' '}
        cores · diferença calculada com CIEDE2000.
      </footer>
    </div>
  )
}
