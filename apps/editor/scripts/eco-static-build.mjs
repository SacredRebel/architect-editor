/**
 * Static export build for Eco embed.
 * Next.js refuses `output: 'export'` while App Router route handlers exist,
 * so we temporarily move `app/api` aside for the build, then restore it.
 *
 * With `basePath: /builder`, asset URLs are `/builder/_next/...` but Next
 * writes HTML at `out/embed/`. Nest the export under `out/builder/` so
 * `npx serve out` serves the editor at `/builder/embed`.
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = path.join(appDir, 'app', 'api')
const apiHidden = path.join(appDir, 'app', '_api_static_hidden')
const outDir = path.join(appDir, 'out')
const stagingDir = path.join(appDir, '.out-staging')

function hideApi() {
  if (existsSync(apiDir)) {
    if (existsSync(apiHidden)) {
      throw new Error(`Refusing to hide api: ${apiHidden} already exists`)
    }
    renameSync(apiDir, apiHidden)
    console.log('[eco-static] hid app/api for export build')
  }
}

function restoreApi() {
  if (existsSync(apiHidden)) {
    if (existsSync(apiDir)) {
      throw new Error(`Refusing to restore api: ${apiDir} already exists`)
    }
    renameSync(apiHidden, apiDir)
    console.log('[eco-static] restored app/api')
  }
}

function* walkFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) yield* walkFiles(full)
    else yield full
  }
}

/**
 * A4 — upstream code refers to public files root-relatively ('/icons/…',
 * '/material/…'); under a base path those miss. Rebase every quoted
 * root-relative reference to a top-level public entry onto the base path in
 * the exported text files. References that already carry the base are left
 * alone; the asset resolver (viewer asset-url.ts) is idempotent for them.
 *
 * Some library files upstream serves only from its CDN (wood, flooring and
 * roofing finishes); a literal naming a file the export does not contain keeps
 * pointing at that CDN, as every build did before A4, instead of being rebased
 * onto a 404. Those are counted, and each one is a request outside the base
 * path when a scene uses that finish.
 */
function rebasePublicPaths(basePath) {
  const base = basePath.replace(/\/+$/, '')
  const exportRoot = path.join(outDir, base.replace(/^\/+/, ''))
  const cdn = (process.env.NEXT_PUBLIC_ASSETS_CDN_URL || 'https://editor.pascal.app').replace(/\/+$/, '')
  const names = readdirSync(path.join(appDir, 'public')).filter((name) =>
    existsSync(path.join(exportRoot, name)),
  )
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(["'\`(])/(${escaped.join('|')})(/[^"'\`()?#\\s]*)?(?=["'\`)?#]|$)`, 'g')
  const onCdn = new Set()
  let files = 0
  let hits = 0
  let cdnHits = 0
  for (const file of walkFiles(exportRoot)) {
    if (!/\.(js|mjs|html|css|txt|json)$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    const next = text.replace(pattern, (_m, quote, name, rest = '') => {
      const target = `/${name}${rest}`
      const isFile = !rest.includes('${') && /\.[a-z0-9]{2,5}$/i.test(rest)
      if (isFile && !existsSync(path.join(exportRoot, safeDecode(target)))) {
        cdnHits++
        onCdn.add(target)
        return `${quote}${cdn}${target}`
      }
      hits++
      return `${quote}${base}${target}`
    })
    if (next !== text) {
      writeFileSync(file, next)
      files++
    }
  }
  console.log(`[eco-static] rebased ${hits} root-relative public paths onto ${base} in ${files} files`)
  console.log(
    `[eco-static] ${cdnHits} references to ${onCdn.size} files the export does not contain stay on ${cdn}`,
  )
  return { cdn, onCdn: [...onCdn].sort() }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * A4 — the export writes a route's segment payload inside a directory
 * (`scenes/__next.scenes/__PAGE__.txt`) while the client prefetches the
 * dot-joined name (`scenes/__next.scenes.__PAGE__.txt`). Write the names the
 * client asks for, next to the directories.
 */
function aliasSegmentPayloads(dir) {
  let written = 0
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!statSync(full).isDirectory()) continue
    if (name.startsWith('__next.')) {
      for (const file of walkFiles(full)) {
        const relative = path.relative(full, file).split(path.sep).join('.')
        const alias = path.join(dir, `${name}.${relative}`)
        if (!existsSync(alias)) {
          copyFileSync(file, alias)
          written++
        }
      }
    } else {
      written += aliasSegmentPayloads(full)
    }
  }
  return written
}

function nestUnderBasePath(basePath) {
  const segment = basePath.replace(/^\/+|\/+$/g, '')
  if (!segment || !existsSync(outDir)) return

  if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true })
  renameSync(outDir, stagingDir)
  mkdirSync(path.join(outDir, segment), { recursive: true })

  for (const name of readdirSync(stagingDir)) {
    renameSync(path.join(stagingDir, name), path.join(outDir, segment, name))
  }
  rmSync(stagingDir, { recursive: true, force: true })
  console.log(`[eco-static] nested export under out/${segment}/`)
}

