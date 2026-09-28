#!/usr/bin/env bun
/**
 * H17.0 / H19.0 — perf baseline check (before + after on the same path).
 *
 * Asserts:
 *   1. Schema / wiring for ?perf HUD and capture harness
 *   2. Before = h17-0-baseline-path.json (20s orbit); after = h19-0-after.json
 *   3. cameraPath.kind and durationMs match across the pair
 *   4. Within each run, sampler frame count and HUD frame count agree within 10%
 *
 * --self-test forges a mismatched path kind, a mismatched duration, a sampler
 * ticking at display Hz, a missing renderMs and a renderMs that timed the CPU;
 * each must FAIL while the unforged control passes.
 *
 * Live capture: packages/viewer/test/capture-h17-baseline.mjs
 *   OUT_PATH=…/h17-0-baseline-path.json  (before, no H19_PHASE)
 *   H19_PHASE=after                      (after)
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const selfTest = process.argv.includes('--self-test')

function checkArtifacts(beforePath, afterPath, label) {
  const fails = []
  function ok(cond, msg) {
    if (!cond) fails.push(msg)
    else console.log('OK', msg)
  }

  function assertCoreFields(tag, artifact) {
    ok(typeof artifact.capturedAt === 'string' && artifact.capturedAt.length > 0, `${tag} capturedAt set`)
    ok(typeof artifact.fps?.median === 'number', `${tag} fps.median number`)
    ok(typeof artifact.fps?.p1 === 'number', `${tag} fps.p1 number`)
    ok(typeof artifact.frameMs?.median === 'number', `${tag} frameMs.median number`)
    ok(
      (artifact.sampleWindowMs ?? 0) >= 4000 || (artifact.cameraPath?.durationMs ?? 0) >= 4000,
      `${tag} sample window ≥ 4s`,
    )
    ok(artifact.note && String(artifact.note).length > 10, `${tag} note present`)
    ok(artifact.targets?.fpsMedian === 60, `${tag} target fps median 60`)
    ok(artifact.targets?.fpsP1 === 45, `${tag} target fps p1 45`)
  }

  // Sampler frame count (frameTick changes seen by the injected rAF loop)
  // against the HUD's own count (PerfMonitor window fps × wall seconds). The
  // renderer's info.frame is not a reference: in three/webgpu it is advanced
  // by the renderer's rAF Animation loop, i.e. it counts display ticks.
  function metersAgree(tag, artifact) {
    const sampler = artifact.frames?.sampler
    const hud = artifact.frames?.hud
    ok(artifact.cameraPath?.meter === 'frame-tick', `${tag} meter is frame-tick (not raw rAF)`)
    ok(typeof sampler === 'number' && sampler > 0, `${tag} sampler frame count present`)
    ok(typeof hud === 'number' && hud > 0, `${tag} HUD frame count present`)
    if (typeof sampler === 'number' && typeof hud === 'number' && sampler > 0 && hud > 0) {
      const rel = Math.abs(sampler - hud) / Math.max(sampler, hud)
      ok(
        rel <= 0.1,
        `${tag} sampler frames (${sampler}) vs HUD frames (${hud}) within 10% (rel=${(rel * 100).toFixed(1)}%)`,
      )
      if (sampler === hud) {
        console.log(
          `NOTE ${tag}: exact match ${sampler} = ${hud} (tickDelta ${artifact.frames.tickDelta}, display ticks ${artifact.frames.rendererFrame}) — see H17-done.md`,
        )
      }
    }
  }

  // Render time beside the interval. renderMs = per-resolve device timestamps
  // taken by the harness; the HUD's gpuMs = PerfMonitor's own 0.5s window
  // averages of the same device queries. Separately aggregated, same device.
  function renderAgree(tag, artifact) {
    const r = artifact.renderMs
    ok(r && r.source === 'webgpu-timestamp-query', `${tag} renderMs from device timestamps`)
    ok((r?.samples ?? 0) >= 100, `${tag} renderMs ≥ 100 samples (${r?.samples ?? 0})`)
    ok(typeof r?.p99 === 'number', `${tag} renderMs p99 present`)
    ok((artifact.renderCpuMs?.samples ?? 0) >= 100, `${tag} renderCpuMs ≥ 100 samples`)
    const hud = r?.hudGpuMsMedian
    if (typeof r?.median === 'number' && typeof hud === 'number' && hud > 0) {
      const rel = Math.abs(r.median - hud) / Math.max(r.median, hud)
      ok(
        rel <= 0.15,
        `${tag} renderMs median (${r.median}) vs HUD gpuMs (${hud}) within 15% (rel=${(rel * 100).toFixed(1)}%)`,
      )
    } else {
      ok(false, `${tag} renderMs median and HUD gpuMs both present`)
    }
  }

  if (!selfTest) {
    const gpuPerf = readFileSync(join(root, 'packages/viewer/src/lib/gpu-perf.ts'), 'utf8')
    ok(gpuPerf.includes("has('perf')"), '?perf query gate')
    ok(existsSync(join(root, 'packages/viewer/src/components/viewer/perf-panel.tsx')), 'PerfPanel HUD')
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
    ok(panel.includes('drawCalls') || panel.includes('draw'), 'HUD shows draw calls')
    ok(panel.includes('triangles') || panel.includes('tri'), 'HUD shows triangles')
    ok(panel.includes('data-pascal-perf-panel'), 'HUD data attribute for probes')
    const monitor = readFileSync(
      join(root, 'packages/viewer/src/components/viewer/perf-monitor.tsx'),
      'utf8',
    )
    ok(monitor.includes('__pascalPerf'), 'window.__pascalPerf probe')
    ok(monitor.includes('readPerfStats'), 'readPerfStats wired into probe')
    const capture = readFileSync(
      join(root, 'packages/viewer/test/capture-h17-baseline.mjs'),
      'utf8',
    )
    ok(capture.includes('20_000') || capture.includes('20000'), 'capture uses 20s camera path')
    ok(capture.includes('pointerToHighlightMs'), 'capture probes pointer→highlight')
    ok(capture.includes('h17-0-baseline-path') || capture.includes('OUT_PATH'), 'capture supports OUT_PATH')
    ok(existsSync(join(root, 'docs/plans/H17-baseline.md')), 'H17-baseline.md present')
    ok(
      existsSync(join(root, 'packages/viewer/test/h17-0-baseline.json')),
      'historic 4s h17-0-baseline.json kept',
    )
  }

  ok(existsSync(beforePath), `${label}: before artifact present`)
  ok(existsSync(afterPath), `${label}: after artifact present`)

  let before = null
  let after = null
  if (existsSync(beforePath)) {
    before = JSON.parse(readFileSync(beforePath, 'utf8'))
    ok(before.phase === 'H17.0', `${label}: before phase H17.0`)
    assertCoreFields(`${label} before`, before)
    ok(before.optimisationsApplied === false, `${label}: before optimisationsApplied false`)
    ok(
      (before.sampleWindowMs ?? 0) >= 20_000 || (before.cameraPath?.durationMs ?? 0) >= 20_000,
      `${label}: before 20s camera path`,
    )
    metersAgree(`${label} before`, before)
    renderAgree(`${label} before`, before)
    console.log(
      `before fps median=${before.fps.median} p1=${before.fps.p1} frames sampler=${before.frames?.sampler} hud=${before.frames?.hud} renderMs=${before.renderMs?.median}/${before.renderMs?.p99} kind=${before.cameraPath?.kind} window=${before.sampleWindowMs ?? before.cameraPath?.durationMs}ms`,
    )
  }

  if (existsSync(afterPath)) {
    after = JSON.parse(readFileSync(afterPath, 'utf8'))
    ok(after.phase === 'H19.0', `${label}: after phase H19.0`)
    assertCoreFields(`${label} after`, after)
    ok(after.optimisationsApplied === true, `${label}: after optimisationsApplied true`)
    ok(
      (after.sampleWindowMs ?? 0) >= 20_000 || (after.cameraPath?.durationMs ?? 0) >= 20_000,
      `${label}: after 20s camera path`,
    )
    ok(after.gpu && typeof after.gpu === 'object', `${label}: after gpu field`)
    metersAgree(`${label} after`, after)
    renderAgree(`${label} after`, after)
    console.log(
      `after fps median=${after.fps.median} p1=${after.fps.p1} frames sampler=${after.frames?.sampler} hud=${after.frames?.hud} renderMs=${after.renderMs?.median}/${after.renderMs?.p99} kind=${after.cameraPath?.kind} window=${after.sampleWindowMs ?? after.cameraPath?.durationMs}ms`,
    )
  }

  if (before && after) {
    ok(
      before.cameraPath?.kind === after.cameraPath?.kind,
      `${label}: cameraPath.kind equal (${before.cameraPath?.kind} vs ${after.cameraPath?.kind})`,
    )
    ok(
      before.cameraPath?.durationMs === after.cameraPath?.durationMs,
      `${label}: cameraPath.durationMs equal (${before.cameraPath?.durationMs} vs ${after.cameraPath?.durationMs})`,
    )
  }

  return fails
}

if (selfTest) {
  console.log('check-h17-perf --self-test')
  const dir = mkdtempSync(join(tmpdir(), 'h17-perf-self-'))
  // Numbers mirror a real capture: 50fps cap on a 60Hz display over 20s.
  const frames = { sampler: 1000, hud: 1000, tickDelta: 1000, rendererFrame: 1201 }
  const renderMs = {
    median: 7.5,
    p99: 9.5,
    max: 11,
    samples: 500,
    source: 'webgpu-timestamp-query',
    hudGpuMsMedian: 7.4,
  }
  const goodBefore = {
    phase: 'H17.0',
    capturedAt: '2026-01-01T00:00:00.000Z',
    sampleWindowMs: 20000,
    cameraPath: { durationMs: 20000, kind: 'synthetic-pointer-orbit', meter: 'frame-tick' },
    fps: { median: 50, p1: 30 },
    frames,
    frameMs: { median: 16.7 },
    renderMs,
    renderCpuMs: { median: 0.9, p99: 2, max: 3, samples: 1000 },
    targets: { fpsMedian: 60, fpsP1: 45 },
    optimisationsApplied: false,
    note: 'self-test before',
  }
  const goodAfter = {
    ...goodBefore,
    phase: 'H19.0',
    optimisationsApplied: true,
    note: 'self-test after',
    gpu: { adaptiveDpr: true },
  }
  const run = (name, before, after) => {
    const pb = join(dir, `${name}-before.json`)
    const pa = join(dir, `${name}-after.json`)
    writeFileSync(pb, JSON.stringify(before))
    writeFileSync(pa, JSON.stringify(after))
    return checkArtifacts(pb, pa, name)
  }
  const expectFail = (name, before, after, needle) => {
    const fails = run(name, before, after)
    if (!fails.some((f) => f.includes(needle))) {
      console.error(`SELF-TEST FAIL: ${name} was not rejected on "${needle}"`)
      console.error(fails)
      process.exit(1)
    }
    console.log(`SELF-TEST OK: ${name} rejected`)
  }
  try {
    // Control: the unforged pair passes, so each forge fails for its own reason.
    const control = run('control', goodBefore, goodAfter)
    if (control.length) {
      console.error('SELF-TEST FAIL: control pair should pass')
      console.error(control)
      process.exit(1)
    }
    console.log('SELF-TEST OK: control pair passes')

    expectFail(
      'forge-kind',
      goodBefore,
      { ...goodAfter, cameraPath: { ...goodAfter.cameraPath, kind: 'raf-idle-sample' } },
      'cameraPath.kind',
    )
    expectFail(
      'forge-duration',
      goodBefore,
      { ...goodAfter, cameraPath: { ...goodAfter.cameraPath, durationMs: 4000 } },
      'cameraPath.durationMs',
    )
    // A sampler that ticks at display Hz: it counts every rAF (1201 in 20s)
    // while the renderer produced 1000 frames.
    expectFail(
      'forge-display-hz-sampler',
      goodBefore,
      { ...goodAfter, frames: { ...frames, sampler: frames.rendererFrame } },
      'within 10%',
    )
    expectFail(
      'forge-render-missing',
      goodBefore,
      { ...goodAfter, renderMs: null },
      'renderMs from device timestamps',
    )
    // renderMs that timed the CPU encode (≈1ms) instead of the device (≈7.4ms).
    expectFail(
      'forge-render-cpu-as-gpu',
      goodBefore,
      { ...goodAfter, renderMs: { ...renderMs, median: 0.9 } },
      'vs HUD gpuMs',
    )
    console.log('check-h17-perf --self-test OK')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(0)
}


const beforePath = join(root, 'packages/viewer/test/h17-0-baseline-path.json')
const afterPath = join(root, 'packages/viewer/test/h19-0-after.json')
const fails = checkArtifacts(beforePath, afterPath, 'pair')
if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h17-perf OK')
