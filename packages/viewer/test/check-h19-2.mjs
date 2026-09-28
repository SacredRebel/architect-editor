#!/usr/bin/env bun
/**
 * H19.2a — AdaptiveDpr never renders above the display (profile line 2).
 *
 * Before: h19-0-after.json (tree with the tier cap only).
 * After:  h19-2a-dpr-clamp.json (tier cap clamped to devicePixelRatio).
 *
 * Asserts, on the same path and the same scene:
 *   - the canvas's own ratio (width / clientWidth) never exceeds window.devicePixelRatio
 *     after the fix, and did exceed it before (else the pair doesn't test the fix);
 *   - renderMs fell; fps did not move (the 50 fps cap — only render time can show this).
 *
 * --self-test forges an after still above the display, a different scene and a
 * renderMs that did not fall; each must FAIL while the unforged control passes.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const selfTest = process.argv.includes('--self-test')

function check(before, after, label) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(msg)
    else console.log('OK', msg)
  }
  ok(before.cameraPath?.kind === after.cameraPath?.kind, `${label}: same path kind`)
  ok(before.cameraPath?.durationMs === after.cameraPath?.durationMs, `${label}: same path duration`)
  ok(
    before.draws?.median === after.draws?.median && before.tris?.median === after.tris?.median,
    `${label}: same scene (draws ${before.draws?.median}/${after.draws?.median}, tris ${before.tris?.median}/${after.tris?.median})`,
  )
  ok(
    before.gpu?.dpr > before.gpu?.devicePixelRatio,
    `${label}: before rendered above the display (${before.gpu?.dpr} > ${before.gpu?.devicePixelRatio})`,
  )
  ok(
    typeof after.gpu?.dpr === 'number' && after.gpu.dpr <= after.gpu.devicePixelRatio,
    `${label}: after renders at or below the display (${after.gpu?.dpr} <= ${after.gpu?.devicePixelRatio})`,
  )
  const b = before.renderMs?.median
  const a = after.renderMs?.median
  ok(
    typeof a === 'number' && typeof b === 'number' && a < b,
    `${label}: renderMs fell (${b} -> ${a})`,
  )
  const fb = before.fps?.mean
  const fa = after.fps?.mean
  ok(
    typeof fa === 'number' && typeof fb === 'number' && Math.abs(fa - fb) / fb <= 0.02,
    `${label}: fps unchanged within 2% (${fb} -> ${fa}) — the cap, not the cost`,
  )
  return fails
}

if (selfTest) {
  console.log('check-h19-2 --self-test')
  const before = {
    cameraPath: { kind: 'synthetic-pointer-orbit', durationMs: 20000 },
    draws: { median: 15 },
    tris: { median: 8350 },
    gpu: { dpr: 1.5, devicePixelRatio: 1 },
    renderMs: { median: 6.8 },
    fps: { mean: 49.97 },
  }
  const after = { ...before, gpu: { dpr: 1, devicePixelRatio: 1 }, renderMs: { median: 3.7 }, fps: { mean: 49.98 } }
  const expectFail = (name, forged, needle) => {
    const fails = check(before, forged, name)
    if (!fails.some((f) => f.includes(needle))) {
      console.error(`SELF-TEST FAIL: ${name} not rejected on "${needle}"`, fails)
      process.exit(1)
    }
    console.log(`SELF-TEST OK: ${name} rejected`)
  }
  if (check(before, after, 'control').length) {
    console.error('SELF-TEST FAIL: control should pass')
    process.exit(1)
  }
  console.log('SELF-TEST OK: control passes')
  expectFail('forge-above-display', { ...after, gpu: { dpr: 1.5, devicePixelRatio: 1 } }, 'at or below the display')
  expectFail('forge-different-scene', { ...after, draws: { median: 33 } }, 'same scene')
  expectFail('forge-no-gain', { ...after, renderMs: { median: 6.9 } }, 'renderMs fell')
  console.log('check-h19-2 --self-test OK')
  process.exit(0)
}

const dir = import.meta.dir
const beforePath = join(dir, 'h19-0-after.json')
const afterPath = join(dir, 'h19-2a-dpr-clamp.json')
if (!existsSync(beforePath) || !existsSync(afterPath)) {
  console.error('FAIL - artifacts missing')
  process.exit(1)
}
const src = readFileSync(join(dir, '../src/components/viewer/adaptive-dpr.tsx'), 'utf8')
const fails = check(
  JSON.parse(readFileSync(beforePath, 'utf8')),
  JSON.parse(readFileSync(afterPath, 'utf8')),
  'pair',
)
if (!src.includes('devicePixelRatio')) fails.push('adaptive-dpr reads devicePixelRatio')
if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h19-2 OK')
