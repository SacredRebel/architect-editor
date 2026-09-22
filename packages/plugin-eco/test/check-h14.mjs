/**
 * H14 — atlas image→3D (mocked fetch), parts join, massing exclude from walk.
 * Usage: bun packages/plugin-eco/test/check-h14.mjs
 */
import { Document } from '@gltf-transform/core'
import {
  ATLAS_PART_MAX_BYTES,
  AtlasImage3dClient,
  AtlasImage3dError,
  joinGlbParts,
} from '../src/eco-atlas-image3d.ts'
import {
  addEcoAsset,
  clearEcoAssets,
  getEcoAssetsState,
  placeEcoAsset,
  placementsExcludedFromWalkExport,
  updateEcoPlacement,
} from '../src/eco-assets-store.ts'
import {
  assertImage3dExportBudget,
  IMAGE3D_EXPORT_MAX_BYTES,
  IMAGE3D_FORBIDDEN_EXTENSIONS,
} from '../src/eco-image3d-budget.ts'
import { prepareImage3dGlb } from '../src/eco-image3d-export.ts'
import { isExcludedFromWalkExport } from '../src/export-glb.ts'
import { auditGlb, createGlbIo } from '../src/glb-audit.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function makeUnitCubeGlb() {
  const io = await createGlbIo()
  const doc = new Document()
  const buffer = doc.createBuffer()
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(
      new Float32Array([
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

/** Tiny valid-looking JPEG data URI (not decoded by atlas mock). */
const TINY_JPEG_DATA_URI =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z'

function createMockAtlasFetch(glbBytes) {
  const total = glbBytes.byteLength
  let polls = 0
  /** @type {Map<string, { kind: string, name: string }>} */
  const jobs = new Map()

  return async (url, init) => {
    const u = String(url)
    const method = (init?.method ?? 'GET').toUpperCase()

    if (u.endsWith('/api/image3d/config') && method === 'GET') {
      return Response.json({ ok: true, providers: ['meshy'] })
    }

    if (u.endsWith('/api/image3d') && method === 'POST') {
      const body = JSON.parse(init.body)
      if (!body.pin || body.pin === '') {
        return Response.json({ ok: false, error: 'bad_pin' }, { status: 401 })
      }
      if (!body.image?.startsWith('data:image/')) {
        return Response.json({ ok: false, error: 'bad_image' }, { status: 400 })
      }
      const task = `task-${jobs.size + 1}`
      jobs.set(task, { kind: body.kind, name: body.name })
      return Response.json({ ok: true, provider: 'meshy', task })
    }

    if (u.endsWith('/api/image3d/status') && method === 'POST') {
      const body = JSON.parse(init.body)
      if (!body.pin) {
        return Response.json({ ok: false, error: 'bad_pin' }, { status: 401 })
      }
      polls++
      if (polls < 2) {
        return Response.json({ ok: true, status: 'running', progress: 40 })
      }
      return Response.json({
        ok: true,
        status: 'done',
        progress: 100,
        bytes: total,
        thumb: 'data:image/png;base64,aaa',
      })
    }

    if (u.endsWith('/api/image3d/part') && method === 'POST') {
      const body = JSON.parse(init.body)
      if (!body.pin) {
        return Response.json({ ok: false, error: 'bad_pin' }, { status: 401 })
      }
      const from = body.from
      const to = body.to
      assert(to - from <= ATLAS_PART_MAX_BYTES, 'part too large')
      const slice = glbBytes.slice(from, to)
      return new Response(slice, {
        status: 200,
        headers: { 'content-type': 'model/gltf-binary' },
      })
    }

    return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
}

async function main() {
  clearEcoAssets()

  // --- parts join ---
  const a = new Uint8Array([1, 2, 3]).buffer
  const b = new Uint8Array([4, 5]).buffer
  const joined = new Uint8Array(joinGlbParts([a, b]))
  assert(joined.length === 5 && joined[0] === 1 && joined[4] === 5, 'joinGlbParts')

  const cube = await makeUnitCubeGlb()
  // Force multi-part by using a tiny part budget override via slicing the mock.
  // Mock respects ATLAS_PART_MAX_BYTES; for smoke we still fetch one part if small.
  assert(cube.byteLength > 0, 'cube glb')

  let slept = 0
  const client = new AtlasImage3dClient({
    baseUrl: 'https://eco-village-map.vercel.app',
    fetchFn: createMockAtlasFetch(cube),
    sleep: async () => {
      slept++
    },
  })

  const cfg = await client.getConfig()
  assert(cfg.providers.includes('meshy'), 'providers')

  let pinBlocked = false
  try {
    await client.submit({
      pin: '',
      image: TINY_JPEG_DATA_URI,
      kind: 'object',
      name: 'x',
    })
  } catch (err) {
    pinBlocked = err instanceof AtlasImage3dError && err.code === 'bad_pin'
  }
  assert(pinBlocked, 'empty PIN must fail')

  const photo = await client.runToGlb({
    pin: 'test-pin-not-a-secret',
    image: TINY_JPEG_DATA_URI,
    kind: 'object',
    name: 'chair',
  })
  assert(photo.provider === 'meshy', 'provider')
  assert(photo.glb.byteLength === cube.byteLength, 'photo glb size')
  assert(slept >= 1, 'polled with sleep')

  const preparedProp = await prepareImage3dGlb(photo.glb, {
    knownDimension: { axis: 'y', meters: 0.9 },
    optimiseProfile: 'image3d',
  })
  assert(preparedProp.optimise.profile === 'image3d', 'image3d profile')
  const propReport = await auditGlb(preparedProp.buffer)
  const budget = assertImage3dExportBudget(propReport)
  assert(budget.ok, `prop budget: ${budget.fails.join('; ')}`)
  for (const banned of IMAGE3D_FORBIDDEN_EXTENSIONS) {
    assert(!propReport.extensionsUsed.includes(banned), `no ${banned}`)
    assert(!propReport.extensionsRequired.includes(banned), `no req ${banned}`)
  }
  assert(propReport.bytes <= IMAGE3D_EXPORT_MAX_BYTES, '≤5 MB')

  // Place prop
  addEcoAsset({
    id: 'asset-prop',
    name: 'chair (prop)',
    hash: 'p',
    byteLength: preparedProp.buffer.byteLength,
    bytesBase64: '',
    thumbDataUrl: '',
    role: 'prop',
    sourceKind: 'object',
  })
  const propPlacement = placeEcoAsset('asset-prop')
  assert(propPlacement && !propPlacement.locked, 'prop unlocked')
  assert(!propPlacement.excludeFromWalkExport, 'prop in walk export')

  // Reset mock polls for second job
  slept = 0
  const client2 = new AtlasImage3dClient({
    baseUrl: 'https://eco-village-map.vercel.app',
    fetchFn: createMockAtlasFetch(cube),
    sleep: async () => {
      slept++
    },
  })
  const sketch = await client2.runToGlb({
    pin: 'test-pin-not-a-secret',
    image: TINY_JPEG_DATA_URI,
    kind: 'building',
    name: 'cabin-sketch',
  })
  const preparedMassing = await prepareImage3dGlb(sketch.glb, {
    knownDimension: { axis: 'y', meters: 3.2 },
    optimiseProfile: 'image3d',
  })

  addEcoAsset({
    id: 'asset-massing',
    name: 'cabin (massing)',
    hash: 'm',
    byteLength: preparedMassing.buffer.byteLength,
    bytesBase64: '',
    thumbDataUrl: '',
    role: 'massing',
    sourceKind: 'building',
  })
  const massingPlacement = placeEcoAsset('asset-massing')
  assert(massingPlacement?.locked === true, 'massing locked')
  assert(massingPlacement?.excludeFromWalkExport === true, 'massing excluded')
  assert((massingPlacement?.opacity ?? 1) < 1, 'massing semi-transparent')

  // Locked: transform patch ignored
  const before = [...massingPlacement.position]
  updateEcoPlacement(massingPlacement.id, { position: [9, 9, 9] })
  const after = getEcoAssetsState().placements.find((p) => p.id === massingPlacement.id)
  assert(after.position[0] === before[0], 'locked massing ignores move')

  const excluded = placementsExcludedFromWalkExport()
  assert(
    excluded.some((p) => p.id === massingPlacement.id),
    'massing in exclude list',
  )
  assert(
    !excluded.some((p) => p.id === propPlacement.id),
    'prop not excluded',
  )
  assert(
    isExcludedFromWalkExport(massingPlacement, { role: 'massing' }),
    'helper excludes massing',
  )
  assert(
    !isExcludedFromWalkExport(propPlacement, { role: 'prop' }),
    'helper keeps prop',
  )

  // Multi-part join: fabricate oversized buffer and fetch in chunks
  const big = new Uint8Array(ATLAS_PART_MAX_BYTES + 12)
  for (let i = 0; i < big.length; i++) big[i] = i % 251
  let partCalls = 0
  const partClient = new AtlasImage3dClient({
    baseUrl: 'https://mock',
    sleep: async () => {},
    fetchFn: async (url, init) => {
      const u = String(url)
      if (u.includes('/config')) return Response.json({ ok: true, providers: ['meshy'] })
      if (u.endsWith('/api/image3d') && !u.includes('status') && !u.includes('part')) {
        return Response.json({ ok: true, provider: 'meshy', task: 't-big' })
      }
      if (u.includes('/status')) {
        return Response.json({ ok: true, status: 'done', bytes: big.byteLength, progress: 100 })
      }
      if (u.includes('/part')) {
        partCalls++
        const body = JSON.parse(init.body)
        return new Response(big.buffer.slice(body.from, body.to))
      }
      return Response.json({ ok: false }, { status: 404 })
    },
  })
  const bigJob = await partClient.runToGlb({
    pin: 'x',
    image: TINY_JPEG_DATA_URI,
    kind: 'object',
    name: 'big',
  })
  assert(partCalls === 2, `expected 2 part calls, got ${partCalls}`)
  assert(bigJob.glb.byteLength === big.byteLength, 'multipart join size')
  const joinedView = new Uint8Array(bigJob.glb)
  assert(joinedView[0] === big[0] && joinedView[big.length - 1] === big[big.length - 1], 'multipart bytes')

  console.log('check-h14: OK')
  console.log(`  photo prop ${preparedProp.buffer.byteLength} B · massing locked+excluded`)
  console.log(`  multipart ${partCalls} parts · budget ≤${IMAGE3D_EXPORT_MAX_BYTES} B`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
