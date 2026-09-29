#!/usr/bin/env bun
/**
 * A5 — the site in the editor.
 *
 *   (cd apps/editor && bun run build:static)
 *   bun packages/plugin-eco/test/check-a5-site.mjs [--self-test]
 *
 * Serves the static build, opens /builder/?perf in its own Chrome, and sends
 * over the eco/1 bridge (from localhost, which the bridge hears) the realistic site, a
 * 97×97 heightfield with metres of relief under the pad, plus standing trees
 * and the world's sun instant. Then it compares what the editor draws against
 * the same site sampled here, independently of the editor's terrain:
 *
 *   - walls: two walls are drawn on the pad with the real wall tool (key B,
 *     two clicks with Alt held so the massing snap stays out, Escape), one
 *     downhill from its high end and one uphill from its low end. At 25
 *     stations along each, the rendered wall is cut across; on each face the
 *     cut's lowest and highest points (the face's foot and head, what the eye
 *     sees) against the ground bilinearly sampled from the sent heights under
 *     that face: foot = min(plane, ground), where the plane is the ground under
 *     the wall's start plus its stored offset; head = plane + height. The
 *     downhill wall must meet the ground on both faces at every station.
 *   - sun: the light named eco-sun against the sun for originLL at sunAt from
 *     a different solar algorithm (NOAA's fractional-year formulae), turned into
 *     the scene frame with the documented north convention, within 1°.
 *   - trees: each standing tree's rendered base against the sampled ground,
 *     its rendered height against the sent height.
 *   - plan: every contour vertex drawn in the plan, sampled here, lies on its
 *     level; the levels drawn are every metre the heights span; the survey line
 *     drawn is the sent boundary; the canopies drawn are the sent trees.
 *
 * --self-test first runs everything (it must pass), then re-sends the site as
 * the editor would have to have drawn it wrongly — rows flipped north–south,
 * north turned 180°, guides and trees mirrored — and compares against the
 * original: every group must fail.
 *
 * Env: CHROME, PORT (default 4173), HEADLESS=1.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  connect,
  evaluate,
  firstPage,
  freePort,
  launchChrome,
  serveStatic,
  waitFor,
} from './browser-lib.mjs'
import { buildRealisticSite } from './realistic-site.mjs'

const BASE = '/builder'
const selfTest = process.argv.includes('--self-test')
const root = resolve(import.meta.dir, '../../..')
const outDir = join(root, 'apps/editor/out')
const port = Number(process.env.PORT || 4173)
const origin = `http://localhost:${port}`
const D2R = Math.PI / 180

// 13:00 PST at the winter solstice: the sun low and to the south, so a north–south
// mirror or a wrongly signed northDeg moves it by tens of degrees, not a few.
const SUN_AT = '2026-12-21T21:00:00Z'
const SUN_TOLERANCE_DEG = 1
const GROUND_TOLERANCE_M = 0.05
const TREES = [
  { pt: [-30, 20], heightM: 9, canopyM: 8, species: 'oak' },
  { pt: [-25, -20], heightM: 7, canopyM: 6, species: 'oak' },
  { pt: [25, 25], heightM: 11, canopyM: 10, species: 'oak' },
  { pt: [30, -15], heightM: 6, canopyM: 5, species: 'chamise' },
  { pt: [-40, 5], heightM: 8, canopyM: 7, species: 'oak' },
  { pt: [40, 5], heightM: 10, canopyM: 9, species: 'oak' },
  { pt: [0, 35], heightM: 12, canopyM: 10, species: 'oak' },
  { pt: [5, -30], heightM: 5, canopyM: 4, species: 'chamise' },
  { pt: [-20, 40], heightM: 9, canopyM: 8, species: 'oak' },
  { pt: [20, -35], heightM: 7, canopyM: 6, species: 'oak' },
  { pt: [-45, -30], heightM: 6, canopyM: 5, species: 'chamise' },
  { pt: [45, 35], heightM: 8, canopyM: 7, species: 'oak' },
]

function a5Site() {
  const site = buildRealisticSite()
  site.trees = TREES.map((t) => ({ ...t, pt: [...t.pt] }))
  site.sunAt = SUN_AT
  return site
}

/** The site as the editor would have drawn it wrongly: for the self-test. */
function forgedSite() {
  const site = a5Site()
  const { w, h, heights } = site.terrain
  const flipped = []
  for (let r = h - 1; r >= 0; r--) flipped.push(...heights.slice(r * w, r * w + w))
  site.terrain.heights = flipped
  site.northDeg = (site.northDeg ?? 0) + 180
  for (const guide of site.guides) guide.pts = guide.pts.map(([x, z]) => [x, -z])
  site.trees = site.trees.map((t) => ({ ...t, pt: [t.pt[0], -t.pt[1]] }))
  return site
}

