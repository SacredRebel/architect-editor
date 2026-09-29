/**
 * Combined harness + snowy reverse proxy on one origin (port 9880).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const UPSTREAM = 'https://architect-editor-snowy.vercel.app'
const PORT = 9880
const here = dirname(fileURLToPath(import.meta.url))
const harness = readFileSync(join(here, 'deploy-host.html'), 'utf8')

Bun.serve({
  port: PORT,
  async fetch(req) {
    const src = new URL(req.url)
    if (
      src.pathname === '/' ||
      src.pathname === '/host' ||
      src.pathname === '/deploy-host.html'
    ) {
      return new Response(harness, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    const target = new URL(src.pathname + src.search, UPSTREAM)
    const headers = new Headers(req.headers)
    headers.delete('host')
    headers.set('host', new URL(UPSTREAM).host)
    headers.delete('accept-encoding')
    try {
      const res = await fetch(target, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
        redirect: 'manual',
      })
      const out = new Headers(res.headers)
      out.delete('x-frame-options')
      out.delete('content-security-policy')
      out.delete('content-security-policy-report-only')
      return new Response(res.body, { status: res.status, headers: out })
    } catch (err) {
      return new Response(`proxy error: ${err}`, { status: 502 })
    }
  },
})

console.log(`combined host+proxy http://127.0.0.1:${PORT}/ (iframe → /embed → snowy)`)
