// Reference cases for the window's hole in its wall and for its body (port note entry 2): the
// old editor's own mesh builders, and the same numbers from the note's equations.
// cd packages/viewer && bun ../../ports/refcases/02-window-body.ts
import { calculateLevelMiters, sceneRegistry, WallNode, WindowNode } from '@pascal-app/core'
import * as THREE from 'three'
import { generateExtrudedWall } from '../../packages/viewer/src/systems/wall/wall-system'
import { poseWindowMovingParts } from '../../packages/viewer/src/systems/window/window-animation-system'
import {
  AWNING_WINDOW_SASH_NAME,
  buildWindowPreviewMesh,
  CASEMENT_WINDOW_SASH_NAME,
  DOUBLE_HUNG_BOTTOM_SASH_NAME,
  DOUBLE_HUNG_TOP_SASH_NAME,
  FRENCH_CASEMENT_LEFT_SASH_NAME,
  FRENCH_CASEMENT_RIGHT_SASH_NAME,
  LOUVERED_WINDOW_SLATS_NAME,
  SINGLE_HUNG_ACTIVE_SASH_NAME,
  SLIDING_WINDOW_ACTIVE_PANEL_NAME,
} from '../../packages/viewer/src/systems/window/window-system'
import { meshFacts } from './_mesh'
import { num, pt, row, title } from './_print'
import {
  bodyOf,
  boxOf,
  boxTotals,
  holeOutline,
  type Hold,
  type Part,
  plainParts,
  poseOf,
  reachOf,
  rectangleOutline,
  shapedFixed,
  shared,
  toWall,
  type V3,
  wallVolume,
  type Win,
  type XY,
} from './_window-equations'

// ------------------------------------------------------------------ the wall every case stands in
const L = 4 // (0, 0) to (4, 0)
const T = 0.2
const HEIGHT = 2.5

let serial = 0
function wallHere(): WallNode {
  serial += 1
  return WallNode.parse({ id: `wall_m${serial}`, start: [0, 0], end: [L, 0], thickness: T, height: HEIGHT })
}

function windowOn(wall: WallNode, more: Record<string, unknown>): WindowNode {
  serial += 1
  return WindowNode.parse({ id: `window_m${serial}`, wallId: wall.id, ...more })
}

// the wall's body with these windows cut out. The cutters are made only when the wall's mesh is
// known to the scene, as it is in the running editor.
function cut(wall: WallNode, windows: WindowNode[], slab = 0, base = 0, known = true): THREE.BufferGeometry {
  const mesh = new THREE.Mesh()
  if (known) sceneRegistry.nodes.set(wall.id, mesh)
  try {
    return generateExtrudedWall(wall, windows, calculateLevelMiters([wall]), slab, base)
  } finally {
    sceneRegistry.nodes.delete(wall.id)
    mesh.geometry.dispose()
  }
}

// where the holes are in the wall's face, read off the faces they leave across the wall's
// thickness (the wall's own ends, top and underside are not such faces)
function holeSeen(geometry: THREE.BufferGeometry, yb: number, yt: number): string {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const at = (i: number): V3 => {
    const v = index ? index.getX(i) : i
    return [position.getX(v), position.getY(v), position.getZ(v)]
  }
  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  const all = (tri: V3[], axis: number, value: number) => tri.every((p) => Math.abs(p[axis]! - value) < 1e-5)
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const tri = [at(offset), at(offset + 1), at(offset + 2)]
    const [a, b, c] = tri as [V3, V3, V3]
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (Math.abs(nz) > 0.5 * Math.hypot(nx, ny, nz)) continue // a face of the wall, front or back
    if (all(tri, 0, 0) || all(tri, 0, L) || all(tri, 1, yb) || all(tri, 1, yt)) continue
    for (const p of tri) {
      x0 = Math.min(x0, p[0])
      x1 = Math.max(x1, p[0])
      y0 = Math.min(y0, p[1])
      y1 = Math.max(y1, p[1])
    }
  }
  return Number.isFinite(x0) ? `x ${num(x0)}..${num(x1)} y ${num(y0)}..${num(y1)}` : 'none'
}

// the same from the note's outlines: each hole where it lies in the wall's face
function holeSaid(holes: XY[][], yb: number, yt: number): string {
  const face = rectangleOutline({ left: 0, right: L, bottom: yb, top: yt })
  const inside = holes.flatMap((hole) => shared(hole, face))
  if (inside.length === 0) return 'none'
  const b = boxOf(inside)
  return `x ${num(b.left)}..${num(b.right)} y ${num(b.bottom)}..${num(b.top)}`
}