// ------------------------------------------------ the site, sampled here
/** Ground height (m ASL) at a scene point, bilinear over the sent heights. */
function groundAsl(site, x, zScene) {
  const { w, h, stepM, originOffsetM, heights } = site.terrain
  const zNorth = -zScene
  const c = (x - originOffsetM[0]) / stepM
  const r = (originOffsetM[1] - zNorth) / stepM
  const c0 = Math.min(Math.max(Math.floor(c), 0), w - 2)
  const r0 = Math.min(Math.max(Math.floor(r), 0), h - 2)
  const fc = c - c0
  const fr = r - r0
  const H = (cc, rr) => heights[rr * w + cc]
  return (
    H(c0, r0) * (1 - fc) * (1 - fr) +
    H(c0 + 1, r0) * fc * (1 - fr) +
    H(c0, r0 + 1) * (1 - fc) * fr +
    H(c0 + 1, r0 + 1) * fc * fr
  )
}
const groundY = (site, x, z) => groundAsl(site, x, z) - site.originElevM

/** Sun azimuth/altitude (degrees) by NOAA's fractional-year formulae — not the editor's port. */
function sunIndependent(date, lat, lng) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const day = Math.floor((date.getTime() - start) / 86400000) + 1
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const leap = new Date(Date.UTC(date.getUTCFullYear(), 1, 29)).getUTCDate() === 29
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (day - 1 + (hour - 12) / 24)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  const trueSolarMin = hour * 60 + eqTime + 4 * lng
  const ha = (trueSolarMin / 4 - 180) * D2R
  const phi = lat * D2R
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha)
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)))
  // Azimuth from south, westward positive, then from north clockwise.
  const fromSouth = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi))
  const az = (fromSouth / D2R + 180 + 360) % 360
  return { altitude: 90 - zen / D2R, azimuth: az }
}

/** Scene frame: x east, y up, z = −(site north); site north is northDeg clockwise from true north. */
function sceneVector({ altitude, azimuth }, northDeg) {
  const a = (azimuth - northDeg) * D2R
  const e = altitude * D2R
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]
}

/** The pre-A5 editor's sun: +z taken as north, turned by +northDeg. Self-test reference. */
function legacyVector({ altitude, azimuth }, northDeg) {
  const [x, y, zw] = sceneVector({ altitude, azimuth }, 0)
  const zNorth = -zw
  const th = -northDeg * D2R
  return [x * Math.cos(th) - zNorth * Math.sin(th), y, x * Math.sin(th) + zNorth * Math.cos(th)]
}

const angleDeg = (a, b) => {
  const la = Math.hypot(...a)
  const lb = Math.hypot(...b)
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)
  return Math.acos(Math.max(-1, Math.min(1, dot))) / D2R
}

// ------------------------------------------------ walls to draw on the pad
function insidePolygon(pts, x, z) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

/** Pad points on a 1 m grid, in the scene frame. */
function padPoints(site) {
  const pad = site.guides.find((g) => g.kind === 'footprint').pts.slice(0, -1)
  const pts = []
  for (let x = -14; x <= 14; x += 1) {
    for (let zN = -10; zN <= 16; zN += 1) if (insidePolygon(pad, x, zN)) pts.push([x, -zN])
  }
  return pts
}

/**
 * The steepest pad wall, 6–10 m, among the pad points the camera shows, whose
 * start is its highest point (so the downhill wall meets the ground at every
 * station); then a second at least 4 m away, drawn from its low end. Returned
 * in the scene frame.
 */
