#!/usr/bin/env bun
/**
 * H17.1 — perf fix smoke check (after H17.0 baseline).
 * Confirms detect-gpu tiering and AdaptiveDpr wiring. Shadow update discipline
 * is checked by behaviour, not by text: the H19.2c captures on the H19 scene
 * (casters present) must show per-frame shadow redraws before and a small
 * fraction after, confirmed by the renderer's own call count — the old
 * `autoUpdate = false` text match passed on a flag WebGPU never reads.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkShadowSet, loadShadowSet } from './check-h19-2c.mjs'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
}

ok(existsSync(join(root, 'packages/viewer/src/lib/gpu-quality.ts')), 'gpu-quality module')
ok(existsSync(join(root, 'packages/viewer/src/components/viewer/adaptive-dpr.tsx')), 'AdaptiveDpr')

const quality = readFileSync(join(root, 'packages/viewer/src/lib/gpu-quality.ts'), 'utf8')
ok(quality.includes('detect-gpu') || quality.includes("from 'detect-gpu'"), 'detect-gpu import')
ok(quality.includes('maxDprForQuality'), 'maxDprForQuality')
ok(quality.includes('return 2') || quality.includes('return 2'), 'DPR hard cap 2')

const viewer = readFileSync(join(root, 'packages/viewer/src/components/viewer/index.tsx'), 'utf8')
ok(viewer.includes('<AdaptiveDpr'), 'AdaptiveDpr mounted')
ok(viewer.includes('detectGpuQuality'), 'detectGpuQuality on boot')
ok(viewer.includes('frameloop="never"'), 'demand-style frameloop never')

const lights = readFileSync(join(root, 'packages/viewer/src/components/viewer/lights.tsx'), 'utf8')
ok(lights.includes('shadowMapSizeForQuality'), 'tiered shadow map size')
// Shadow update discipline, by behaviour (H19.2c).
for (const failure of checkShadowSet(loadShadowSet(), 'shadow discipline')) fails.push(failure)

const store = readFileSync(join(root, 'packages/viewer/src/store/use-viewer.ts'), 'utf8')
ok(store.includes('gpuQuality'), 'gpuQuality preference in store')
ok(store.includes('setGpuQuality'), 'setGpuQuality')

const toolbar = readFileSync(join(root, 'apps/editor/components/viewer-toolbar.tsx'), 'utf8')
ok(toolbar.includes('setGpuQuality'), 'Quality control in toolbar')

ok(existsSync(join(root, 'docs/plans/H17-baseline.md')), 'H17-baseline.md')
ok(existsSync(join(root, 'docs/plans/H17-done.md')), 'H17-done.md')

const baseline = JSON.parse(
  readFileSync(join(root, 'packages/viewer/test/h17-0-baseline.json'), 'utf8'),
)
ok(baseline.optimisationsApplied === false, 'baseline still pre-fix artifact')

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h17-1 OK')
