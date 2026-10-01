/**
 * Conversões de cor: sRGB (0–255) ⇄ CIE XYZ ⇄ CIE L*a*b*.
 * Iluminante de referência D65, observador 2°.
 */

export type RGB = { r: number; g: number; b: number }
export type Lab = { L: number; a: number; b: number }

// Branco de referência D65
const XN = 0.95047
const YN = 1.0
const ZN = 1.08883

// Constantes CIE exatas (evitam a descontinuidade das versões arredondadas)
const EPSILON = 216 / 24389
const KAPPA = 24389 / 27

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]
export type Vec3 = readonly [number, number, number]

/** sRGB linear → XYZ (D65). */
export const RGB_TO_XYZ: Mat3 = [
  0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041,
]

/** XYZ (D65) → sRGB linear. */
export const XYZ_TO_RGB: Mat3 = [
  3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252,
]

export const D65_WHITE: Vec3 = [XN, YN, ZN]

export function mulMatVec(m: Mat3, v: Vec3): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return r as unknown as Mat3
}

/** Remove a curva gamma do sRGB: valor 0–255 → intensidade linear 0–1. */
export function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Aplica a curva gamma do sRGB: intensidade linear 0–1 → valor 0–255. */
export function linearToSrgb(linear: number): number {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
  return c * 255
}

function labF(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116
}

function labFInverse(f: number): number {
  const f3 = f ** 3
  return f3 > EPSILON ? f3 : (116 * f - 16) / KAPPA
}

export function rgbToLab({ r, g, b }: RGB): Lab {
  const [X, Y, Z] = mulMatVec(RGB_TO_XYZ, [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)])

  const fx = labF(X / XN)
  const fy = labF(Y / YN)
  const fz = labF(Z / ZN)

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** Lab → sRGB. Cores fora do gamut sRGB são cortadas para 0–255. */
export function labToRgb({ L, a, b }: Lab): RGB {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200

  const X = labFInverse(fx) * XN
  const Y = (L > KAPPA * EPSILON ? fy ** 3 : L / KAPPA) * YN
  const Z = labFInverse(fz) * ZN

  const [R, G, B] = mulMatVec(XYZ_TO_RGB, [X, Y, Z])

  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(linearToSrgb(v))))
  return { r: clamp(R), g: clamp(G), b: clamp(B) }
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Hex inválido: ${hex}`)
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export const hexToLab = (hex: string): Lab => rgbToLab(hexToRgb(hex))
export const labToHex = (lab: Lab): string => rgbToHex(labToRgb(lab))

/** Contraste aproximado: texto claro ou escuro sobre esta cor. */
export function isDark(lab: Lab): boolean {
  return lab.L < 60
}
