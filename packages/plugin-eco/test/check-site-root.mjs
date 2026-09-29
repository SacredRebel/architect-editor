#!/usr/bin/env bun
/**
 * The host's ground lands whatever the editor holds when eco:load-site comes.
 *
 *   (cd apps/editor && bun run build:static)
 *   bun packages/plugin-eco/test/check-site-root.mjs [--self-test]
 *
 * The world's studio sends the site the moment the editor answers hello — which
 * can be before the editor has loaded any scene — and a scene it sends may have
 * no site in it. Serves the static build, opens /builder/embed/?perf in its own
 * Chrome (storage cleared), and plays the host from the page's own origin
 * (localhost, which the bridge hears) with a site like the world's: a 201×201
 * heightfield with metres of relief, eleven guides, and a house reference
 * (refGlb: a box built here). Three orders:
 *
 *   A. site first: a script that runs before the editor's own code says hello
 *      and sends eco:load-site the moment the bridge answers;
 *   B. a scene without a site (a building with a level and a wall as its only
 *      root), then the site;
 *   C. the site, then that scene.
 *
 * The editor's own record (window.ecoSiteLandings) must show each case took
 * the path it names — A: no site root when the site came; B, C: a site made to
 * adopt the building — or the case proved nothing and fails. Then what the
 * editor holds and draws is compared with the site as sent, worked out here:
 * one site root; its terrain as saved (the node's JSON, base64 Int16 decoded
 * here) equal on every sample to the sent heights less originElevM; every
 * guide vertex drawn 0.05 m above the sent ground at that point; the house
 * reference drawn at the box's extents, from one object URL (the page's
 * URL.createObjectURL is counted); in B and C the building under that site
 * root with its wall.
 *
 * --self-test runs everything (it must pass), then judges forged observations,
 * each of which must fail: the terrain gone, the ground 1 m high, the rows
 * flipped north–south, a second site root, the guides flat on the datum, the
 * house reference missing, a new object URL on every render (what kept the
 * reference from ever drawing), and case A with a site root already there.
 *
 * Env: CHROME, PORT (default 4173), HEADLESS=1.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import {
  connect,
  evaluate,
  firstPage,
  freePort,
  launchChrome,
  serveStatic,
  waitFor,
} from './browser-lib.mjs'

const BASE = '/builder'
const PAGE = `${BASE}/embed/?perf`
const selfTest = process.argv.includes('--self-test')
const root = resolve(import.meta.dir, '../../..')
const outDir = join(root, 'apps/editor/out')
const port = Number(process.env.PORT || 4173)
const origin = `http://127.0.0.1:${port}`

// The world's shape of site: 201×201 samples 1 m apart around the origin.
const N = 201
const HALF = 100
const ELEV = 425.9
const GUIDE_LIFT = 0.05
const HOUSE = { size: [12, 6, 9], center: [2, 3, -1] }

/** Relief in metres above originElevM at site (x east, z north) — lopsided, so flips show. */
const relief = (x, zNorth) =>
  4 * Math.sin(x / 19) + 2.5 * Math.cos(zNorth / 13) + 0.03 * x - 0.02 * zNorth + 0.5

async function houseGlb() {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const [sx, sy, sz] = HOUSE.size
  const [cx, cy, cz] = HOUSE.center
  const corners = []
  for (const x of [-sx / 2, sx / 2])
    for (const y of [-sy / 2, sy / 2])
      for (const z of [-sz / 2, sz / 2]) corners.push(cx + x, cy + y, cz + z)
  const faces = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer)
  const indices = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(faces)).setBuffer(buffer)
  const mesh = doc.createMesh('house').addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices))
  doc.createScene('house').addChild(doc.createNode('house').setMesh(mesh))
  return Buffer.from(await new NodeIO().writeBinary(doc)).toString('base64')
}

