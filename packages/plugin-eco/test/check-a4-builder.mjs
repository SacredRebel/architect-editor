#!/usr/bin/env bun
/**
 * A4 — the editor runs under the base path /builder, same origin as the world.
 *
 *   (cd apps/editor && bun run build:static)          # static export → apps/editor/out
 *   bun packages/plugin-eco/test/check-a4-builder.mjs [--self-test]
 *
 * Serves apps/editor/out from its own server (every request logged), opens the
 * editor pages under /builder in its own Chrome (isolated profile, cache off)
 * and records every request each page makes until the network is idle.
 * Asserts, per page, two separately derived views of the same traffic:
 *   - the browser's (CDP Network): every request same-origin and under
 *     /builder/, no 4xx/5xx response, no failed load;
 *   - the server's own log: every path under /builder/ and answered 200;
 *   - the two agree on which paths were fetched.
 * Then IFC export from /builder/embed/ (its wasm must come from the base
 * path), the bridge's origin gate (below), and, on a build whose host origin is
 * this server's localhost, the same audit over real content: the H19 fixture
 * plus one KTX2 finish, so the Draco decoder and the Basis transcoder load.
 * Content may also fetch the library files the build itself records as absent
 * from the export and left on the CDN (eco-build.json `onCdn`); those are
 * listed, and nothing else outside the base path passes.
 * --self-test forges one root-relative asset (a fetch of /forged-asset.png from
 * the page) and must FAIL on it, with and without the CDN-only files allowed;
 * the content checks, given a page that loaded no content, and the IFC checks,
 * given a page where no export ran, must FAIL too.
 *
 * Env: CHROME (path to Chrome), PORT (static server, default 4173),
 * HEADLESS=1 (run Chrome headless).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const BASE = '/builder'
const PAGES = [`${BASE}/`, `${BASE}/embed/`]
const selfTest = process.argv.includes('--self-test')
const root = resolve(import.meta.dir, '../../..')
const outDir = join(root, 'apps/editor/out')
const port = Number(process.env.PORT || 4173)
// Chrome's debugging port: whatever the OS hands out, never a fixed guess.
const cdpPort = await (async () => {
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const free = probe.port
  probe.stop(true)
  return free
})()
const chromePath =
  process.env.CHROME ||
  (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome')

if (!existsSync(join(outDir, BASE.slice(1), 'index.html'))) {
  console.error(`FAIL - no static export at ${outDir}${BASE}/ (run: cd apps/editor && bun run build:static)`)
  process.exit(1)
}

// ------------------------------------------------------------ static server
const serverLog = []
const server = Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(request) {
    const url = new URL(request.url)
    let path = decodeURIComponent(url.pathname)
    const file = (() => {
      const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`, `${path}.html`]
      for (const candidate of candidates) {
        const full = normalize(join(outDir, candidate))
        if (!full.startsWith(outDir)) return null
        if (existsSync(full) && statSync(full).isFile()) return full
      }
      return null
    })()
    const status = file ? 200 : 404
    serverLog.push({ path, status })
    if (!file) return new Response('not found', { status: 404 })
    const type = extname(file) === '.mjs' ? { 'content-type': 'text/javascript' } : undefined
    return new Response(Bun.file(file), { headers: type })
  },
})
const origin = `http://127.0.0.1:${port}`

// ------------------------------------------------------------------- chrome
const profile = mkdtempSync(join(tmpdir(), 'a4-chrome-'))
const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    ...(process.env.HEADLESS === '1' ? ['--headless=new'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function cdpPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {}
    await Bun.sleep(250)
  }
  throw new Error('Chrome did not expose a page over CDP')
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 1
  const pending = new Map()
  const listeners = new Set()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    } else if (msg.method) {
      for (const fn of listeners) fn(msg)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const my = id++
      pending.set(my, { resolve, reject })
      ws.send(JSON.stringify({ id: my, method, params }))
    })
  return { ws, send, on: (fn) => listeners.add(fn), off: (fn) => listeners.delete(fn) }
}

const evaluate = async (cdp, expression) =>
  (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value

/**
 * Loads `pageOrigin + path` and records every request until the network is
 * idle. `during` runs once the page has loaded (e.g. posting a fixture);
 * `after` reads the page's state at the end.
 */