function report(key: string, geometry: THREE.BufferGeometry, windows: WindowNode[], yb = 0, yt = HEIGHT) {
  const holes = windows.map((window) => holeOutline(window, T))
  row(`${key}.volume`, meshFacts(geometry).volume)
  row(`${key}.volume.by_equation`, wallVolume(L, T, yb, yt, holes))
  row(`${key}.hole`, holeSeen(geometry, yb, yt))
  row(`${key}.hole.by_equation`, holeSaid(holes, yb, yt))
  geometry.dispose()
}

// ------------------------------------------------------------------ reading a window's body
type Seen = {
  boxes: { frame: { count: number; volume: number }; glass: { count: number; volume: number } }
  sheets: Array<{ slot: string; area: number }>
  min: V3
  max: V3
}

// every part under a window's mesh but its unseen pick box: boxes by what they are made of,
// the meshes that are no boxes with their surface, and the box that holds them all
function see(mesh: THREE.Mesh): Seen {
  const seen: Seen = {
    boxes: { frame: { count: 0, volume: 0 }, glass: { count: 0, volume: 0 } },
    sheets: [],
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  }
  const inverse = new THREE.Matrix4()
  mesh.updateMatrixWorld(true)
  inverse.copy(mesh.matrixWorld).invert()
  const p = new THREE.Vector3()
  mesh.traverse((child) => {
    const part = child as THREE.Mesh
    if (child === mesh || child.name === 'cutout' || !part.isMesh) return
    const slot = part.userData.slotId as 'frame' | 'glass'
    const geometry = part.geometry
    if (geometry.type === 'BoxGeometry') {
      const q = (geometry as THREE.BoxGeometry).parameters
      seen.boxes[slot].count += 1
      seen.boxes[slot].volume += q.width * q.height * q.depth
    } else {
      seen.sheets.push({ slot, area: meshFacts(geometry).area })
    }
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld).applyMatrix4(inverse)
      const here: V3 = [p.x, p.y, p.z]
      for (let axis = 0; axis < 3; axis += 1) {
        seen.min[axis] = Math.min(seen.min[axis]!, here[axis]!)
        seen.max[axis] = Math.max(seen.max[axis]!, here[axis]!)
      }
    }
  })
  return seen
}

const span = (min: V3, max: V3) =>
  `x ${num(min[0])}..${num(max[0])} y ${num(min[1])}..${num(max[1])} z ${num(min[2])}..${num(max[2])}`

function totalsSaid(boxes: Seen['boxes']): string {
  return `frame ${boxes.frame.count} boxes ${num(boxes.frame.volume)} m3, glass ${boxes.glass.count} boxes ${num(boxes.glass.volume)} m3`
}

const boxSaid = (slot: string, size: readonly number[], at: readonly number[]) =>
  `${slot} ${num(size[0]!)} x ${num(size[1]!)} x ${num(size[2]!)} at ${pt(at)}`

// the parts of a window made of boxes alone, one after another as the fork adds them
function boxesOf(mesh: THREE.Mesh): string[] {
  return mesh.children
    .filter((child) => child.name !== 'cutout')
    .map((child) => {
      const part = child as THREE.Mesh<THREE.BoxGeometry>
      const q = part.geometry.parameters
      return boxSaid(part.userData.slotId, [q.width, q.height, q.depth], [part.position.x, part.position.y, part.position.z])
    })
}

function partsAgainst(key: string, mesh: THREE.Mesh, mine: Part[], skip: (name: string) => boolean = () => false) {
  const seen = boxesOf(mesh)
  for (let i = 0; i < Math.max(seen.length, mine.length); i += 1) {
    const part = mine[i]
    if (part && seen[i] && skip(part.name)) continue
    const name = part?.name ?? `part_${i + 1}_the_note_does_not_have`
    row(`${key}.${name}`, seen[i] ?? 'not there')
    row(`${key}.${name}.by_equation`, part && part.kind === 'box' ? boxSaid(part.slot, part.size, part.at) : 'not there')
  }
}

// where the moving parts stand: what the fork's named groups hold, and the note's poses
const holdSaid = (label: string, at: readonly number[], turnX: number, turnY: number) =>
  `${label} at ${pt(at)} turn about x ${num(turnX)} about y ${num(turnY)}`