function padWalls(site, pts) {
  const along = (a, b, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n
      return groundY(site, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    })
  const pairs = []
  for (const a of pts) {
    for (const b of pts) {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (d < 6 || d > 10) continue
      const hs = along(a, b)
      if (Math.max(...hs) > hs[0] + 0.02) continue
      pairs.push({ a, b, drop: hs[0] - hs.at(-1) })
    }
  }
  pairs.sort((p, q) => q.drop - p.drop)
  const down = pairs[0]
  if (!down) throw new Error(`no 6–10 m wall fits the ${pts.length} pad points on screen`)
  const mid = (p) => [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2]
  const far = pairs.find((p) => Math.hypot(mid(p)[0] - mid(down)[0], mid(p)[1] - mid(down)[1]) >= 4)
  if (!far) throw new Error('no second pad wall 4 m from the first')
  return {
    downhill: { from: down.a, to: down.b, drop: down.drop },
    uphill: { from: far.b, to: far.a, rise: far.drop },
  }
}

// ------------------------------------------------ in-page reads
const MEASURE_WALL = (id, n = 24) => `(() => {
  const p = window.__pascalPerf
  const node = p.node(${JSON.stringify(id)})
  const mesh = p.object(${JSON.stringify(id)})
  if (!node || !mesh || !mesh.geometry) return null
  mesh.updateWorldMatrix(true, false)
  const V = mesh.position.constructor
  const toWorld = (x, z) => (mesh.parent ? mesh.parent.localToWorld(new V(x, 0, z)) : new V(x, 0, z))
  const pos = mesh.geometry.attributes.position
  const index = mesh.geometry.index
  const e = mesh.matrixWorld.elements
  const v = new Float64Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    v[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
    v[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
    v[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
  const triangles = (index ? index.count : pos.count) / 3
  const vi = (k) => (index ? index.getX(k) : k) * 3
  const s0 = toWorld(node.start[0], node.start[1])
  const s1 = toWorld(node.end[0], node.end[1])
  const len = Math.hypot(s1.x - s0.x, s1.z - s0.z)
  const ux = (s1.x - s0.x) / len, uz = (s1.z - s0.z) / len
  const half = (node.thickness ?? 0.1) / 2
  // Each station cuts the wall across; the lowest and highest points of the
  // cut on each face are that face's foot and head — what the eye sees.
  const stations = []
  for (let s = 0; s <= ${n}; s++) {
    const t = 0.04 + (0.92 * s) / ${n}
    const px = s0.x + (s1.x - s0.x) * t, pz = s0.z + (s1.z - s0.z) * t
    const faces = { '1': { lo: Infinity, hi: -Infinity }, '-1': { lo: Infinity, hi: -Infinity } }
    const along = (i) => (v[i] - px) * ux + (v[i + 2] - pz) * uz
    const side = (x, z) => (x - px) * -uz + (z - pz) * ux
    for (let k = 0; k < triangles; k++) {
      const ids = [vi(k * 3), vi(k * 3 + 1), vi(k * 3 + 2)]
      const d = ids.map(along)
      if (Math.min(...d) > 0 || Math.max(...d) < 0) continue
      for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        if ((d[i] > 0) === (d[j] > 0) && d[i] !== 0) continue
        const f = d[i] === d[j] ? 0 : d[i] / (d[i] - d[j])
        const a = ids[i], b = ids[j]
        const x = v[a] + (v[b] - v[a]) * f, y = v[a + 1] + (v[b + 1] - v[a + 1]) * f, z = v[a + 2] + (v[b + 2] - v[a + 2]) * f
        const off = side(x, z)
        if (Math.abs(Math.abs(off) - half) > 0.01) continue
        const face = faces[off > 0 ? '1' : '-1']
        if (y < face.lo) face.lo = y
        if (y > face.hi) face.hi = y
      }
    }
    for (const sign of [1, -1]) {
      const face = faces[String(sign)]
      stations.push({
        t,
        face: sign,
        x: px + -uz * half * sign,
        z: pz + ux * half * sign,
        bottom: Number.isFinite(face.lo) ? face.lo : null,
        top: Number.isFinite(face.hi) ? face.hi : null,
      })
    }
  }
  return {
    start: [s0.x, s0.z],
    end: [s1.x, s1.z],
    fillToTerrain: node.fillToTerrain ?? null,
    supportSlabId: node.supportSlabId ?? null,
    supportOffset: node.supportOffset ?? 0,
    height: node.height ?? null,
    stations,
  }
})()`

