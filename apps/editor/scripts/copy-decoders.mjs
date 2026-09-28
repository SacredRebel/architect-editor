#!/usr/bin/env node
// A4 — the Draco decoder and the Basis (KTX2) transcoder ship inside the
// installed `three` package. Copy them into `public/decoders/` so the app
// serves them from its own origin and base path (lib/decoders-self-hosted.ts
// points the loaders there) instead of fetching gstatic / jsDelivr.
//
// Runs next to the web-ifc copy on postinstall / predev / prebuild, and from
// the static export. Idempotent: skips files that already match by size.
// Both are Apache-2.0; `public/decoders/LICENSE` is the licence text and this
// script writes `public/decoders/NOTICE.md` naming what was copied from where.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function findThreeDir(startDir) {
  let dir = startDir
  while (dir && dir !== resolve(dir, '..')) {
    const candidate = join(dir, 'node_modules', 'three')
    if (existsSync(join(candidate, 'package.json'))) return candidate
    dir = resolve(dir, '..')
  }
  return null
}

const SETS = [
  {
    dir: 'draco',
    from: 'examples/jsm/libs/draco/gltf',
    files: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
    name: 'Draco 3D Data Compression — glTF decoder',
    project: 'https://github.com/google/draco',
  },
  {
    dir: 'basis',
    from: 'examples/jsm/libs/basis',
    files: ['basis_transcoder.js', 'basis_transcoder.wasm'],
    name: 'Basis Universal — transcoder',
    project: 'https://github.com/BinomialLLC/basis_universal',
  },
]

const threeDir = findThreeDir(import.meta.dirname)
if (!threeDir) {
  console.warn('[editor] three package not found — decoder copy skipped.')
  process.exit(0)
}
const threeVersion = JSON.parse(readFileSync(join(threeDir, 'package.json'), 'utf8')).version
const decodersDir = join(import.meta.dirname, '..', 'public', 'decoders')

for (const set of SETS) {
  const destDir = join(decodersDir, set.dir)
  mkdirSync(destDir, { recursive: true })
  for (const name of set.files) {
    const src = join(threeDir, set.from, name)
    const dst = join(destDir, name)
    try {
      const srcSize = statSync(src).size
      let dstSize = 0
      try {
        dstSize = statSync(dst).size
      } catch {
        /* not present yet */
      }
      if (srcSize === dstSize) continue
      copyFileSync(src, dst)
      console.log(`[editor] copied decoders/${set.dir}/${name} (${(srcSize / 1024).toFixed(0)} KB)`)
    } catch (err) {
      console.warn(`[editor] could not copy decoders/${set.dir}/${name}:`, err.message)
    }
  }
}

const notice = [
  '# Decoders served by the editor',
  '',
  `Copied from the installed \`three@${threeVersion}\` by \`apps/editor/scripts/copy-decoders.mjs\`.`,
  'The app points its GLTF and KTX2 loaders at `<basePath>/decoders/`, so no decoder is fetched from',
  'another origin. Both components are licensed under the Apache License 2.0; the text is in `LICENSE`.',
  '',
  '| Directory | Component | Copied from | Project | Licence |',
  '|---|---|---|---|---|',
  ...SETS.map(
    (set) =>
      `| \`${set.dir}/\` | ${set.name} | \`three/${set.from}/\` (${set.files.join(', ')}) | ${set.project} | Apache-2.0 |`,
  ),
  '',
].join('\n')
writeFileSync(join(decodersDir, 'NOTICE.md'), notice)
