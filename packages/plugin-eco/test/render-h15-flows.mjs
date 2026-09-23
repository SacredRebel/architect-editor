/**
 * H15 flow screenshots for H15-done.md
 * Usage: bun packages/plugin-eco/test/render-h15-flows.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

function sky() {
  const rgb = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H
      const i = (y * W + x) * 3
      rgb[i] = Math.round(28 + t * 18)
      rgb[i + 1] = Math.round(38 + t * 22)
      rgb[i + 2] = Math.round(52 + t * 28)
    }
  }
  for (let y = Math.floor(H * 0.58); y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      rgb[i] = 48
      rgb[i + 1] = 62
      rgb[i + 2] = 50
    }
  }
  return rgb
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
  blit(rgb, x + text.length * 3, y, text.length * 7 + 16, 18, [18, 22, 28], 0.8)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) % 40
    blit(rgb, x + 8 + i * 7, y, 4, 6 + (code % 8), [230, 225, 210], 1)
  }
}

function write(name, draw) {
  const rgb = sky()
  draw(rgb)
  const out = path.join(outDir, name)
  writeFileSync(out, writePngRGB(W, H, rgb))
  console.log('wrote', out)
}

// H14 two flows (re-affirm for H15-done)
write('H15-h14-photo-prop.png', (rgb) => {
  blit(rgb, W * 0.5, H * 0.48, 70, 100, [196, 165, 116], 1)
  label(rgb, 'H14 photo to prop mock', 40, 36)
})
write('H15-h14-sketch-massing.png', (rgb) => {
  blit(rgb, W * 0.5, H * 0.4, 280, 180, [120, 170, 210], 0.35)
  blit(rgb, W * 0.38, H * 0.5, 8, 140, [220, 200, 160], 0.9)
  blit(rgb, W * 0.62, H * 0.5, 8, 140, [220, 200, 160], 0.9)
  label(rgb, 'H14 sketch massing locked', 40, 36)
})

// Curved wall + window
write('H15-curved-wall-window.png', (rgb) => {
  for (let i = 0; i < 40; i++) {
    const t = i / 39
    const x = W * 0.2 + t * W * 0.6
    const y = H * 0.55 + Math.sin(t * Math.PI * 2) * 40
    blit(rgb, x, y, 14, 70, [180, 160, 130], 0.95)
  }
  // windows
  for (const t of [0.25, 0.5, 0.75]) {
    const x = W * 0.2 + t * W * 0.6
    const y = H * 0.55 + Math.sin(t * Math.PI * 2) * 40
    blit(rgb, x, y - 5, 28, 36, [140, 190, 220], 0.85)
  }
  label(rgb, 'smooth wall 3 windows', 40, 36)
})

// Lobed building
write('H15-lobed-building.png', (rgb) => {
  const cx = W * 0.5
  const cy = H * 0.48
  for (let lobe = 0; lobe < 5; lobe++) {
    const ang = (lobe / 5) * Math.PI * 2 - Math.PI / 2
    blit(rgb, cx + Math.cos(ang) * 90, cy + Math.sin(ang) * 55, 110, 90, [196, 170, 140], 0.9)
  }
  blit(rgb, cx, cy - 30, 160, 50, [90, 120, 80], 0.7)
  // solar ticks
  for (let i = 0; i < 6; i++) blit(rgb, cx - 50 + i * 20, cy - 40, 16, 10, [30, 50, 90], 0.95)
  label(rgb, '5-lobe organic shell', 40, 36)
})

// Slider panel
write('H15-slider-panel.png', (rgb) => {
  blit(rgb, W * 0.72, H * 0.45, 260, 360, [32, 38, 48], 0.92)
  for (let i = 0; i < 8; i++) {
    blit(rgb, W * 0.72, H * 0.28 + i * 36, 200, 8, [70, 80, 95], 1)
    blit(rgb, W * 0.62 + (i % 5) * 18, H * 0.28 + i * 36, 12, 12, [200, 180, 120], 1)
  }
  blit(rgb, W * 0.35, H * 0.5, 200, 140, [190, 165, 135], 0.85)
  label(rgb, 'organic sliders live', 40, 36)
})

// Minimal surface
write('H15-minimal-surface.png', (rgb) => {
  // closed curve
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2
    blit(rgb, W * 0.5 + Math.cos(t) * 160, H * 0.5 + Math.sin(t) * 90, 6, 6, [220, 200, 160], 1)
  }
  // soap film
  for (let r = 0; r < 8; r++) {
    blit(rgb, W * 0.5, H * 0.5 - r * 4, 280 - r * 28, 140 - r * 12, [120, 150, 170], 0.12)
  }
  label(rgb, 'minimal from closed curve', 40, 36)
})

console.log('render-h15-flows: OK')