const READ_SUN = `(() => {
  let sun = null
  window.__pascalPerf.three().scene.traverse((o) => { if (o.name === 'eco-sun' && o.isDirectionalLight) sun = o })
  if (!sun) return null
  sun.updateWorldMatrix(true, false)
  sun.target.updateWorldMatrix(true, false)
  const a = sun.getWorldPosition(sun.position.clone())
  const b = sun.target.getWorldPosition(sun.position.clone())
  return [a.x - b.x, a.y - b.y, a.z - b.z]
})()`

const READ_TREES = `(() => {
  const out = { trunks: [], canopies: [] }
  let group = null
  window.__pascalPerf.three().scene.traverse((o) => { if (o.name === 'eco-site-trees') group = o })
  if (!group) return null
  for (const mesh of group.children) {
    if (!mesh.isInstancedMesh) continue
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    const box = mesh.geometry.boundingBox
    const m = mesh.matrixWorld.clone()
    const M = m.constructor
    const P = mesh.position.constructor
    const Q = mesh.quaternion.constructor
    const list = mesh.name.includes('trunk') ? out.trunks : out.canopies
    for (let i = 0; i < mesh.count; i++) {
      const im = new M()
      mesh.getMatrixAt(i, im)
      const p = new P(), q = new Q(), s = new P()
      im.decompose(p, q, s)
      list.push({ x: p.x, z: p.z, low: p.y + s.y * box.min.y, high: p.y + s.y * box.max.y })
    }
  }
  return out
})()`

const READ_PLAN = `(() => {
  const parse = (el) => (el.getAttribute('points') || '').trim().split(/\\s+/).map((pair) => pair.split(',').map(Number))
  const contours = [...document.querySelectorAll('[data-eco-plan="contours"] polyline')].map((el) => ({
    level: Number(el.getAttribute('data-level')),
    points: parse(el),
  }))
  const survey = [...document.querySelectorAll('[data-eco-plan="guides"] polyline[data-kind="boundary"]')].map(parse)
  const trees = [...document.querySelectorAll('[data-eco-plan="trees"] circle[data-canopy]')].map((el) => ({
    x: Number(el.getAttribute('cx')),
    z: Number(el.getAttribute('cy')),
    r: Number(el.getAttribute('r')),
  }))
  return { contours, survey, trees }
})()`

// ------------------------------------------------ input
async function key(cdp, keyName, code, keyCode) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, text: keyName.length === 1 ? keyName : undefined })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode })
}

// Alt held: the eco plan snap to the massing outline is suspended, so the
// walls land where they are planned.
const ALT = 1

async function moveTo(cdp, from, to, steps = 12) {
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', modifiers: ALT })
    await Bun.sleep(25)
  }
}

async function click(cdp, at) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1, modifiers: ALT })
  await Bun.sleep(60)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1, modifiers: ALT })
  await Bun.sleep(250)
}

