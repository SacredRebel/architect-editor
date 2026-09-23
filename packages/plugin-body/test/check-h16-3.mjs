/**
 * H16.3 acceptance — body kernel port (curves, sweep, CSG, push-pull).
 * Run: bun packages/plugin-body/test/check-h16-3.mjs
 */
import {
  createCircularArcFaceBody,
  createRectangleBody,
  inspectBodySolid,
  pushPullBodyFace,
  subtractBodies,
  sweepBodyFace,
  validateBodyTopology,
} from '../src/index.ts'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`  OK  ${msg}`)
  else {
    console.error(` FAIL ${msg}`)
    failed++
  }
}

console.log('H16.3 rectangle → push-pull solid')
{
  const face = createRectangleBody({ width: 4, depth: 3 })
  ok(validateBodyTopology(face).valid, 'planar rectangle topology')
  const solid = pushPullBodyFace(face, 'face:0', 2).body
  ok(validateBodyTopology(solid).valid, 'extruded topology')
  const inspection = inspectBodySolid(solid)
  ok(inspection.validSolid, `solid volume=${inspection.volume}`)
}

console.log('H16.3 circular-arc face')
{
  const arc = createCircularArcFaceBody([2, 0, 0], [0, 0, 2], [-2, 0, 0])
  ok(validateBodyTopology(arc).valid, 'arc face topology')
  ok(arc.curves.some((c) => c.kind === 'circular-arc'), 'has circular-arc curve')
}

console.log('H16.3 sweep')
{
  const face = createRectangleBody({ width: 1.2, depth: 0.8 })
  const swept = sweepBodyFace(face, 'face:0', [
    [0, 0, 0],
    [0, 1.5, 0],
  ])
  ok(validateBodyTopology(swept.body).valid, 'swept body topology')
}

console.log('H16.3 CSG subtract')
{
  const a = pushPullBodyFace(createRectangleBody({ width: 4, depth: 4 }), 'face:0', 2).body
  const b = pushPullBodyFace(
    createRectangleBody({ width: 1, depth: 1, origin: [1.5, 0, 1.5] }),
    'face:0',
    2,
  ).body
  const result = subtractBodies(a, b)
  ok(validateBodyTopology(result.body).valid, 'subtract topology')
  ok(inspectBodySolid(result.body).validSolid, 'subtract remains a solid')
}

if (failed) {
  console.error(`\nH16.3 FAILED (${failed})`)
  process.exit(1)
}
console.log('\nH16.3 OK')