async function recordPage(
  cdp,
  path,
  { forge = false, pageOrigin = origin, during, after, minMs = 10_000, quietMs = 3000, maxMs = 60_000 } = {},
) {
  const requests = new Map()
  const errors = []
  let lastActivity = Date.now()
  let loaded = false
  const listener = (msg) => {
    const p = msg.params ?? {}
    if (msg.method === 'Network.requestWillBeSent') {
      requests.set(p.requestId, { url: p.request.url, type: p.type, status: null, failed: null })
      lastActivity = Date.now()
    } else if (msg.method === 'Network.responseReceived') {
      const r = requests.get(p.requestId)
      if (r) r.status = p.response.status
      lastActivity = Date.now()
    } else if (msg.method === 'Network.loadingFailed') {
      const r = requests.get(p.requestId)
      if (r) r.failed = p.errorText
      lastActivity = Date.now()
    } else if (msg.method === 'Page.loadEventFired') {
      loaded = true
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'exception')
    } else if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      errors.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '))
    }
  }
  cdp.on(listener)
  serverLog.length = 0
  await cdp.send('Page.navigate', { url: pageOrigin + path })
  const start = Date.now()
  while (!loaded && Date.now() - start < 60_000) await Bun.sleep(100)
  await Bun.sleep(3000)
  if (forge) await evaluate(cdp, `fetch('/forged-asset.png').catch(() => {}); 'forged'`)
  const settleFrom = Date.now()
  if (during) await during()
  // Idle: at least `minMs` after load (or after `during`) and no network
  // activity for `quietMs`, at most `maxMs`.
  while (
    Date.now() - settleFrom < maxMs &&
    (Date.now() - settleFrom < minMs || Date.now() - lastActivity < quietMs)
  ) {
    await Bun.sleep(200)
  }
  const state = after ? await after() : null
  cdp.off(listener)
  return { requests: [...requests.values()], server: [...serverLog], errors, state }
}

/**
 * `declared`: absolute URLs of the files this build itself leaves on the CDN
 * (eco-build.json `onCdn`, derived from the export). Only content passes it:
 * a request to one of those is counted and listed, not failed; any other
 * request outside the base path still fails. The pages pass nothing: zero.
 */
function checkPage(path, { requests, server }, pageOrigin = origin, declared = null) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${path}: ${msg}`)
    else console.log('OK', `${path}: ${msg}`)
  }
  const all = requests.filter((r) => /^https?:/.test(r.url))
  const onCdn = declared ? all.filter((r) => declared.has(r.url)) : []
  const web = all.filter((r) => !onCdn.includes(r))
  const outside = web.filter((r) => {
    const u = new URL(r.url)
    return u.origin !== pageOrigin || !(u.pathname === BASE || u.pathname.startsWith(`${BASE}/`))
  })
  ok(all.length > 0, `browser recorded ${all.length} requests`)
  ok(
    outside.length === 0,
    `every browser request same-origin under ${BASE}/${declared ? `, apart from ${onCdn.length} to files this build declares CDN-only` : ''} (outside: ${outside.map((r) => r.url).join(', ') || 'none'})`,
  )
  if (onCdn.length) {
    console.log(`NOTE ${path}: ${onCdn.length} requests to declared CDN-only files:`)
    for (const r of onCdn) console.log(`NOTE   ${r.status ?? r.failed ?? 'pending'} ${r.url}`)
  }
  const bad = web.filter((r) => (r.status ?? 0) >= 400)
  ok(bad.length === 0, `no 4xx/5xx in the browser (${bad.map((r) => `${r.status} ${r.url}`).join(', ') || 'none'})`)
  const failed = web.filter((r) => r.failed && r.failed !== 'net::ERR_ABORTED')
  ok(failed.length === 0, `no failed loads (${failed.map((r) => `${r.failed} ${r.url}`).join(', ') || 'none'})`)
  const serverOutside = server.filter((s) => !(s.path === BASE || s.path.startsWith(`${BASE}/`)))
  ok(serverOutside.length === 0, `server saw only ${BASE}/ paths (outside: ${serverOutside.map((s) => s.path).join(', ') || 'none'})`)
  const server404 = server.filter((s) => s.status !== 200)
  ok(server404.length === 0, `server answered every request 200 (${server404.map((s) => `${s.status} ${s.path}`).join(', ') || 'none'})`)
  const browserPaths = new Set(
    web.filter((r) => new URL(r.url).origin === pageOrigin).map((r) => new URL(r.url).pathname),
  )
  const serverPaths = new Set(server.map((s) => s.path))
  const onlyBrowser = [...browserPaths].filter((p) => !serverPaths.has(p))
  const onlyServer = [...serverPaths].filter((p) => !browserPaths.has(p))
  ok(
    onlyBrowser.length === 0 && onlyServer.length === 0,
    `browser and server agree on ${serverPaths.size} paths (browser only: ${onlyBrowser.join(', ') || 'none'}; server only: ${onlyServer.join(', ') || 'none'})`,
  )
  return fails
}

/**
 * The bridge talks to one origin (NEXT_PUBLIC_ECO_HOST_ORIGIN, recorded by the
 * build in eco-build.json). The world stand-in (eco-host-harness.html) embeds
 * /builder/embed/ and knocks eco:hello. Two separately derived signals: the
 * host's own log (did eco:ready arrive?) and the editor's scene (did the site's
 * guides render?). From the configured origin both must be yes; from any other
 * origin both must be no.
 */
async function originCase(cdp, hostOrigin) {
  const url = `${hostOrigin}/eco-host-harness.html?embed=${encodeURIComponent(`${BASE}/embed/?perf`)}`
  await cdp.send('Page.navigate', { url })
  const read = async () =>
    (
      await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const log = document.getElementById('log')?.textContent ?? ''
          let guides = 0
          try {
            const w = document.getElementById('editor').contentWindow
            w.__pascalPerf?.three().scene.traverse((o) => { if (o.name === 'eco-guides') guides++ })
          } catch {}
          return { ready: log.includes('eco:ready'), exhausted: log.includes('knock budget exhausted'), guides }
        })()`,
      })
    ).result.value
  const start = Date.now()
  let state = await read()
  while (Date.now() - start < 45_000 && !(state.ready && state.guides > 0) && !state.exhausted) {
    await Bun.sleep(500)
    state = await read()
  }
  return state
}

