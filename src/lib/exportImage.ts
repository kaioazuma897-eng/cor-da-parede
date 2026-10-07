import { hexToLab, isDark } from '../core/color'
import type { PixelBuffer } from '../core/image'
import type { CatalogColor } from '../core/matcher'

/** Cores por linha na faixa de baixo. */
const PER_ROW = 3

/**
 * Gera a imagem da prévia com uma faixa embaixo identificando cada tinta usada (amostra, nome,
 * código), para quem recebe a foto (família, pintor, loja) saber exatamente qual cor pedir.
 */
export function renderExport(pixels: PixelBuffer, colors: readonly CatalogColor[], note?: string): HTMLCanvasElement {
  const { width, height } = pixels
  const row = Math.max(72, Math.round(width * 0.09))
  const cols = Math.max(1, Math.min(colors.length, PER_ROW))
  const rows = Math.ceil(colors.length / cols)
  const pad = Math.round(row * 0.2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height + row * rows
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')

  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0)
  ctx.fillStyle = '#FFFDF9'
  ctx.fillRect(0, height, width, row * rows)

  const cell = width / cols
  const swatch = row - pad * 2
  const font = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textBaseline = 'alphabetic'

  colors.forEach((color, i) => {
    const x = Math.round((i % cols) * cell)
    const y = height + Math.floor(i / cols) * row

    // Amostra da tinta à esquerda de cada célula
    ctx.fillStyle = color.hex
    ctx.fillRect(x + pad, y + pad, swatch, swatch)
    if (!isDark(hexToLab(color.hex))) {
      // Amostra clara some sobre o fundo claro: contorno discreto
      ctx.strokeStyle = 'rgb(0 0 0 / 0.15)'
      ctx.lineWidth = Math.max(1, row / 72)
      ctx.strokeRect(x + pad, y + pad, swatch, swatch)
    }

    const textX = x + pad * 2 + swatch
    const maxText = cell - (textX - x) - pad
    ctx.fillStyle = '#1F1C19'
    ctx.font = `600 ${Math.round(row * (cols > 1 ? 0.24 : 0.3))}px ${font}`
    ctx.fillText(color.nome, textX, y + pad + row * 0.3, maxText)
    ctx.fillStyle = '#5D564E'
    ctx.font = `${Math.round(row * (cols > 1 ? 0.17 : 0.2))}px ${font}`
    const detail = cols > 1 ? color.codigo : `${color.marca} · ${color.codigo} · ${color.hex}`
    ctx.fillText(detail, textX, y + row - pad, maxText)
  })

  if (note) {
    // Etiqueta no canto da foto: deixa claro que a luz foi simulada
    const size = Math.round(row * 0.2)
    ctx.font = `600 ${size}px ${font}`
    const w = ctx.measureText(note).width + size * 1.4
    const h = size * 2
    const x = width - w - pad
    const y = height - h - pad
    ctx.fillStyle = 'rgb(20 18 16 / 0.62)'
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'middle'
    ctx.fillText(note, x + size * 0.7, y + h / 2)
  }

  return canvas
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/jpeg', 0.9),
  )

const fileName = (colors: readonly CatalogColor[]) =>
  (colors.length === 1 ? `parede-${colors[0].codigo}-${colors[0].nome}` : `parede-${colors.length}-cores`)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w-]+/g, '-')
    .toLowerCase() + '.jpg'

/** O navegador consegue compartilhar arquivos (menu nativo do celular)? Senão, a imagem é baixada. */
export function canShareImage(): boolean {
  try {
    const probe = new File([], 'x.jpg', { type: 'image/jpeg' })
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [probe] }) === true
  } catch {
    return false
  }
}

/** Abre o menu de compartilhar do aparelho ou, onde não houver, baixa o arquivo. */
export async function shareOrDownload(
  pixels: PixelBuffer,
  colors: readonly CatalogColor[],
  /** Aviso sobre a foto (ex.: luz simulada), também incluído no texto compartilhado. */
  note?: string,
): Promise<void> {
  const blob = await toBlob(renderExport(pixels, colors, note))
  const file = new File([blob], fileName(colors), { type: 'image/jpeg' })
  const names = colors.map((c) => `${c.nome} (${c.codigo})`)

  if (canShareImage()) {
    try {
      await navigator.share({
        files: [file],
        title: colors.length === 1 ? `Parede em ${colors[0].nome}` : 'Cores das paredes',
        text: [...names, ...(note ? [note] : [])].join('\n'),
      })
      return
    } catch (e) {
      // Usuário fechou o menu: não é erro
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Outras falhas (ex.: permissão negada): cai no download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
