#!/usr/bin/env bun
/**
 * H18 — walk-mode feel check.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '../../..')
const fails = []

function ok(cond, msg) {
  if (!cond) fails.push(msg)
  else console.log('OK', msg)
}

const speeds = readFileSync(join(root, 'packages/viewer/src/lib/walk-speeds.ts'), 'utf8')
ok(speeds.includes('WALK_SPEED_MS = 1.4'), 'walk 1.4 m/s')
ok(speeds.includes('RUN_SPEED_MS = 4'), 'run 4 m/s')
ok(speeds.includes('SPRINT_SPEED_MS = 7'), 'sprint 7 m/s')
ok(speeds.includes('FLY_SPEED_MIN_MS = 10'), 'fly min 10')
ok(speeds.includes('FLY_SPEED_MAX_MS = 40'), 'fly max 40')

const fpc = readFileSync(
  join(root, 'packages/editor/src/components/editor/first-person-controls.tsx'),
  'utf8',
)
ok(fpc.includes('WALK_SPEED_MS'), 'editor uses WALK_SPEED_MS')
ok(fpc.includes('RUN_SPEED_MS'), 'editor uses RUN_SPEED_MS')
ok(fpc.includes('SPRINT_SPEED_MS'), 'editor uses SPRINT_SPEED_MS')
ok(fpc.includes("KeyF"), 'F toggles fly')
ok(fpc.includes('SPRINT_DOUBLE_TAP_MS'), 'double-tap sprint')
ok(fpc.includes('flySpeedRef'), 'scrollable fly speed')
ok(fpc.includes("KeyH"), 'H help')
ok(fpc.includes("KeyV"), 'V first/third')
ok(fpc.includes('teleportArmedRef'), 'T+click teleport')
ok(fpc.includes('buildGroundPath') || fpc.includes('clickWalkPathRef'), 'click-to-walk')
ok(fpc.includes('getGamepads'), 'gamepad')
ok(fpc.includes('createCc0WalkCharacter'), 'CC0 character')
ok(fpc.includes('useWalkSettings'), 'walk settings')
ok(fpc.includes('pascal-walk-joystick'), 'touch joystick bridge')

const glb = readFileSync(
  join(root, 'packages/viewer/src/components/viewer/glb-walkthrough-controller.tsx'),
  'utf8',
)
ok(glb.includes('WALK_SPEED_MS'), 'GLB walk uses WALK_SPEED_MS')
ok(glb.includes('RUN_SPEED_MS'), 'GLB walk uses RUN_SPEED_MS')

ok(existsSync(join(root, 'packages/editor/src/store/use-walk-settings.ts')), 'walk settings store')
ok(existsSync(join(root, 'packages/editor/src/lib/walk-ground-path.ts')), 'ground path helper')
ok(existsSync(join(root, 'packages/editor/src/lib/h18-cc0-character.ts')), 'CC0 character module')
ok(existsSync(join(root, 'docs/plans/H18-character-licence.md')), 'character licence doc')

const character = readFileSync(join(root, 'packages/editor/src/lib/h18-cc0-character.ts'), 'utf8')
ok(character.includes('excludeFromExport'), 'character tagged excludeFromExport')
ok(character.includes('h18-cc0-character'), 'character name')
ok(!/mixamo/i.test(character.replace(/not Mixamo|no Mixamo|Never.*Mixamo|Mixamo files must never/gi, '')), 'character source is not Mixamo')

const hud = readFileSync(join(root, 'packages/editor/src/components/walkthrough-hud.tsx'), 'utf8')
ok(hud.includes('WalkthroughHelpCard'), 'help card')
ok(hud.includes('WalkTouchJoystick'), 'touch joystick UI')

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (
      name.name === 'node_modules' ||
      name.name === '.git' ||
      name.name === 'dist' ||
      name.name === '.cache' ||
      name.name === '.next' ||
      name.name === 'turbo'
    )
      continue
    const p = join(dir, name.name)
    if (name.isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}
const scanRoots = ['packages', 'apps', 'docs', 'public'].map((d) => join(root, d))
const mixamoHits = scanRoots.flatMap((d) => walkFiles(d)).filter((p) => /mixamo/i.test(p))
ok(mixamoHits.length === 0, 'no Mixamo paths in repo')

ok(existsSync(join(root, 'docs/plans/H18-done.md')), 'H18-done.md')

if (fails.length) {
  console.error('FAIL')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}
console.log('check-h18-walk OK')
