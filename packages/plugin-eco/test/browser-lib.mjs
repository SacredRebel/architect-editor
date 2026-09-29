/**
 * Shared by browser checks: a static server for apps/editor/out that logs every
 * request, an isolated Chrome on a free debugging port, and a small CDP client.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

export async function freePort() {
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const port = probe.port
  probe.stop(true)
  return port
}

export function serveStatic(root, port, log = []) {
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname)
      const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`, `${path}.html`]
      let file = null
      for (const candidate of candidates) {
        const full = normalize(join(root, candidate))
        if (!full.startsWith(root)) break
        if (existsSync(full) && statSync(full).isFile()) {
          file = full
          break
        }
      }
      log.push({ path, status: file ? 200 : 404 })
      if (!file) return new Response('not found', { status: 404 })
      const type = extname(file) === '.mjs' ? { 'content-type': 'text/javascript' } : undefined
      return new Response(Bun.file(file), { headers: type })
    },
  })
  return { server, log }
}

export function chromePath() {
  return (
    process.env.CHROME ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : 'google-chrome')
  )
}

export function launchChrome(cdpPort, { width = 1440, height = 900 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'eco-check-chrome-'))
  const chrome = spawn(
    chromePath(),
    [
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${width},${height}`,
      ...(process.env.HEADLESS === '1' ? ['--headless=new'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  return {
    chrome,
    profile,
    async close() {
      chrome.kill()
      await Bun.sleep(500)
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {}
    },
  }
}

export async function firstPage(cdpPort) {
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

export async function connect(wsUrl) {
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

/** Evaluate in the page and return the value; page exceptions are thrown here. */
export async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) {
    throw new Error(
      `page: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    )
  }
  return result.result.value
}

/** Poll `expression` until it is truthy (returns it) or `timeoutMs` passes (returns null). */
export async function waitFor(cdp, expression, timeoutMs = 60_000, everyMs = 400) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await evaluate(cdp, `(() => { try { return ${expression} } catch { return null } })()`)
      if (value) return value
    } catch {}
    await Bun.sleep(everyMs)
  }
  return null
}
