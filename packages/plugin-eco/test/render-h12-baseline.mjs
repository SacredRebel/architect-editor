/**
 * H12.0 / H8 visual baseline — fixed camera, seed, light → PNG.
 *
 * Usage:
 *   bun packages/plugin-eco/test/render-h12-baseline.mjs before
 *   bun packages/plugin-eco/test/render-h12-baseline.mjs after
 *
 * "before" = grey plastic leaf (no presentation materials/lighting).
 * "after"  = full H12 materials + site sun + IBL-ish hemisphere.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { buildShellObject3D } from '../src/eco-shell-geometry.ts'
import { makeDefaultLeafShell } from '../src/eco-shell-store.ts'
import { createEcoThreeMaterial } from '../src/eco-materials.ts'
import { sunDirectionAt } from '../src/eco-site-sun.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(dir, '../../../docs/plans/h12-baseline')
mkdirSync(outDir, { recursive: true })

const MODE = (process.argv[2] || 'before').toLowerCase()
const W = 960
const H = 640
/** Fixed seed — reserved for future stochastic materials. */
const SEED = 0xec0120

// Ojai / Sulphur Mountain approx
const LAT = 34.448
const LON = -119.243
const NORTH_DEG = 0
/** Fixed civil time for regression: 2026-06-21 15:00 local (UTC-7). */
const WHEN = new Date(Date.UTC(2026, 5, 21, 22, 0, 0))

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

/** Minimal RGB PNG writer (no deps). */
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
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function buildScene(mode) {
  const shell = makeDefaultLeafShell('h12-baseline-leaf')
  shell.rise = 1
  let mat
  if (mode === 'after') {
    mat = createEcoThreeMaterial('living-roof', { doubleSide: true })
  } else {
    mat = new THREE.MeshStandardMaterial({
      name: 'grey-plastic',
      color: 0x9a9a9a,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  }
  const obj = buildShellObject3D(shell, mat, mode === 'after' ? 'living-roof' : undefined)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(mode === 'after' ? 0xb8d4e8 : 0xd0d0d0)
  scene.add(obj)

  // Software rasterizer reads shade.* (scene lights are documentary / R3F parity).
  // After: stronger fill so living-roof #5d7a55 reads green, not near-black.
  let shade
  if (mode === 'after') {
    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x6b5a45, 0.85)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.0)
    const dir = sunDirectionAt(LAT, LON, WHEN, NORTH_DEG)
    sun.position.set(dir.x * 40, dir.y * 40, dir.z * 40)
    scene.add(sun)
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    shade = { ambient: 0.55, sun: 0.55, exposure: 1.2 }
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 0.65)
    key.position.set(12, 18, 10)
    scene.add(key)
    shade = { ambient: 0.32, sun: 0.9, exposure: 1.0 }
  }
  return {
    scene,
    shell,
    lightDir: mode === 'after' ? sunDirectionAt(LAT, LON, WHEN, NORTH_DEG) : { x: 0.4, y: 0.85, z: 0.35 },
    shade,
  }
}