/**
 * Content: the H19 fixture (a house whose item models are mostly
 * Draco-compressed, a terrain with thirty trees, the survey guides) posted over
 * the bridge from the build's host origin, with one wall finished in a library
 * material whose maps are KTX2, so the Draco decoder and the Basis transcoder
 * both load. The fixture file is read as committed; the finish is set on the
 * copy posted here. Same request audit as the pages, plus three separately
 * derived agreements: the live scene's node counts against the fixture's
 * `expect`; every item model the fixture names against the server's log; the
 * decoder files against the server's log, fetched from under the base path.
 */
const FIXTURE = join(root, 'packages/viewer/test/fixtures/h19-scene.json')
const KTX2_FINISH = 'library:concrete-plate'
const DECODER_FILES = [
  `${BASE}/decoders/draco/draco_wasm_wrapper.js`,
  `${BASE}/decoders/draco/draco_decoder.wasm`,
  `${BASE}/decoders/basis/basis_transcoder.js`,
  `${BASE}/decoders/basis/basis_transcoder.wasm`,
]
const DECODER_ERROR = /draco|basis|ktx2|transcod|decoder|gltf|glb/i

function contentFixture(pageOrigin) {
  const text = readFileSync(FIXTURE, 'utf8')
  const fixture = JSON.parse(text.replaceAll('{{origin}}', `${pageOrigin}${BASE}`))
  const load = fixture.postMessages.find((m) => m.t === 'eco:load-scene')
  const wall = Object.values(load.scene.nodes).find((n) => n.type === 'wall')
  wall.materialPreset = KTX2_FINISH
  const models = [...new Set([...text.matchAll(/\{\{origin\}\}(\/items\/[^"]+\/model\.glb)/g)].map((m) => `${BASE}${m[1]}`))]
  return { fixture, models }
}

async function contentCase(cdp, pageOrigin) {
  const { fixture, models } = contentFixture(pageOrigin)
  // Start from empty storage, cleared from a same-origin file that runs no
  // editor code (the editor persists its scene per origin).
  await cdp.send('Page.navigate', { url: `${pageOrigin}${BASE}/eco-build.json` })
  await Bun.sleep(800)
  await cdp.send('Storage.clearDataForOrigin', { origin: pageOrigin, storageTypes: 'all' })
  const recording = await recordPage(cdp, `${BASE}/?perf`, {
    pageOrigin,
    minMs: 15_000,
    quietMs: 5000,
    maxMs: 150_000,
    during: async () => {
      let ready = false
      for (let i = 0; i < 120 && !ready; i++) {
        ready = await evaluate(cdp, `(() => { try { return !!(${fixture.readyWhen}) } catch { return false } })()`)
        if (!ready) await Bun.sleep(500)
      }
      await Bun.sleep(1000)
      for (const message of fixture.postMessages) {
        await evaluate(cdp, `window.postMessage(${JSON.stringify(message)}, location.origin); true`)
        await Bun.sleep(500)
      }
    },
    after: () =>
      evaluate(
        cdp,
        `(() => {
          const p = window.__pascalPerf
          if (!p) return null
          const counts = {}
          for (const type of ${JSON.stringify(Object.keys(fixture.expect))}) counts[type] = p.listNodes(type).length
          let guides = 0
          p.three().scene.traverse((o) => { if (o.name === 'eco-guides') guides++ })
          return { counts, guides }
        })()`,
      ),
  })
  return { recording, expect: fixture.expect, models }
}

function checkContent(label, { recording, expect, models }) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  const counts = recording.state?.counts ?? null
  const wrong = Object.entries(expect).filter(([type, n]) => counts?.[type] !== n)
  ok(
    wrong.length === 0,
    `scene holds the fixture's nodes (${wrong.map(([t, n]) => `${t} ${counts?.[t] ?? '-'}/${n}`).join(', ') || Object.entries(expect).map(([t, n]) => `${t} ${n}`).join(', ')})`,
  )
  ok((recording.state?.guides ?? 0) > 0, `site guides rendered (${recording.state?.guides ?? 0})`)
  const served = new Set(recording.server.filter((s) => s.status === 200).map((s) => s.path))
  const modelsMissing = models.filter((m) => !served.has(m))
  ok(
    modelsMissing.length === 0,
    `server served all ${models.length} item models the fixture names (missing: ${modelsMissing.join(', ') || 'none'})`,
  )
  const decodersMissing = DECODER_FILES.filter((f) => !served.has(f))
  ok(
    decodersMissing.length === 0,
    `server served the Draco decoder and the Basis transcoder (missing: ${decodersMissing.join(', ') || 'none'})`,
  )
  const ktx2 = [...served].filter((p) => p.endsWith('.ktx2'))
  ok(ktx2.length > 0, `KTX2 maps served from under ${BASE}/ (${ktx2.length})`)
  const decoderErrors = recording.errors.filter((e) => DECODER_ERROR.test(e))
  ok(decoderErrors.length === 0, `no model or texture decode errors (${decoderErrors.slice(0, 3).join(' | ') || 'none'})`)
  return fails
}

/**
 * IFC export from the page the world embeds: the command palette's "Export IFC
 * 4.3" loads web-ifc, whose wasm the app serves. Two separately derived signals:
 * the browser began a download of an .ifc file, and the server served the wasm
 * from under the base path. The request audit runs over the same recording.
 */
const IFC_WASM = `${BASE}/web-ifc.wasm`

async function ifcCase(cdp, path) {
  const downloads = []
  const listener = (msg) => {
    if (msg.method === 'Page.downloadWillBegin') downloads.push(msg.params.suggestedFilename)
  }
  cdp.on(listener)
  const downloadPath = join(profile, 'downloads')
  mkdirSync(downloadPath, { recursive: true })
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath })
  const key = (type, key, code, keyCode, modifiers = 0) =>
    cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers })
  const recording = await recordPage(cdp, path, {
    minMs: 10_000,
    maxMs: 60_000,
    during: async () => {
      await Bun.sleep(3000)
      await key('keyDown', 'k', 'KeyK', 75, 2)
      await key('keyUp', 'k', 'KeyK', 75, 2)
      await Bun.sleep(800)
      await cdp.send('Input.insertText', { text: 'Export IFC' })
      await Bun.sleep(800)
      await key('keyDown', 'Enter', 'Enter', 13)
      await key('keyUp', 'Enter', 'Enter', 13)
      for (let i = 0; i < 60 && downloads.length === 0; i++) await Bun.sleep(500)
    },
  })
  cdp.off(listener)
  await cdp.send('Page.setDownloadBehavior', { behavior: 'default' })
  return { recording, downloads }
}

function checkIfc(label, { recording, downloads }) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  ok(downloads.some((name) => name.endsWith('.ifc')), `an .ifc download began (${downloads.join(', ') || 'none'})`)
  const wasm = recording.server.filter((s) => /web-ifc[^/]*\.wasm$/.test(s.path))
  ok(
    wasm.some((s) => s.path === IFC_WASM && s.status === 200),
    `server served ${IFC_WASM} (web-ifc wasm requests: ${wasm.map((s) => `${s.status} ${s.path}`).join(', ') || 'none'})`,
  )
  return fails
}

