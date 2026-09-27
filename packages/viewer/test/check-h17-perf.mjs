#!/usr/bin/env bun
/**
 * H17.0 / H19.0 — perf baseline check (before + after).
 *
 * Confirms the ?perf HUD wiring and that both capture artifacts exist with the
 * fields H19.0 compares. Before remains the locked H17.0 numbers; after is the
 * post-H17.1 re-measure on the same 20s camera path.
 *
 * Live capture: packages/viewer/test/capture-h17-baseline.mjs
 *   (H19_PHASE=after → h19-0-after.json)
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
}

function assertCoreFields(label, artifact) {
  ok(typeof artifact.capturedAt === 'string' && artifact.capturedAt.length > 0, `${label} capturedAt set`)
  ok(typeof artifact.fps?.median === 'number', `${label} fps.median number`)
  ok(typeof artifact.fps?.p1 === 'number', `${label} fps.p1 number`)
  ok(typeof artifact.frameMs?.median === 'number', `${label} frameMs.median number`)
  ok(
    (artifact.sampleWindowMs ?? 0) >= 4000 || (artifact.cameraPath?.durationMs ?? 0) >= 4000,
    `${label} sample window ≥ 4s (prefer 20s path)`,
  )
  ok(artifact.note && String(artifact.note).length > 10, `${label} note present`)
  ok(artifact.targets?.fpsMedian === 60, `${label} target fps median 60`)
  ok(artifact.targets?.fpsP1 === 45, `${label} target fps p1 45`)
}

const gpuPerf = readFileSync(join(root, 'packages/viewer/src/lib/gpu-perf.ts'), 'utf8')
ok(gpuPerf.includes("has('perf')"), '?perf query gate')

ok(
  existsSync(join(root, 'packages/viewer/src/components/viewer/perf-panel.tsx')),
  'PerfPanel HUD',
)
ok(
  existsSync(join(root, 'packages/viewer/src/components/viewer/perf-monitor.tsx')),
  'PerfMonitor collector',
)

const viewer = readFileSync(join(root, 'packages/viewer/src/components/viewer/index.tsx'), 'utf8')
ok(viewer.includes('<PerfPanel'), 'PerfPanel mounted in Viewer')
ok(viewer.includes('<PerfMonitor'), 'PerfMonitor mounted in Viewer')
ok(viewer.includes('PERF_OVERLAY_ENABLED'), 'overlay gated by PERF_OVERLAY_ENABLED')

const panel = readFileSync(
  join(root, 'packages/viewer/src/components/viewer/perf-panel.tsx'),
  'utf8',
)
ok(panel.includes('fps'), 'HUD shows fps')
ok(panel.includes('frameMs') || panel.includes('frame'), 'HUD shows frame time')
ok(panel.includes('drawCalls') || panel.includes('draw'), 'HUD shows draw calls')
ok(panel.includes('triangles') || panel.includes('tri'), 'HUD shows triangles')
ok(panel.includes('textures') || panel.includes('tex'), 'HUD shows textures')
ok(panel.includes('geometries') || panel.includes('geo'), 'HUD shows geometries')
ok(panel.includes('heap'), 'HUD shows JS heap')
ok(panel.includes('data-pascal-perf-panel'), 'HUD data attribute for probes')

const monitor = readFileSync(
  join(root, 'packages/viewer/src/components/viewer/perf-monitor.tsx'),
  'utf8',
)
ok(monitor.includes('__pascalPerf'), 'window.__pascalPerf probe')
ok(monitor.includes('stats:') || monitor.includes('stats:'), 'probe exposes stats()')
ok(monitor.includes('readPerfStats'), 'readPerfStats wired into probe')

const store = readFileSync(join(root, 'packages/viewer/src/lib/perf-panel-store.ts'), 'utf8')
ok(store.includes('export function readPerfStats'), 'readPerfStats export')

ok(
  existsSync(join(root, 'packages/viewer/test/capture-h17-baseline.mjs')),
  'capture-h17-baseline.mjs present',
)
const capture = readFileSync(join(root, 'packages/viewer/test/capture-h17-baseline.mjs'), 'utf8')
ok(capture.includes('20_000') || capture.includes('20000'), 'capture uses 20s camera path')
ok(capture.includes('pointerToHighlightMs'), 'capture probes pointer→highlight')
ok(capture.includes('wallDragFrameMs'), 'capture probes wall-drag frame time')
ok(capture.includes('undoMs'), 'capture probes undo latency')
ok(capture.includes('h19-0-after.json') || capture.includes('H19_PHASE'), 'capture supports after phase')

const baselinePath = join(root, 'packages/viewer/test/h17-0-baseline.json')
const afterPath = join(root, 'packages/viewer/test/h19-0-after.json')
ok(existsSync(baselinePath), 'h17-0-baseline.json present')
ok(existsSync(afterPath), 'h19-0-after.json present')

ok(existsSync(join(root, 'docs/plans/H17-baseline.md')), 'H17-baseline.md present')

let before = null
let after = null

if (existsSync(baselinePath)) {
  before = JSON.parse(readFileSync(baselinePath, 'utf8'))
  ok(before.phase === 'H17.0', 'before phase H17.0')
  assertCoreFields('before', before)
  ok(before.optimisationsApplied === false, 'before: no optimisations applied')
  console.log(
    `before fps median=${before.fps.median} p1=${before.fps.p1} frameMs.median=${before.frameMs.median} window=${before.sampleWindowMs ?? before.cameraPath?.durationMs}ms`,
  )
}

if (existsSync(afterPath)) {
  after = JSON.parse(readFileSync(afterPath, 'utf8'))
  ok(after.phase === 'H19.0', 'after phase H19.0')
  assertCoreFields('after', after)
  ok(after.optimisationsApplied === true, 'after: optimisations applied')
  ok(
    (after.sampleWindowMs ?? 0) >= 20_000 || (after.cameraPath?.durationMs ?? 0) >= 20_000,
    'after: 20s camera path',
  )
  ok(typeof after.draws?.median === 'number' || after.draws?.median === null, 'after draws field')
  ok(typeof after.tris?.median === 'number' || after.tris?.median === null, 'after tris field')
  ok(after.gpu && typeof after.gpu === 'object', 'after gpu field')
  ok(typeof after.gpu.adaptiveDpr === 'boolean', 'after AdaptiveDpr flag')
  console.log(
    `after fps median=${after.fps.median} p1=${after.fps.p1} frameMs.median=${after.frameMs.median} window=${after.sampleWindowMs ?? after.cameraPath?.durationMs}ms dpr=${after.gpu?.dpr} draws=${after.draws?.median} tris=${after.tris?.median}`,
  )
}

if (before && after) {
  const beforeKeys = ['fps', 'frameMs', 'targets', 'capturedAt', 'note', 'optimisationsApplied']
  for (const key of beforeKeys) {
    ok(key in before && key in after, `both runs share field ${key}`)
  }
  ok(typeof before.fps.median === typeof after.fps.median, 'fps.median type matches')
  ok(typeof before.fps.p1 === typeof after.fps.p1, 'fps.p1 type matches')
  ok(typeof before.frameMs.median === typeof after.frameMs.median, 'frameMs.median type matches')
}

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h17-perf OK')