function moversSeen(mesh: THREE.Mesh, names: Array<[string, string]>): string {
  return names
    .map(([label, name]) => {
      const group = mesh.getObjectByName(name)
      if (!group) return `${label} not there`
      if (name === LOUVERED_WINDOW_SLATS_NAME) {
        const first = group.children[0]!
        const last = group.children[group.children.length - 1]!
        return `${group.children.length} slats, first ${holdSaid('', [first.position.x, first.position.y, first.position.z], first.rotation.x, first.rotation.y).trim()}, last at ${pt([last.position.x, last.position.y, last.position.z])}`
      }
      return holdSaid(label, [group.position.x, group.position.y, group.position.z], group.rotation.x, group.rotation.y)
    })
    .join('; ')
}

function moversSaid(holds: Hold[], names: Array<[string, string]>): string {
  if (names[0]?.[1] === LOUVERED_WINDOW_SLATS_NAME) {
    const first = holds[0]!
    const last = holds[holds.length - 1]!
    return `${holds.length} slats, first ${holdSaid('', first.at, first.turnX ?? 0, first.turnY ?? 0).trim()}, last at ${pt(last.at)}`
  }
  return names
    .map(([label], i) => {
      const hold = holds[i]
      return hold ? holdSaid(label, hold.at, hold.turnX ?? 0, hold.turnY ?? 0) : `${label} not there`
    })
    .join('; ')
}

// ------------------------------------------------------------------ the hole in the wall
title('M1 a window as the fork makes it (1.5 x 1.5, rectangle) in a wall (0, 0) to (4, 0), 0.2 thick, 2.5 high: middle 2.0 m along, 1.25 m up')
{
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.25, 0] })
  const uncut = meshFacts(cut(wall, []))
  row('M1.wall_alone.volume', uncut.volume)
  row('M1.wall_alone.volume.by_equation', wallVolume(L, T, 0, HEIGHT, []))
  const geometry = cut(wall, [window])
  const f = meshFacts(geometry)
  row('M1.box', span(f.min, f.max))
  report('M1', geometry, [window])
}

title('M2 an arched window 1.2 x 1.5 at the same place: arch height 0.6 (half its width), then 0.35')
for (const archHeight of [0.6, 0.35]) {
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.25, 0], width: 1.2, height: 1.5, openingShape: 'arch', archHeight })
  report(`M2.arch_height_${archHeight}`, cut(wall, [window]), [window])
  // with the true half ellipse; at 0.6 that is the half circle the Wall record's Arch has
  row(
    `M2.arch_height_${archHeight}.volume.exact`,
    L * T * HEIGHT - T * (1.2 * (1.5 - archHeight) + (Math.PI * 0.6 * archHeight) / 2),
  )
}

title('M3 rounded windows, middle 2.0 m along, 1.5 m up: 1.2 x 1.0 radius 0.15 (reveal radius 0.025, then 0); 1.0 x 1.0 radius 0.5 (reveal 0, then 0.025)')
for (const [name, more, trueArea] of [
  ['radius_0.15', { width: 1.2, height: 1.0 }, undefined],
  // with true quarter circles
  ['radius_0.15.reveal_0', { width: 1.2, height: 1.0, openingRevealRadius: 0 }, 1.2 * 1.0 - (4 - Math.PI) * 0.15 * 0.15],
  // with the true circle of diameter 1.0, which is the Wall record's Round
  ['circle.reveal_0', { width: 1.0, height: 1.0, cornerRadius: 0.5, openingRevealRadius: 0 }, Math.PI / 4],
  ['circle', { width: 1.0, height: 1.0, cornerRadius: 0.5 }, undefined],
] as Array<[string, Record<string, unknown>, number | undefined]>) {
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.5, 0], openingShape: 'rounded', ...more })
  report(`M3.${name}`, cut(wall, [window]), [window])
  if (trueArea !== undefined) row(`M3.${name}.volume.exact`, L * T * HEIGHT - T * trueArea)
}

title('M4 a window 1.2 x 1.5 at the wall\'s foot: its bottom 0, 0.004 and 0.005 above the base; then bottom 0 on a wall whose body starts 0.15 lower')
for (const bottom of [0, 0.004, 0.005]) {
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, bottom + 0.75, 0], width: 1.2, height: 1.5 })
  report(`M4.bottom(${bottom})`, cut(wall, [window]), [window])
}
{
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 0.75, 0], width: 1.2, height: 1.5 })
  // the wall stands on a floor 0.15 up and its body runs down to 0: from -0.15 to 2.5 in its own frame
  report('M4.lower_body.bottom(0)', cut(wall, [window], 0.15, 0), [window], -0.15, HEIGHT)
}