/** Draw one wall with the wall tool from `a` to `b` (scene [x, z]); returns its id. */
async function drawWall(cdp, site, a, b) {
  const before = new Set(await evaluate(cdp, `window.__pascalPerf.listNodes('wall')`))
  const rect = await evaluate(
    cdp,
    `(() => { const r = window.__pascalPerf.three().gl.domElement.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })()`,
  )
  const screen = async ([x, z]) => {
    const p = await evaluate(cdp, `window.__pascalPerf.projectPoint(${x}, ${groundY(site, x, z)}, ${z})`)
    const at = { x: rect.left + p.x, y: rect.top + p.y }
    const onCanvas = await evaluate(
      cdp,
      `document.elementFromPoint(${at.x}, ${at.y}) === window.__pascalPerf.three().gl.domElement`,
    )
    if (p.behindCamera || !onCanvas) {
      throw new Error(`pad point [${x}, ${z}] is not on the canvas at ${JSON.stringify(at)}`)
    }
    return at
  }
  const sa = await screen(a)
  const sb = await screen(b)
  await key(cdp, 'Escape', 'Escape', 27)
  await key(cdp, 'b', 'KeyB', 66)
  await Bun.sleep(500)
  await moveTo(cdp, { x: sa.x - 40, y: sa.y - 40 }, sa)
  await click(cdp, sa)
  await moveTo(cdp, sa, sb, 24)
  await click(cdp, sb)
  await key(cdp, 'Escape', 'Escape', 27)
  const id = await waitFor(
    cdp,
    `window.__pascalPerf.listNodes('wall').find((id) => !${JSON.stringify([...before])}.includes(id))`,
    10_000,
  )
  await key(cdp, 'Escape', 'Escape', 27)
  if (!id) throw new Error(`no wall was created by clicks at ${JSON.stringify(sa)} → ${JSON.stringify(sb)}`)
  return id
}

// ------------------------------------------------ comparisons
function checkWall(label, site, wall, { mustMeetGround }) {
  const fails = []
  const lines = []
  const ok = (cond, msg) => (cond ? lines.push(`OK ${label}: ${msg}`) : fails.push(`${label}: ${msg}`))
  ok(wall.fillToTerrain === true, `created with fillToTerrain (${wall.fillToTerrain})`)
  ok(wall.supportSlabId === 'ground', `hosted on the ground (${wall.supportSlabId})`)
  const plane = groundY(site, wall.start[0], wall.start[1]) + wall.supportOffset
  let worstBottom = 0
  let worstTop = 0
  let met = 0
  let buried = 0
  let missing = 0
  const offBy = []
  for (const s of wall.stations) {
    if (s.bottom == null || s.top == null) {
      missing++
      continue
    }
    const ground = groundY(site, s.x, s.z)
    const expected = Math.min(plane, ground)
    offBy.push({ t: s.t, x: s.x, z: s.z, bottom: s.bottom, expected, ground, off: s.bottom - expected })
    worstBottom = Math.max(worstBottom, Math.abs(s.bottom - expected))
    if (wall.height != null) worstTop = Math.max(worstTop, Math.abs(s.top - (plane + wall.height)))
    if (ground <= plane + 1e-9) met++
    else buried = Math.max(buried, ground - plane)
  }
  ok(missing === 0, `both faces cut at every station (${wall.stations.length - missing}/${wall.stations.length})`)
  ok(
    worstBottom < GROUND_TOLERANCE_M,
    `foot = min(plane, ground) on both faces at every station, worst ${(worstBottom * 100).toFixed(1)} cm`,
  )
  if (wall.height != null) {
    ok(worstTop < GROUND_TOLERANCE_M, `head = plane + height at every station, worst ${(worstTop * 100).toFixed(1)} cm`)
  }
  if (mustMeetGround) {
    ok(met === wall.stations.length, `meets the ground on both faces at every station (${met}/${wall.stations.length})`)
  }
  const fmt = (v) => v.toFixed(3)
  const worst = [...offBy].sort((a, b) => Math.abs(b.off) - Math.abs(a.off)).slice(0, 3)
  const detail = `${label}: start [${wall.start.map(fmt)}] end [${wall.end.map(fmt)}] offset ${fmt(wall.supportOffset)}; worst stations ${worst.map((s) => `t=${s.t.toFixed(2)} bottom ${fmt(s.bottom)} expected ${fmt(s.expected)} (ground ${fmt(s.ground)})`).join('; ')}`
  const change = groundY(site, wall.end[0], wall.end[1]) - groundY(site, wall.start[0], wall.start[1])
  return { fails, lines, plane, met, buried, worstBottom, worstTop, detail, change, length: Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) }
}

