/**
 * H14 flow screenshots — photo→prop and sketch→massing (visual stand-ins).
 * Usage: bun packages/plugin-eco/test/render-h14-flows.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'

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

function renderScene(build) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a2332)
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200)
  camera.position.set(4.5, 3.2, 5.5)
  camera.lookAt(0, 0.6, 0)

  const hemi = new THREE.HemisphereLight(0xddeeff, 0x334455, 0.85)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.1)
  sun.position.set(4, 8, 2)
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x2d3a2e, roughness: 0.95 }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  build(scene)

  // Software path: project simple shaded colors without WebGL (Bun headless).
  // Draw a fixed composition via orthographic-ish raster of known meshes.
  const rgb = Buffer.alloc(W * H * 3)
  // sky gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H
      const i = (y * W + x) * 3
      rgb[i] = Math.round(26 + t * 20)
      rgb[i + 1] = Math.round(35 + t * 25)
      rgb[i + 2] = Math.round(50 + t * 30)
    }
  }

  // ground band
  for (let y = Math.floor(H * 0.55); y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      rgb[i] = 45
      rgb[i + 1] = 58
      rgb[i + 2] = 46
    }
  }

  return { rgb, scene }
}

function blitBox(rgb, cx, cy, w, h, color, alpha = 1) {
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

function label(rgb, text, x, y, color = [230, 230, 220]) {
  // Minimal 5x7 bitmap for a few glyphs — just stamp a bar + caption strip.
  blitBox(rgb, x + text.length * 3, y, text.length * 7 + 16, 18, [20, 24, 30], 0.75)
  // Caption is encoded in filename; draw ticks representing letters.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) % 40
    blitBox(rgb, x + 8 + i * 7, y, 4, 6 + (code % 8), color, 1)
  }
}

function main() {
  // Photo → prop: opaque small object on ground
  {
    const { rgb } = renderScene((scene) => {
      const prop = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.9, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.6 }),
      )
      prop.position.set(0, 0.45, 0)
      prop.name = 'photo-prop'
      scene.add(prop)
    })
    blitBox(rgb, W * 0.5, H * 0.48, 70, 100, [196, 165, 116], 1)
    blitBox(rgb, W * 0.5, H * 0.42, 78, 18, [160, 120, 80], 1)
    label(rgb, 'H14 photo to prop', 40, 36)
    label(rgb, 'atlas Meshy object', 40, 58)
    const out = path.join(outDir, 'H14-photo-prop.png')
    writeFileSync(out, writePngRGB(W, H, rgb))
    console.log('wrote', out)
  }

  // Sketch → massing: large semi-transparent massing + faint wall traces
  {
    const { rgb } = renderScene(() => {})
    // translucent massing volume
    blitBox(rgb, W * 0.5, H * 0.4, 280, 180, [120, 170, 210], 0.35)
    blitBox(rgb, W * 0.5, H * 0.4, 280, 180, [80, 120, 160], 0.15)
    // locked badge strip
    blitBox(rgb, W * 0.5, H * 0.22, 200, 22, [40, 50, 60], 0.85)
    // wall-trace rectangles (opaque lines)
    blitBox(rgb, W * 0.38, H * 0.5, 8, 140, [220, 200, 160], 0.9)
    blitBox(rgb, W * 0.62, H * 0.5, 8, 140, [220, 200, 160], 0.9)
    blitBox(rgb, W * 0.5, H * 0.62, 220, 8, [220, 200, 160], 0.9)
    label(rgb, 'H14 sketch massing', 40, 36)
    label(rgb, 'locked not walkable', 40, 58)
    const out = path.join(outDir, 'H14-sketch-massing.png')
    writeFileSync(out, writePngRGB(W, H, rgb))
    console.log('wrote', out)
  }
}

main()
