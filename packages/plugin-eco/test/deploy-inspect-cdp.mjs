/**
 * Inspect snowy /embed iframe from the deploy host — confirm bridge + messages.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const HARNESS =
  'http://127.0.0.1:9876/deploy-host.html?embed=https://architect-editor-snowy.vercel.app/embed'
const PORT = 9230
const userData = `${process.env.TEMP || '/tmp'}/eco-cdp-inspect-${Date.now()}`

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userData}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--headless=new',
    HARNESS,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

async function waitForWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('CDP not up')
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () =>
      resolve({
        ws,
        send(method, params = {}) {
          const mid = ++id
          return new Promise((res, rej) => {
            pending.set(mid, { res, rej })
            ws.send(JSON.stringify({ id: mid, method, params }))
          })
        },
      }),
    )
    ws.addEventListener('error', reject)
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data))
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
      }
    })
  })
}

try {
  await waitForWs()
  await sleep(8000)
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  console.log(
    'targets',
    pages.map((p) => ({ type: p.type, url: p.url, title: p.title })),
  )

  const host = pages.find((p) => String(p.url || '').includes('deploy-host'))
  const embed =
    pages.find((p) => String(p.url || '').includes('architect-editor-snowy')) ||
    pages.find((p) => String(p.url || '').includes('/embed'))

  if (host?.webSocketDebuggerUrl) {
    const s = await connect(host.webSocketDebuggerUrl)
    await s.send('Runtime.enable')
    await s.send('Console.enable')
    const hostState = await s.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        status: document.getElementById('status')?.innerText,
        arrived: window.__ecoArrived,
        log: window.__ecoLog,
        iframeSrc: document.getElementById('editor')?.src,
        iframeReadyState: (() => { try { return document.getElementById('editor')?.contentDocument?.readyState } catch(e) { return String(e) } })()
      })`,
      returnByValue: true,
    })
    console.log('HOST', hostState.result.value)
    s.ws.close()
  }

  if (embed?.webSocketDebuggerUrl) {
    const s = await connect(embed.webSocketDebuggerUrl)
    await s.send('Runtime.enable')
    const embedState = await s.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        href: location.href,
        ecoEmbedded: window.ecoEmbedded,
        hasListener: typeof window.onmessage,
        title: document.title,
        bodyText: (document.body?.innerText || '').slice(0, 200),
        pluginLog: (window.__ecoDebugLog || null)
      })`,
      returnByValue: true,
    })
    console.log('EMBED', embedState.result.value)
    s.ws.close()
  } else {
    console.log('NO EMBED TARGET — iframe may be blocked or same-process')
  }
} finally {
  chrome.kill()
}