function checkSun(label, site, measured) {
  const expected = sceneVector(sunIndependent(new Date(site.sunAt), site.originLL[1], site.originLL[0]), site.northDeg ?? 0)
  const angle = measured ? angleDeg(measured, expected) : 180
  return {
    angle,
    fails: angle < SUN_TOLERANCE_DEG ? [] : [`${label}: sun off by ${angle.toFixed(2)}° (limit ${SUN_TOLERANCE_DEG}°)`],
  }
}

function checkTrees(label, site, drawn) {
  const fails = []
  const sent = site.trees
  if (!drawn || drawn.trunks.length !== sent.length || drawn.canopies.length !== sent.length) {
    return { fails: [`${label}: ${drawn ? drawn.trunks.length : 0} trees drawn, ${sent.length} sent`], worstBase: null }
  }
  let worstBase = 0
  let worstHeight = 0
  let worstPos = 0
  sent.forEach((tree, i) => {
    const trunk = drawn.trunks[i]
    const canopy = drawn.canopies[i]
    const x = tree.pt[0]
    const z = -tree.pt[1]
    worstPos = Math.max(worstPos, Math.hypot(trunk.x - x, trunk.z - z))
    worstBase = Math.max(worstBase, Math.abs(trunk.low - groundY(site, x, z)))
    worstHeight = Math.max(worstHeight, Math.abs(canopy.high - trunk.low - tree.heightM))
  })
  if (worstPos > 1e-6) fails.push(`${label}: trees stand ${worstPos.toFixed(3)} m from where they were sent`)
  if (worstBase > GROUND_TOLERANCE_M) fails.push(`${label}: tree base off the ground by ${(worstBase * 100).toFixed(1)} cm`)
  if (worstHeight > 0.01) fails.push(`${label}: tree height off by ${(worstHeight * 100).toFixed(1)} cm`)
  return { fails, worstBase, worstHeight, worstPos }
}

function checkPlan(label, site, plan) {
  const fails = []
  const { heights } = site.terrain
  let min = Infinity
  let max = -Infinity
  for (const v of heights) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const expectedLevels = []
  for (let l = Math.ceil(min); l <= Math.floor(max); l++) expectedLevels.push(l)
  const drawnLevels = [...new Set(plan.contours.map((c) => c.level))].sort((a, b) => a - b)
  if (JSON.stringify(drawnLevels) !== JSON.stringify(expectedLevels)) {
    fails.push(`${label}: contour levels drawn ${drawnLevels.join(',')} ≠ the heights' span ${expectedLevels.join(',')}`)
  }
  let worstLevel = 0
  let vertices = 0
  for (const c of plan.contours) {
    for (const [x, z] of c.points) {
      worstLevel = Math.max(worstLevel, Math.abs(groundAsl(site, x, z) - c.level))
      vertices++
    }
  }
  if (!(vertices > 0) || worstLevel > 0.01) {
    fails.push(`${label}: contour vertices off their level by up to ${(worstLevel * 100).toFixed(2)} cm (${vertices} vertices)`)
  }
  const boundary = site.guides.find((g) => g.kind === 'boundary').pts.map(([x, z]) => [x, -z])
  const drawn = plan.survey[0] ?? []
  const surveyOff =
    drawn.length === boundary.length
      ? Math.max(...boundary.map(([x, z], i) => Math.hypot(drawn[i][0] - x, drawn[i][1] - z)))
      : Infinity
  if (!(surveyOff < 1e-6)) fails.push(`${label}: survey line drawn ${surveyOff} m from the sent boundary`)
  const treeOff =
    plan.trees.length === site.trees.length
      ? Math.max(
          ...site.trees.map((t, i) =>
            Math.max(
              Math.hypot(plan.trees[i].x - t.pt[0], plan.trees[i].z + t.pt[1]),
              Math.abs(plan.trees[i].r - t.canopyM / 2),
            ),
          ),
        )
      : Infinity
  if (!(treeOff < 1e-6)) fails.push(`${label}: canopies drawn ${treeOff} m from the sent trees`)
  return { fails, levels: drawnLevels.length, lines: plan.contours.length, vertices, worstLevel, surveyOff, treeOff }
}

