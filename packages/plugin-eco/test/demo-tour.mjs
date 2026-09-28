#!/usr/bin/env bun
/**
 * Demo tour — screenshots of the editor with a model and each tool's panel.
 *
 *   DEMO_URL=<preview URL, with a Vercel share token if protected> \
 *     bun packages/plugin-eco/test/demo-tour.mjs [out-dir]
 *
 * Opens the editor in its own Chrome (fresh profile, so no saved scene), waits
 * for a model — the world's, or the demo site/house the editor opens when
 * nothing arrives — then:
 *   - draws one wall with the wall tool (B, two clicks, Escape) to show the
 *     model is editable, and checks the wall count went up;
 *   - opens every rail tab, recording console errors, page exceptions and
 *     crashed-panel notices while it is open, and screenshots it;
 *   - runs each named tool once (catenary arch, organic, temple forms, body,
 *     IFC export, XR) and records what happened.
 * Writes `tour.json` next to the screenshots. The perf HUD (`?perf`, needed
 * for the scene probe) is hidden before any screenshot. This is a record of
 * what was shown, not a measurement.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DEMO_URL = process.env.DEMO_URL
if (!DEMO_URL) {
  console.error('set DEMO_URL to the preview URL (with its share token if the preview is protected)')
  process.exit(1)
}
const outDir = resolve(process.argv[2] ?? '.cache/demo-tour')
mkdirSync(outDir, { recursive: true })
const origin = new URL(DEMO_URL).origin
const WIDTH = 1600
const HEIGHT = 1000

async function freePort() {
  const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const port = probe.port
  probe.stop(true)
  return port
}

const cdpPort = await freePort()
const profile = mkdtempSync(join(tmpdir(), 'demo-tour-'))
const chrome = spawn(
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function connect() {
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json())
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch {}
    if (!page) await Bun.sleep(250)
  }
  if (!page) throw new Error('no CDP page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
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
    } else if (msg.method) for (const fn of listeners) fn(msg)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const my = id++
      pending.set(my, { resolve, reject })
      ws.send(JSON.stringify({ id: my, method, params }))
    })
  return { ws, send, on: (fn) => listeners.add(fn) }
}

const cdp = await connect()
const evaluate = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const waitFor = async (expression, timeoutMs = 60_000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await evaluate(`(() => { try { return ${expression} } catch { return null } })()`)
      if (v) return v
    } catch {}
    await Bun.sleep(400)
  }
  return null
}

// Everything the page says is wrong, bucketed by the step that was running.
let step = 'load'
const problems = []
cdp.on((msg) => {
  const p = msg.params ?? {}
  if (msg.method === 'Runtime.exceptionThrown') {
    problems.push({ step, kind: 'exception', text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text })
  } else if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
    problems.push({ step, kind: 'console.error', text: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ') })
  }
})
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Page.bringToFront')
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'downloads'), eventsEnabled: true }).catch(() => {})
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: join(profile, 'downloads') }).catch(() => {})
const downloads = []
const failed = []
await cdp.send('Network.enable')
cdp.on((msg) => {
  if (msg.method === 'Page.downloadWillBegin' || msg.method === 'Browser.downloadWillBegin') downloads.push({ step, file: msg.params.suggestedFilename })
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    failed.push(`${msg.params.response.status} ${msg.params.response.url.replace(/\?.*$/, '')}`)
  }
})

const shot = async (name) => {
  await evaluate(`(() => { let s = document.getElementById('demo-tour-css'); if (!s) { s = document.createElement('style'); s.id = 'demo-tour-css'; s.textContent = '[data-pascal-perf-panel]{display:none!important}'; document.head.appendChild(s) } return true })()`)
  await Bun.sleep(400)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 })
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'))
  return `${name}.jpg`
}
const key = async (keyName, code, keyCode, modifiers = 0) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers, text: keyName.length === 1 && !modifiers ? keyName : undefined })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers })
}
const clickAt = async ({ x, y }) => {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await Bun.sleep(120)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await Bun.sleep(60)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await Bun.sleep(300)
}
const clickButton = (label) =>
  evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`)
/** World point → page pixels, through the live camera. */
const toScreen = (x, y, z) =>
  evaluate(`(() => {
    const t = window.__pascalPerf.three()
    const v = new t.camera.position.constructor(${x}, ${y}, ${z}).project(t.camera)
    const r = t.gl.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, onCanvas: document.elementFromPoint(r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height) === t.gl.domElement }
  })()`)