title('M5 two things at once: two windows 1 x 1 with their middles at (1.5, 1.5) and (2.0, 1.5); a window 1 x 1 at (1.5, 1.5) and the arch of M2 (0.6 high) at (2.3, 1.25); a window 1.2 x 1.0 at (0.3, 1.5), past the wall\'s start')
{
  const wall = wallHere()
  const a = windowOn(wall, { position: [1.5, 1.5, 0], width: 1, height: 1 })
  const b = windowOn(wall, { position: [2.0, 1.5, 0], width: 1, height: 1 })
  report('M5.two_rectangles', cut(wall, [a, b]), [a, b])
}
{
  const wall = wallHere()
  const a = windowOn(wall, { position: [1.5, 1.5, 0], width: 1, height: 1 })
  const b = windowOn(wall, { position: [2.3, 1.25, 0], width: 1.2, height: 1.5, openingShape: 'arch', archHeight: 0.6 })
  report('M5.rectangle_and_arch', cut(wall, [a, b]), [a, b])
}
{
  const wall = wallHere()
  const window = windowOn(wall, { position: [0.3, 1.5, 0], width: 1.2, height: 1.0 })
  report('M5.past_the_start', cut(wall, [window]), [window])
}

title('M6 what cuts and what does not, with the window of M1: a wall whose mesh the scene does not know; a bare opening; the window on the back; then a sliding window 1.2 x 1.5 that still stores an arch 0.6 high')
{
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.25, 0] })
  const geometry = cut(wall, [window], 0, 0, false)
  row('M6.wall_not_known.volume', meshFacts(geometry).volume)
  row('M6.wall_not_known.hole', holeSeen(geometry, 0, HEIGHT))
  geometry.dispose()
}
{
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.25, 0], openingKind: 'opening' })
  report('M6.bare_opening', cut(wall, [window]), [window])
  row('M6.bare_opening.body', totalsSaid(see(buildWindowPreviewMesh(window)).boxes))
}
{
  // the window of M1 turned to the back of the wall and set 0.05 off its axis: the same hole
  const wall = wallHere()
  const window = windowOn(wall, { position: [2, 1.25, 0.05], rotation: [0, Math.PI, 0], side: 'back' })
  report('M6.on_the_back_and_off_the_axis', cut(wall, [window]), [window])
}
{
  const wall = wallHere()
  const window = windowOn(wall, {
    position: [2, 1.25, 0],
    width: 1.2,
    height: 1.5,
    windowType: 'sliding',
    openingShape: 'arch',
    archHeight: 0.6,
  })
  report('M6.sliding_with_arch', cut(wall, [window]), [window])
  const seen = see(buildWindowPreviewMesh(window))
  const mine = bodyOf(window as Win)
  row('M6.sliding_with_arch.body', `${totalsSaid(seen.boxes)}, meshes that are no boxes ${seen.sheets.length}`)
  row(
    'M6.sliding_with_arch.body.by_equation',
    `${totalsSaid(boxTotals(mine))}, meshes that are no boxes ${mine.filter((part) => part.kind === 'sheet').length}`,
  )
}

// ------------------------------------------------------------------ the body
title('M7 the body of the plain window: 1.5 x 1.5 as the fork makes it; the grid of the same with columns 3 : 2 (divider 0.04) and rows 1 : 2 (divider 0.02); then the first on the back of its wall, middle 2.0 m along and 1.25 m up')
{
  const window = WindowNode.parse({ id: 'window_m7a' })
  const mesh = buildWindowPreviewMesh(window)
  const q = (mesh.geometry as THREE.BoxGeometry).parameters
  row('M7.as_made.pick_box', `${num(q.width)} x ${num(q.height)} x ${num(q.depth)}`)
  row('M7.as_made.pick_box.by_equation', `${num(window.width)} x ${num(window.height)} x ${num(window.frameDepth)}`)
  partsAgainst('M7.as_made', mesh, plainParts(window))
}
{
  const window = WindowNode.parse({
    id: 'window_m7b',
    columnRatios: [3, 2],
    rowRatios: [1, 2],
    columnDividerThickness: 0.04,
    rowDividerThickness: 0.02,
  })
  // its four frame bars and its sill are those of the window above: the grid's parts alone
  partsAgainst('M7.grid', buildWindowPreviewMesh(window), plainParts(window), (name) => name.startsWith('frame_') || name === 'sill')
}
{
  // the same window as made, its middle 2.0 m along a wall and 1.25 m up, turned to the back
  const window = WindowNode.parse({ id: 'window_m7c', position: [2, 1.25, 0], rotation: [0, Math.PI, 0], side: 'back' })
  const mesh = buildWindowPreviewMesh(window)
  mesh.updateMatrixWorld(true)
  const parts = plainParts(window)
  const where = new THREE.Vector3()
  for (const [name, index] of [
    ['frame_left', 2],
    ['sill', 5],
  ] as Array<[string, number]>) {
    mesh.children[index]!.getWorldPosition(where)
    const part = parts[index]!
    row(`M7.on_the_back.${name}`, pt([where.x, where.y, where.z]))
    row(`M7.on_the_back.${name}.by_equation`, part.kind === 'box' ? pt(toWall(window, part.at)) : 'not there')
  }
}

