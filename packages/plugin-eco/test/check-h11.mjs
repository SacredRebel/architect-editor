/**
 * H11 — image-to-3D selection + export helper smoke (no weight download).
 * Usage: bun packages/plugin-eco/test/check-h11.mjs
 */
import { Document } from '@gltf-transform/core'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IMAGE3D_BANNED_IDS,
  IMAGE3D_MODELS,
  IMAGE3D_QUALITY_FIRST_PICK,
  IMAGE3D_SCOPE_NOTE,
  IMAGE3D_WIRE_FIRST,
  createImage3dBackend,
  isBannedImage3dId,
} from '../src/eco-image3d.ts'
import {
  applyUniformScale,
  applyZForwardToWorldZSouth,
  measureGlbExtents,
  prepareImage3dGlb,
  scaleFactorForKnownDimension,
} from '../src/eco-image3d-export.ts'
import { createGlbIo } from '../src/glb-audit.ts'

const here = dirname(fileURLToPath(import.meta.url))

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

/** Tiny unit cube GLB for scale / axis tests — no HF weights. */
async function makeUnitCubeGlb() {
  const io = await createGlbIo()
  const doc = new Document()
  const buffer = doc.createBuffer()
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(
      new Float32Array([
        // unit cube corners roughly spanning [0,1]^3
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
      ]),
    )
    .setBuffer(buffer)
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(
      new Uint16Array([
        0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 1, 5, 6, 1, 6, 2, 0,
        3, 7, 0, 7, 4,
      ]),
    )
    .setBuffer(buffer)
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices)
  const mesh = doc.createMesh('cube').addPrimitive(prim)
  const node = doc.createNode('cube').setMesh(mesh)
  const scene = doc.createScene('s').addChild(node)
  doc.getRoot().setDefaultScene(scene)
  const bin = await io.writeBinary(doc)
  const copy = new Uint8Array(bin.byteLength)
  copy.set(bin)
  return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
}

async function main() {
  assert(IMAGE3D_QUALITY_FIRST_PICK === 'trellis2', 'first pick must be trellis2')
  assert(IMAGE3D_WIRE_FIRST === 'triposg', 'wire first must be triposg')
  assert(
    IMAGE3D_MODELS.every((m) => m.licence === 'MIT'),
    'shortlist must be MIT-only',
  )
  assert(!IMAGE3D_MODELS.some((m) => /instant/i.test(m.id)), 'InstantMesh must not be in shortlist')
  assert(isBannedImage3dId('InstantMesh'), 'InstantMesh must be banned pending Zero123++/SD check')
  for (const b of IMAGE3D_BANNED_IDS) {
    assert(isBannedImage3dId(b), `banned id ${b} must match`)
  }
  assert(/not walk/i.test(IMAGE3D_SCOPE_NOTE), 'scope note must say not walk')

  const backend = createImage3dBackend('quality')
  assert(backend.id === 'trellis2', 'quality backend id')
  assert(backend.status === 'deferred', 'no weights in CI — deferred')
  let threw = false
  try {
    await backend.infer({
      bytes: new Uint8Array([0]),
      mimeType: 'image/png',
      knownDimension: { axis: 'y', meters: 1 },
    })
  } catch {
    threw = true
  }
  assert(threw, 'deferred backend must refuse infer')

  const factor = scaleFactorForKnownDimension([1, 1, 1], { axis: 'y', meters: 0.45 })
  assert(Math.abs(factor - 0.45) < 1e-9, `scale factor got ${factor}`)

  const glb = await makeUnitCubeGlb()
  const io = await createGlbIo()
  const doc = await io.readBinary(new Uint8Array(glb))
  const before = measureGlbExtents(doc)
  assert(before.every((v) => Math.abs(v - 1) < 1e-3), `unit cube extents ${before}`)

  applyUniformScale(doc, 2)
  applyZForwardToWorldZSouth(doc)
  const after = measureGlbExtents(doc)
  assert(after.every((v) => Math.abs(v - 2) < 1e-2), `scaled extents ${after}`)

  const prepared = await prepareImage3dGlb(glb, {
    knownDimension: { axis: 'y', meters: 0.9 },
    optimiseProfile: 'web',
  })
  assert(prepared.scaleFactor > 0, 'prepared scale')
  assert(Math.abs(prepared.extentAfterM[1] - 0.9) < 0.05, `Y after ${prepared.extentAfterM}`)
  assert(prepared.optimise.profile === 'web', 'meshopt web profile')
  assert(prepared.buffer.byteLength > 0, 'output bytes')

  // Guard: package must not depend on banned image-to-3D stacks.
  const { readFileSync } = await import('node:fs')
  const pkg = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'))
  const depBlob = JSON.stringify({
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  }).toLowerCase()
  for (const b of IMAGE3D_BANNED_IDS) {
    assert(!depBlob.includes(b), `package.json must not depend on banned ${b}`)
  }
  assert(!depBlob.includes('instantmesh'), 'InstantMesh must not be a dependency')
  assert(!depBlob.includes('triposr'), 'TripoSR weights must not be npm deps (backend TBD)')
  assert(!depBlob.includes('trellis'), 'TRELLIS weights must not be npm deps (backend TBD)')

  console.log('check-h11: OK')
  console.log(`  first pick ${IMAGE3D_QUALITY_FIRST_PICK} · wire ${IMAGE3D_WIRE_FIRST}`)
  console.log(`  prepared ${prepared.optimise.beforeBytes} → ${prepared.optimise.afterBytes} B (web)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