function worldSite(refGlb) {
  const heights = []
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) heights.push(Math.round((ELEV + relief(-HALF + c, HALF - r)) * 100) / 100)
  const ring = (cx, cz, w, d) => [
    [cx - w / 2, cz + d / 2],
    [cx + w / 2, cz + d / 2],
    [cx + w / 2, cz - d / 2],
    [cx - w / 2, cz - d / 2],
    [cx - w / 2, cz + d / 2],
  ]
  const guides = [
    { kind: 'boundary', pts: ring(0, 0, 150, 130), name: 'parcel' },
    { kind: 'easement', pts: [[-75, 40], [75, 40]], name: 'utility' },
    { kind: 'easement', pts: [[-40, -65], [-40, 65]] },
    { kind: 'footprint', pts: ring(2, 1, 12, 9), name: 'house' },
    { kind: 'footprint', pts: ring(-30, 25, 6, 5), name: 'shed' },
    { kind: 'massing-outline', pts: ring(2, 1, 14, 11), name: 'the Oak Leaf' },
    { kind: 'road', pts: [[-90, -80], [-20, -55], [40, -70], [90, -60]], name: 'drive' },
    { kind: 'road', pts: [[60, -60], [65, 10], [70, 70]] },
    { kind: 'boundary', pts: ring(45, 30, 20, 18), name: 'garden' },
    { kind: 'easement', pts: [[10, 60], [55, 5]] },
    { kind: 'footprint', pts: ring(30, -20, 8, 6), name: 'studio' },
  ]
  return {
    v: 'eco/1',
    originLL: [-119.15536, 34.4331],
    originElevM: ELEV,
    terrain: { w: N, h: N, stepM: 1, originOffsetM: [-HALF, HALF], heights },
    guides,
    refGlb,
    northDeg: 0,
  }
}

/** A scene with no site: a building (a level, one wall) as its only root. */
function siteLessScene() {
  const building = 'building_p0root'
  const level = 'level_p0root'
  const wall = 'wall_p0root'
  return {
    scene: {
      nodes: {
        [building]: { object: 'node', id: building, type: 'building', parentId: null, visible: true, metadata: {}, children: [level], position: [0, 0, 0], rotation: [0, 0, 0] },
        [level]: { object: 'node', id: level, type: 'level', parentId: building, visible: true, metadata: {}, children: [wall], level: 0, height: 3 },
        [wall]: { object: 'node', id: wall, type: 'wall', parentId: level, visible: true, metadata: {}, children: [], start: [-4, 3.5], end: [8, 3.5], thickness: 0.2, height: 3, frontSide: 'unknown', backSide: 'unknown' },
      },
      rootNodeIds: [building],
    },
    building,
    wall,
  }
}

// ------------------------------------------------------------ expectations
/** The sent ground (metres above originElevM) at editor (x, z): bilinear, +z south. */
function sentGroundAt(site, x, z) {
  const { w, h, stepM, originOffsetM, heights } = site.terrain
  const u = Math.min(w - 1, Math.max(0, (x - originOffsetM[0]) / stepM))
  const v = Math.min(h - 1, Math.max(0, (z + originOffsetM[1]) / stepM))
  const c = Math.min(w - 2, Math.floor(u))
  const r = Math.min(h - 2, Math.floor(v))
  const tu = u - c
  const tv = v - r
  const at = (rr, cc) => heights[rr * w + cc] - site.originElevM
  return (
    at(r, c) * (1 - tu) * (1 - tv) + at(r, c + 1) * tu * (1 - tv) + at(r + 1, c) * (1 - tu) * tv + at(r + 1, c + 1) * tu * tv
  )
}

function decodeTerrain(data) {
  if (!data || data.type !== 'heightfield' || typeof data.heights !== 'string') return null
  const bytes = Buffer.from(data.heights, 'base64')
  if (bytes.length !== data.cols * data.rows * 2) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const metres = []
  for (let i = 0; i < data.cols * data.rows; i++) metres.push(view.getInt16(i * 2, true) * data.step)
  return { ...data, metres }
}

