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
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
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
