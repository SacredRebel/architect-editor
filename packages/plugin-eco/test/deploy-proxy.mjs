/**
 * TLS-tolerant reverse proxy → architect-editor-snowy.vercel.app
 * Lets headless Chrome load /embed without the local leaf-cert failure.
 */
const UPSTREAM = 'https://architect-editor-snowy.vercel.app'
const PORT = Number(process.env.PROXY_PORT || 9880)

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

Bun.serve({
  port: PORT,
  async fetch(req) {
    const src = new URL(req.url)
    const target = new URL(src.pathname + src.search, UPSTREAM)
    const headers = new Headers(req.headers)
    headers.delete('host')
    headers.set('host', new URL(UPSTREAM).host)
    headers.delete('accept-encoding') // simplify
    try {
      const res = await fetch(target, {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
        redirect: 'manual',
      })
      const out = new Headers(res.headers)
      // Allow framing from local harness
      out.delete('x-frame-options')
      out.delete('content-security-policy')
      out.delete('content-security-policy-report-only')
      return new Response(res.body, { status: res.status, headers: out })
    } catch (err) {
      return new Response(`proxy error: ${err}`, { status: 502 })
    }
  },
})

console.log(`proxy ${UPSTREAM} → http://127.0.0.1:${PORT}/`)