/** Software rasterize with fixed camera — no WebGL dependency. */
function renderRGB(scene, width, height, lightDirIn, shade = { ambient: 0.25, sun: 1, exposure: 1 }) {
  const cam = new THREE.PerspectiveCamera(45, width / height, 0.5, 200)
  cam.position.set(22, 14, 18)
  cam.lookAt(0, 5, 0)
  cam.updateMatrixWorld(true)
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)

  const zbuf = new Float32Array(width * height)
  zbuf.fill(Infinity)
  const rgb = new Uint8Array(width * height * 3)
  // background — Color is linear; write display sRGB
  const bgLin = scene.background
  const bg = bgLin.clone().convertLinearToSRGB()
  const br = Math.round(bg.r * 255)
  const bgG = Math.round(bg.g * 255)
  const bb = Math.round(bg.b * 255)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = br
    rgb[i * 3 + 1] = bgG
    rgb[i * 3 + 2] = bb
  }

  const lightDir = new THREE.Vector3(lightDirIn.x, lightDirIn.y, lightDirIn.z).normalize()
  const v0 = new THREE.Vector3()
  const v1 = new THREE.Vector3()
  const v2 = new THREE.Vector3()
  const n = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()

  scene.updateMatrixWorld(true)
  scene.traverse((obj) => {
    const mesh = obj
    if (!mesh.isMesh) return
    const geo = mesh.geometry
    const pos = geo.attributes.position
    if (!pos) return
    const idx = geo.index
    // Three stores material.color in linear; PNG needs display sRGB.
    const linear = mesh.material.color || new THREE.Color(0x9a9a9a)
    const color = linear.clone().convertLinearToSRGB()
    const mw = mesh.matrixWorld
    const triCount = idx ? idx.count / 3 : pos.count / 3

    for (let t = 0; t < triCount; t++) {
      let i0
      let i1
      let i2
      if (idx) {
        i0 = idx.getX(t * 3)
        i1 = idx.getX(t * 3 + 1)
        i2 = idx.getX(t * 3 + 2)
      } else {
        i0 = t * 3
        i1 = t * 3 + 1
        i2 = t * 3 + 2
      }
      v0.fromBufferAttribute(pos, i0).applyMatrix4(mw)
      v1.fromBufferAttribute(pos, i1).applyMatrix4(mw)
      v2.fromBufferAttribute(pos, i2).applyMatrix4(mw)
      e1.subVectors(v1, v0)
      e2.subVectors(v2, v0)
      n.crossVectors(e1, e2).normalize()
      // Double-sided: flip normal toward light if needed
      let ndl = n.dot(lightDir)
      if (ndl < 0) ndl = -ndl
      // ambient + sun*N·L, then exposure (scene hemi/ambient not sampled otherwise)
      const lit = Math.min(1, (shade.ambient + ndl * shade.sun) * shade.exposure)
      const cr = Math.min(255, Math.round(color.r * 255 * lit))
      const cg = Math.min(255, Math.round(color.g * 255 * lit))
      const cb = Math.min(255, Math.round(color.b * 255 * lit))

      const p0 = project(v0, vp, width, height)
      const p1 = project(v1, vp, width, height)
      const p2 = project(v2, vp, width, height)
      if (!p0 || !p1 || !p2) continue
      rasterTri(rgb, zbuf, width, height, p0, p1, p2, cr, cg, cb)
    }
  })

  return rgb
}

function project(v, vp, width, height) {
  const c = new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(vp)
  if (c.w === 0) return null
  const ndcX = c.x / c.w
  const ndcY = c.y / c.w
  const ndcZ = c.z / c.w
  if (ndcZ < -1 || ndcZ > 1) return null
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
    z: ndcZ,
  }
}

function rasterTri(rgb, zbuf, w, h, a, b, c, cr, cg, cb) {
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)))
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)))
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
  const area = edge(a, b, c)
  if (Math.abs(area) < 1e-8) return
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = { x: x + 0.5, y: y + 0.5 }
      const w0 = edge(b, c, p) / area
      const w1 = edge(c, a, p) / area
      const w2 = edge(a, b, p) / area
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const z = w0 * a.z + w1 * b.z + w2 * c.z
      const i = y * w + x
      if (z >= zbuf[i]) continue
      zbuf[i] = z
      rgb[i * 3] = cr
      rgb[i * 3 + 1] = cg
      rgb[i * 3 + 2] = cb
    }
  }
}

function edge(a, b, c) {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)
}

const { scene, lightDir, shade } = buildScene(MODE === 'after' ? 'after' : 'before')
const rgb = renderRGB(scene, W, H, lightDir, shade)
const png = writePngRGB(W, H, rgb)
const outName = MODE === 'after' ? 'after.png' : 'before.png'
const outPath = path.join(outDir, outName)
writeFileSync(outPath, png)

const meta = {
  mode: MODE === 'after' ? 'after' : 'before',
  seed: SEED,
  width: W,
  height: H,
  camera: { position: [22, 14, 18], target: [0, 5, 0], fov: 45 },
  site: { lat: LAT, lon: LON, when: WHEN.toISOString(), northDeg: NORTH_DEG },
  shade,
  bytes: png.byteLength,
  wrote: outPath,
}
writeFileSync(path.join(outDir, `${MODE === 'after' ? 'after' : 'before'}.json`), JSON.stringify(meta, null, 2))
console.log('render-h12-baseline OK', meta)