function checkOrigin(label, state, expectAccepted) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${label}: ${msg}`)
    else console.log('OK', `${label}: ${msg}`)
  }
  if (expectAccepted) {
    ok(state.ready, 'host received eco:ready')
    ok(state.guides > 0, `editor rendered the site's guides (${state.guides})`)
  } else {
    ok(!state.ready, 'host received no eco:ready')
    ok(state.guides === 0, `editor rendered no site (${state.guides} guide groups)`)
  }
  return fails
}

let exitCode = 0
try {
  const page = await cdpPage()
  const cdp = await connect(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  const build = JSON.parse(await Bun.file(join(outDir, BASE.slice(1), 'eco-build.json')).text())
  const declared = new Set((build.onCdn ?? []).map((p) => `${build.cdn}${p}`))

  if (selfTest) {
    console.log('check-a4-builder --self-test')
    const controlRecording = await recordPage(cdp, PAGES[0])
    const control = checkPage(PAGES[0], controlRecording)
    if (control.length) {
      console.error('SELF-TEST FAIL: the unforged page should pass', control)
      exitCode = 1
    } else {
      console.log('SELF-TEST OK: control page passes')
      const forgedRecording = await recordPage(cdp, PAGES[0], { forge: true })
      const forged = checkPage(`${PAGES[0]} +forged`, forgedRecording)
      // With the build's CDN-only files allowed (as for content), the forged
      // asset must still fail: the exception covers those files and no other.
      const forgedDeclared = checkPage(
        `${PAGES[0]} +forged, ${declared.size} CDN-only files allowed`,
        forgedRecording,
        origin,
        declared,
      )
      const hit =
        forged.some((f) => f.includes('/forged-asset.png')) &&
        forgedDeclared.some((f) => f.includes('/forged-asset.png'))
      // The content checks read a page that loaded no content: they must fail on
      // the scene and on the decoders, or they could not have failed at all.
      const { models } = contentFixture(origin)
      const empty = checkContent(`${PAGES[0]} as content`, {
        recording: controlRecording,
        expect: JSON.parse(readFileSync(FIXTURE, 'utf8')).expect,
        models,
      })
      const emptyHit =
        empty.some((f) => f.includes("fixture's nodes")) && empty.some((f) => f.includes('Basis transcoder'))
      // Likewise the IFC checks, given the page where no export ran.
      const noExport = checkIfc(`${PAGES[0]} as IFC export`, { recording: controlRecording, downloads: [] })
      const noExportHit =
        noExport.some((f) => f.includes('.ifc download')) && noExport.some((f) => f.includes(IFC_WASM))
      if (!hit) {
        console.error('SELF-TEST FAIL: a root-relative asset was not rejected', forged, forgedDeclared)
        exitCode = 1
      } else if (!emptyHit) {
        console.error('SELF-TEST FAIL: the content checks passed a page with no content', empty)
        exitCode = 1
      } else if (!noExportHit) {
        console.error('SELF-TEST FAIL: the IFC checks passed a page where no export ran', noExport)
        exitCode = 1
      } else {
        console.log('SELF-TEST OK: root-relative asset rejected, with and without the CDN-only files allowed')
        console.log('SELF-TEST OK: content checks reject a page with no content')
        console.log('SELF-TEST OK: IFC checks reject a page where no export ran')
        console.log('check-a4-builder --self-test OK')
      }
    }
  } else {
    const fails = []
    for (const path of PAGES) fails.push(...checkPage(path, await recordPage(cdp, path)))
    const ifc = await ifcCase(cdp, PAGES[1])
    fails.push(...checkPage(`${PAGES[1]} + Export IFC`, ifc.recording))
    fails.push(...checkIfc(`${PAGES[1]} + Export IFC`, ifc))
    const local = `http://localhost:${port}`
    console.log(`bridge host origin in this build: ${build.hostOrigin}`)
    console.log(`files this build leaves on ${build.cdn}: ${declared.size}`)
    fails.push(...checkOrigin(`hello from ${origin}`, await originCase(cdp, origin), build.hostOrigin === origin))
    if (build.hostOrigin === local) {
      fails.push(...checkOrigin(`hello from ${local}`, await originCase(cdp, local), true))
      const content = await contentCase(cdp, local)
      const label = `${BASE}/?perf + H19 fixture + ${KTX2_FINISH}`
      fails.push(...checkPage(label, content.recording, local, declared))
      fails.push(...checkContent(label, content))
    } else {
      console.log(
        `NOTE the accepted case and the content case need a build with NEXT_PUBLIC_ECO_HOST_ORIGIN=${local}; this build answers only ${build.hostOrigin}`,
      )
    }
    if (fails.length) {
      console.error('FAIL')
      for (const f of fails) console.error('-', f)
      exitCode = 1
    } else {
      console.log('check-a4-builder OK')
    }
  }
  cdp.ws.close()
} catch (err) {
  console.error(err)
  exitCode = 1
} finally {
  chrome.kill()
  server.stop(true)
  await Bun.sleep(500)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
process.exit(exitCode)
