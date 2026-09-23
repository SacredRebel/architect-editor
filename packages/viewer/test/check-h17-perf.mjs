#!/usr/bin/env bun
/**
 * H17.0 — perf baseline check (measure before fixes).
 *
 * Confirms the ?perf HUD wiring (FPS, frame time, draws, tris, textures,
 * geometries, JS heap) and that a captured baseline artifact exists with the
 * fields H17.1 will compare against. Does NOT apply any optimisations.
 *
 * Live capture (20s camera path + interaction probes) is
 * packages/viewer/test/capture-h17-baseline.mjs against a production build.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
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

const baselinePath = join(root, 'packages/viewer/test/h17-0-baseline.json')
ok(existsSync(baselinePath), 'h17-0-baseline.json present')

ok(existsSync(join(root, 'docs/plans/H17-baseline.md')), 'H17-baseline.md present')

if (existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  ok(baseline.phase === 'H17.0', 'baseline phase H17.0')
  ok(typeof baseline.capturedAt === 'string' && baseline.capturedAt.length > 0, 'capturedAt set')
  ok(typeof baseline.fps?.median === 'number', 'fps.median number')
  ok(typeof baseline.fps?.p1 === 'number', 'fps.p1 number')
  ok(typeof baseline.frameMs?.median === 'number', 'frameMs.median number')
  ok(
    (baseline.sampleWindowMs ?? 0) >= 4000 ||
      (baseline.cameraPath?.durationMs ?? 0) >= 4000,
    'sample window ≥ 4s (prefer 20s path)',
  )
  ok(baseline.note && String(baseline.note).length > 10, 'baseline note present')
  ok(baseline.optimisationsApplied === false, 'no optimisations applied yet')
  ok(baseline.targets?.fpsMedian === 60, 'target fps median 60')
  ok(baseline.targets?.fpsP1 === 45, 'target fps p1 45')
  console.log(
    `baseline fps median=${baseline.fps.median} p1=${baseline.fps.p1} frameMs.median=${baseline.frameMs.median} window=${baseline.sampleWindowMs ?? baseline.cameraPath?.durationMs}ms`,
  )
}

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h17-perf OK')