title('M8 fixed windows with a shaped top, 1.2 x 1.0, columns 1 : 3 : 1, rows 1 : 3: an arch 0.35 high; rounded with radius 0.4')
for (const [name, more] of [
  ['arch', { openingShape: 'arch' }],
  ['rounded', { openingShape: 'rounded', cornerRadius: 0.4 }],
] as Array<[string, Record<string, unknown>]>) {
  const window = WindowNode.parse({
    id: `window_m8_${name}`,
    width: 1.2,
    height: 1.0,
    columnRatios: [1, 3, 1],
    rowRatios: [1, 3],
    ...more,
  })
  const mesh = buildWindowPreviewMesh(window)
  const mine = shapedFixed(window)
  const made = mesh.children.filter((child) => child.name !== 'cutout').map((child) => meshFacts((child as THREE.Mesh).geometry))
  const barSeen = (f: (typeof made)[number] | undefined) =>
    f ? `x ${num(f.min[0])}..${num(f.max[0])} y ${num(f.min[1])}..${num(f.max[1])} depth ${num(f.max[2] - f.min[2])}` : 'not there'
  const barSaid = (r: { left: number; right: number; bottom: number; top: number } | undefined) =>
    r ? `x ${num(r.left)}..${num(r.right)} y ${num(r.bottom)}..${num(r.top)} depth ${num(mine.dividerDepth)}` : 'not there'
  row(`M8.${name}.frame_volume`, made[0]!.volume)
  row(`M8.${name}.frame_volume.by_equation`, mine.frameVolume)
  row(`M8.${name}.glass_volume`, made[1]!.volume)
  row(`M8.${name}.glass_volume.by_equation`, mine.glassVolume)
  row(`M8.${name}.column_divider_1`, barSeen(made[2]))
  row(`M8.${name}.column_divider_1.by_equation`, barSaid(mine.columnDividers[0]))
  row(`M8.${name}.column_divider_2`, barSeen(made[3]))
  row(`M8.${name}.column_divider_2.by_equation`, barSaid(mine.columnDividers[1]))
  row(`M8.${name}.row_divider_1`, barSeen(made[4]))
  row(`M8.${name}.row_divider_1.by_equation`, barSaid(mine.rowDividers[0]))
  row(`M8.${name}.parts`, made.length)
  row(`M8.${name}.parts.by_equation`, 2 + mine.columnDividers.length + mine.rowDividers.length + (window.sill ? 1 : 0))
}

// ------------------------------------------------------------------ the types
type Kind = { key: string; more: Record<string, unknown>; movers: Array<[string, string]> }
const KINDS: Kind[] = [
  { key: 'sliding', more: { windowType: 'sliding' }, movers: [['panel', SLIDING_WINDOW_ACTIVE_PANEL_NAME]] },
  { key: 'casement_hinged_left', more: { windowType: 'casement' }, movers: [['sash', CASEMENT_WINDOW_SASH_NAME]] },
  { key: 'casement_hinged_right', more: { windowType: 'casement', hingesSide: 'right' }, movers: [['sash', CASEMENT_WINDOW_SASH_NAME]] },
  {
    key: 'casement_french',
    more: { windowType: 'casement', casementStyle: 'french' },
    movers: [
      ['left', FRENCH_CASEMENT_LEFT_SASH_NAME],
      ['right', FRENCH_CASEMENT_RIGHT_SASH_NAME],
    ],
  },
  { key: 'awning', more: { windowType: 'awning' }, movers: [['sash', AWNING_WINDOW_SASH_NAME]] },
  { key: 'hopper', more: { windowType: 'hopper' }, movers: [['sash', AWNING_WINDOW_SASH_NAME]] },
  { key: 'single_hung', more: { windowType: 'single-hung' }, movers: [['lower', SINGLE_HUNG_ACTIVE_SASH_NAME]] },
  {
    key: 'double_hung',
    more: { windowType: 'double-hung' },
    movers: [
      ['upper', DOUBLE_HUNG_TOP_SASH_NAME],
      ['lower', DOUBLE_HUNG_BOTTOM_SASH_NAME],
    ],
  },
  { key: 'louvered', more: { windowType: 'louvered' }, movers: [['slats', LOUVERED_WINDOW_SLATS_NAME]] },
  { key: 'bay', more: { windowType: 'bay' }, movers: [] },
  { key: 'bow', more: { windowType: 'bow' }, movers: [] },
]

