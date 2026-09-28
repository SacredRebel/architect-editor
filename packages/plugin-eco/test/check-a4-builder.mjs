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
 * --self-test forges one root-relative asset (a fetch of /forged-asset.png from
 * the page) and must FAIL on it.
 *
 * Env: CHROME (path to Chrome), PORT (static server, default 4173),
 * HEADLESS=1 (run Chrome headless).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
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
  return { ws, send, on: (fn) => listeners.add(fn) }
}

async function recordPage(cdp, path, forge) {
  const requests = new Map()
  let lastActivity = Date.now()
  let loaded = false
  const off = (msg) => {
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
    }
  }
  cdp.on(off)
  serverLog.length = 0
  await cdp.send('Page.navigate', { url: origin + path })
  const start = Date.now()
  while (!loaded && Date.now() - start < 60_000) await Bun.sleep(100)
  await Bun.sleep(3000)
  if (forge) {
    await cdp.send('Runtime.evaluate', {
      expression: `fetch('/forged-asset.png').catch(() => {}); 'forged'`,
    })
  }
  // Idle: at least 10 s after load and no network activity for 3 s (max 60 s).
  while (Date.now() - start < 60_000 && (Date.now() - start < 10_000 || Date.now() - lastActivity < 3000)) {
    await Bun.sleep(200)
  }
  return { requests: [...requests.values()], server: [...serverLog] }
}

function checkPage(path, { requests, server }) {
  const fails = []
  const ok = (cond, msg) => {
    if (!cond) fails.push(`${path}: ${msg}`)
    else console.log('OK', `${path}: ${msg}`)
  }
  const web = requests.filter((r) => /^https?:/.test(r.url))
  const outside = web.filter((r) => {
    const u = new URL(r.url)
    return u.origin !== origin || !(u.pathname === BASE || u.pathname.startsWith(`${BASE}/`))
  })
  ok(web.length > 0, `browser recorded ${web.length} requests`)
  ok(outside.length === 0, `every browser request same-origin under ${BASE}/ (outside: ${outside.map((r) => r.url).join(', ') || 'none'})`)
  const bad = web.filter((r) => (r.status ?? 0) >= 400)
  ok(bad.length === 0, `no 4xx/5xx in the browser (${bad.map((r) => `${r.status} ${r.url}`).join(', ') || 'none'})`)
  const failed = web.filter((r) => r.failed && r.failed !== 'net::ERR_ABORTED')
  ok(failed.length === 0, `no failed loads (${failed.map((r) => `${r.failed} ${r.url}`).join(', ') || 'none'})`)
  const serverOutside = server.filter((s) => !(s.path === BASE || s.path.startsWith(`${BASE}/`)))
  ok(serverOutside.length === 0, `server saw only ${BASE}/ paths (outside: ${serverOutside.map((s) => s.path).join(', ') || 'none'})`)
  const server404 = server.filter((s) => s.status !== 200)
  ok(server404.length === 0, `server answered every request 200 (${server404.map((s) => `${s.status} ${s.path}`).join(', ') || 'none'})`)
  const browserPaths = new Set(web.filter((r) => new URL(r.url).origin === origin).map((r) => new URL(r.url).pathname))
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
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })

  if (selfTest) {
    console.log('check-a4-builder --self-test')
    const control = checkPage(PAGES[0], await recordPage(cdp, PAGES[0], false))
    if (control.length) {
      console.error('SELF-TEST FAIL: the unforged page should pass', control)
      exitCode = 1
    } else {
      console.log('SELF-TEST OK: control page passes')
      const forged = checkPage(`${PAGES[0]} +forged`, await recordPage(cdp, PAGES[0], true))
      const hit = forged.some((f) => f.includes('/forged-asset.png'))
      if (!hit) {
        console.error('SELF-TEST FAIL: a root-relative asset was not rejected', forged)
        exitCode = 1
      } else {
        console.log('SELF-TEST OK: root-relative asset rejected')
        console.log('check-a4-builder --self-test OK')
      }
    }
  } else {
    const fails = []
    for (const path of PAGES) fails.push(...checkPage(path, await recordPage(cdp, path, false)))
    const build = JSON.parse(await Bun.file(join(outDir, BASE.slice(1), 'eco-build.json')).text())
    const local = `http://localhost:${port}`
    console.log(`bridge host origin in this build: ${build.hostOrigin}`)
    fails.push(...checkOrigin(`hello from ${origin}`, await originCase(cdp, origin), build.hostOrigin === origin))
    if (build.hostOrigin === local) {
      fails.push(...checkOrigin(`hello from ${local}`, await originCase(cdp, local), true))
    } else {
      console.log(
        `NOTE the accepted case needs a build with NEXT_PUBLIC_ECO_HOST_ORIGIN=${local}; this build answers only ${build.hostOrigin}`,
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