function judge(label, observed, site, { landing, building }) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  if (!observed) return [`${label}: the editor never came up (no __pascalPerf)`]

  const want = JSON.stringify(landing)
  const landed = (observed.landings ?? []).find((l) => Object.entries(landing).every(([k, v]) => l[k] === v))
  ok(Boolean(landed), `the editor records the path this case is about, ${want} (landings: ${JSON.stringify(observed.landings)})`)

  const roots = observed.sites.filter((s) => !s.parentId)
  ok(roots.length === 1, `one site root (${roots.map((s) => s.id).join(', ') || 'none'})`)
  const siteRoot = roots[0]
  const field = decodeTerrain(siteRoot?.terrain)
  ok(Boolean(field), `the site root carries a terrain (${siteRoot?.terrain ? 'present' : 'none'})`)
  if (field) {
    ok(
      field.cols === N && field.rows === N && field.spacing === 1 && field.origin[0] === -HALF && field.origin[1] === -HALF,
      `the terrain grid is the sent one, NW corner at (−${HALF}, −${HALF}) with +z south (${field.cols}×${field.rows} @ ${field.spacing} m from ${field.origin.join(', ')})`,
    )
    let worst = 0
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const sent = site.terrain.heights[r * N + c] - site.originElevM
        worst = Math.max(worst, Math.abs((field.metres[r * N + c] ?? Number.NaN) - sent))
      }
    ok(worst <= 0.006, `every one of ${N * N} samples equals the sent height less originElevM (worst ${worst.toFixed(4)} m)`)
  }

  const vertices = observed.guides.flat()
  ok(
    observed.guides.length === site.guides.length,
    `every sent guide is drawn (${observed.guides.length}/${site.guides.length})`,
  )
  let worstGuide = 0
  let at = null
  for (const [x, y, z] of vertices) {
    const off = Math.abs(y - (sentGroundAt(site, x, z) + GUIDE_LIFT))
    if (off > worstGuide) {
      worstGuide = off
      at = [x, z]
    }
  }
  ok(
    vertices.length > 0 && worstGuide <= 0.02,
    `every guide vertex (${vertices.length}) stands ${GUIDE_LIFT} m above the sent ground (worst ${worstGuide.toFixed(3)} m${at ? ` at ${at.map((v) => v.toFixed(1)).join(', ')}` : ''})`,
  )

  const [sx, sy, sz] = HOUSE.size
  const [cx, cy, cz] = HOUSE.center
  const boxMin = [cx - sx / 2, cy - sy / 2, cz - sz / 2]
  const boxMax = [cx + sx / 2, cy + sy / 2, cz + sz / 2]
  const ghost = observed.ghost
  ok(
    Boolean(ghost) && [0, 1, 2].every((k) => Math.abs(ghost.min[k] - boxMin[k]) < 0.01 && Math.abs(ghost.max[k] - boxMax[k]) < 0.01),
    `the house reference is drawn at the box's extents (${ghost ? `${ghost.min.map((v) => v.toFixed(2))} … ${ghost.max.map((v) => v.toFixed(2))}` : 'not drawn'})`,
  )
  ok(observed.glbUrls === 1, `the house reference loads from one object URL (${observed.glbUrls} minted)`)

  if (building) {
    const b = observed.buildings.find((x) => x.id === building.id)
    ok(Boolean(b) && b.parentId === siteRoot?.id, `the scene's building stands under the site root (${b?.parentId ?? 'missing'})`)
    ok(observed.walls.includes(building.wall), `its wall is still there (${observed.walls.length} walls)`)
  }
  return fails
}

// ------------------------------------------------------------ the browser side
const OBSERVE = `(() => {
  const p = window.__pascalPerf
  if (!p) return null
  const scene = p.three().scene
  scene.updateMatrixWorld(true)
  const apply = (e, x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]
  const guides = []
  let ghost = null
  scene.traverse((o) => {
    if (o.name === 'eco-guides') {
      o.traverse((line) => {
        const s = line.geometry?.attributes?.instanceStart
        const end = line.geometry?.attributes?.instanceEnd
        if (!s || !s.count) return
        const e = line.matrixWorld.elements
        const pts = []
        for (let i = 0; i < s.count; i++) pts.push(apply(e, s.getX(i), s.getY(i), s.getZ(i)))
        const k = end.count - 1
        pts.push(apply(e, end.getX(k), end.getY(k), end.getZ(k)))
        guides.push(pts)
      })
    }
    if (o.name === 'eco-ghost') {
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      o.traverse((m) => {
        const pos = m.isMesh ? m.geometry?.attributes?.position : null
        if (!pos) return
        const e = m.matrixWorld.elements
        for (let i = 0; i < pos.count; i++) {
          const w = apply(e, pos.getX(i), pos.getY(i), pos.getZ(i))
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]) }
        }
      })
      if (Number.isFinite(min[0])) ghost = { min, max }
    }
  })
  const sites = p.listNodes('site').map((id) => { const n = p.node(id); return { id, parentId: n.parentId ?? null, terrain: n.terrain ?? null } })
  const buildings = p.listNodes('building').map((id) => ({ id, parentId: p.node(id).parentId ?? null }))
  return { sites, buildings, walls: p.listNodes('wall'), guides, ghost, glbUrls: window.__glbUrls ?? 0, landings: window.ecoSiteLandings ?? null }
})()`

