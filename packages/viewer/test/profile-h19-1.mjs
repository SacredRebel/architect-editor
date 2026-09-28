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

async function frameProfile() {
  const { page, ws, send, evaluate } = await cdp(process.env.PAGE_MATCH || 'perf')
  await send('Page.bringToFront').catch(() => {})
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!!(window.__pascalPerf && window.__pascalPerf.three && window.__pascalPerf.stats())`)) break
    await Bun.sleep(500)
  }

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
      else s.done = true
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
    attribution,
    note: 'Profile only. No product change. Attribution toggles were applied in-page and restored.',
  }
}

const out = loadMode ? await loadProfile() : await frameProfile()
const file = join(import.meta.dir, loadMode ? 'h19-1-load.json' : 'h19-1-profile.json')
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
console.log('wrote', file)
console.log(JSON.stringify(out, null, 2))
