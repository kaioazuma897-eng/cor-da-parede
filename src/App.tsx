import { useEffect, useMemo, useRef, useState } from 'react'
import { CalibrationBar, type Mode } from './components/CalibrationBar'
import { CatalogBrowser } from './components/CatalogBrowser'
import { CatalogPicker } from './components/CatalogPicker'
import { PaintBar, TOLERANCE_DEFAULT } from './components/PaintBar'
import { PhotoPicker } from './components/PhotoPicker'
import { PhotoStage, type Selection } from './components/PhotoStage'
import { MatchList, Palette, SampleCard } from './components/Results'
import type { Lab } from './core/color'
import { regionColor, sampleLab, type PixelBuffer, type Rect } from './core/image'
import { kMeans } from './core/kmeans'
import { createMatcher, type CatalogColor } from './core/matcher'
import type { LayerSpec } from './core/scene'
import type { Seed } from './core/segment'
import { BLOCKING_WARNINGS, applyMatrix, calibrate, type Calibration } from './core/whiteBalance'
import { canShareImage, shareOrDownload } from './lib/exportImage'
import { demoPhoto, loadPhoto } from './lib/loadImage'
import { useCatalogs } from './lib/useCatalogs'
import { usePainter } from './lib/usePainter'

type Target = { kind: 'region'; selection: Selection } | { kind: 'palette'; index: number }
type Paper = { selection: Selection; result: Calibration | null }
/** Uma parede da prévia: seus toques, seu alcance e sua cor. */
type Layer = { id: number; color: CatalogColor; seeds: Seed[]; tolerance: number }
/** `active`: índice da parede que recebe os toques e a cor escolhida na lista. */
type Paint = { layers: Layer[]; active: number }

const newLayer = (color: CatalogColor, seeds: Seed[] = []): Layer => ({
  id: Date.now() + Math.random(),
  color,
  seeds,
  tolerance: TOLERANCE_DEFAULT,
})

/** Cores distintas usadas nas paredes já pintadas, na ordem das camadas. */
const usedColors = (layers: Layer[]) =>
  layers.filter((l) => l.seeds.length).map((l) => l.color).filter((c, i, all) => all.findIndex((o) => o.codigo === c.codigo) === i)

const centerOf = (s: Selection): Seed => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 })

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
  const [paint, setPaint] = useState<Paint | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogs = useCatalogs()
  const catalog = catalogs.selected
  const matcher = useMemo(() => createMatcher(catalog.colors), [catalog])

  const replacePhoto = (next: PixelBuffer | null) => {
    setPhoto(next)
    setTarget(null)
    setPaper(null)
    setPaint(null)
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

  // ---------- prévia da cor na parede ----------
  const layer = paint ? paint.layers[paint.active] : null
  const specs = useMemo((): LayerSpec[] | null => {
    if (!paint?.layers.some((l) => l.seeds.length)) return null
    return paint.layers.map((l) => ({ seeds: l.seeds, tolerance: l.tolerance, hex: l.color.hex }))
  }, [paint])
  // Segmentação e repintura rodam num Web Worker: a tela não trava em fotos grandes
  const { painted, coverages, busy: painting } = usePainter(working, specs)

  const updateLayer = (change: Partial<Layer>) =>
    setPaint((p) => p && { ...p, layers: p.layers.map((l, i) => (i === p.active ? { ...l, ...change } : l)) })

  const addLayer = () =>
    setPaint((p) => p && { layers: [...p.layers, newLayer(p.layers[p.active].color)], active: p.layers.length })

  const removeLayer = (index: number) => {
    if (!paint) return
    if (paint.layers.length === 1) {
      setPaint(null)
      setShowOriginal(false)
      return
    }
    const layers = paint.layers.filter((_, i) => i !== index)
    const active = paint.active > index || paint.active === layers.length ? paint.active - 1 : paint.active
    setPaint({ layers, active })
  }

  const exportPainted = async () => {
    if (!painted || !paint) return
    setExporting(true)
    setError(null)
    try {
      await shareOrDownload(painted, usedColors(paint.layers))
    } catch {
      setError('Não consegui gerar a imagem. Tente de novo.')
    } finally {
      setExporting(false)
    }
  }
  const exportLabel = useMemo(() => (canShareImage() ? 'Compartilhar' : 'Baixar imagem'), [])

  const photoRef = useRef<HTMLDivElement>(null)
  const startPaint = (color: CatalogColor) => {
    setShowOriginal(false)
    if (paint) updateLayer({ color })
    else setPaint({ layers: [newLayer(color, regionSelection ? [centerOf(regionSelection)] : [])], active: 0 })
    // No celular a lista fica abaixo da foto: volta para a foto
    if (window.matchMedia('(max-width: 820px)').matches) {
      photoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const onSelect = (selection: Selection) => {
    if (!photo) return
    if (layer) {
      updateLayer({ seeds: [...layer.seeds, centerOf(selection)] })
      return
    }
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
          <div ref={photoRef} className="workspace-photo">
            {paint && layer ? (
              <PaintBar
                layers={paint.layers.map((l, i) => ({
                  id: l.id,
                  color: l.color,
                  seeds: l.seeds.length,
                  // Cobertura só vale se o último resultado já tem as mesmas paredes
                  coverage: coverages?.length === paint.layers.length ? coverages[i] : null,
                }))}
                active={paint.active}
                onSelectLayer={(active) => setPaint({ ...paint, active })}
                onAddLayer={addLayer}
                onRemoveLayer={removeLayer}
                tolerance={layer.tolerance}
                onTolerance={(tolerance) => updateLayer({ tolerance })}
                working={painting}
                showOriginal={showOriginal}
                onShowOriginal={setShowOriginal}
                onUndo={() => updateLayer({ seeds: layer.seeds.slice(0, -1) })}
                exportLabel={exportLabel}
                exporting={exporting}
                onExport={exportPainted}
                onClose={() => {
                  setPaint(null)
                  setShowOriginal(false)
                }}
              />
            ) : (
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
            )}
            {layer ? (
              <PhotoStage
                pixels={showOriginal ? working : (painted ?? working)}
                tone="target"
                selection={null}
                tip={paint?.layers.some((l) => l.seeds.length) ? '' : 'Toque na parede para pintar'}
                onSelect={onSelect}
              />
            ) : (
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
            )}
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
                <MatchList
                  target={sample.lab}
                  matches={matches}
                  painted={layer?.color.codigo ?? null}
                  onPaint={startPaint}
                />
              </>
            ) : (
              <div className="results-empty">
                <p>Marque um ponto da foto para descobrir a cor, ou escolha uma tinta abaixo para ver na parede.</p>
                <p className="muted">
                  Dica: marque uma área em vez de um ponto. A cor final é a mediana da área, o que descarta sombras e
                  reflexos. Para mais precisão, use “Calibrar com folha”.
                </p>
              </div>
            )}
            <CatalogBrowser colors={catalog.colors} painted={layer?.color.codigo ?? null} onPaint={startPaint} />
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
