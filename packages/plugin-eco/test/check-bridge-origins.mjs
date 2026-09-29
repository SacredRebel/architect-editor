#!/usr/bin/env bun
/**
 * eco/1 host origins — the bridge hears the world, the world's previews and
 * local development, and nothing else; it replies only to the origin that said
 * hello, never to "*".
 *
 *   bun packages/plugin-eco/test/check-bridge-origins.mjs [--self-test]
 *
 * Two separately derived answers must agree for every origin in the table:
 *   - the bridge's own gate (src/eco-origins.ts), driven the way the bridge
 *     drives it (a hello on a fresh page);
 *   - an oracle written here from the brief, reading each origin with URL()
 *     (scheme, host, port) and sharing no pattern with src.
 * Then the session: once an allowed hello binds the host, another allowed
 * origin gets silence (hello or not) and the reply target stays the first.
 * And the bridge's source: one postMessage, whose target is the bound host.
 * --self-test forges three faults and must FAIL on each: a policy that admits a
 * foreign origin, a gate that lets a second origin take the session, and a
 * bridge that posts to "*".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createEcoOriginGate, isEcoHostOrigin } from '../src/eco-origins.ts'

const selfTest = process.argv.includes('--self-test')
const bridgeSource = readFileSync(join(import.meta.dir, '../src/bridge.ts'), 'utf8')

// ---------------------------------------------------------------- the oracle
// From the brief: https://spatial-map.vercel.app; https://spatial-map-*-
// pauls-projects-af8162cc.vercel.app (that exact team suffix); http://localhost:*
// and http://127.0.0.1:*. Browsers send canonical origins, so anything URL()
// would rewrite (case, default port, path) is not one of them.
const TEAM_SUFFIX = '-pauls-projects-af8162cc.vercel.app'
function oracle(origin) {
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.origin !== origin) return false
  if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' || url.port !== '') return false
  const host = url.hostname
  if (host === 'spatial-map.vercel.app') return true
  if (!host.startsWith('spatial-map-') || !host.endsWith(TEAM_SUFFIX)) return false
  const name = host.slice('spatial-map-'.length, host.length - TEAM_SUFFIX.length)
  return name.length > 0 && [...name].every((c) => 'abcdefghijklmnopqrstuvwxyz0123456789-'.includes(c))
}

const TABLE = [
  // the world, its previews, local development
  'https://spatial-map.vercel.app',
  'https://spatial-map-k3x9d2p1a-pauls-projects-af8162cc.vercel.app',
  'https://spatial-map-git-eco-s2-pauls-projects-af8162cc.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',
  'http://127.0.0.1:4173',
  'http://127.0.0.1',
  // foreign, and look-alikes
  'https://evil.example',
  'null',
  '*',
  '',
  'http://spatial-map.vercel.app',
  'https://spatial-map.vercel.app:443',
  'https://SPATIAL-MAP.vercel.app',
  'https://spatial-map.vercel.app.evil.example',
  'https://evil-spatial-map.vercel.app',
  'https://spatial-map-k3x9-pauls-projects-af8162cd.vercel.app',
  'https://spatial-map-k3x9-pauls-projects-af8162cc.vercel.app.evil.example',
  'https://spatial-map-k3x9-pauls-projects-af8162cc.vercel.app:8443',
  'https://spatial-map--pauls-projects-af8162cc.vercel.app',
  'https://spatial-map-a.b-pauls-projects-af8162cc.vercel.app',
  'https://architect-editor-snowy.vercel.app',
  'https://localhost:3000',
  'http://localhost.evil.example',
  'http://127.0.0.1.nip.io',
  'http://[::1]:3000',
  'http://0.0.0.0:3000',
  'file://',
]

// ---------------------------------------------------------------- the checks
function checkTable(policy, makeGate) {
  const fails = []
  let admitted = 0
  for (const origin of TABLE) {
    const expected = oracle(origin)
    if (expected) admitted++
    if (policy(origin) !== expected) fails.push(`policy says ${policy(origin)} for ${JSON.stringify(origin)}, oracle ${expected}`)
    const gate = makeGate()
    const hello = gate.admit(origin, true) === 'hello'
    if (hello !== expected) fails.push(`gate ${hello ? 'answers' : 'ignores'} a hello from ${JSON.stringify(origin)}, oracle ${expected ? 'answer' : 'silence'}`)
    if (hello && gate.host() !== origin) fails.push(`gate replies to ${gate.host()} after a hello from ${origin}`)
    if (!hello && gate.host() !== null) fails.push(`gate bound ${gate.host()} without an admitted hello`)
  }
  return { fails, admitted, silent: TABLE.length - admitted }
}

function checkSession(makeGate) {
  const fails = []
  const a = 'http://localhost:5173'
  const b = 'https://spatial-map.vercel.app'
  const foreign = 'https://evil.example'
  const expect = (cond, msg) => cond || fails.push(msg)
  const gate = makeGate()
  expect(gate.admit(a, false) === null, 'a message before any hello was heard')
  expect(gate.admit(foreign, true) === null && gate.host() === null, 'a foreign hello opened the session')
  expect(gate.admit(a, true) === 'hello' && gate.host() === a, 'the first allowed hello did not bind its origin')
  expect(gate.admit(a, false) === 'message', "the bound host's message was not heard")
  expect(gate.admit(b, true) === null && gate.host() === a, 'a second allowed origin took the session with a hello')
  expect(gate.admit(b, false) === null, 'a second allowed origin was heard')
  expect(gate.admit(foreign, false) === null, 'a foreign message was heard')
  expect(gate.admit(a, true) === 'hello' && gate.host() === a, 'the host could not say hello again')
  return fails
}

function checkSource(source) {
  const fails = []
  const posts = [...source.matchAll(/\.postMessage\(([^)]*)\)/g)]
  if (posts.length !== 1) fails.push(`bridge posts from ${posts.length} places, not one`)
  for (const [call, args] of posts) {
    const target = args.split(',').at(-1)?.trim()
    if (target !== 'host') fails.push(`bridge posts ${call}: target is not the bound host`)
  }
  if (/postMessage\([^)]*['"`]\*['"`]/.test(source)) fails.push('bridge posts to "*"')
  if (!/const host = gate\.host\(\)/.test(source)) fails.push("bridge's post target is not gate.host()")
  if (!/gate\.admit\(event\.origin, event\.data\.t === 'eco:hello'\)/.test(source)) {
    fails.push('onMessage does not pass every message through the gate')
  }
  return fails
}

function run(label, policy, makeGate, source) {
  const table = checkTable(policy, makeGate)
  const fails = [...table.fails, ...checkSession(makeGate), ...checkSource(source)]
  return { label, fails, table }
}

// -------------------------------------------------------------------- output
const real = run('bridge', isEcoHostOrigin, () => createEcoOriginGate(), bridgeSource)

if (!selfTest) {
  if (real.fails.length) {
    console.error('check-bridge-origins FAIL')
    for (const f of real.fails) console.error('-', f)
    process.exit(1)
  }
  console.log(
    `OK ${TABLE.length} origins: gate and oracle agree (${real.table.admitted} answered, ${real.table.silent} silent)`,
  )
  console.log('OK session: the first allowed hello binds the host; others, and foreign origins, get silence')
  console.log('OK source: one postMessage, to the bound host; never "*"')
  console.log('check-bridge-origins OK')
  process.exit(0)
}

console.log('check-bridge-origins --self-test')
let selfFail = false
const mustFail = (result, needle) => {
  const hit = result.fails.find((f) => f.includes(needle))
  if (hit) console.log(`SELF-TEST OK: ${result.label} rejected — ${hit}`)
  else {
    selfFail = true
    console.error(`SELF-TEST FAIL: ${result.label} passed`, result.fails)
  }
}
if (real.fails.length) {
  selfFail = true
  console.error('SELF-TEST FAIL: the real bridge should pass', real.fails)
} else {
  console.log('SELF-TEST OK: control — the real bridge passes')
}
// 1. A policy that also admits a foreign origin.
const forged = (origin) => isEcoHostOrigin(origin) || origin === 'https://evil.example'
mustFail(run('forged foreign origin', forged, () => createEcoOriginGate(forged), bridgeSource), 'evil.example')
// 2. A gate that lets any allowed origin take the session with a hello.
const hijackable = () => {
  let bound = null
  return {
    admit(origin, isHello) {
      if (!isEcoHostOrigin(origin)) return null
      if (isHello) {
        bound = origin
        return 'hello'
      }
      return origin === bound ? 'message' : null
    },
    host: () => bound,
  }
}
mustFail(run('forged session hijack', isEcoHostOrigin, hijackable, bridgeSource), 'took the session')
// 3. A bridge that posts to "*".
const starSource = bridgeSource.replace('postMessage(msg, host)', "postMessage(msg, '*')")
if (starSource === bridgeSource) {
  selfFail = true
  console.error('SELF-TEST FAIL: could not forge the "*" post (the bridge source changed shape)')
} else {
  mustFail(run('forged "*" post', isEcoHostOrigin, () => createEcoOriginGate(), starSource), '"*"')
}
if (selfFail) process.exit(1)
console.log('check-bridge-origins --self-test OK')
