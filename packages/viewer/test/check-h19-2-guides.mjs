#!/usr/bin/env bun
/**
 * H19.2 — eco site guides no longer break the WebGPU pipeline.
 *
 * With a site loaded, drei's <Line> (WebGL-only LineMaterial) failed the node
 * builder: the post-processing pipeline rebuilt and failed every frame and the
 * viewer fell back to a direct render with long CPU stalls. Reads the three
 * interleaved H19-scene pairs (guides as drei Line vs Line2NodeMaterial) and
 * asserts, per pair, two separately derived signals:
 *   - the renderer's own render() calls per frame (info.calls per useFrame
 *     tick): the full pipeline (2 shadow + 4 scene/composite passes) before
 *     H19.2c is 6; the fallback is fewer;
 *   - the sampler's render-interval p99: at the 50 fps cap it stays within two
 *     vsyncs (34 ms); the rebuild loop stretched it past 50 ms.
 * Before must show the failure on both, after must clear both.
 *
 * --self-test forges an after still on the fallback and an after still
 * stalling; each must FAIL while the unforged control passes.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAIRS = ['', 'ab2-', 'ab3-'].map((tag) => ({
  before: join(import.meta.dir, `h19-2-guides-${tag}before-scene.json`),
  after: join(import.meta.dir, `h19-2-guides-${tag}after-scene.json`),
}))

function check(pairs, label) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  pairs.forEach(([before, after], i) => {
    const tag = `${label} pair ${i + 1}`
    ok(
      before.fixture?.sha256 && before.fixture.sha256 === after.fixture?.sha256,
      `${tag}: same fixture (${before.fixture?.name})`,
    )
    const cb = before.frames?.callsPerFrame
    const ca = after.frames?.callsPerFrame
    const pb = before.frameMs?.p99
    const pa = after.frameMs?.p99
    ok(cb < 6 && pb > 50, `${tag}: before shows the failure (${cb} calls/frame, interval p99 ${pb} ms)`)
    ok(ca >= 6, `${tag}: after runs the full pipeline (${ca} calls/frame)`)
    ok(pa <= 34, `${tag}: after has no stalls (interval p99 ${pa} ms)`)
  })
  return fails
}

if (process.argv.includes('--self-test')) {
  console.log('check-h19-2-guides --self-test')
  const fixture = { name: 'h19-scene', sha256: 'f'.repeat(64) }
  const before = { fixture, frames: { callsPerFrame: 4 }, frameMs: { p99: 110 } }
  const after = { fixture, frames: { callsPerFrame: 6 }, frameMs: { p99: 33.4 } }
  const control = [
    [before, after],
    [before, after],
    [before, after],
  ]
  if (check(control, 'control').length) {
    console.error('SELF-TEST FAIL: control should pass')
    process.exit(1)
  }
  console.log('SELF-TEST OK: control passes')
  const forges = [
    ['forge-fallback', [[before, { ...after, frames: { callsPerFrame: 4 } }], ...control.slice(1)], 'full pipeline'],
    ['forge-stalls', [...control.slice(0, 2), [before, { ...after, frameMs: { p99: 99.9 } }]], 'no stalls'],
  ]
  for (const [name, pairs, needle] of forges) {
    const fails = check(pairs, name)
    if (!fails.some((f) => f.includes(needle))) {
      console.error(`SELF-TEST FAIL: ${name} not rejected on "${needle}"`, fails)
      process.exit(1)
    }
    console.log(`SELF-TEST OK: ${name} rejected`)
  }
  console.log('check-h19-2-guides --self-test OK')
  process.exit(0)
}

const pairs = PAIRS.map(({ before, after }) => {
  if (!existsSync(before) || !existsSync(after)) {
    console.error(`FAIL - missing ${before} or ${after}`)
    process.exit(1)
  }
  return [JSON.parse(readFileSync(before, 'utf8')), JSON.parse(readFileSync(after, 'utf8'))]
})
const fails = check(pairs, 'guides')
if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h19-2-guides OK')