const typed = (kind: Kind, more: Record<string, unknown> = {}) =>
  WindowNode.parse({ id: `window_${kind.key}`, width: 1.2, height: 1.0, sill: false, ...kind.more, ...more })

title('M9 the other types, each 1.2 x 1.0 with the frame as made (0.05 x 0.07) and no sill, shut: what they are made of and the box that holds them (the window\'s own frame)')
for (const kind of KINDS) {
  const window = typed(kind)
  const seen = see(buildWindowPreviewMesh(window))
  const mine = bodyOf(window as Win)
  const reach = reachOf(mine)
  row(`M9.${kind.key}.made_of`, totalsSaid(seen.boxes))
  row(`M9.${kind.key}.made_of.by_equation`, totalsSaid(boxTotals(mine)))
  if (seen.sheets.length > 0) {
    const sheets = mine.filter((part) => part.kind === 'sheet')
    const said = (list: Array<{ slot: string; area: number }>) => list.map((sheet) => `${sheet.slot} ${num(sheet.area)} m2`).join(', ')
    row(`M9.${kind.key}.not_boxes`, said(seen.sheets))
    row(`M9.${kind.key}.not_boxes.by_equation`, said(sheets as Array<{ slot: string; area: number }>))
  }
  row(`M9.${kind.key}.reach`, span(seen.min, seen.max))
  row(`M9.${kind.key}.reach.by_equation`, span(reach.min, reach.max))
}

title('M10 the same windows opening: the moving part shut (0), half open (0.5) and open (1), and the box that holds the open window')
for (const kind of KINDS) {
  const window = typed(kind)
  const mesh = buildWindowPreviewMesh(window)
  if (kind.movers.length === 0) {
    row(`M10.${kind.key}.moves`, poseWindowMovingParts(window, mesh, 1))
    row(`M10.${kind.key}.moves.by_equation`, poseOf(window as Win, 1).length > 0)
    continue
  }
  for (const t of [0, 0.5, 1]) {
    poseWindowMovingParts(window, mesh, t)
    row(`M10.${kind.key}.open(${t})`, moversSeen(mesh, kind.movers))
    row(`M10.${kind.key}.open(${t}).by_equation`, moversSaid(poseOf(window as Win, t), kind.movers))
  }
  const open = see(mesh)
  const reach = reachOf(bodyOf(window as Win, 1))
  row(`M10.${kind.key}.open_reach`, span(open.min, open.max))
  row(`M10.${kind.key}.open_reach.by_equation`, span(reach.min, reach.max))
}
{
  // an awning told to hang from its bottom edge is the hopper
  const kind: Kind = {
    key: 'awning_direction_down',
    more: { windowType: 'awning', awningDirection: 'down' },
    movers: [['sash', AWNING_WINDOW_SASH_NAME]],
  }
  const window = typed(kind)
  const mesh = buildWindowPreviewMesh(window)
  poseWindowMovingParts(window, mesh, 1)
  row(`M10.${kind.key}.open(1)`, moversSeen(mesh, kind.movers))
  row(`M10.${kind.key}.open(1).by_equation`, moversSaid(poseOf(window as Win, 1), kind.movers))
}
{
  // a window stored half open is built half open
  const kind = KINDS[0]!
  const window = typed(kind, { operationState: 0.5 })
  row('M10.sliding.stored_half_open', moversSeen(buildWindowPreviewMesh(window), kind.movers))
  row('M10.sliding.stored_half_open.by_equation', moversSaid(poseOf(window as Win, 0.5), kind.movers))
}
