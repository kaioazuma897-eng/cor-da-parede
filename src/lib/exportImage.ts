import { hexToLab, isDark } from '../core/color'
import type { PixelBuffer } from '../core/image'
import type { CatalogColor } from '../core/matcher'

/**
 * Gera a imagem da prévia com uma faixa embaixo identificando a tinta (amostra, nome, código),
 * para quem recebe a foto (família, pintor, loja) saber exatamente qual cor pedir.
 */
export function renderExport(pixels: PixelBuffer, color: CatalogColor): HTMLCanvasElement {
  const { width, height } = pixels
  const strip = Math.max(72, Math.round(width * 0.09))
  const pad = Math.round(strip * 0.2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height + strip
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível')

  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), width, height), 0, 0)

  // Faixa clara, com a amostra da tinta à esquerda
  ctx.fillStyle = '#FFFDF9'
  ctx.fillRect(0, height, width, strip)
  const swatch = strip - pad * 2
  ctx.fillStyle = color.hex
  ctx.fillRect(pad, height + pad, swatch, swatch)
  if (!isDark(hexToLab(color.hex))) {
    // Amostra clara some sobre o fundo claro: contorno discreto
    ctx.strokeStyle = 'rgb(0 0 0 / 0.15)'
    ctx.lineWidth = Math.max(1, strip / 72)
    ctx.strokeRect(pad, height + pad, swatch, swatch)
  }

  const textX = pad * 2 + swatch
  const font = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1F1C19'
  ctx.font = `600 ${Math.round(strip * 0.3)}px ${font}`
  ctx.fillText(color.nome, textX, height + pad + strip * 0.3, width - textX - pad)
  ctx.fillStyle = '#5D564E'
  ctx.font = `${Math.round(strip * 0.2)}px ${font}`
  ctx.fillText(`${color.marca} · ${color.codigo} · ${color.hex}`, textX, height + strip - pad, width - textX - pad)

  return canvas
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/jpeg', 0.9),
  )

const fileName = (color: CatalogColor) =>
  `parede-${color.codigo}-${color.nome}`
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
export async function shareOrDownload(pixels: PixelBuffer, color: CatalogColor): Promise<void> {
  const blob = await toBlob(renderExport(pixels, color))
  const file = new File([blob], fileName(color), { type: 'image/jpeg' })

  if (canShareImage()) {
    try {
      await navigator.share({ files: [file], title: `Parede em ${color.nome}`, text: `${color.nome} (${color.codigo})` })
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
