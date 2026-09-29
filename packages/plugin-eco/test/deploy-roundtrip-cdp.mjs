/**
 * Auto-attach after blank, then navigate — wait for OOPIF embed + host messages.
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
const HARNESS = 'http://127.0.0.1:9880/'
const PORT = 9237
const userData = `${process.env.TEMP}\\eco-cdp-auto2-${Date.now()}`

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userData}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--headless=new',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--allow-insecure-localhost',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch {}
    await sleep(250)
  }
  throw new Error('no cdp')
}

try {
  const ver = await waitCdp()
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })

  let id = 0
  const pending = new Map()
  const sessions = new Map()

  function send(method, params = {}, sessionId) {
    const mid = ++id
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject })
      const msg = { id: mid, method, params }
      if (sessionId) msg.sessionId = sessionId
      ws.send(JSON.stringify(msg))
    })
  }

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = msg.params
      sessions.set(sessionId, {
        url: targetInfo.url,
        type: targetInfo.type,
        consoles: [],
        targetId: targetInfo.targetId,
      })
      console.log('attached', targetInfo.type, (targetInfo.url || '').slice(0, 110))
      if (targetInfo.type === 'page' || targetInfo.type === 'iframe') {
        void send('Runtime.enable', {}, sessionId).catch(() => {})
        void send('Console.enable', {}, sessionId).catch(() => {})
      }
    }
    if (msg.method === 'Target.targetInfoChanged' && msg.params?.targetInfo) {
      const info = msg.params.targetInfo
      for (const s of sessions.values()) {
        if (s.targetId === info.targetId) s.url = info.url
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId) {
      const s = sessions.get(msg.sessionId)
      if (s) {
        s.consoles.push(
          (msg.params.args || []).map((a) => a.value ?? a.description).join(' '),
        )
      }
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
  })

  await send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  })
  await send('Target.setDiscoverTargets', { discover: true })

  // Find blank page session and navigate
  await sleep(1000)
  let pageSid = null
  for (const [sid, s] of sessions) {
    if (s.type === 'page') pageSid = sid
  }
  if (!pageSid) {
    // create via Target.createTarget
    const created = await send('Target.createTarget', { url: HARNESS })
    console.log('created target', created)
    await sleep(2000)
  } else {
    await send('Page.enable', {}, pageSid).catch(() => {})
    // Critical: auto-attach OOPIF iframes from the *page* session
    await send(
      'Target.setAutoAttach',
      {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      },
      pageSid,
    ).catch((e) => console.log('page autoAttach err', e.message))
    await send('Page.navigate', { url: HARNESS }, pageSid)
    console.log('navigated host')
    await sleep(2000)
    await send('Runtime.enable', {}, pageSid).catch(() => {})
  }

  // Wait for embed iframe session
  const t0 = Date.now()
  let embedSid = null
  let hostSid = pageSid
  while (Date.now() - t0 < 15_000) {
    for (const [sid, s] of sessions) {
      if (s.type === 'page' && (String(s.url) === 'http://127.0.0.1:9880/' || String(s.url).includes('deploy-host') || String(s.url).endsWith(':9880/')))
        hostSid = sid
      // same-origin iframe may appear as iframe OR stay in page frames
      if (s.type === 'iframe' && /9880\/embed/.test(String(s.url))) {
        embedSid = sid
      }
    }
    // also poll json/list
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const ifr = list.find(
        (p) => p.type === 'iframe' && /9880\/embed/.test(String(p.url || '')),
      )
      if (ifr) console.log('json/list sees iframe', ifr.id)
    } catch {}
    if (embedSid) break
    await sleep(1000)
  }

  console.log(
    'sessions',
    [...sessions.entries()].map(([sid, s]) => ({
      sid: sid.slice(0, 8),
      type: s.type,
      url: (s.url || '').slice(0, 90),
    })),
  )
  console.log('embedSid', embedSid, 'hostSid', hostSid)

  // Same-origin iframe may not get its own target — still poll the host harness.
  if (!hostSid) {
    console.log('FAILED — no host session')
    process.exitCode = 1
    ws.close()
    chrome.kill()
    process.exit(1)
  }

  for (let i = 0; i < 45; i++) {
    if (embedSid) {
      try {
        const r = await send(
          'Runtime.evaluate',
          {
            expression: `JSON.stringify({
              href: location.href,
              ecoEmbedded: window.ecoEmbedded,
              title: document.title,
              bodyLen: document.body ? document.body.innerHTML.length : 0,
              text: ((document.body && document.body.innerText) || '').slice(0, 180),
              ecoKeys: Object.keys(window).filter(k => /eco/i.test(k))
            })`,
            returnByValue: true,
          },
          embedSid,
        )
        console.log('embed', i, r.result.value)
        console.log('consoles', sessions.get(embedSid)?.consoles.slice(-8))
      } catch (e) {
        console.log('embed err', e.message)
      }
    }

    try {
      await send('Runtime.enable', {}, hostSid).catch(() => {})
      const h = await send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            try {
              return JSON.stringify({
                href: location.href,
                arrived: window.__ecoArrived||[],
                glb: window.__ecoGlb || null,
                status: document.getElementById('status')?.innerText || null,
                iframeSrc: document.getElementById('editor')?.src || null,
                bodyLen: document.body ? document.body.innerHTML.length : 0,
                logTail: (window.__ecoLog||'').split('\\n').slice(-6)
              })
            } catch (e) { return JSON.stringify({ err: String(e) }) }
          })()`,
          returnByValue: true,
        },
        hostSid,
      )
      console.log('raw', h)
      const hs = JSON.parse(h.result?.value ?? h.result?.description ?? '{}')
      console.log('host', hs.status, hs.arrived, hs.href, 'body', hs.bodyLen)
      if (hs.arrived?.includes('eco:glb') || hs.arrived?.includes('eco:error')) {
        console.log('FINAL', JSON.stringify(hs, null, 2))
        const ok =
          hs.arrived.includes('eco:ready') && hs.arrived.includes('eco:glb')
        console.log(ok ? 'OK' : 'FAILED')
        ws.close()
        chrome.kill()
        process.exit(ok ? 0 : 1)
      }
    } catch (e) {
      console.log('host err', e.message)
    }
    await sleep(2000)
  }

  console.log('FAILED — no complete round-trip')
  process.exitCode = 1
  ws.close()
} finally {
  chrome.kill()
}