/** Counts the GLB object URLs the page mints: one house reference, one URL. */
const COUNT_GLB_URLS = `(() => {
  window.__glbUrls = 0
  const create = URL.createObjectURL
  URL.createObjectURL = function (blob) {
    if (blob && blob.type === 'model/gltf-binary') window.__glbUrls++
    return create.call(this, blob)
  }
})()`

/** Sends hello and the site from inside the page, before its own code, the moment the bridge answers. */
const siteFirst = (site) => `(() => {
  const site = ${JSON.stringify(site)}
  let said = false
  const tick = () => {
    if (!('ecoHost' in window)) return setTimeout(tick, 2)
    if (!said) { said = true; window.postMessage({ t: 'eco:hello', v: 'eco/1' }, location.origin) }
    if (window.ecoHost !== location.origin) return setTimeout(tick, 2)
    window.postMessage({ t: 'eco:load-site', site }, location.origin)
  }
  tick()
})()`

const post = (cdp, message) => evaluate(cdp, `window.postMessage(${JSON.stringify(message)}, location.origin); true`)

async function freshPage(cdp) {
  await cdp.send('Page.navigate', { url: `${origin}${BASE}/eco-build.json` })
  await Bun.sleep(800)
  await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' })
}

/** Waits for the ground, the guides and the house reference; observes either way. */
async function settle(cdp, ready) {
  const up = await waitFor(cdp, ready, 90_000)
  if (up) await Bun.sleep(4000)
  else console.log('NOTE the ground, guides and house reference were not all drawn within 90 s')
  return evaluate(cdp, OBSERVE).catch(() => null)
}

const GROUND_READY = `!!window.__pascalPerf && window.__pascalPerf.listNodes('site').some((id) => window.__pascalPerf.node(id).terrain) && (() => { let g = false; window.__pascalPerf.three().scene.traverse((o) => { if (o.name === 'eco-ghost' && o.children.length) g = true }); return g })()`

async function caseA(cdp, site) {
  await freshPage(cdp)
  const script = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: siteFirst(site) })
  await cdp.send('Page.navigate', { url: `${origin}${PAGE}` })
  const observed = await settle(cdp, GROUND_READY)
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script.identifier })
  return observed
}

async function hostUp(cdp) {
  await cdp.send('Page.navigate', { url: `${origin}${PAGE}` })
  await waitFor(cdp, `'ecoHost' in window && !!window.__pascalPerf && window.__pascalPerf.listNodes('site').length > 0`, 90_000)
  await post(cdp, { t: 'eco:hello', v: 'eco/1' })
  await waitFor(cdp, `window.ecoHost === location.origin`, 10_000)
}

async function caseB(cdp, site, host) {
  await freshPage(cdp)
  await hostUp(cdp)
  await post(cdp, { t: 'eco:load-scene', scene: host.scene })
  await waitFor(cdp, `window.__pascalPerf.listNodes('wall').includes(${JSON.stringify(host.wall)})`, 30_000)
  await post(cdp, { t: 'eco:load-site', site })
  return settle(cdp, GROUND_READY)
}

async function caseC(cdp, site, host) {
  await freshPage(cdp)
  await hostUp(cdp)
  await post(cdp, { t: 'eco:load-site', site })
  await waitFor(cdp, GROUND_READY, 60_000)
  await post(cdp, { t: 'eco:load-scene', scene: host.scene })
  await waitFor(cdp, `window.__pascalPerf.listNodes('wall').includes(${JSON.stringify(host.wall)})`, 30_000)
  return settle(cdp, GROUND_READY)
}