// The app imports workspace packages from their built dist/; build them first
// (turbo-cached) so the export never ships a stale package.
const deps = spawnSync('bunx', ['turbo', 'run', 'build', '--filter=editor^...'], {
  cwd: path.resolve(appDir, '../..'),
  stdio: 'inherit',
  shell: true,
})
if (deps.status !== 0) {
  console.error('[eco-static] building workspace packages failed')
  process.exit(deps.status ?? 1)
}

// `next build` is spawned directly, so the package's prebuild copies do not
// run; the decoders must be in public/ before the export copies it.
const decoders = spawnSync('node', ['scripts/copy-decoders.mjs'], { cwd: appDir, stdio: 'inherit' })
if (decoders.status !== 0) {
  console.error('[eco-static] copying decoders failed')
  process.exit(decoders.status ?? 1)
}

hideApi()

let status = 1
try {
  const basePath = process.env.ECO_BASE_PATH ?? '/builder'
  const env = {
    ...process.env,
    ECO_STATIC: '1',
    NEXT_PUBLIC_ECO: '1',
    NEXT_PUBLIC_ECO_STATIC: '1',
    ECO_BASE_PATH: basePath,
    NEXT_PUBLIC_ECO_BASE_PATH: basePath,
  }
  const result = spawnSync('bunx', ['dotenv', '-e', '../../.env.local', '--', 'next', 'build'], {
    cwd: appDir,
    env,
    stdio: 'inherit',
    shell: true,
  })
  status = result.status ?? 1
  if (status === 0) {
    nestUnderBasePath(basePath)
    const exportRoot = path.join(outDir, basePath.replace(/^\/+|\/+$/g, ''))
    const { cdn, onCdn } = rebasePublicPaths(basePath)
    console.log(`[eco-static] wrote ${aliasSegmentPayloads(exportRoot)} segment payload aliases`)
    // What this build was made for, for checks that serve it.
    writeFileSync(
      path.join(exportRoot, 'eco-build.json'),
      `${JSON.stringify({
        basePath,
        cdn,
        onCdn,
      })}\n`,
    )
    const harnessSrc = path.resolve(appDir, '../../packages/plugin-eco/test/bridge.html')
    const harnessDest = path.join(outDir, 'eco-bridge.html')
    if (existsSync(harnessSrc)) {
      copyFileSync(harnessSrc, harnessDest)
      console.log('[eco-static] copied eco-bridge.html harness to out/')
    }
    const hostHarnessSrc = path.resolve(appDir, '../../packages/plugin-eco/test/host-harness.html')
    if (existsSync(hostHarnessSrc)) {
      copyFileSync(hostHarnessSrc, path.join(outDir, 'eco-host-harness.html'))
      console.log('[eco-static] copied eco-host-harness.html to out/')
    }
    const fixtureDir = path.resolve(appDir, '../../packages/plugin-eco/test')
    for (const name of ['fixture.glb', 'realistic-site.mjs']) {
      const src = path.join(fixtureDir, name)
      if (existsSync(src)) {
        copyFileSync(src, path.join(outDir, name))
      }
    }
  }
} finally {
  try {
    restoreApi()
  } catch (err) {
    console.error('[eco-static] FAILED to restore app/api — fix manually:', err)
    status = 1
  }
}

process.exit(status)