const count = (type) => evaluate(`window.__pascalPerf.listNodes(${JSON.stringify(type)}).length`)

const record = { url: origin, when: new Date().toISOString(), steps: [] }
const log = (entry) => {
  record.steps.push(entry)
  console.log(JSON.stringify(entry))
}

try {
  // The share URL sets the preview's auth cookie; then the editor with the probe.
  await cdp.send('Page.navigate', { url: DEMO_URL })
  await Bun.sleep(4000)
  await cdp.send('Page.navigate', { url: `${origin}/?perf` })
  const up = await waitFor(`!!window.__pascalPerf && window.__pascalPerf.listNodes('site').length > 0`, 90_000)
  if (!up) throw new Error('editor did not come up')
  step = 'model'
  const t0 = Date.now()
  const walls = await waitFor(`window.__pascalPerf.listNodes('wall').length >= 1 && window.__pascalPerf.listNodes('wall').length`, 90_000)
  const inStoreS = (Date.now() - t0) / 1000
  // Built, not just in the store: every wall's object registered, nothing left dirty.
  const built = await waitFor(
    `(() => { const p = window.__pascalPerf; const w = p.listNodes('wall'); return w.length > 0 && w.every((id) => p.projectNode(id)) && p.stats().dirty === 0 })()`,
    180_000,
  )
  const builtS = (Date.now() - t0) / 1000
  await Bun.sleep(3000)
  log({ step: 'model', walls, items: await count('item'), inStoreS, built: !!built, builtS, graphics: await evaluate(`JSON.parse(localStorage.getItem('viewer-preferences') || '{}').state?.graphics ?? 'light (default)'`), shot: await shot('01-model') })

  // Editable: draw one wall with the wall tool beside the house (it spans
  // x −6..6, z −4.5..4.5 on the flat pad).
  step = 'edit'
  const before = await count('wall')
  const a = await toScreen(9, 0, -3)
  const b = await toScreen(9, 0, 3)
  await key('Escape', 'Escape', 27)
  await key('b', 'KeyB', 66)
  await Bun.sleep(500)
  await clickAt(a)
  await clickAt(b)
  await key('Escape', 'Escape', 27)
  await Bun.sleep(1500)
  await key('Escape', 'Escape', 27)
  const after = await count('wall')
  log({ step: 'edit', onCanvas: a.onCanvas && b.onCanvas, wallsBefore: before, wallsAfter: after, shot: await shot('02-edited') })

  // The one graphics setting, in the Display menu.
  step = 'graphics'
  // The menu opens on pointer down, which a scripted click() does not send.
  const display = await evaluate(`(() => { const b = document.querySelector('button[aria-label="Display settings"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  if (display) await clickAt(display)
  await Bun.sleep(1200)
  const graphicsItem = await evaluate(`document.querySelector('[data-graphics]')?.getAttribute('data-graphics') ?? null`)
  log({ step, graphicsItem, shot: await shot('03-display-graphics') })
  await key('Escape', 'Escape', 27)
  await Bun.sleep(400)

  // Every rail tab.
  const tabs = await evaluate(`(() => {
    const rail = [...document.querySelectorAll('button[aria-label]')]
    const skip = new Set(['Collapse sidebar', '3D', '2D', 'Split', 'Display settings', 'Enter VR'])
    const labels = []
    for (const b of rail) {
      const l = b.getAttribute('aria-label')
      if (skip.has(l) || labels.includes(l)) continue
      const r = b.getBoundingClientRect()
      if (r.left < 80 && r.width > 0) labels.push(l)
    }
    return labels
  })()`)
  let n = 10
  for (const label of tabs) {
    step = `tab:${label}`
    const errorsBefore = problems.length
    const clicked = await clickButton(label)
    const opened = Date.now()
    // The panel's own code loads on first open: wait until its placeholder goes.
    await Bun.sleep(800)
    const loaded = await waitFor(`!document.body.innerText.split('\\n').some((line) => line.trim() === 'Loading…')`, 30_000)
    await Bun.sleep(1200)
    const crashed = await evaluate(`document.body.innerText.includes('This panel hit an error')`)
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    log({ step, clicked, loaded: !!loaded, loadS: (Date.now() - opened) / 1000, crashed, errors: problems.slice(errorsBefore).length, shot: await shot(`${n++}-${slug}`) })
  }

  // Each named tool, once: its action, what changed, what went wrong.
  const TOOLS = [
    { tool: 'catenary', tab: 'Eco site', button: 'Add catenary arch' },
    { tool: 'organic geometry', tab: 'Eco site', button: 'Add lofted leaf surface' },
    { tool: 'organic geometry', tab: 'Eco site', button: 'Add barrel vault + ribs' },
    { tool: 'organic geometry', tab: 'Organic', button: 'Grow 5-lobe building' },
    { tool: 'organic geometry', tab: 'Organic', button: 'Add smooth wall + 3 windows' },
    { tool: 'organic geometry', tab: 'Minimal surface', button: 'Make from closed curve' },
    { tool: 'temple forms', tab: 'Temple forms', button: 'Place it where the view is centred' },
    { tool: 'temple forms', tab: 'Temple forms', button: 'Place catenary vault' },
    { tool: 'IFC', tab: 'Settings', button: 'Export IFC 4.3' },
    { tool: 'XR', tab: 'WebXR', button: 'VR unavailable' },
    { tool: 'XR', tab: null, button: 'Enter VR' },
  ]
  const scene = () =>
    evaluate(`(() => { const s = window.__pascalPerf.stats(); return { meshes: s.meshes, drawCalls: s.drawCalls } })()`)
  let m = 40
  const buttonShown = (label) =>
    evaluate(`(() => { const norm = (s) => (s ?? '').replace(/\\s+/g, ' ').trim(); const want = norm(${JSON.stringify(label)}); return [...document.querySelectorAll('button')].some((el) => norm(el.getAttribute('aria-label')) === want || norm(el.textContent) === want) })()`)
  for (const t of TOOLS) {
    step = `tool:${t.tool}:${t.button}`
    // Clicking an open tab closes its panel: open it only when the button is not showing.
    if (t.tab && !(await buttonShown(t.button))) {
      await clickButton(t.tab)
      await waitFor(`!document.body.innerText.split('\\n').some((line) => line.trim() === 'Loading…')`, 30_000)
      await Bun.sleep(800)
    }
    const errorsBefore = problems.length
    const failedBefore = failed.length
    const downloadsBefore = downloads.length
    const before = await scene()
    const found = await evaluate(`(() => {
      const norm = (s) => (s ?? '').replace(/\\s+/g, ' ').trim()
      const want = norm(${JSON.stringify(t.button)})
      const b = [...document.querySelectorAll('button')].find((el) => norm(el.getAttribute('aria-label')) === want || norm(el.textContent) === want)
      if (!b) return 'missing'
      if (b.disabled) return 'disabled'
      b.click()
      return 'clicked'
    })()`)
    await Bun.sleep(6000)
    const after = await scene()
    const slug = `${t.tool}-${t.button}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    log({
      step,
      found,
      meshes: [before.meshes, after.meshes],
      drawCalls: [before.drawCalls, after.drawCalls],
      downloads: downloads.slice(downloadsBefore).map((d) => d.file),
      httpErrors: failed.slice(failedBefore),
      errors: problems.slice(errorsBefore).map((p) => p.text?.slice(0, 160)),
      shot: await shot(`${m++}-${slug}`),
    })
    await key('Escape', 'Escape', 27)
  }

  record.problems = problems
  record.downloads = downloads
  record.failed = failed
} catch (err) {
  record.error = String(err?.stack ?? err)
  console.error(err)
} finally {
  writeFileSync(join(outDir, 'tour.json'), `${JSON.stringify(record, null, 2)}\n`)
  cdp.ws.close()
  chrome.kill()
  await Bun.sleep(500)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
