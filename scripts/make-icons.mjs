/**
 * Gera os ícones PNG do app (iPhone exige PNG para a tela inicial) sem dependências:
 * desenha o logotipo com supersampling e codifica o PNG com zlib do Node.
 *
 *   node scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [246, 242, 236]
const DOTS = [
  { color: [184, 96, 62], dx: -0.21 },
  { color: [209, 161, 46], dx: 0 },
  { color: [40, 88, 102], dx: 0.21 },
]

/** `scale`: fração do ícone ocupada pelo logotipo (menor nos ícones "maskable"). */
function draw(size, scale) {
  const SS = 4 // amostras por eixo
  const px = new Uint8Array(size * size * 3)
  const r = 0.17 * scale
  const ring = 0.025 * scale
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size - 0.5
          const v = (y + (sy + 0.5) / SS) / size - 0.5
          let c = BG
          // Desenha da esquerda para a direita; cada bolinha tem um anel da cor de fundo
          for (const d of DOTS) {
            const dist = Math.hypot(u - d.dx * scale, v)
            if (dist < r) c = d.color
            else if (dist < r + ring && c !== BG) c = BG
          }
          acc[0] += c[0]
          acc[1] += c[1]
          acc[2] += c[2]
        }
      }
      const i = (y * size + x) * 3
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(acc[k] / (SS * SS))
    }
  }
  return png(size, px)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8 bits, RGB, sem entrelaçamento
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0 // filtro "none"
    raw.set(rgb.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
const icons = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.75], // área segura: o sistema pode recortar as bordas
]
for (const [name, size, scale] of icons) {
  writeFileSync(`public/icons/${name}`, draw(size, scale))
  console.log(`public/icons/${name}`)
}
