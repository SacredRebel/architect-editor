/**
 * Direct iframe CDP probe + manual postMessage inject from host.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const HARNESS =
  'http://127.0.0.1:9876/deploy-host.html?embed=https://architect-editor-snowy.vercel.app/embed'
const PORT = 9234
const userData = `${process.env.TEMP}\\eco-cdp-rt4-${Date.now()}`

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
  { stdio: ['ignore', 'ignore', 'pipe'] },
)

async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('no cdp')
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    const consoles = []
    ws.addEventListener('open', () =>
      resolve({
        ws,
        consoles,
        async send(method, params = {}) {
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
      if (msg.method === 'Runtime.consoleAPICalled') {
        consoles.push(
          msg.params.args?.map((a) => a.value ?? a.description).join(' '),
        )
      }
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
  await waitCdp()
  // Give Next embed time to hydrate
  await sleep(15000)

  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const iframe = pages.find(
    (p) =>
      p.type === 'iframe' &&
      String(p.url || '').startsWith('https://architect-editor-snowy.vercel.app/embed'),
  )
  const host = pages.find((p) => String(p.url || '').includes('deploy-host'))
  console.log('iframe entry', iframe && {
    url: iframe.url,
    title: iframe.title,
    ws: iframe.webSocketDebuggerUrl?.slice(0, 80),
    id: iframe.id,
  })

  if (!iframe?.webSocketDebuggerUrl) throw new Error('no iframe ws')

  const emb = await connect(iframe.webSocketDebuggerUrl)
  await emb.send('Runtime.enable')
  await emb.send('Console.enable')
  await emb.send('Page.enable')

  const loc = await emb.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      origin: location.origin,
      ecoEmbedded: window.ecoEmbedded,
      parentIsSelf: window.parent === window,
      title: document.title,
      scripts: document.scripts.length,
      bodyLen: (document.body && document.body.innerHTML.length) || 0,
      text: ((document.body && document.body.innerText) || '').slice(0, 240)
    })`,
    returnByValue: true,
  })
  console.log('IFRAME_EVAL', loc.result.value)
  console.log('IFRAME_CONSOLE', emb.consoles.slice(-20))

  // Manually fire a hello from inside the iframe's perspective won't work —
  // instead ask host to postMessage again and watch.
  const h = await connect(host.webSocketDebuggerUrl)
  await h.send('Runtime.enable')
  const knock = await h.send('Runtime.evaluate', {
    expression: `(function(){
      const iframe = document.getElementById('editor');
      const origin = 'https://architect-editor-snowy.vercel.app';
      for (let i = 0; i < 5; i++) {
        iframe.contentWindow.postMessage({ t: 'eco:hello', v: 'eco/1' }, origin);
      }
      return 'knocked';
    })()`,
    returnByValue: true,
  })
  console.log('KNOCK', knock.result.value)
  await sleep(3000)

  const loc2 = await emb.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      ecoEmbedded: window.ecoEmbedded,
      // peek bridge internals if exposed
      keys: Object.keys(window).filter(k => /eco/i.test(k)).slice(0, 30)
    })`,
    returnByValue: true,
  })
  console.log('IFRAME_AFTER', loc2.result.value)

  const hostState = await h.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      arrived: window.__ecoArrived || [],
      status: document.getElementById('status')?.innerText,
      logTail: (window.__ecoLog || '').split('\\n').slice(-12)
    })`,
    returnByValue: true,
  })
  console.log('HOST_AFTER', hostState.result.value)

  emb.ws.close()
  h.ws.close()
} finally {
  chrome.kill()
}