// ------------------------------------------------ run
if (!existsSync(join(outDir, BASE.slice(1), 'index.html'))) {
  console.error(`FAIL - no static export at ${outDir}${BASE}/ (see the header for the build command)`)
  process.exit(1)
}

const { server } = serveStatic(outDir, port)
const cdpPort = await freePort()
const browser = launchChrome(cdpPort)

async function loadEditor(cdp) {
  await cdp.send('Page.navigate', { url: `${origin}${BASE}/eco-build.json` })
  await Bun.sleep(800)
  await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' })
  await cdp.send('Page.navigate', { url: `${origin}${BASE}/?perf` })
  const ready = await waitFor(
    cdp,
    `typeof window.ecoEmbedded === 'boolean' && !!window.__pascalPerf && window.__pascalPerf.listNodes('site').length === 1`,
    90_000,
  )
  if (!ready) throw new Error('the editor did not come up')
  await Bun.sleep(1500)
}

async function sendSite(cdp, site) {
  await evaluate(cdp, `window.postMessage({ t: 'eco:hello', v: 'eco/1' }, location.origin); true`)
  await Bun.sleep(400)
  await evaluate(cdp, `window.postMessage(${JSON.stringify({ t: 'eco:load-site', site })}, location.origin); true`)
  const applied = await waitFor(
    cdp,
    `(() => { const p = window.__pascalPerf; const id = p.listNodes('site')[0]; const n = id && p.node(id); let trees = false; p.three().scene.traverse((o) => { if (o.name === 'eco-site-trees') trees = true }); return !!(n && n.terrain) && trees })()`,
    30_000,
  )
  if (!applied) throw new Error('the site did not apply (terrain + standing trees)')
  await Bun.sleep(2500)
}

async function measure(cdp, site, wallIds) {
  const walls = {}
  for (const [name, id] of Object.entries(wallIds)) walls[name] = await evaluate(cdp, MEASURE_WALL(id))
  const sun = await evaluate(cdp, READ_SUN)
  const trees = await evaluate(cdp, READ_TREES)
  await evaluate(cdp, `document.querySelector('[aria-label="Split"]')?.click(); true`)
  const planReady = await waitFor(cdp, `document.querySelectorAll('[data-eco-plan="contours"] polyline').length > 0`, 20_000)
  const plan = planReady ? await evaluate(cdp, READ_PLAN) : { contours: [], survey: [], trees: [] }
  await evaluate(cdp, `document.querySelector('[aria-label="3D"]')?.click(); true`)
  await Bun.sleep(1200)
  return { walls, sun, trees, plan, site }
}

function judge(tag, reference, m) {
  const groups = {}
  const report = []
  const down = checkWall(`${tag} downhill wall`, reference, m.walls.downhill, { mustMeetGround: true })
  const up = checkWall(`${tag} uphill wall`, reference, m.walls.uphill, { mustMeetGround: false })
  groups.walls = [...down.fails, ...up.fails]
  report.push(...down.lines, ...up.lines)
  const sun = checkSun(`${tag} sun`, reference, m.sun)
  groups.sun = sun.fails
  const trees = checkTrees(`${tag} standing trees`, reference, m.trees)
  groups.trees = trees.fails
  const plan = checkPlan(`${tag} plan`, reference, m.plan)
  groups.plan = plan.fails
  return { groups, report, down, up, sun, trees, plan }
}

