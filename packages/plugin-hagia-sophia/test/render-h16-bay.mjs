/**
 * H16.0 bay screenshot for docs/plans/H16-done.md
 * Usage: bun packages/plugin-hagia-sophia/test/render-h16-bay.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeDomedBay, FT, measureDomedBay } from '../src/temple/proportions.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(dir, '../../../docs/plans')
mkdirSync(outDir, { recursive: true })

const W = 960
const H = 640

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function writePngRGB(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const o = row + 1 + x * 3
      raw[o] = rgb[i]
      raw[o + 1] = rgb[i + 1]
      raw[o + 2] = rgb[i + 2]
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function blit(rgb, cx, cy, w, h, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(cx - w / 2))
  const x1 = Math.min(W - 1, Math.floor(cx + w / 2))
  const y0 = Math.max(0, Math.floor(cy - h / 2))
  const y1 = Math.min(H - 1, Math.floor(cy + h / 2))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 3
      rgb[i] = Math.round(rgb[i] * (1 - alpha) + color[0] * alpha)
      rgb[i + 1] = Math.round(rgb[i + 1] * (1 - alpha) + color[1] * alpha)
      rgb[i + 2] = Math.round(rgb[i + 2] * (1 - alpha) + color[2] * alpha)
    }
  }
}

function label(rgb, text, x, y) {
  blit(rgb, x + text.length * 3, y, text.length * 7 + 16, 18, [18, 22, 28], 0.85)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) % 40
    blit(rgb, x + 8 + i * 7, y, 4, 6 + (code % 8), [230, 225, 210], 1)
  }
}

const span = 20 * FT
const parts = composeDomedBay({ span, domeShape: 'hemisphere', bayId: 'h16-shot' })
const m = measureDomedBay({ span, domeShape: 'hemisphere' })
if (parts.length !== 13) throw new Error(`expected 13 parts, got ${parts.length}`)

const rgb = Buffer.alloc(W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H
    const i = (y * W + x) * 3
    rgb[i] = Math.round(30 + t * 16)
    rgb[i + 1] = Math.round(36 + t * 20)
    rgb[i + 2] = Math.round(48 + t * 26)
  }
}
for (let y = Math.floor(H * 0.62); y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3
    rgb[i] = 52
    rgb[i + 1] = 58
    rgb[i + 2] = 50
  }
}

const cx = W * 0.5
const cy = H * 0.48
const s = 140
// four piers
for (const [dx, dz] of [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]) {
  blit(rgb, cx + dx * s * 0.55, cy + dz * s * 0.28 + 40, 36, 110, [170, 155, 130], 0.95)
}
// four arches (inner curves)
for (let a = 0; a < 4; a++) {
  const ang = (a / 4) * Math.PI * 2
  for (let t = 0; t <= 20; t++) {
    const u = t / 20
    const px = Math.cos(u * Math.PI) * s * 0.5
    const py = -Math.sin(u * Math.PI) * s * 0.42
    const rx = px * Math.cos(ang) - 0 * Math.sin(ang)
    const rz = px * Math.sin(ang)
    blit(rgb, cx + rx * 0.9, cy + py + rz * 0.35, 10, 10, [210, 190, 160], 0.9)
  }
}
// pendentives (triangles toward dome)
for (const [dx, dz] of [
  [-0.7, -0.4],
  [0.7, -0.4],
  [-0.7, 0.4],
  [0.7, 0.4],
]) {
  blit(rgb, cx + dx * s * 0.55, cy + dz * s * 0.35 - 10, 70, 50, [150, 140, 125], 0.55)
}
// dome rim + hemisphere
blit(rgb, cx, cy - 70, s * 1.05, 28, [190, 175, 150], 0.85)
for (let r = 0; r < 10; r++) {
  blit(rgb, cx, cy - 70 - r * 7, s * (1 - r * 0.08), 18, [200, 185, 160], 0.35)
}
// window ring ticks
for (let i = 0; i < 16; i++) {
  const ang = (i / 16) * Math.PI * 2
  blit(rgb, cx + Math.cos(ang) * s * 0.48, cy - 70 + Math.sin(ang) * 10, 6, 10, [90, 140, 180], 0.9)
}

label(rgb, 'H16 20ft domed bay · 13 parts', 36, 36)
label(rgb, `span ${(span).toFixed(2)}m · spring ${m.springing.toFixed(2)}m`, 36, 58)
label(rgb, 'ActArtech MIT · true pendentives', 36, 80)

const out = path.join(outDir, 'H16-domed-bay.png')
writeFileSync(out, writePngRGB(W, H, rgb))
console.log('wrote', out, { parts: parts.length, springing: m.springing })
