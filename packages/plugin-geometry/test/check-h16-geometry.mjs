/**
 * H16.1 acceptance — geometry kit ratios, north recovery, snap, banned labels.
 * Usage: bun packages/plugin-geometry/test/check-h16-geometry.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FORMS } from '../src/catalog.ts'
import {
  adQuadratum,
  archimedeanSolid,
  cordTriple,
  equalShadows,
  extremeMean,
  hexCircleLattice,
  regularPentagon,
  regularSolid,
  rootRectangle,
  snapToLattice,
  tilingFill,
  tilingIds,
  twoCircle,
} from '../src/forms.ts'
import { BANNED_UI_LABELS, PHI, SQRT3 } from '../src/math.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const sizes = [1, 3.2, 10]

for (const r of sizes) {
  const f = twoCircle(r)
  assert(Math.abs(f.meta.lensHeightOverWidth - SQRT3) < 1e-9, `lens √3 at r=${r}`)
}

for (const u of sizes) {
  const t = cordTriple(u)
  assert(Math.abs(t.meta.rightAngleDot) < 1e-9, `3-4-5 right angle unit=${u}`)
}

for (const s of sizes) {
  const p = regularPentagon(s)
  assert(Math.abs(p.meta.diagonalOverSide - PHI) < 1e-9, `pentagon φ side=${s}`)
}

for (const root of [2, 3, 5]) {
  for (const s of sizes) {
    const rr = rootRectangle(s, root)
    assert(Math.abs(rr.meta.ratio - Math.sqrt(root)) < 1e-9, `root-${root}`)
  }
}

for (const s of sizes) {
  const aq = adQuadratum(s, 4)
  assert(Math.abs(aq.meta.stepAreaRatio - 0.5) < 1e-9, `ad quadratum halves area side=${s}`)
}

for (const L of sizes) {
  const em = extremeMean(L)
  assert(Math.abs(em.meta.phiApprox - PHI) < 1e-9, `extreme-mean φ L=${L}`)
  assert(Math.abs(em.meta.majorOverMinor - PHI) < 1e-9, `major/minor φ`)
}

{
  const g = equalShadows(1.5, [-2, 0], [2, 0], [0, 0])
  const bearing = g.meta.northBearingDeg
  const err = Math.min(Math.abs(bearing - 0), Math.abs(bearing - 180), Math.abs(bearing - 360))
  assert(err <= 0.5, `north within 0.5°, got ${bearing}`)
}

{
  const lat = hexCircleLattice(0.5, 2)
  const pts = lat.points
  const near = [pts[3][0] + 0.0004, pts[3][1] - 0.0003]
  const snapped = snapToLattice(near, pts, 0.001)
  assert(Math.hypot(snapped[0] - pts[3][0], snapped[1] - pts[3][1]) < 1e-9, 'snap to lattice ≤1mm')
}

for (const kind of ['tetrahedron', 'cube', 'octahedron', 'icosahedron', 'dodecahedron']) {
  for (const edge of sizes) {
    const s = regularSolid(kind, edge)
    assert(s.meta.radiusSpread < 1e-6, `${kind} spherical`)
    assert(Math.abs(s.meta.edgeMean - edge) < 1e-4, `${kind} edge mean`)
  }
}

for (const kind of ['cuboctahedron', 'truncated-tetrahedron', 'rhombicuboctahedron']) {
  for (const edge of sizes) {
    const s = archimedeanSolid(kind, edge)
    assert(s.meta.radiusSpread < 1e-5, `arch ${kind} spherical`)
    assert(Math.abs(s.meta.edgeMean - edge) / edge < 0.03, `arch ${kind} edge`)
  }
}

assert(tilingIds().length === 11, `11 tilings, got ${tilingIds().length}`)
for (const id of ['4.4.4.4', '3.3.3.3.3.3', '6.6.6']) {
  for (const tile of [1, 2]) {
    const t = tilingFill(id, tile, 20)
    assert(t.meta.maxGap < 1e-6 || t.meta.maxGap < tile, `tiling ${id} gap ${t.meta.maxGap}`)
    assert(t.polylines.length > 0, `tiling ${id} draws`)
  }
}
// Square tiling must cover 20×20 with zero leftover when tile divides area.
{
  const t = tilingFill('4.4.4.4', 1, 20)
  assert(t.meta.maxGap < 1e-9, `4.4.4.4 closed over 20×20, gap=${t.meta.maxGap}`)
}

assert(FORMS.length === 20, `20 forms, got ${FORMS.length}`)
const catalogSrc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/catalog.ts'),
  'utf8',
).toLowerCase()
for (const ban of ['flower of life', 'metatron', 'seed of life', 'vesica piscis']) {
  assert(!catalogSrc.includes(`label: '${ban}'`) && !catalogSrc.includes(`label: "${ban}"`), ban)
}
for (const f of FORMS) {
  const label = f.label.toLowerCase()
  for (const ban of BANNED_UI_LABELS) {
    assert(!label.includes(ban), `label contains ${ban}: ${f.label}`)
  }
}

// Grep panel + catalog UI strings for banned words as titles.
const uiFiles = ['../src/panel.tsx', '../src/catalog.ts', '../src/host-panel.ts']
for (const rel of uiFiles) {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8').toLowerCase()
  for (const ban of BANNED_UI_LABELS) {
    // allow in comments / keywords only — fail if used as visible label=
    assert(!src.includes(`>${ban}<`) && !src.includes(`label: '${ban}'`), `${rel} banned ${ban}`)
  }
}

console.log('check-h16-geometry: OK', { forms: FORMS.length, sizes, tilings: tilingIds().length })