// ------------------------------------------------------------ run
if (!existsSync(join(outDir, BASE.slice(1), 'embed', 'index.html'))) {
  console.error(`FAIL - no static export at ${outDir}${BASE}/embed/ (run: cd apps/editor && bun run build:static)`)
  process.exit(1)
}

const { server } = serveStatic(outDir, port)
const cdpPort = await freePort()
const browser = launchChrome(cdpPort)
let exitCode = 1
try {
  const cdp = await connect((await firstPage(cdpPort)).webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: COUNT_GLB_URLS })

  const site = worldSite(await houseGlb())
  const host = siteLessScene()
  const building = { id: host.building, wall: host.wall }
  const runs = [
    { label: 'A · site first', observed: await caseA(cdp, site), expect: { landing: { via: 'load-site', hadSiteRoot: false }, building: null } },
    { label: 'B · a scene without a site, then the site', observed: await caseB(cdp, site, host), expect: { landing: { via: 'load-site', hadSiteRoot: false, made: 'adopted' }, building } },
    { label: 'C · the site, then a scene without a site', observed: await caseC(cdp, site, host), expect: { landing: { via: 'new-scene', hadSiteRoot: false, made: 'adopted' }, building } },
  ]
  const fails = runs.flatMap((run) => judge(run.label, run.observed, site, run.expect))

  if (!selfTest) {
    if (fails.length) {
      for (const f of fails) console.error('FAIL', f)
      console.error(`check-site-root FAILED (${fails.length})`)
    } else {
      console.log('check-site-root OK')
      exitCode = 0
    }
  } else if (fails.length) {
    for (const f of fails) console.error('FAIL', f)
    console.error('SELF-TEST FAIL: the honest run must pass before the forgeries mean anything')
  } else {
    const a = runs[0]
    const clone = (value) => structuredClone(value)
    const forgeries = [
      ['the terrain gone', () => { const o = clone(a.observed); for (const s of o.sites) s.terrain = null; return [o, site] }],
      ['the ground 1 m high', () => [a.observed, { ...site, terrain: { ...site.terrain, heights: site.terrain.heights.map((h) => h - 1) } }]],
      [
        'the rows flipped north–south',
        () => {
          const flipped = []
          for (let r = N - 1; r >= 0; r--) flipped.push(...site.terrain.heights.slice(r * N, r * N + N))
          return [a.observed, { ...site, terrain: { ...site.terrain, heights: flipped } }]
        },
      ],
      ['a second site root', () => { const o = clone(a.observed); o.sites.push({ ...o.sites[0], id: 'site_forged' }); return [o, site] }],
      ['the guides flat on the datum', () => { const o = clone(a.observed); for (const g of o.guides) for (const v of g) v[1] = GUIDE_LIFT; return [o, site] }],
      ['the house reference missing', () => { const o = clone(a.observed); o.ghost = null; return [o, site] }],
      ['a new object URL on every render', () => { const o = clone(a.observed); o.glbUrls = 7143; return [o, site] }],
      [
        'case A with a site root already there',
        () => { const o = clone(a.observed); for (const l of o.landings) l.hadSiteRoot = true; return [o, site] },
      ],
    ]
    let caught = 0
    for (const [name, forge] of forgeries) {
      const [observed, reference] = forge()
      const rejected = judge(`forged: ${name}`, observed, reference, a.expect).length > 0
      console.log(rejected ? 'SELF-TEST OK' : 'SELF-TEST FAIL', `${name} ${rejected ? 'is rejected' : 'PASSED the check'}`)
      if (rejected) caught++
    }
    if (caught === forgeries.length) {
      console.log(`check-site-root --self-test OK (${caught}/${forgeries.length} forgeries rejected)`)
      exitCode = 0
    } else {
      console.error(`check-site-root --self-test FAILED (${caught}/${forgeries.length} forgeries rejected)`)
    }
  }
} finally {
  await browser.close()
  server.stop(true)
}
process.exit(exitCode)
