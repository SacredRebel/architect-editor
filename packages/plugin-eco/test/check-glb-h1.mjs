/**
 * H1 — GLB optimise + hard audit.
 * Usage: bun packages/plugin-eco/test/check-glb-h1.mjs [path/to/oak-leaf.glb]
 *
 * Drawn from pascalorg/skills glb-web-export (MIT).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { assertHardGlbAudit, auditGlb } from '../src/glb-audit.ts'
import { optimiseGlb } from '../src/glb-optimise.ts'
import { ensureFileReaderPolyfill, exportEcoGlb } from '../src/export-glb.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

ensureFileReaderPolyfill()

// --- tiny valid house through exportEcoGlb (compat) ---
const houseNodes = {
  site: { id: 'site', type: 'site', children: ['bldg'] },
  bldg: { id: 'bldg', type: 'building', parentId: 'site', children: ['L0'] },
  L0: {
    id: 'L0',
    type: 'level',
    parentId: 'bldg',
    height: 2.7,
    baseElevation: 0,
    children: ['slab0', 'wN', 'wS', 'wE', 'wW'],
  },
  slab0: {
    id: 'slab0',
    type: 'slab',
    parentId: 'L0',
    polygon: [
      [-4, -4],
      [4, -4],
      [4, 4],
      [-4, 4],
    ],
    elevation: 0.05,
    thickness: 0.05,
  },
  wN: { id: 'wN', type: 'wall', parentId: 'L0', start: [-4, 4], end: [4, 4], thickness: 0.2, height: 2.7, children: [] },
  wS: { id: 'wS', type: 'wall', parentId: 'L0', start: [4, -4], end: [-4, -4], thickness: 0.2, height: 2.7, children: [] },
  wE: { id: 'wE', type: 'wall', parentId: 'L0', start: [4, 4], end: [4, -4], thickness: 0.2, height: 2.7, children: [] },
  wW: { id: 'wW', type: 'wall', parentId: 'L0', start: [-4, -4], end: [-4, 4], thickness: 0.2, height: 2.7, children: [] },
}

const exported = await exportEcoGlb({
  nodes: houseNodes,
  includePlacedAssets: false,
  optimiseProfile: 'compat',
  maxBytes: 500 * 1024,
})
assert(exported.buffer.byteLength > 0, 'export buffer')
assert(exported.buffer.byteLength < 500 * 1024, 'house under 500 KB')
assert(exported.optimise?.afterBytes === exported.buffer.byteLength, 'optimise meta')
{
  const houseReport = await auditGlb(exported.buffer)
  assert(
    !houseReport.extensionsRequired.includes('EXT_meshopt_compression'),
    'parametric house must fit without meshopt (compression is headroom)',
  )
}
console.log('exportEcoGlb house OK', {
  before: exported.optimise?.beforeBytes,
  after: exported.optimise?.afterBytes,
  profile: exported.optimise?.profile,
})

// --- HARD FAIL: empty / corrupt ---
{
  let threw = false
  try {
    await auditGlb(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))
  } catch {
    threw = true
  }
  assert(threw, 'corrupt GLB must fail audit parse')
  console.log('corrupt GLB hard-fail OK')
}

// --- HARD FAIL: deliberately huge-scale model ---
{
  ensureFileReaderPolyfill()
  const g = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(5000, 5000, 5000), new THREE.MeshBasicMaterial())
  mesh.name = 'broken-scale'
  g.add(mesh)
  const scene = new THREE.Scene()
  scene.add(g)
  const exporter = new GLTFExporter()
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (out) => (out instanceof ArrayBuffer ? resolve(out) : reject(new Error('not binary'))),
      reject,
      { binary: true },
    )
  })
  const report = await auditGlb(glb)
  let threw = false
  try {
    assertHardGlbAudit(report, { maxBytes: 50 * 1024 * 1024 })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('HARD FAIL'), 'hard fail message')
    assert(String(e.message).includes('max'), 'scale failure')
  }
  assert(threw, 'oversized world extent must hard-fail')
  console.log('oversized scale hard-fail OK', report.worldBounds.sizeMeters)
}

// --- HARD FAIL: empty scene (no meshes) ---
{
  const scene = new THREE.Scene()
  scene.add(new THREE.Group())
  const exporter = new GLTFExporter()
  const glb = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (out) => (out instanceof ArrayBuffer ? resolve(out) : reject(new Error('not binary'))),
      reject,
      { binary: true },
    )
  })
  const report = await auditGlb(glb)
  let threw = false
  try {
    assertHardGlbAudit(report)
  } catch {
    threw = true
  }
  assert(threw, 'empty mesh scene must hard-fail')
  console.log('empty scene hard-fail OK')
}

// --- Oak Leaf (optional path or OAK_LEAF_GLB env) ---
const oakArg = process.argv[2] || process.env.OAK_LEAF_GLB || ''
const oakPath = oakArg
  ? path.resolve(oakArg)
  : path.join(dir, 'oak-leaf.glb')

if (existsSync(oakPath)) {
  const raw = readFileSync(oakPath)
  assert(raw.byteLength > 500 * 1024, `Oak Leaf fixture should start large (got ${raw.byteLength})`)
  const before = await auditGlb(raw)
  console.log('Oak Leaf before', {
    bytes: before.bytes,
    triangles: before.triangles,
    textures: before.counts.textures,
    sizeM: before.worldBounds.sizeMeters,
  })
  // Sparse bar: prefer empty extensionsRequired. Oak Leaf massing is dense —
  // compat alone stays over 500 KB; meshopt headroom brings it under.
  const compat = await optimiseGlb(raw, 'compat')
  const compatReport = await auditGlb(compat.buffer)
  console.log('Oak Leaf compat (no meshopt)', {
    before: compat.beforeBytes,
    after: compat.afterBytes,
    under500k: compat.afterBytes < 500 * 1024,
    extensionsRequired: compatReport.extensionsRequired,
  })

  const web = await optimiseGlb(raw, 'web')
  const after = await auditGlb(web.buffer)
  assertHardGlbAudit(after, { maxBytes: 500 * 1024 })
  assert(web.afterBytes < 500 * 1024, `Oak Leaf after ${web.afterBytes} must be < 500 KB`)
  const outPath = path.join(dir, 'oak-leaf.web.glb')
  writeFileSync(outPath, Buffer.from(web.buffer))
  console.log('Oak Leaf web optimise OK (meshopt headroom)', {
    before: web.beforeBytes,
    after: web.afterBytes,
    ratio: Number((web.afterBytes / web.beforeBytes).toFixed(3)),
    triangles: after.triangles,
    extensionsRequired: after.extensionsRequired,
    wrote: outPath,
    finding:
      compat.afterBytes >= 500 * 1024
        ? 'massing needs meshopt to fit — geometry density is wrong first; parametric exports must stay sparse'
        : 'fits without meshopt',
  })
} else {
  console.log('Oak Leaf GLB not present — skip size proof (pass path as argv or OAK_LEAF_GLB)')
}

console.log('check-glb-h1 OK')
