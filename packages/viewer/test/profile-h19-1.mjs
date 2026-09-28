#!/usr/bin/env bun
/**
 * H19.1 — profile, choose nothing. Where the frame goes on the open ?perf page.
 *
 * Usage:
 *   Chrome --remote-debugging-port=9222 http://…/?perf   (a tree whose probe has three())
 *   TREE_SHA=… bun packages/viewer/test/profile-h19-1.mjs
 *   LOAD_URL=https://…/?perf bun packages/viewer/test/profile-h19-1.mjs --load   (load timing only)
 *
 * Writes packages/viewer/test/h19-1-profile.json (or h19-1-load.json with --load).
 * Clears the origin's storage and reloads with a WebGPU call hook (uploads,
 * pipelines) installed; reads per-pass device timestamps and hides one drawable
 * at a time to rank draws by GPU cost.
 * Attribution toggles (shadow casting off, dpr 1) are in-page, measured, and
 * restored before the script exits; nothing in the product changes.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PATH_MS = 20_000
const loadMode = process.argv.includes('--load')

async function cdp(match) {
  const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
  const page = list.find((t) => t.type === 'page' && String(t.url).includes(match))
  if (!page) throw new Error(`No CDP page matching ${match}`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 1
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const my = id++
      const timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 60_000)
      const onmsg = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id !== my) return
        ws.removeEventListener('message', onmsg)
        clearTimeout(timer)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
      ws.addEventListener('message', onmsg)
      ws.send(JSON.stringify({ id: my, method, params }))
    })
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result?.value
  }
  return { page, ws, send, evaluate }
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null
}
const r2 = (n) => (typeof n === 'number' ? Number(n.toFixed(2)) : n)

async function loadProfile() {
  const url = process.env.LOAD_URL
  if (!url) throw new Error('LOAD_URL required with --load')
  const { page, ws, send, evaluate } = await cdp(new URL(url).host)
  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Page.navigate', { url })
  for (let i = 0; i < 120; i++) {
    await Bun.sleep(500)
    if (await evaluate(`document.readyState === 'complete' && !!document.querySelector('canvas')`)) break
  }
  await Bun.sleep(3000)
  const out = await evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
    const res = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.replace(location.origin, ''),
      type: r.initiatorType,
      startMs: Math.round(r.startTime),
      durationMs: Math.round(r.duration),
      endMs: Math.round(r.responseEnd),
      transferKB: Math.round((r.transferSize || 0) / 1024),
      decodedKB: Math.round((r.decodedBodySize || 0) / 1024),
    }))
    return {
      navigation: {
        ttfbMs: nav && Math.round(nav.responseStart),
        domContentLoadedMs: nav && Math.round(nav.domContentLoadedEventEnd),
        loadEventMs: nav && Math.round(nav.loadEventEnd),
        firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
      },
      resourceCount: res.length,
      totalTransferKB: res.reduce((s, r) => s + r.transferKB, 0),
      byType: res.reduce((m, r) => ((m[r.type] = (m[r.type] || 0) + r.transferKB), m), {}),
      largest: [...res].sort((a, b) => b.transferKB - a.transferKB).slice(0, 12),
      latestToFinish: [...res].sort((a, b) => b.endMs - a.endMs).slice(0, 12),
    }
  })()`)
  await send('Network.setCacheDisabled', { cacheDisabled: false })
  ws.close()
  return { phase: 'H19.1-load', capturedAt: new Date().toISOString(), sourceUrl: page.url, cache: 'disabled', ...out }
}

// Counts WebGPU uploads and program creation from the first script on the page.
// Installed before a reload; `phase` is flipped to 'orbit' once the path starts.
const GPU_HOOK = `(() => {
  if (!window.GPUQueue || window.__gpuLog) return
  const log = { phase: 'load', load: {}, orbit: {}, rest: {} }
  window.__gpuLog = log
  const add = (name, bytes, ms) => {
    const e = (log[log.phase][name] ||= { calls: 0, bytes: 0, ms: 0 })
    e.calls++
    e.bytes += bytes || 0
    e.ms += ms
  }
  const wrap = (proto, name, bytesOf) => {
    const orig = proto[name]
    if (typeof orig !== 'function') return
    proto[name] = function (...args) {
      const t0 = performance.now()
      const out = orig.apply(this, args)
      if (out && typeof out.then === 'function') {
        return out.then((v) => (add(name, bytesOf(args), performance.now() - t0), v))
      }
      add(name, bytesOf(args), performance.now() - t0)
      return out
    }
  }
  const len = (d) => (d && (d.byteLength ?? d.length)) || 0
  const extent = (s) => Array.isArray(s) ? (s[0] || 1) * (s[1] || 1) * (s[2] || 1) : (s?.width || 1) * (s?.height || 1) * (s?.depthOrArrayLayers || 1)
  wrap(GPUQueue.prototype, 'writeBuffer', (a) => a[4] ?? len(a[2]) - (a[3] || 0))
  wrap(GPUQueue.prototype, 'writeTexture', (a) => len(a[1]))
  wrap(GPUQueue.prototype, 'copyExternalImageToTexture', (a) => extent(a[2]) * 4)
  wrap(GPUDevice.prototype, 'createTexture', (a) => extent(a[0]?.size) * 4)
  wrap(GPUDevice.prototype, 'createShaderModule', () => 0)
  wrap(GPUDevice.prototype, 'createRenderPipeline', () => 0)
  wrap(GPUDevice.prototype, 'createRenderPipelineAsync', () => 0)
  wrap(GPUDevice.prototype, 'createComputePipeline', () => 0)
  wrap(GPUDevice.prototype, 'createComputePipelineAsync', () => 0)
  const createBuffer = GPUDevice.prototype.createBuffer
  GPUDevice.prototype.createBuffer = function (desc) {
    const t0 = performance.now()
    const out = createBuffer.call(this, desc)
    add(desc?.mappedAtCreation ? 'createBuffer(mapped)' : 'createBuffer', desc?.size, performance.now() - t0)
    return out
  }
})()`

async function frameProfile() {
  const { page, ws, send, evaluate } = await cdp(process.env.PAGE_MATCH || 'perf')
  await send('Page.bringToFront').catch(() => {})
  await send('Page.enable')
  // Same empty site as the capture: the editor persists its scene per origin.
  await send('Storage.clearDataForOrigin', { origin: new URL(page.url).origin, storageTypes: 'all' })
  const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source: GPU_HOOK })
  await send('Page.reload', { ignoreCache: false })
  await Bun.sleep(1500)
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!!(window.__pascalPerf && window.__pascalPerf.three && window.__pascalPerf.stats())`)) break
    await Bun.sleep(500)
  }
  await Bun.sleep(4000)

  // Environment: backend, adapter, resolution, tier.
  const env = await evaluate(
    `(async () => {
      const { gl } = window.__pascalPerf.three()
      let adapter = null
      try {
        const ad = navigator.gpu && (await navigator.gpu.requestAdapter())
        const info = ad && (ad.info || (ad.requestAdapterInfo && (await ad.requestAdapterInfo())))
        adapter = info ? { vendor: info.vendor, architecture: info.architecture, description: info.description, isFallback: ad.isFallbackAdapter ?? null } : null
      } catch (e) { adapter = { error: String(e) } }
      const el = document.documentElement
      return {
        backend: gl.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2',
        adapter,
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        dpr: gl.getPixelRatio(),
        devicePixelRatio: window.devicePixelRatio,
        drawingBuffer: [gl.domElement.width, gl.domElement.height],
        cssSize: [gl.domElement.clientWidth, gl.domElement.clientHeight],
        detectedQuality: el.dataset.gpuQuality ?? null,
        resolvedQuality: el.dataset.gpuQualityResolved ?? null,
        shadowMap: { enabled: gl.shadowMap?.enabled, type: gl.shadowMap?.type },
        toneMapping: gl.toneMapping,
      }
    })()`,
    true,
  )

  // Where the frame goes: HUD windows over the same 20s orbit as the capture.
  await evaluate(`(() => {
    const p = window.__pascalPerf, c = document.querySelector('canvas')
    const s = { done: false, windows: [], t0: performance.now(), mem0: p.rendererInfo() }
    if (window.__gpuLog) window.__gpuLog.phase = 'orbit'
    window.__h191 = s
    let last = p.stats()
    function tick(now) {
      const t = (now - s.t0) / ${PATH_MS}, r = c.getBoundingClientRect(), a = t * Math.PI * 2
      c.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse',
        clientX: r.left + r.width / 2 + Math.cos(a) * Math.min(r.width, r.height) * 0.25,
        clientY: r.top + r.height / 2 + Math.sin(a) * Math.min(r.width, r.height) * 0.25 }))
      const st = p.stats()
      if (st && st !== last) {
        last = st
        s.windows.push({ fps: st.fps, cpuMs: st.frameMs, cpuMaxMs: st.frameMaxMs, encodeMs: st.encodeMs,
          encodeMaxMs: st.encodeMaxMs, gpuMs: st.gpuMs, gpuMaxMs: st.gpuMaxMs, gpuTracked: st.gpuTracked,
          queueMs: st.queueMs, queueMaxMs: st.queueMaxMs, drawCalls: st.drawCalls, triangles: st.triangles,
          textures: st.textures, geometries: st.geometries, gpuBytes: st.gpuBytes, heapBytes: st.heapBytes,
          tracks: st.tracks })
      }
      if (now - s.t0 < ${PATH_MS}) requestAnimationFrame(tick)
      else {
        s.done = true
        if (window.__gpuLog) window.__gpuLog.phase = 'rest'
      }
    }
    requestAnimationFrame(tick)
  })()`)
  let path = null
  for (let i = 0; i < 60 && !path; i++) {
    await Bun.sleep(1000)
    path = await evaluate(`window.__h191.done ? window.__h191 : null`)
  }
  if (!path) throw new Error('path timed out')
  const w = path.windows
  const col = (k) => w.map((x) => x[k]).filter((n) => typeof n === 'number')
  const summary = (k) => ({ median: r2(pct(col(k), 50)), max: r2(Math.max(...col(k))) })
  const trackTotals = {}
  for (const x of w)
    for (const t of x.tracks || []) {
      const e = (trackTotals[t.name] ||= { totalMs: 0, count: 0, maxMs: 0 })
      e.totalMs += t.totalMs
      e.count += t.count
      e.maxMs = Math.max(e.maxMs, t.maxMs)
    }
  const frame = {
    windows: w.length,
    fps: summary('fps'),
    budgetMsAtCap: 20,
    cpuFrameMs: summary('cpuMs'),
    cpuFrameMaxMs: summary('cpuMaxMs'),
    renderEncodeMs: summary('encodeMs'),
    gpuMs: summary('gpuMs'),
    gpuMaxMs: summary('gpuMaxMs'),
    gpuTracked: w.some((x) => x.gpuTracked),
    queueMs: summary('queueMs'),
    drawCalls: summary('drawCalls'),
    triangles: summary('triangles'),
    systemTracks: Object.entries(trackTotals)
      .map(([name, e]) => ({ name, totalMs: r2(e.totalMs), count: e.count, maxMs: r2(e.maxMs) }))
      .sort((a, b) => b.totalMs - a.totalMs),
  }
  const upload = {
    texturesFirst: w[0]?.textures ?? null,
    texturesLast: w.at(-1)?.textures ?? null,
    geometriesFirst: w[0]?.geometries ?? null,
    geometriesLast: w.at(-1)?.geometries ?? null,
    gpuBytesFirst: w[0]?.gpuBytes ?? null,
    gpuBytesLast: w.at(-1)?.gpuBytes ?? null,
    heapBytesFirst: w[0]?.heapBytes ?? null,
    heapBytesLast: w.at(-1)?.heapBytes ?? null,
  }

  // Passes: wrap gl.render for 10 frames and account each call.
  const passes = await evaluate(
    `(async () => {
      const p = window.__pascalPerf, { gl } = p.three()
      const orig = gl.render
      const calls = []
      let depth = 0
      gl.render = function (scene, camera) {
        const rt = gl.getRenderTarget()
        const i0 = gl.info.render.drawCalls, t0 = gl.info.render.triangles
        const c0 = performance.now()
        depth++
        try { return orig.apply(this, arguments) } finally {
          depth--
          calls.push({ tick: p.frameTick(), depth,
            target: rt ? (rt.texture?.name || 'rt') + ' ' + rt.width + 'x' + rt.height + (rt.depthTexture ? ' +depth' : '') : 'canvas',
            camera: camera?.type, scene: scene?.type || scene?.constructor?.name,
            drawCalls: gl.info.render.drawCalls - i0, triangles: gl.info.render.triangles - t0,
            cpuMs: +(performance.now() - c0).toFixed(3) })
        }
      }
      const start = p.frameTick()
      await new Promise((res) => { const f = () => (p.frameTick() - start >= 11 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) })
      gl.render = orig
      const frames = [...new Set(calls.map((c) => c.tick))].slice(1, 11)
      const perFrame = frames.map((t) => calls.filter((c) => c.tick === t))
      return { framesSampled: perFrame.length, callsPerFrame: perFrame.map((f) => f.length), exampleFrame: perFrame[0] }
    })()`,
    true,
  )

  // Shadows, materials, worst draws: one scene walk.
  const scene = await evaluate(`(() => {
    const p = window.__pascalPerf, { scene } = p.three()
    const lights = [], mats = new Map(), meshes = []
    let casters = 0, receivers = 0
    scene.traverse((o) => {
      if (o.isLight) lights.push({ type: o.type, name: o.name || null, visible: o.visible, castShadow: !!o.castShadow,
        mapSize: o.shadow ? o.shadow.mapSize.x + 'x' + o.shadow.mapSize.y : null,
        allocated: !!(o.shadow && o.shadow.map), autoUpdate: o.shadow?.autoUpdate ?? null })
      if ((o.isMesh || o.isInstancedMesh || o.isLine || o.isPoints) && o.visible) {
        let visible = true
        for (let q = o.parent; q; q = q.parent) if (!q.visible) { visible = false; break }
        if (!visible) return
        if (o.castShadow) casters++
        if (o.receiveShadow) receivers++
        const ms = [].concat(o.material)
        for (const m of ms) {
          const e = mats.get(m.uuid) || { type: m.type, name: m.name || null, transparent: m.transparent, users: 0 }
          e.users++
          mats.set(m.uuid, e)
        }
        const g = o.geometry
        const idx = g?.index ? g.index.count : g?.attributes?.position?.count ?? 0
        const tris = o.isMesh ? Math.round(idx / 3) * (o.isInstancedMesh ? o.count : 1) : 0
        meshes.push({ name: o.name || o.parent?.name || o.type, kind: o.type, triangles: tris,
          instances: o.isInstancedMesh ? o.count : 1, materials: ms.map((m) => m.type).join('+'),
          castShadow: !!o.castShadow, receiveShadow: !!o.receiveShadow, frustumCulled: o.frustumCulled })
      }
    })
    const byType = {}
    for (const m of mats.values()) byType[m.type] = (byType[m.type] || 0) + 1
    return {
      shadows: { lights: lights.filter((l) => l.castShadow || l.allocated), otherLights: lights.filter((l) => !(l.castShadow || l.allocated)).length, visibleCasters: casters, visibleReceivers: receivers },
      materials: { unique: mats.size, byType, transparent: [...mats.values()].filter((m) => m.transparent).length },
      drawables: meshes.length,
      worstDraws: meshes.sort((a, b) => b.triangles - a.triangles).slice(0, 10),
      drawComposition: typeof p.drawComposition === 'function' ? p.drawComposition() : null,
    }
  })()`)

  // Attribution: read the HUD's GPU ms with one knob flipped, then restore.
  async function hudFor(label, apply, restore) {
    await evaluate(`(() => { const p = window.__pascalPerf, three = p.three(); (${apply})(three) })()`)
    await Bun.sleep(1500)
    const vals = []
    let last = null
    for (let i = 0; i < 60 && vals.length < 8; i++) {
      await Bun.sleep(250)
      const st = await evaluate(`(() => { const s = window.__pascalPerf.stats(); return s && { gpuMs: s.gpuMs, cpuMs: s.frameMs, drawCalls: s.drawCalls, fps: s.fps, stamp: s.gpuMs + ':' + s.frameMs + ':' + s.encodeMs } })()`)
      if (st && st.stamp !== last) {
        last = st.stamp
        vals.push(st)
      }
    }
    await evaluate(`(() => { const p = window.__pascalPerf, three = p.three(); (${restore})(three) })()`)
    return { label, windows: vals.length, gpuMs: r2(pct(vals.map((v) => v.gpuMs), 50)), cpuMs: r2(pct(vals.map((v) => v.cpuMs), 50)), drawCalls: pct(vals.map((v) => v.drawCalls), 50), fps: pct(vals.map((v) => v.fps), 50) }
  }
  const attribution = [
    await hudFor('baseline', '() => {}', '() => {}'),
    await hudFor(
      'shadow casting off (all lights)',
      `(t) => { window.__h191cast = []; t.scene.traverse((o) => { if (o.isLight && o.castShadow) { window.__h191cast.push(o); o.castShadow = false } }) }`,
      `() => { for (const o of window.__h191cast) o.castShadow = true }`,
    ),
    await hudFor(
      'dpr 1.0',
      `(t) => { window.__h191dpr = t.gl.getPixelRatio(); t.setDpr(1) }`,
      `(t) => { t.setDpr(window.__h191dpr) }`,
    ),
    await hudFor('baseline again', '() => {}', '() => {}'),
  ]

  // Time per pass: label each render context's timestamp uid by its target,
  // then read three's per-context device timestamps on every new resolve.
  const passGpu = await evaluate(
    `(async () => {
      const { gl } = window.__pascalPerf.three()
      const be = gl.backend, pool = be.timestampQueryPool?.render
      if (!be.trackTimestamp || !pool) return null
      const labels = new Map()
      const orig = be.beginRender
      be.beginRender = function (rc) {
        const out = orig.call(this, rc)
        const uid = be.get(rc).timestampUID
        if (uid) {
          const rt = rc.renderTarget
          labels.set(String(uid).replace(/:f\\d+$/, ''),
            rt ? (rt.texture?.name || 'rt') + ' ' + rc.width + 'x' + rc.height : 'canvas ' + rc.width + 'x' + rc.height)
        }
        return out
      }
      const per = {}, totals = []
      let last = pool.frames
      const t0 = performance.now()
      await new Promise((res) => {
        const f = () => {
          if (pool.frames && pool.frames !== last) {
            last = pool.frames
            const frame = pool.frames[pool.frames.length - 1]
            let total = 0
            // uid = r:<render.frameCalls>:<contextId>:f<frame>. frameCalls drifts
            // (PerfMonitor owns info.reset), so a pass is its context id plus its
            // order within the frame.
            const inFrame = []
            for (const [uid, ms] of pool.timestamps) {
              const m = String(uid).match(/^r:(\\d+):(\\d+):f(\\d+)$/)
              if (!m || Number(m[3]) !== frame) continue
              inFrame.push({ order: Number(m[1]), ctx: m[2], base: 'r:' + m[1] + ':' + m[2], ms })
            }
            inFrame.sort((a, b) => a.order - b.order)
            inFrame.forEach((p, i) => {
              const label = '#' + (i + 1) + ' ' + (labels.get(p.base) || 'unlabelled') + ' (context ' + p.ctx + ')'
              ;(per[label] ||= []).push(p.ms)
              total += p.ms
            })
            if (total > 0) totals.push(total)
          }
          performance.now() - t0 < 8000 ? requestAnimationFrame(f) : res()
        }
        requestAnimationFrame(f)
      })
      be.beginRender = orig
      const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
      const totalMed = med(totals)
      // A pass is per-frame if it appears in at least half the resolves.
      const rows = Object.entries(per).map(([label, a]) => ({
        label, samples: a.length, gpuMsMedian: +med(a).toFixed(3), share: +(med(a) / totalMed).toFixed(3),
      }))
      const perFrame = rows.filter((r) => r.samples >= totals.length / 2)
      const oneOff = rows.filter((r) => r.samples < totals.length / 2)
      return {
        resolves: totals.length,
        frameGpuMsMedian: +totalMed.toFixed(3),
        perFramePassSumMs: +perFrame.reduce((s, r) => s + r.gpuMsMedian, 0).toFixed(3),
        passes: perFrame.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })),
        oneOff: { contexts: oneOff.length, samples: oneOff.reduce((s, r) => s + r.samples, 0) },
      }
    })()`,
    true,
  )

  // Worst draws by cost: hide one drawable at a time and read renderMs against
  // interleaved baselines. Device timestamps, one sample per resolve.
  const drawCost = await evaluate(
    `(async () => {
      const { gl, scene } = window.__pascalPerf.three()
      const pool = gl.backend.timestampQueryPool?.render
      if (!pool) return null
      const sample = (ms) => new Promise((res) => {
        const vals = []
        let last = pool.frames
        const t0 = performance.now()
        const f = () => {
          if (pool.frames && pool.frames !== last) { last = pool.frames; if (pool.lastValue > 0) vals.push(pool.lastValue) }
          performance.now() - t0 < ms ? requestAnimationFrame(f) : res(vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)])
        }
        requestAnimationFrame(f)
      })
      const drawables = []
      scene.traverse((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints) || !o.visible) return
        for (let q = o.parent; q; q = q.parent) if (!q.visible) return
        drawables.push(o)
      })
      await sample(800)
      const rows = []
      for (const o of drawables) {
        const before = await sample(1500)
        o.visible = false
        await sample(300)
        const hidden = await sample(1500)
        o.visible = true
        const after = await sample(1500)
        const base = (before + after) / 2
        rows.push({ name: o.name || o.parent?.name || o.type, kind: o.type, baseMs: +base.toFixed(3), hiddenMs: +hidden.toFixed(3),
          costMs: +(base - hidden).toFixed(3), baselineDriftMs: +Math.abs(before - after).toFixed(3) })
      }
      return rows.sort((a, b) => b.costMs - a.costMs)
    })()`,
    true,
  )

  const gpuLog = await evaluate(`window.__gpuLog ? { load: window.__gpuLog.load, orbit: window.__gpuLog.orbit } : null`)
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier }).catch(() => {})
  const r3 = (o) =>
    o &&
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, { calls: v.calls, bytes: v.bytes, ms: Number(v.ms.toFixed(2)) }]),
    )
  const gpuWork = gpuLog
    ? {
        note: 'WebGPU calls wrapped from the first script on the page (reload). load = until the 20s orbit starts; orbit = during it. ms is CPU wall time of the call.',
        load: r3(gpuLog.load),
        orbit: r3(gpuLog.orbit),
        programs: {
          shaderModules: gpuLog.load.createShaderModule?.calls ?? 0,
          renderPipelines:
            (gpuLog.load.createRenderPipeline?.calls ?? 0) + (gpuLog.load.createRenderPipelineAsync?.calls ?? 0),
          computePipelines:
            (gpuLog.load.createComputePipeline?.calls ?? 0) + (gpuLog.load.createComputePipelineAsync?.calls ?? 0),
          createdDuringOrbit:
            (gpuLog.orbit.createShaderModule?.calls ?? 0) +
            (gpuLog.orbit.createRenderPipeline?.calls ?? 0) +
            (gpuLog.orbit.createRenderPipelineAsync?.calls ?? 0),
        },
      }
    : null

  ws.close()
  return {
    phase: 'H19.1',
    capturedAt: new Date().toISOString(),
    sourceUrl: page.url,
    tree: process.env.TREE_SHA || null,
    cameraPath: { kind: 'synthetic-pointer-orbit', durationMs: PATH_MS },
    env,
    frame,
    passes,
    ...scene,
    upload,
    gpuWork,
    passGpu,
    drawCost,
    attribution,
    note: 'Profile only. No product change. Toggles (shadow casting, dpr, one drawable hidden at a time) were applied in-page and restored; the WebGPU call hook was installed for one reload and removed.',
  }
}

const out = loadMode ? await loadProfile() : await frameProfile()
const file = join(import.meta.dir, loadMode ? 'h19-1-load.json' : 'h19-1-profile.json')
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
console.log('wrote', file)
console.log(JSON.stringify(out, null, 2))
