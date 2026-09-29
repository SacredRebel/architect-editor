#!/usr/bin/env bun
/**
 * H19.2c — shadow maps redraw on change, not every frame (WebGPU path).
 *
 * Reads the before/after captures on the H19 scene (shadow casters present):
 * three interleaved pairs, same harness, same path, same fixture. Per pair:
 *   - the scene has casters and a shadow-casting light, identical on both sides;
 *   - before, every shadow light redraws every frame; after, a small fraction;
 *   - two separately derived counts agree on how many passes went: the harness's
 *     own count of shadow-map render() calls per frame, and the renderer's own
 *     info.calls per useFrame tick (frames.callsPerFrame).
 * Across the pairs: render time is not worse — the median of the three
 * differences stays under the noise floor (0.26 ms; timestamps move in
 * 0.0655 ms steps).
 *
 * --self-test forges an after that still redraws every frame, a scene with no
 * casters, a count the renderer does not confirm, and a set that got slower;
 * each must FAIL while the unforged control passes. check-h17-1 runs the same
 * assertions on the committed captures in place of its old text match.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const NOISE_FLOOR_MS = 0.26
export const SHADOW_PAIRS = ['', 'ab2-', 'ab3-'].map((tag) => ({
  before: join(import.meta.dir, `h19-2c-${tag}before-scene.json`),
  after: join(import.meta.dir, `h19-2c-${tag}after-scene.json`),
}))

export function checkShadowPair(before, after, label) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  ok(
    before.cameraPath?.kind === after.cameraPath?.kind &&
      before.cameraPath?.durationMs === after.cameraPath?.durationMs,
    'same path',
  )
  ok(
    before.fixture?.sha256 && before.fixture.sha256 === after.fixture?.sha256,
    `same fixture (${before.fixture?.name})`,
  )
  const sb = before.scene ?? {}
  const sa = after.scene ?? {}
  ok(
    sb.drawables === sa.drawables && sb.triangles === sa.triangles && sb.casters === sa.casters,
    `same scene (drawables ${sb.drawables}/${sa.drawables}, tris ${sb.triangles}/${sa.triangles}, casters ${sb.casters}/${sa.casters})`,
  )
  ok(
    (sb.casters ?? 0) > 0 && (sb.shadowLights ?? 0) > 0,
    `casters present (${sb.casters} casters, ${sb.shadowLights} shadow lights)`,
  )

  const pb = before.shadowPasses?.perFrame
  const pa = after.shadowPasses?.perFrame
  const lights = sb.shadowLights ?? 0
  ok(
    typeof pb === 'number' && pb >= 0.9 * lights,
    `before redraws every shadow light every frame (${pb} passes/frame, ${lights} lights)`,
  )
  ok(
    typeof pa === 'number' && pa <= 0.2 * Math.max(1, lights),
    `after redraws a small fraction (${pa} passes/frame)`,
  )

  const cb = before.frames?.callsPerFrame
  const ca = after.frames?.callsPerFrame
  if (typeof pb === 'number' && typeof pa === 'number' && typeof cb === 'number' && typeof ca === 'number') {
    const byHarness = pb - pa
    const byRenderer = cb - ca
    ok(
      Math.abs(byHarness - byRenderer) <= 0.1 + 0.1 * Math.abs(byHarness),
      `harness and renderer agree on passes removed per frame (${byHarness.toFixed(3)} vs ${byRenderer.toFixed(3)})`,
    )
  } else {
    ok(false, 'pass counts present on both sides')
  }
  return fails
}

/** Pairs as [before, after] artifacts. */
export function checkShadowSet(pairs, label) {
  const fails = []
  pairs.forEach(([before, after], i) => fails.push(...checkShadowPair(before, after, `${label} pair ${i + 1}`)))
  const diffs = pairs
    .map(([before, after]) => after.renderMs?.median - before.renderMs?.median)
    .filter((d) => Number.isFinite(d))
    .sort((a, b) => a - b)
  const median = diffs[Math.floor(diffs.length / 2)]
  const msg = `${label}: renderMs not worse — median of ${diffs.length} pair differences ${median?.toFixed(3)} ms (${diffs.map((d) => d.toFixed(3)).join(', ')}) under ${NOISE_FLOOR_MS}`
  if (pairs.length >= 3 && diffs.length === pairs.length && median < NOISE_FLOOR_MS) console.log('OK', msg)
  else fails.push(msg)
  return fails
}

export function loadShadowSet() {
  return SHADOW_PAIRS.map(({ before, after }) => {
    if (!existsSync(before) || !existsSync(after)) throw new Error(`missing ${before} or ${after}`)
    return [JSON.parse(readFileSync(before, 'utf8')), JSON.parse(readFileSync(after, 'utf8'))]
  })
}

if (import.meta.main) {
  if (process.argv.includes('--self-test')) {
    console.log('check-h19-2c --self-test')
    const scene = { drawables: 227, triangles: 54295, casters: 136, shadowLights: 2 }
    const base = {
      cameraPath: { kind: 'synthetic-pointer-orbit', durationMs: 20000 },
      fixture: { name: 'h19-scene', sha256: 'f'.repeat(64) },
      scene,
    }
    const before = (ms) => ({ ...base, shadowPasses: { perFrame: 2 }, frames: { callsPerFrame: 6 }, renderMs: { median: ms } })
    const after = (ms) => ({ ...base, shadowPasses: { perFrame: 0.154 }, frames: { callsPerFrame: 4.154 }, renderMs: { median: ms } })
    const control = [
      [before(5.3), after(5.4)],
      [before(5.6), after(5.6)],
      [before(5.2), after(5.1)],
    ]
    if (checkShadowSet(control, 'control').length) {
      console.error('SELF-TEST FAIL: control should pass')
      process.exit(1)
    }
    console.log('SELF-TEST OK: control passes')
    const swap = (pairs, i, forged) => pairs.map((p, j) => (j === i ? [p[0], forged(p[1])] : p))
    const forges = [
      ['forge-per-frame', swap(control, 0, (a) => ({ ...a, shadowPasses: { perFrame: 2 }, frames: { callsPerFrame: 6 } })), 'small fraction'],
      ['forge-no-casters', swap(control, 1, (a) => ({ ...a, scene: { ...scene, casters: 0 } })), 'same scene'],
      ['forge-unconfirmed', swap(control, 2, (a) => ({ ...a, frames: { callsPerFrame: 6 } })), 'agree on passes removed'],
      ['forge-slower', control.map(([b, a]) => [b, { ...a, renderMs: { median: a.renderMs.median + 1 } }]), 'renderMs not worse'],
    ]
    for (const [name, pairs, needle] of forges) {
      const fails = checkShadowSet(pairs, name)
      if (!fails.some((f) => f.includes(needle))) {
        console.error(`SELF-TEST FAIL: ${name} not rejected on "${needle}"`, fails)
        process.exit(1)
      }
      console.log(`SELF-TEST OK: ${name} rejected`)
    }
    console.log('check-h19-2c --self-test OK')
    process.exit(0)
  }

  const fails = checkShadowSet(loadShadowSet(), 'h19-2c')
  if (fails.length) {
    console.error('FAIL')
    for (const f of fails) console.error('-', f)
    process.exit(1)
  }
  console.log('check-h19-2c OK')
}
