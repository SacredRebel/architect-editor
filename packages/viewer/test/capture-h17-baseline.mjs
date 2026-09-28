#!/usr/bin/env bun
/**
 * H17 / H19.0 — capture live FPS/frameMs from a production page with ?perf.
 *
 * Usage:
 *   Chrome --remote-debugging-port=9222 https://…/?perf
 *   bun packages/viewer/test/capture-h17-baseline.mjs
 *   H19_PHASE=after bun packages/viewer/test/capture-h17-baseline.mjs
 *
 * Default writes packages/viewer/test/h17-0-baseline.json (before).
 * H19_PHASE=after writes packages/viewer/test/h19-0-after.json (post H17.1).
 * Override path with OUT_PATH=…
 *
 * Implementation note: long `awaitPromise` CDP evals hang when the tab is
 * background-throttled. We inject a sampler, poll `window.__h17Capture` until
 * done (wall-clock 20s), then collect results.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const phaseMode = (process.env.H19_PHASE || process.env.PHASE || 'before').toLowerCase()
const isAfter = phaseMode === 'after' || phaseMode === 'h19.0' || phaseMode === 'h19'
const outPath =
  process.env.OUT_PATH ||
  join(import.meta.dir, isAfter ? 'h19-0-after.json' : 'h17-0-baseline.json')
const CAMERA_PATH_MS = 20_000

async function findPerfPage() {
  const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
  const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  const preferred =
    pages.find((p) => String(p.url).includes('perf')) ||
    pages.find((p) => String(p.url).includes('architect-editor')) ||
    pages[0]
  if (!preferred) throw new Error('No CDP page found on :9222')
  return preferred
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]
}

function makeWs(url) {
  const ws = new WebSocket(url)
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    let msg
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
    } catch {
      return
    }
    if (msg.id == null) return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
    else p.resolve(msg.result)
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  async function send(method, params = {}, timeoutMs = 15_000) {
    await ready
    const id = nextId++
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP timeout ${method}`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
    })
    ws.send(JSON.stringify({ id, method, params }))
    return result
  }
  async function evaluate(expression, timeoutMs = 15_000) {
    const result = await send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: false },
      timeoutMs,
    )
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails))
    }
    return result.result?.value
  }
  return { ws, send, evaluate, ready }
}

async function main() {
  const page = await findPerfPage()
  console.log('CDP page', page.url)
  const { ws, send, evaluate } = makeWs(page.webSocketDebuggerUrl)
  await send('Page.bringToFront', {}).catch(() => {})

  // Every run starts from the same empty site: the editor persists its scene
  // per origin, and the interaction probes below edit it (wall-drag, undo).
  if (process.env.KEEP_STORAGE !== '1') {
    const origin = new URL(page.url).origin
    await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' })
    await send('Page.reload', { ignoreCache: false })
    await Bun.sleep(1500)
    console.log('cleared storage and reloaded', origin)
  }

  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(
      `!!(document.querySelector('canvas') && (window.__pascalPerf || document.querySelector('[data-pascal-perf-panel]')))`,
    )
    if (ready) break
    await Bun.sleep(500)
  }
  console.log('canvas/perf ready')
  // Same settle on both sides before the path: site, sky and HUD windows.
  await Bun.sleep(4000)

  const navTiming = await evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const paints = performance.getEntriesByType('paint')
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')
    return {
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
      loadEventMs: nav ? nav.loadEventEnd : null,
      firstContentfulPaintMs: fcp ? fcp.startTime : null,
      transferSize: nav ? nav.transferSize : null,
    }
  })()`)

  // Inject non-blocking sampler (wall-clock 20s).
  // Frame deltas prefer R3F advance / frameTick (render cadence), not raw rAF —
  // AdaptiveDpr and other helpers keep rAF alive without rendering.
  await evaluate(`(() => {
    // Always reset — a prior timed-out run can leave running:true and block us.
    try { delete window.__h17Capture } catch {}
    const PATH_MS = ${CAMERA_PATH_MS}
    const state = {
      running: true,
      done: false,
      deltas: [],
      hudSamples: [],
      pathMs: PATH_MS,
      interaction: null,
      error: null,
      meter: null,
    }
    window.__h17Capture = state
    const canvas = document.querySelector('canvas')
    // Count renders, not display refreshes: FrameLimiter runs its own rAF and
    // advances R3F only on its fps grid, so a bare rAF counter reads display Hz.
    // The sampler records a delta only when the useFrame tick has moved.
    const perf = window.__pascalPerf
    if (!perf || typeof perf.frameTick !== 'function' || typeof perf.rendererInfo !== 'function') {
      state.error = 'probe missing frameTick/rendererInfo — refusing a raw rAF sample'
      state.running = false
      state.done = true
      return 'no-probe'
    }
    state.meter = 'frame-tick'
    state.samplerFrames = 0
    state.frameTimes = []
    state.hudWindows = []
    let lastHud = null

    // Render time, measured beside the interval: the cap hides cost, this doesn't.
    // renderMs = device (timestamp-query) GPU time of one frame's render passes.
    // three's pool resolves asynchronously and returns the last resolved frame,
    // so a sample is taken only when the pool publishes a new resolve.
    // renderCpuMs = wall time of the outermost renderer.render() call.
    const gl = typeof perf.three === 'function' ? perf.three().gl : null
    const pool = gl?.backend?.trackTimestamp ? gl.backend.timestampQueryPool?.render : null
    state.renderMsSource = pool ? 'webgpu-timestamp-query' : null
    state.gpuSamples = []
    state.cpuSamples = []
    let lastResolve = pool ? pool.frames : null
    const origRender = gl ? gl.render : null
    let renderDepth = 0
    if (gl) {
      gl.render = function (...args) {
        const t0 = performance.now()
        renderDepth++
        try {
          return origRender.apply(this, args)
        } finally {
          renderDepth--
          if (renderDepth === 0) state.cpuSamples.push(performance.now() - t0)
        }
      }
    }
    state.restoreRender = () => {
      if (gl) gl.render = origRender
    }

    let lastTick = performance.now()
    let lastFrameTick = -1
    const start = performance.now()
    state.tick0 = perf.frameTick()
    state.renderer0 = perf.rendererInfo()
    function tick(now) {
      try {
        const ft = perf.frameTick()
        if (typeof ft === 'number' && ft !== lastFrameTick) {
          if (lastFrameTick >= 0) {
            state.deltas.push(now - lastTick)
            state.samplerFrames++
            state.frameTimes.push(now - start)
          }
          lastFrameTick = ft
          lastTick = now
        }
        const hudNow = typeof perf.stats === 'function' ? perf.stats() : null
        if (hudNow && hudNow !== lastHud) {
          // A fresh object per 0.5s HUD window; skip the one that straddles start.
          if (lastHud) state.hudWindows.push({ t: now - start, fps: hudNow.fps, gpuMs: hudNow.gpuMs })
          lastHud = hudNow
        }
        if (pool && pool.frames && pool.frames !== lastResolve) {
          lastResolve = pool.frames
          if (typeof pool.lastValue === 'number' && pool.lastValue > 0) {
            state.gpuSamples.push(pool.lastValue)
          }
        }

        const t = (now - start) / PATH_MS
        if (canvas && Number.isFinite(t)) {
          const angle = t * Math.PI * 2
          const rect = canvas.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          const r = Math.min(rect.width, rect.height) * 0.25
          canvas.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: cx + Math.cos(angle) * r,
            clientY: cy + Math.sin(angle) * r,
            pointerId: 1,
            pointerType: 'mouse',
          }))
        }
        if (window.__pascalPerf && typeof window.__pascalPerf.stats === 'function') {
          const s = window.__pascalPerf.stats()
          if (s) {
            state.hudSamples.push({
              t: now - start,
              fps: s.fps,
              frameMs: s.frameMs,
              drawCalls: s.drawCalls,
              triangles: s.triangles,
              textures: s.textures,
              geometries: s.geometries,
              heapBytes: s.heapBytes,
            })
          }
        }
        if (now - start < PATH_MS) {
          requestAnimationFrame(tick)
        } else {
          state.wallMs = now - start
          state.tick1 = perf.frameTick()
          state.renderer1 = perf.rendererInfo()
          state.restoreRender()
          // interaction probes after path
          const rect = canvas.getBoundingClientRect()
          const cx = rect.left + rect.width / 2
          const cy = rect.top + rect.height / 2
          function fire(type, x, y) {
            canvas.dispatchEvent(new PointerEvent(type, {
              bubbles: true, cancelable: true, clientX: x, clientY: y,
              pointerId: 1, pointerType: 'mouse', buttons: type === 'pointerup' ? 0 : 1,
            }))
          }
          const t0 = performance.now()
          fire('pointermove', cx + 40, cy + 20)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const pointerToHighlightMs = performance.now() - t0
              const t1 = performance.now()
              fire('pointerdown', cx, cy)
              fire('pointerup', cx, cy)
              canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cx, clientY: cy }))
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const clickToSelectMs = performance.now() - t1
                  const dragDeltas = []
                  let dLast = performance.now()
                  fire('pointerdown', cx - 60, cy)
                  const dStart = performance.now()
                  function dragTick(now) {
                    dragDeltas.push(now - dLast)
                    dLast = now
                    const u = (now - dStart) / 400
                    fire('pointermove', cx - 60 + u * 120, cy)
                    if (now - dStart < 400) requestAnimationFrame(dragTick)
                    else {
                      fire('pointerup', cx + 60, cy)
                      const sorted = dragDeltas.slice(1).sort((a, b) => a - b)
                      const wallDragFrameMs = sorted.length
                        ? sorted[Math.floor(sorted.length / 2)]
                        : null
                      const t2 = performance.now()
                      document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true,
                      }))
                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          state.interaction = {
                            pointerToHighlightMs: +pointerToHighlightMs.toFixed(2),
                            clickToSelectMs: +clickToSelectMs.toFixed(2),
                            wallDragFrameMs: wallDragFrameMs != null ? +wallDragFrameMs.toFixed(2) : null,
                            undoMs: +(performance.now() - t2).toFixed(2),
                            note: 'Synthetic probes; wall-drag is a proxy gesture.',
                          }
                          state.running = false
                          state.done = true
                        })
                      })
                    }
                  }
                  requestAnimationFrame(dragTick)
                })
              })
            })
          })
        }
      } catch (err) {
        state.restoreRender?.()
        state.error = String(err)
        state.running = false
        state.done = true
      }
    }
    requestAnimationFrame(tick)
    return 'started'
  })()`)

  console.log('sampler started; polling…')
  const deadline = Date.now() + CAMERA_PATH_MS + 30_000
  let pathResult = null
  while (Date.now() < deadline) {
    const snap = await evaluate(`(() => {
      const s = window.__h17Capture
      if (!s) return { status: 'missing' }
      return {
        status: s.done ? 'done' : s.running ? 'running' : 'idle',
        deltaCount: s.deltas?.length ?? 0,
        error: s.error,
        done: !!s.done,
      }
    })()`)
    console.log('poll', snap)
    if (snap?.status === 'done' || snap?.done) {
      pathResult = await evaluate(`(() => {
        const s = window.__h17Capture
        return {
          deltas: s.deltas.slice(1),
          hudSamples: s.hudSamples,
          pathMs: s.pathMs,
          interaction: s.interaction,
          error: s.error,
          meter: s.meter,
          wallMs: s.wallMs,
          samplerFrames: s.samplerFrames,
          frameTimes: s.frameTimes,
          hudWindows: s.hudWindows,
          tick0: s.tick0,
          tick1: s.tick1,
          renderer0: s.renderer0,
          renderer1: s.renderer1,
          renderMsSource: s.renderMsSource,
          gpuSamples: s.gpuSamples,
          cpuSamples: s.cpuSamples,
        }
      })()`)
      break
    }
    if (snap?.error) throw new Error(snap.error)
    await Bun.sleep(1000)
  }

  if (!pathResult) throw new Error('Capture timed out waiting for sampler')
  if (pathResult.error) throw new Error(pathResult.error)

  const samples = pathResult.deltas
  if (!Array.isArray(samples) || samples.length < 30) {
    throw new Error(`Insufficient frame samples: ${samples?.length ?? 0}`)
  }

  const frameMs = [...samples].sort((a, b) => a - b)
  const fpsSamples = frameMs.map((ms) => (ms > 0 ? 1000 / ms : 0)).sort((a, b) => a - b)

  // Renders land on vsync, so under a 50fps cap on a 60Hz display five of six
  // intervals are 16.7ms and the per-frame median reads 60. The rate is frames
  // over time: median of 1s wall-clock bins, and the mean over the whole run.
  const wallSec = pathResult.wallMs / 1000
  const bins = new Array(Math.floor(wallSec)).fill(0)
  for (const t of pathResult.frameTimes) {
    const b = Math.floor(t / 1000)
    if (b < bins.length) bins[b]++
  }
  const binsSorted = [...bins].sort((a, b) => a - b)
  const hudWindows = pathResult.hudWindows.filter((w) => typeof w.fps === 'number')
  const hudMeanFps = hudWindows.length
    ? hudWindows.reduce((sum, w) => sum + w.fps, 0) / hudWindows.length
    : null
  const r0 = pathResult.renderer0
  const r1 = pathResult.renderer1
  const tickDelta = pathResult.tick1 - pathResult.tick0
  const renderCalls = r1.calls - r0.calls
  const msStats = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return null
    const s = [...arr].sort((a, b) => a - b)
    return {
      median: Number(percentile(s, 50).toFixed(3)),
      p99: Number(percentile(s, 99).toFixed(3)),
      max: Number(s[s.length - 1].toFixed(3)),
      samples: s.length,
    }
  }
  const hudGpu = hudWindows.map((w) => w.gpuMs).filter((n) => typeof n === 'number' && n > 0)
  const renderMs = msStats(pathResult.gpuSamples)
  if (renderMs) {
    renderMs.source = pathResult.renderMsSource
    renderMs.hudGpuMsMedian = hudGpu.length
      ? Number(percentile([...hudGpu].sort((a, b) => a - b), 50).toFixed(3))
      : null
  }
  const renderCpuMs = msStats(pathResult.cpuSamples)
  const frames = {
    sampler: pathResult.samplerFrames,
    hud: hudMeanFps == null ? null : Math.round(hudMeanFps * wallSec),
    hudWindows: hudWindows.length,
    tickDelta,
    rendererFrame: r1.frame - r0.frame,
    renderCalls,
    callsPerFrame: tickDelta > 0 ? Number((renderCalls / tickDelta).toFixed(3)) : null,
    wallMs: Number(pathResult.wallMs.toFixed(1)),
    note: 'sampler = frameTick changes seen by the injected rAF loop; hud = mean PerfMonitor window fps × wall seconds; rendererFrame = WebGPU info.frame (advanced by the renderer rAF Animation loop, i.e. display ticks — recorded, not used as a frame reference); renderCalls = info.calls (every render() pass).',
  }
  const hud = Array.isArray(pathResult.hudSamples) ? pathResult.hudSamples : []
  const lastHud = hud.length ? hud[hud.length - 1] : null
  const hudFps = hud.map((h) => h.fps).filter((n) => typeof n === 'number').sort((a, b) => a - b)
  const hudDraws = hud
    .map((h) => h.drawCalls)
    .filter((n) => typeof n === 'number')
    .sort((a, b) => a - b)
  const hudTris = hud
    .map((h) => h.triangles)
    .filter((n) => typeof n === 'number')
    .sort((a, b) => a - b)

  const runtime = await evaluate(`(() => {
    const canvas = document.querySelector('canvas')
    const dpr =
      canvas && canvas.clientWidth > 0
        ? Number((canvas.width / canvas.clientWidth).toFixed(3))
        : null
    let gpuQualityPreference = null
    try {
      const raw = localStorage.getItem('viewer-preferences')
      if (raw) {
        const parsed = JSON.parse(raw)
        const state = parsed?.state ?? parsed
        if (state?.gpuQuality) gpuQualityPreference = state.gpuQuality
      }
    } catch {}
    const qualityEl = document.documentElement
    const detectedGpuQuality =
      qualityEl.getAttribute('data-gpu-quality') ||
      document.querySelector('[data-gpu-quality]')?.getAttribute('data-gpu-quality') ||
      null
    const resolvedGpuQuality = qualityEl.getAttribute('data-gpu-quality-resolved')
    return {
      dpr,
      devicePixelRatio: window.devicePixelRatio ?? null,
      gpuQualityPreference,
      detectedGpuQuality,
      resolvedGpuQuality,
      adaptiveDprActive: Boolean(resolvedGpuQuality),
    }
  })()`)

  const artifact = {
    phase: isAfter ? 'H19.0' : 'H17.0',
    capturedAt: new Date().toISOString(),
    sourceUrl: page.url,
    tree: process.env.TREE_SHA || null,
    sampleCount: samples.length,
    sampleWindowMs: pathResult.pathMs ?? CAMERA_PATH_MS,
    cameraPath: {
      durationMs: pathResult.pathMs ?? CAMERA_PATH_MS,
      kind: 'synthetic-pointer-orbit',
      note: 'Fixed 20s orbital pointermoves on the canvas; frames counted from the useFrame tick, not raw rAF.',
      meter: pathResult.meter ?? null,
    },
    fps: {
      median: binsSorted.length ? percentile(binsSorted, 50) : null,
      mean: Number((pathResult.samplerFrames / wallSec).toFixed(2)),
      p1: Number(percentile(fpsSamples, 1).toFixed(2)),
      min: Number(fpsSamples[0].toFixed(2)),
      max: Number(fpsSamples[fpsSamples.length - 1].toFixed(2)),
      perFrameMedian: Number(percentile(fpsSamples, 50).toFixed(2)),
      note: 'median = median of 1s wall-clock bins of rendered frames; mean = frames / wall seconds; p1/min/max/perFrameMedian from per-frame render intervals (vsync-quantised).',
    },
    frames,
    renderMs,
    renderCpuMs,
    frameMs: {
      median: Number(percentile(frameMs, 50).toFixed(3)),
      p99: Number(percentile(frameMs, 99).toFixed(3)),
      max: Number(frameMs[frameMs.length - 1].toFixed(3)),
    },
    draws: {
      median: hudDraws.length ? Number(percentile(hudDraws, 50).toFixed(1)) : null,
      last: lastHud?.drawCalls ?? null,
    },
    tris: {
      median: hudTris.length ? Number(percentile(hudTris, 50).toFixed(0)) : null,
      last: lastHud?.triangles ?? null,
    },
    gpu: {
      qualityPreference: runtime?.gpuQualityPreference ?? 'auto',
      detectedQuality: runtime?.detectedGpuQuality ?? null,
      resolvedQuality: runtime?.resolvedGpuQuality ?? null,
      adaptiveDpr: Boolean(runtime?.resolvedGpuQuality || isAfter),
      dpr: runtime?.dpr ?? null,
      devicePixelRatio: runtime?.devicePixelRatio ?? null,
    },
    hud: lastHud
      ? {
          sampleCount: hud.length,
          fpsMedian: hudFps.length ? Number(percentile(hudFps, 50).toFixed(2)) : null,
          last: lastHud,
        }
      : null,
    navigation: navTiming,
    interaction: pathResult.interaction,
    targets: {
      fpsMedian: 60,
      fpsP1: 45,
      pointerToHighlightMs: 50,
      wallDragFrameMs: 16,
      loadToInteractiveMs: 4000,
    },
    optimisationsApplied: isAfter,
    note: isAfter
      ? 'H19.0 after: eco/h19 tree (H17.1 AdaptiveDpr / detect-gpu / shadow discipline applied) on the 20s orbital path, same harness, same machine and Chrome as the before. Before is h17-0-baseline-path.json; the historic 4s idle file stays as h17-0-baseline.json.'
      : 'H17.0 before: pre-H17.1 tree plus the ?perf probe only, on the 20s orbital path, same harness, same machine and Chrome as the after. Historic 4s idle sample remains in h17-0-baseline.json untouched.',
  }

  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`)
  console.log('wrote', outPath)
  console.log(
    JSON.stringify(
      {
        phase: artifact.phase,
        fps: artifact.fps,
        frames: artifact.frames,
        renderMs: artifact.renderMs,
        renderCpuMs: artifact.renderCpuMs,
        frameMs: artifact.frameMs,
        draws: artifact.draws,
        tris: artifact.tris,
        gpu: artifact.gpu,
        interaction: artifact.interaction,
      },
      null,
      2,
    ),
  )
  ws.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
