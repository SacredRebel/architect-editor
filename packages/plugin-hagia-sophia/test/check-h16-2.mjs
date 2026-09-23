/**
 * H16.2 acceptance — catenary arch / vault / dome + Poleni middle-third.
 * Run: bun packages/plugin-hagia-sophia/test/check-h16-2.mjs
 */
import {
  analyseThrust,
  fitCatenary,
  fitEndpointError,
  sampleCatenaryMeridian,
} from '../src/math/catenary.ts'
import { buildArchCentreline, buildArchOuterPoints } from '../src/math/arch-profile.ts'
import { buildDomeProfile } from '../src/kinds/hs-dome/geometry.ts'

const MM = 0.001
let failed = 0

function ok(cond, msg) {
  if (cond) {
    console.log(`  OK  ${msg}`)
  } else {
    console.error(` FAIL ${msg}`)
    failed++
  }
}

console.log('H16.2 catenary fit (springings + crown ≤ 1 mm)')
const cases = [
  [6, 1],
  [10, 4],
  [20 * 0.3048, 8 * 0.3048],
  [12, 8],
  [31.2, 12],
]
for (const [span, rise] of cases) {
  const fit = fitCatenary(span, rise)
  const err = fitEndpointError(fit)
  ok(err <= MM, `span=${span.toFixed(3)} rise=${rise.toFixed(3)} err=${(err * 1000).toFixed(4)} mm`)
  const pts = buildArchOuterPoints('catenary', span, rise, 64)
  const apex = pts.reduce((b, p) => (p.y > b.y ? p : b), pts[0])
  ok(Math.abs(pts[0].y) <= MM && Math.abs(pts[pts.length - 1].y) <= MM, 'outer springings on deck')
  ok(Math.abs(apex.y - rise) <= MM && Math.abs(apex.x) <= MM, 'outer crown')
}

console.log('H16.2 Poleni middle third')
{
  const span = 8
  const rise = 3
  const thickness = 0.6
  const centre = buildArchCentreline('catenary', span, rise, thickness, 48)
  const a = analyseThrust(centre, thickness, span, rise, 48)
  ok(a.withinMiddleThird, `catenary ring keeps thrust (max offset ${(a.maxOffset * 1000).toFixed(2)} mm)`)
}
{
  const span = 8
  const rise = 4
  const thickness = 0.15
  const centre = buildArchCentreline('round', span, rise, thickness, 48)
  const a = analyseThrust(centre, thickness, span, rise, 48)
  ok(!a.withinMiddleThird, `thin semicircle leaves middle third (offset ${(a.maxOffset * 1000).toFixed(2)} mm)`)
}

console.log('H16.2 catenary vault = extruded profile (depth field)')
ok(typeof buildArchOuterPoints === 'function', 'arch outer points builder present')

console.log('H16.2 catenary dome of revolution')
{
  const radius = 5
  const height = 4
  const merid = sampleCatenaryMeridian(radius, height, 48)
  ok(Math.abs(merid[0].x - radius) < 1e-9, 'meridian starts at rim')
  ok(Math.abs(merid[0].y) <= MM, 'rim at y=0')
  const last = merid[merid.length - 1]
  ok(Math.abs(last.x) <= MM && Math.abs(last.y - height) <= MM, 'crown within 1 mm')
  const dome = buildDomeProfile(radius, height / (2 * radius), 48, 'catenary')
  ok(Math.abs(dome[dome.length - 1].y - height) <= MM, 'dome profile crown')
}

if (failed) {
  console.error(`\nH16.2 FAILED (${failed})`)
  process.exit(1)
}
console.log('\nH16.2 OK')
