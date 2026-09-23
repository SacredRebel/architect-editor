#!/usr/bin/env bun
/**
 * H16.4 — WebXR port smoke check.
 * Confirms XR sources, feature gate, 1:1 human scale reset, and terrain walkability hooks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
}

const xrDir = join(root, 'packages/viewer/src/xr')
ok(existsSync(join(xrDir, 'session-root.tsx')), 'viewer xr session-root')
ok(existsSync(join(xrDir, 'human-mode/lib/locomotion.ts')), 'human locomotion')
ok(existsSync(join(xrDir, 'mode-switching/lib/scene-scale-transition.ts')), '1:1 scale transition')

const scaleSrc = readFileSync(
  join(xrDir, 'mode-switching/lib/scene-scale-transition.ts'),
  'utf8',
)
ok(scaleSrc.includes('setScalar(1)'), 'human mode resets scene scale to 1')

ok(existsSync(join(root, 'apps/editor/components/webxr-feature-gate.tsx')), 'feature gate')
ok(existsSync(join(root, 'apps/editor/components/webxr-home.tsx')), 'webxr home shell')
ok(existsSync(join(root, 'wiki/architecture/xr.md')), 'xr architecture wiki')

const nextCfg = readFileSync(join(root, 'apps/editor/next.config.ts'), 'utf8')
ok(nextCfg.includes('NEXT_PUBLIC_WEBXR'), 'NEXT_PUBLIC_WEBXR in next.config')
ok(nextCfg.includes("NEXT_PUBLIC_WEBXR ?? '1'") || nextCfg.includes('NEXT_PUBLIC_WEBXR ?? "1"'), 'WEBXR defaults on for eco fork')

const bootstrap = readFileSync(join(root, 'apps/editor/lib/bootstrap.ts'), 'utf8')
ok(bootstrap.includes("NEXT_PUBLIC_WEBXR === '1'"), 'bootstrap gates WebXR registration')

const sceneBvh = readFileSync(join(root, 'packages/viewer/src/components/viewer/scene-bvh.tsx'), 'utf8')
ok(sceneBvh.includes('passes < 8'), 'scene BVH re-scans for late terrain')

const collision = readFileSync(
  join(root, 'packages/viewer/src/xr/human-mode/input/human-collision-rig.tsx'),
  'utf8',
)
ok(collision.includes('rescanAt'), 'human collision re-scans colliders')

const site = readFileSync(join(root, 'packages/nodes/src/site/renderer.tsx'), 'utf8')
ok(site.includes('!immersiveXR && horizonGeometry'), 'site horizon hidden in XR')

const pkg = JSON.parse(readFileSync(join(root, 'apps/editor/package.json'), 'utf8'))
ok(Boolean(pkg.dependencies['@webxr/plugin']), '@webxr/plugin dependency')

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h16-4 OK')
