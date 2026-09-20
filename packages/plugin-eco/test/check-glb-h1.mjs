/**
 * H1 — GLB optimise + hard audit (fails the export, not a warning).
 * Usage: bun packages/plugin-eco/test/check-glb-h1.mjs [path/to/oak-leaf.glb]
 *
 * Ceilings (stated, consistent):
 * - Compat file ≤ 500 KB
 * - AABB each axis ∈ [0.5 m, 500 m]
 * - Textures power-of-two, edge ≤ 512
 * - One mesh / draw call per material
 * - Y-up + z-south (design scale.z < 0; walk north walls z < 0)
 *
 * Drawn from pascalorg/skills glb-web-export (MIT).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import {
  assertHardGlbAudit,
  auditGlb,
  ECO_GLB_MAX_BYTES,
  ECO_GLB_MAX_EXTENT_M,
  ECO_GLB_MAX_TEX_DIM,
  ECO_GLB_MIN_EXTENT_M,
  formatExportSizeLabel,
} from '../src/glb-audit.ts'
import { optimiseGlb } from '../src/glb-optimise.ts'
import { ensureFileReaderPolyfill, exportEcoGlb } from '../src/export-glb.ts'

const dir = path.dirname(fileURLToPath(import.meta.url))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

ensureFileReaderPolyfill()

assert(ECO_GLB_MAX_BYTES === 500 * 1024, 'compat ceiling 500 KB')
assert(ECO_GLB_MIN_EXTENT_M === 0.5, 'min axis 0.5 m')
assert(ECO_GLB_MAX_EXTENT_M === 500, 'max axis 500 m')
assert(ECO_GLB_MAX_TEX_DIM === 512, 'texture ceiling 512')

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
  maxBytes: ECO_GLB_MAX_BYTES,
})
assert(exported.buffer.byteLength > 0, 'export buffer')
assert(exported.buffer.byteLength < ECO_GLB_MAX_BYTES, 'house under 500 KB')
assert(exported.optimise.afterBytes === exported.buffer.byteLength, 'optimise meta')
assert(
  exported.sizeLabel ===
    formatExportSizeLabel(exported.optimise.beforeBytes, exported.optimise.afterBytes),
  `sizeLabel must match pack numbers, got ${exported.sizeLabel}`,
)
{
  const houseReport = await auditGlb(exported.buffer)
  assertHardGlbAudit(houseReport, { maxBytes: ECO_GLB_MAX_BYTES })
  assert(
    !houseReport.extensionsRequired.includes('EXT_meshopt_compression'),
    'parametric house must fit without meshopt (compression is headroom)',
  )
  assert(houseReport.frame.walkPresent, 'walk extras on export')
  assert(houseReport.frame.northWallsNegativeZ.length >= 1, 'north wall z < 0 in walk')
  // designScaleZ may be baked to +1 by GLTFExporter — walk signs are the gate
  assert(houseReport.frame.walkMinZ !== null && houseReport.frame.walkMinZ < 0, 'walk min z south')
  assert(houseReport.counts.meshes <= houseReport.counts.materials, 'one mesh per material')
  assert(houseReport.drawCalls <= houseReport.counts.materials, 'one draw per material')
  for (const t of houseReport.textures) {
    assert(t.powerOfTwo, `texture ${t.width}x${t.height} PoT`)
    assert(t.width <= ECO_GLB_MAX_TEX_DIM && t.height <= ECO_GLB_MAX_TEX_DIM, 'tex ceiling')
  }
  const size = houseReport.worldBounds.sizeMeters
  assert(size, 'bounds')
  for (const e of size) {
    assert(e >= ECO_GLB_MIN_EXTENT_M && e <= ECO_GLB_MAX_EXTENT_M, `axis ${e}`)
  }
}
console.log('exportEcoGlb house OK', {
  sizeLabel: exported.sizeLabel,
  before: exported.optimise.beforeBytes,
  after: exported.optimise.afterBytes,
  profile: exported.optimise.profile,
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

async function exportRawScene(build) {
  ensureFileReaderPolyfill()
  const scene = new THREE.Scene()
  build(scene)
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (out) => (out instanceof ArrayBuffer ? resolve(out) : reject(new Error('not binary'))),
      reject,
      { binary: true },
    )
  })
}

// --- HARD FAIL: deliberately huge-scale model ---
{
  const glb = await exportRawScene((scene) => {
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5000, 5000, 5000), new THREE.MeshBasicMaterial())
    mesh.name = 'broken-scale'
    g.add(mesh)
    scene.add(g)
  })
  const report = await auditGlb(glb)
  let threw = false
  try {
    assertHardGlbAudit(report, {
      maxBytes: 50 * 1024 * 1024,
      skipFrame: true,
      skipMeshBudget: true,
    })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('HARD FAIL'), 'hard fail message')
    assert(String(e.message).includes('above max'), 'scale failure')
  }
  assert(threw, 'oversized world extent must hard-fail')
  console.log('oversized scale hard-fail OK', report.worldBounds.sizeMeters)
}

// --- HARD FAIL: cm-scale (under 0.5 m) ---
{
  const glb = await exportRawScene((scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.027, 0.08), new THREE.MeshBasicMaterial())
    scene.add(mesh)
  })
  const report = await auditGlb(glb)
  let threw = false
  try {
    assertHardGlbAudit(report, {
      maxBytes: 50 * 1024 * 1024,
      skipFrame: true,
      skipMeshBudget: true,
    })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('below min'), 'cm-scale failure')
  }
  assert(threw, 'sub-0.5 m extent must hard-fail')
  console.log('cm-scale hard-fail OK', report.worldBounds.sizeMeters)
}

// --- HARD FAIL: empty scene (no meshes) ---
{
  const glb = await exportRawScene((scene) => {
    scene.add(new THREE.Group())
  })
  const report = await auditGlb(glb)
  let threw = false
  try {
    assertHardGlbAudit(report, { skipFrame: true })
  } catch {
    threw = true
  }
  assert(threw, 'empty mesh scene must hard-fail')
  console.log('empty scene hard-fail OK')
}

// --- HARD FAIL: one mesh per element (meshes > materials) ---
{
  const fake = {
    bytes: 1000,
    gzipBytes: 100,
    brotliBytes: 80,
    worldBounds: { min: [0, 0, 0], max: [8, 2.7, 8], sizeMeters: [8, 2.7, 8] },
    drawCalls: 5,
    triangles: 60,
    textureVramMiB: 0,
    textures: [],
    frame: {
      designScaleZ: -1,
      walkPresent: true,
      walkMinZ: -4,
      walkMaxZ: 4,
      northWallsNegativeZ: ['wall:wN'],
    },
    counts: { nodes: 5, meshes: 5, materials: 1, textures: 0, animations: 0, skins: 0 },
    namedNodes: [],
    extensionsUsed: [],
    extensionsRequired: [],
  }
  let threw = false
  try {
    assertHardGlbAudit(fake, { maxBytes: 50 * 1024 * 1024 })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('one mesh per material'), String(e.message))
  }
  assert(threw, 'meshes>materials must hard-fail')
  console.log('mesh-per-element hard-fail OK')
}

// --- HARD FAIL: non-PoT / oversize texture ---
{
  const fake = {
    bytes: 1000,
    gzipBytes: 100,
    brotliBytes: 80,
    worldBounds: { min: [0, 0, 0], max: [8, 2.7, 8], sizeMeters: [8, 2.7, 8] },
    drawCalls: 1,
    triangles: 12,
    textureVramMiB: 1,
    textures: [{ width: 100, height: 100, powerOfTwo: false }],
    frame: {
      designScaleZ: -1,
      walkPresent: false,
      walkMinZ: null,
      walkMaxZ: null,
      northWallsNegativeZ: [],
    },
    counts: { nodes: 1, meshes: 1, materials: 1, textures: 1, animations: 0, skins: 0 },
    namedNodes: [],
    extensionsUsed: [],
    extensionsRequired: [],
  }
  let threw = false
  try {
    assertHardGlbAudit(fake, { maxBytes: 50 * 1024 * 1024, skipFrame: true })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('power-of-two'), String(e.message))
  }
  assert(threw, 'non-PoT texture must hard-fail')

  fake.textures = [{ width: 1024, height: 1024, powerOfTwo: true }]
  threw = false
  try {
    assertHardGlbAudit(fake, { maxBytes: 50 * 1024 * 1024, skipFrame: true })
  } catch (e) {
    threw = true
    assert(String(e.message).includes('exceeds max'), String(e.message))
  }
  assert(threw, '1024 texture must hard-fail at 512 ceiling')
  console.log('texture hard-fail OK')
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
    sizeLabel: formatExportSizeLabel(compat.beforeBytes, compat.afterBytes),
  })

  const web = await optimiseGlb(raw, 'web')
  const after = await auditGlb(web.buffer)
  // Massing GLB is not an eco export — skip frame / mesh-budget gates.
  assertHardGlbAudit(after, {
    maxBytes: ECO_GLB_MAX_BYTES,
    skipFrame: true,
    skipMeshBudget: true,
  })
  assert(web.afterBytes < ECO_GLB_MAX_BYTES, `Oak Leaf after ${web.afterBytes} must be < 500 KB`)
  const outPath = path.join(dir, 'oak-leaf.web.glb')
  writeFileSync(outPath, Buffer.from(web.buffer))
  console.log('Oak Leaf web optimise OK (meshopt headroom)', {
    sizeLabel: formatExportSizeLabel(web.beforeBytes, web.afterBytes),
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
