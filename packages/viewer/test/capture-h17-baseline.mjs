#!/usr/bin/env bun
/**
 * H17.0 — capture a live FPS/frameMs baseline from a production page with ?perf.
 *
 * Usage:
 *   Chrome --remote-debugging-port=9222 https://…/?perf
 *   bun packages/viewer/test/capture-h17-baseline.mjs
 *
 * Writes packages/viewer/test/h17-0-baseline.json — no optimisations applied.
 *
 * Implementation note: long `awaitPromise` CDP evals hang when the tab is
 * background-throttled. We inject a sampler, poll `window.__h17Capture` until
 * done (wall-clock 20s), then collect results.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outPath = join(import.meta.dir, 'h17-0-baseline.json')
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

  for (let i = 0; i < 40; i++) {
    const ready = await evaluate(
      `!!(document.querySelector('canvas') && (window.__pascalPerf || document.querySelector('[data-pascal-perf-panel]')))`,
    )
    if (ready) break
    await Bun.sleep(500)
  }
  console.log('canvas/perf ready')

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
  await evaluate(`(() => {
    if (window.__h17Capture?.running) return 'already'
    const PATH_MS = ${CAMERA_PATH_MS}
    const state = {
      running: true,
      done: false,
      deltas: [],
      hudSamples: [],
      pathMs: PATH_MS,
      interaction: null,
      error: null,
    }
    window.__h17Capture = state
    const canvas = document.querySelector('canvas')
    let last = performance.now()
    const start = performance.now()
    function tick(now) {
      try {
        state.deltas.push(now - last)
        last = now
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
  const hud = Array.isArray(pathResult.hudSamples) ? pathResult.hudSamples : []
  const lastHud = hud.length ? hud[hud.length - 1] : null
  const hudFps = hud.map((h) => h.fps).filter((n) => typeof n === 'number').sort((a, b) => a - b)

  const baseline = {
    phase: 'H17.0',
    capturedAt: new Date().toISOString(),
    sourceUrl: page.url,
    sampleCount: samples.length,
    sampleWindowMs: pathResult.pathMs ?? CAMERA_PATH_MS,
    cameraPath: {
      durationMs: pathResult.pathMs ?? CAMERA_PATH_MS,
      kind: 'synthetic-pointer-orbit',
      note: 'Fixed 20s rAF sample while dispatching orbital pointermoves on the canvas.',
    },
    fps: {
      median: Number(percentile(fpsSamples, 50).toFixed(2)),
      p1: Number(percentile(fpsSamples, 1).toFixed(2)),
      min: Number(fpsSamples[0].toFixed(2)),
      max: Number(fpsSamples[fpsSamples.length - 1].toFixed(2)),
    },
    frameMs: {
      median: Number(percentile(frameMs, 50).toFixed(3)),
      p99: Number(percentile(frameMs, 99).toFixed(3)),
      max: Number(frameMs[frameMs.length - 1].toFixed(3)),
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
    optimisationsApplied: false,
    note:
      'Pre-optimisation baseline for H17.1. Captured via CDP on production (?perf). HUD is the in-repo PerfPanel gated by ?perf. Do not tune until this artifact exists and check-h17-perf passes.',
  }

  writeFileSync(outPath, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log('wrote', outPath)
  console.log(JSON.stringify({ fps: baseline.fps, frameMs: baseline.frameMs, interaction: baseline.interaction }, null, 2))
  ws.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