let exitCode = 0
try {
  const page = await firstPage(cdpPort)
  const cdp = await connect(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.bringToFront')
  await loadEditor(cdp)
  const site = a5Site()
  await sendSite(cdp, site)

  // Only pad points the canvas itself shows: in the viewport, not under a panel.
  const candidates = padPoints(site)
  const shown = await evaluate(
    cdp,
    `(() => {
      const p = window.__pascalPerf
      const canvas = p.three().gl.domElement
      const r = canvas.getBoundingClientRect()
      const clear = (px, py) => {
        for (const [dx, dy] of [[0, 0], [-30, -30], [30, 30], [-30, 30], [30, -30]]) {
          const x = px + dx, y = py + dy
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
          if (document.elementFromPoint(x, y) !== canvas) return false
        }
        return true
      }
      return ${JSON.stringify(candidates.map(([x, z]) => [x, groundY(site, x, z), z]))}.map(([x, y, z]) => {
        const s = p.projectPoint(x, y, z)
        return !s.behindCamera && clear(r.left + s.x, r.top + s.y)
      })
    })()`,
  )
  const visible = candidates.filter((_, i) => shown[i])
  console.log(`pad points on a 1 m grid: ${candidates.length}, on screen: ${visible.length}`)
  const plan = padWalls(site, visible)
  const wallIds = {
    downhill: await drawWall(cdp, site, plan.downhill.from, plan.downhill.to),
    uphill: await drawWall(cdp, site, plan.uphill.from, plan.uphill.to),
  }
  await Bun.sleep(1500)
  const control = judge('site', site, await measure(cdp, site, wallIds))
  for (const line of control.report) console.log(line)
  const expectedSun = sunIndependent(new Date(SUN_AT), site.originLL[1], site.originLL[0])
  console.log(
    `sun at ${SUN_AT} for ${site.originLL.join(', ')}, northDeg ${site.northDeg}: az ${expectedSun.azimuth.toFixed(2)}°, alt ${expectedSun.altitude.toFixed(2)}° — editor's light ${control.sun.angle.toFixed(3)}° away (the pre-A5 conversion would be ${angleDeg(legacyVector(expectedSun, site.northDeg ?? 0), sceneVector(expectedSun, site.northDeg ?? 0)).toFixed(1)}° away)`,
  )
  const wallLine = (name, w) =>
    `${name} ${w.length.toFixed(2)} m, ground ${w.change >= 0 ? '+' : ''}${w.change.toFixed(2)} m start→end, plane ${w.plane.toFixed(2)} m, ground at or below the plane at ${w.met}/50 face points${w.buried > 0 ? `, buried up to ${w.buried.toFixed(2)} m` : ''}, worst foot ${(w.worstBottom * 100).toFixed(1)} cm, worst head ${(w.worstTop * 100).toFixed(1)} cm`
  console.log(`walls: ${wallLine('downhill', control.down)} · ${wallLine('uphill', control.up)}`)
  console.log(
    `trees: ${site.trees.length} drawn, base worst ${((control.trees.worstBase ?? 0) * 100).toFixed(1)} cm · plan: ${control.plan.levels} contour levels, ${control.plan.lines} lines, ${control.plan.vertices} vertices, worst ${(control.plan.worstLevel * 100).toFixed(4)} cm off level; survey ${control.plan.surveyOff.toExponential(1)} m; canopies ${control.plan.treeOff.toExponential(1)} m`,
  )
  console.log(control.down.detail)
  console.log(control.up.detail)
  const controlFails = Object.values(control.groups).flat()

  if (!selfTest) {
    if (controlFails.length) {
      console.error('FAIL')
      for (const f of controlFails) console.error('-', f)
      exitCode = 1
    } else {
      console.log('check-a5-site OK')
    }
  } else if (controlFails.length) {
    console.error('SELF-TEST FAIL: the control run should pass')
    for (const f of controlFails) console.error('-', f)
    exitCode = 1
  } else {
    console.log('SELF-TEST OK: control run passes')
    await sendSite(cdp, forgedSite())
    await Bun.sleep(1500)
    const forged = judge('forged', site, await measure(cdp, site, wallIds))
    const caught = Object.entries(forged.groups).map(([group, fails]) => ({ group, caught: fails.length > 0, first: fails[0] }))
    for (const c of caught) {
      console.log(`${c.caught ? 'SELF-TEST OK' : 'SELF-TEST FAIL'}: ${c.group} ${c.caught ? `rejected — ${c.first}` : 'passed a site drawn wrongly'}`)
    }
    if (caught.every((c) => c.caught)) console.log('check-a5-site --self-test OK')
    else exitCode = 1
  }
  cdp.ws.close()
} catch (err) {
  console.error(err)
  exitCode = 1
} finally {
  await browser.close()
  server.stop(true)
}
process.exit(exitCode)
