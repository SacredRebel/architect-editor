#!/usr/bin/env bun
/**
 * A4 — self-hosted Iconify icon data, so the editor fetches no icon data from
 * api.iconify.design (a request outside the origin and base path).
 *
 *   bun apps/editor/scripts/make-iconify-offline.mjs
 *   → apps/editor/public/iconify/<prefix>.json  (Iconify JSON, one per set)
 *   → apps/editor/public/iconify/NOTICE.md      (licence per set, substitutions)
 *
 * Scans every source that ships into the editor for "<prefix>:<name>" strings,
 * keeps those whose prefix is an Iconify set, and fetches just those icons
 * from the Iconify API once (this script is the only thing that touches the
 * network; the build and the browser read the committed files). The app points
 * Iconify at <basePath>/iconify (lib/iconify-offline.ts).
 *
 * Licences: sets must be MIT, ISC, BSD or Apache-2.0. An icon from any other
 * set needs an explicit substitution below (served under the name the code
 * asks for, drawn from a permissive set) — or the script fails.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../..')
const outDir = join(root, 'apps/editor/public/iconify')
const API = 'https://api.iconify.design'
const PERMISSIVE = /^(MIT|ISC|Apache-2\.0|BSD-[23]-Clause)$/

// name the code asks for → permissive icon drawn in its place.
const SUBSTITUTES = {
  // Font Awesome Free icons are CC BY 4.0 (asked for by @webxr/plugin).
  'fa6-solid:vr-cardboard': 'mdi:google-cardboard',
}

const SOURCE_DIRS = [
  'packages/core/src',
  'packages/editor/src',
  'packages/viewer/src',
  'packages/nodes/src',
  'packages/plugin-eco/src',
  'packages/plugin-geometry/src',
  'packages/plugin-body/src',
  'packages/plugin-hagia-sophia/src',
  'packages/ifc-exporter/src',
  'packages/ui/src',
  'apps/editor/app',
  'apps/editor/components',
  'apps/editor/lib',
  'node_modules/@webxr/plugin/src',
  'node_modules/@pascal-app/plugin-trees/src',
  'node_modules/@pascal-app/plugin-pool/src',
  'node_modules/@pascal-app/plugin-streetscape/src',
  'node_modules/@pascal-app/plugin-environment/src',
  'node_modules/@pascal-app/plugin-bones/src',
  'node_modules/@mint/pascal-plugin/src',
]

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) yield full
  }
}

const pattern = /['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g
const wanted = new Map() // prefix → Set(name)
for (const dir of SOURCE_DIRS) {
  for (const file of walk(join(root, dir))) {
    for (const m of readFileSync(file, 'utf8').matchAll(pattern)) {
      if (!wanted.has(m[1])) wanted.set(m[1], new Set())
      wanted.get(m[1]).add(m[2])
    }
  }
}

const getJson = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const collections = await getJson(`${API}/collections`)
const sets = new Map() // prefix → { data, info, names }
const substituted = []

async function fetchIcons(prefix, names) {
  const data = await getJson(`${API}/${prefix}.json?icons=${[...names].sort().join(',')}`)
  const found = Object.keys(data.icons ?? {}).concat(Object.keys(data.aliases ?? {}))
  return { data, found }
}

for (const [prefix, names] of [...wanted].sort()) {
  if (!collections[prefix]) continue // not an Iconify set: event names, protocol tags, …
  const info = collections[prefix]
  const spdx = info.license?.spdx ?? ''
  const permissive = PERMISSIVE.test(spdx)
  const keep = new Set()
  for (const name of names) {
    const key = `${prefix}:${name}`
    if (permissive) keep.add(name)
    else if (SUBSTITUTES[key]) substituted.push([key, SUBSTITUTES[key]])
    else throw new Error(`${key}: set licence ${spdx || 'unknown'} is not MIT/ISC/BSD/Apache and has no substitute`)
  }
  if (keep.size) {
    const { data, found } = await fetchIcons(prefix, keep)
    if (found.length) sets.set(prefix, { data, info, names: found.sort() })
  }
}

// Substitutes: draw the permissive glyph, serve it under the requested name.
for (const [asked, drawn] of substituted) {
  const [askedPrefix, askedName] = asked.split(':')
  const [drawnPrefix, drawnName] = drawn.split(':')
  const { data } = await fetchIcons(drawnPrefix, [drawnName])
  const icon = data.icons?.[drawnName]
  if (!icon) throw new Error(`substitute ${drawn} not found`)
  const entry = sets.get(askedPrefix) ?? {
    data: { prefix: askedPrefix, icons: {}, width: data.width, height: data.height },
    info: null,
    names: [],
    drawnFrom: [],
  }
  entry.data.icons[askedName] = { ...icon, width: icon.width ?? data.width, height: icon.height ?? data.height }
  entry.names.push(askedName)
  entry.drawnFrom = [...(entry.drawnFrom ?? []), { asked, drawn, license: collections[drawnPrefix]?.license }]
  sets.set(askedPrefix, entry)
}

mkdirSync(outDir, { recursive: true })
const notice = [
  '# Iconify icon data served by the editor',
  '',
  'Generated by `apps/editor/scripts/make-iconify-offline.mjs` from the Iconify API: only the icons the',
  'shipped source asks for. The app points Iconify at `<basePath>/iconify` (`lib/iconify-offline.ts`), so',
  'no icon data is fetched from another origin.',
  '',
  '| Set | Licence | Author | Icons |',
  '|---|---|---|---|',
]
for (const [prefix, { data, info, names, drawnFrom }] of [...sets].sort()) {
  const { lastModified: _lm, ...clean } = data
  writeFileSync(join(outDir, `${prefix}.json`), `${JSON.stringify(clean)}\n`)
  if (info) {
    notice.push(
      `| \`${prefix}\` (${info.name}) | ${info.license?.title ?? '?'} (${info.license?.spdx ?? '?'}) | ${info.author?.name ?? '?'} | ${names.join(', ')} |`,
    )
  }
  for (const d of drawnFrom ?? []) {
    notice.push(
      `| \`${d.asked}\` | served with \`${d.drawn}\` — ${d.license?.title ?? '?'} (${d.license?.spdx ?? '?'}); the ${prefix} set's own data is not redistributed | — | ${d.asked.split(':')[1]} |`,
    )
  }
}
writeFileSync(join(outDir, 'NOTICE.md'), `${notice.join('\n')}\n`)
console.log(
  'wrote',
  [...sets.keys()].map((p) => `${p}(${sets.get(p).names.length})`).join(' '),
  '| substituted',
  substituted.map(([a, d]) => `${a}→${d}`).join(', ') || 'none',
)
