#!/usr/bin/env bun
/**
 * H19.2c — shadow maps redraw on change, not every frame (WebGPU path).
 *
 * Reads the before/after captures on the H19 scene (shadow casters present),
 * same harness, same path, same fixture. Asserts:
 *   - the scene has casters and a shadow-casting light, identical on both sides;
 *   - before, every shadow light redraws every frame; after, a small fraction;
 *   - two separately derived counts agree on how many passes went: the harness's
 *     own count of shadow-map render() calls per frame, and the renderer's own
 *     info.calls per useFrame tick (frames.callsPerFrame);
 *   - render time did not get worse.
 *
 * --self-test forges an after that still redraws every frame, a scene with no
 * casters, and a count the renderer does not confirm; each must FAIL while the
 * unforged control passes. check-h17-1 runs the same assertions on the
 * committed captures in place of its old text match.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SHADOW_BEFORE = join(import.meta.dir, 'h19-2c-before-scene.json')
export const SHADOW_AFTER = join(import.meta.dir, 'h19-2c-after-scene.json')

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
  ok((sb.casters ?? 0) > 0 && (sb.shadowLights ?? 0) > 0, `casters present (${sb.casters} casters, ${sb.shadowLights} shadow lights)`)

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

  const rb = before.renderMs?.median
  const ra = after.renderMs?.median
  ok(
    typeof rb === 'number' && typeof ra === 'number' && ra <= rb * 1.05,
    `renderMs not worse (${rb} -> ${ra})`,
  )
  return fails
}

if (import.meta.main) {
  if (process.argv.includes('--self-test')) {
    console.log('check-h19-2c --self-test')
    const scene = { drawables: 120, triangles: 90000, casters: 60, shadowLights: 2 }
    const base = {
      cameraPath: { kind: 'synthetic-pointer-orbit', durationMs: 20000 },
      fixture: { name: 'h19-scene', sha256: 'f'.repeat(64) },
      scene,
    }
    const before = {
      ...base,
      shadowPasses: { perFrame: 2 },
      frames: { callsPerFrame: 6 },
      renderMs: { median: 9 },
    }
    const after = {
      ...base,
      shadowPasses: { perFrame: 0.08 },
      frames: { callsPerFrame: 4.08 },
      renderMs: { median: 7.5 },
    }
    if (checkShadowPair(before, after, 'control').length) {
      console.error('SELF-TEST FAIL: control should pass')
      process.exit(1)
    }
    console.log('SELF-TEST OK: control passes')
    const forges = [
      ['forge-per-frame', { ...after, shadowPasses: { perFrame: 2 }, frames: { callsPerFrame: 6 } }, 'small fraction'],
      ['forge-no-casters', { ...after, scene: { ...scene, casters: 0 } }, 'same scene'],
      ['forge-unconfirmed', { ...after, frames: { callsPerFrame: 6 } }, 'agree on passes removed'],
    ]
    for (const [name, forged, needle] of forges) {
      const fails = checkShadowPair(before, forged, name)
      if (!fails.some((f) => f.includes(needle))) {
        console.error(`SELF-TEST FAIL: ${name} not rejected on "${needle}"`, fails)
        process.exit(1)
      }
      console.log(`SELF-TEST OK: ${name} rejected`)
    }
    console.log('check-h19-2c --self-test OK')
    process.exit(0)
  }

  if (!existsSync(SHADOW_BEFORE) || !existsSync(SHADOW_AFTER)) {
    console.error('FAIL - h19-2c captures missing')
    process.exit(1)
  }
  const fails = checkShadowPair(
    JSON.parse(readFileSync(SHADOW_BEFORE, 'utf8')),
    JSON.parse(readFileSync(SHADOW_AFTER, 'utf8')),
    'pair',
  )
  if (fails.length) {
    console.error('FAIL')
    for (const f of fails) console.error('-', f)
    process.exit(1)
  }
  console.log('check-h19-2c OK')
}
