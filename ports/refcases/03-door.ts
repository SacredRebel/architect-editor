// Reference cases for the door (port note entry 3): where it sits on its wall, how it is
// resized, the hole it cuts, how far open it is and how it gets there.
// cd packages/viewer && bun ../../ports/refcases/03-door.ts
//
// Two halves, as in 01-wall.ts. A line `K` is what the old editor's own function gives; a line
// `K.by_equation` is the same thing worked out from the port note's equations alone
// (_door-equations.ts, which calls nothing of the old editor); `K.exact` is the true value
// where the old editor draws a curve as chords.
import {
  clampDoorOperationState,
  DoorNode,
  getDoorRenderOpenAmount,
  getGarageVisibleOpeningRatio,
  isOperationDoorType,
  SECTIONAL_GARAGE_RENDER_OPEN_SCALE,
  useInteractive,
  useScene,
  WallNode,
} from '@pascal-app/core'
import { useThree } from '@react-three/fiber'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createElement, Fragment } from 'react'
import type * as THREE from 'three'
import {
  DOOR_SWING_OPEN_ANGLE,
  DOOR_TOGGLE_ANIMATION_MS,
  toggleDoorOpenState,
} from '../../packages/editor/src/lib/door-interaction'
import { doorDefinition } from '../../packages/nodes/src/door/definition'
import {
  clampToWall,
  hasWallChildOverlap,
  scaleHandleHeight,
  wallLocalToWorld,
} from '../../packages/nodes/src/door/door-math'
import { doorParametrics } from '../../packages/nodes/src/door/parametrics'
import { projectWallLocalPointToPlan } from '../../packages/nodes/src/shared/wall-attach-target'
import { DoorAnimationSystem } from '../../packages/viewer/src/systems/door/door-animation-system'
import {
  buildOpeningCutoutGeometry,
  buildOpeningCutoutShape,
  getOpeningCutoutBottomPadding,
  hasFlatOpeningCutoutBottom,
} from '../../packages/viewer/src/systems/wall/opening-cutout-geometry'
import {
  archHeadShare,
  archRise,
  areaOf,
  bottomLowering,
  clearOpening,
  type Door,
  drawnOpen,
  faceRect,
  handleAfterResize,
  heightResized,
  holeOutline,
  holeRect,
  openFraction,
  overlap,
  placeInLevel,
  placeInPlan,
  placeOnWall,
  plainDoor,
  type Q,
  revealGrowth,
  SLIDES_OR_FOLDS,
  toggle,
  topRadii,
  tween,
  widthResized,
} from './_door-equations'
import { meshFacts } from './_mesh'
import { num, pt, pts, row, title } from './_print'

// the React warning about act() is of no use here
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Node = ReturnType<typeof DoorNode.parse>
const door = (more: Record<string, unknown> = {}): Node => DoorNode.parse({ id: 'door_case', ...more })
const plain = (node: Node): Door => plainDoor(node as unknown as Record<string, unknown>)

// The profile rectangle the wall's builder hands to the outline function (createOpeningCutoutBrush
// in wall-system.tsx does exactly this; the body cases run that function itself).
function cutterRect(node: Node) {
  const bottom = node.position[1] - node.height / 2
  return {
    left: node.position[0] - node.width / 2,
    right: node.position[0] + node.width / 2,
    bottom: bottom - getOpeningCutoutBottomPadding(node, bottom),
    top: node.position[1] + node.height / 2,
  }
}

// an outline's corners: the points three.js extrudes (24 curve segments), the closing point and repeats dropped
function cornersOf(shape: THREE.Shape): Q[] {
  const out: Q[] = []
  for (const p of shape.extractPoints(24).shape) {
    const last = out[out.length - 1]
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-9) continue
    out.push({ x: p.x, y: p.y })
  }
  const first = out[0]!
  const last = out[out.length - 1]!
  if (out.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) out.pop()
  return out
}

// the outline a cutter has where it passes through the wall: its points on the plane z = depth / 2
function sectionOf(geometry: THREE.BufferGeometry, depth: number): Q[] {
  const position = geometry.getAttribute('position')
  const seen = new Map<string, Q>()
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getZ(i) - depth / 2) > 1e-6) continue
    const p = { x: position.getX(i), y: position.getY(i) }
    seen.set(`${p.x.toFixed(6)},${p.y.toFixed(6)}`, p)
  }
  const points = [...seen.values()]
  const cx = points.reduce((total, p) => total + p.x, 0) / points.length
  const cy = points.reduce((total, p) => total + p.y, 0) / points.length
  return points.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
}

// where an arched outline leaves its right side: the height the arch springs from
function springOf(node: Node): number {
  const rect = cutterRect(node)
  const onTheSide = cornersOf(buildOpeningCutoutShape(node, rect)).filter((p) => Math.abs(p.x - rect.right) < 1e-9)
  return Math.max(...onTheSide.map((p) => p.y))
}

const boxText = (min: readonly number[], max: readonly number[]) =>
  `x ${num(min[0]!)}..${num(max[0]!)} y ${num(min[1]!)}..${num(max[1]!)} z ${num(min[2]!)}..${num(max[2]!)}`

function boxOfPoints(points: readonly Q[], halfDepth: number) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return boxText([Math.min(...xs), Math.min(...ys), -halfDepth], [Math.max(...xs), Math.max(...ys), halfDepth])
}

// ------------------------------------------------------------------ the cases
title('D0 constants and defaults')
{
  const d = door()
  row('D0.width', d.width)
  row('D0.height', d.height)
  row('D0.position', pt(d.position))
  row('D0.frame_thickness', d.frameThickness)
  row('D0.frame_depth', d.frameDepth)
  row('D0.threshold', `${d.threshold} height ${num(d.thresholdHeight)}`)
  row('D0.corner_radius', d.cornerRadius)
  row('D0.top_radii', pt(d.openingTopRadii))
  row('D0.arch_height', d.archHeight)
  row('D0.reveal_radius', d.openingRevealRadius)
  row('D0.content_padding', pt(d.contentPadding))
  row('D0.handle', `${d.handle} height ${num(d.handleHeight)} side ${d.handleSide}`)
  row('D0.panic_bar_height', d.panicBarHeight)
  row('D0.type', `${d.doorType}, ${d.openingKind}, ${d.openingShape}, radii ${d.openingRadiusMode}`)
  row('D0.hung', `hinges ${d.hingesSide}, swing ${d.swingDirection}, angle ${num(d.swingAngle)}, slide ${d.slideDirection}`)
  row('D0.counts', `leaves ${d.leafCount} garage panels ${d.garagePanelCount} open ${num(d.operationState)}`)
  row(
    'D0.rows',
    d.segments
      .map((s) => `${s.type} ${num(s.heightRatio)} columns ${s.columnRatios.length} divider ${num(s.dividerThickness)} depth ${num(s.panelDepth)} inset ${num(s.panelInset)}`)
      .join(' | '),
  )
  const handles = doorDefinition.handles as unknown as Array<{ kind: string; min?: number }>
  row('D0.arrows.min_width', handles[1]?.min ?? Number.NaN)
  row('D0.arrows.min_height', handles[3]?.min ?? Number.NaN)
  for (const group of doorParametrics.groups) {
    for (const field of group.fields as Array<{ key: string; min: number; max: number; step: number }>) {
      row(`D0.panel.${field.key}`, `${num(field.min)} to ${num(field.max)} step ${num(field.step)}`)
    }
  }
  row('D0.open_angle', DOOR_SWING_OPEN_ANGLE)
  row('D0.toggle_ms', DOOR_TOGGLE_ANIMATION_MS)
  row('D0.sectional_scale', SECTIONAL_GARAGE_RENDER_OPEN_SCALE)
}

title('D1 where it sits: a wall from (1, 2) to (4, 6), 5 m long; a door 0.9 x 2.1')
{
  const wall = WallNode.parse({ id: 'wall_d1', start: [1, 2], end: [4, 6], thickness: 0.2, height: 2.5 })
  const S = { x: 1, y: 2 }
  const E = { x: 4, y: 6 }
  for (const asked of [0.2, 2.5, 4.9]) {
    const got = clampToWall(wall, asked, 0.9, 2.1)
    const mine = placeOnWall(5, asked, 0.9, 2.1)
    row(`D1.place(${asked})`, `along ${num(got.clampedX)} up ${num(got.clampedY)}`)
    row(`D1.place(${asked}).by_equation`, `along ${num(mine.x)} up ${num(mine.y)}`)
  }
  const short = WallNode.parse({ id: 'wall_short', start: [0, 0], end: [0.6, 0] })
  row('D1.place_on_a_0.6_wall(0.3)', `along ${num(clampToWall(short, 0.3, 0.9, 2.1).clampedX)}`)
  row('D1.place_on_a_0.6_wall(0.3).by_equation', `along ${num(placeOnWall(0.6, 0.3, 0.9, 2.1).x)}`)
  row('D1.in_level(2.5, 1.05)', pt(wallLocalToWorld(wall, 2.5, 1.05)))
  row('D1.in_level(2.5, 1.05).by_equation', pt(placeInLevel(S, E, 2.5, 1.05)))
  row('D1.in_level(2.5, 1.05).base_0.15.level_3', pt(wallLocalToWorld(wall, 2.5, 1.05, 3, 0.15)))
  row('D1.in_level(2.5, 1.05).base_0.15.level_3.by_equation', pt(placeInLevel(S, E, 2.5, 1.05, 0.15, 3)))
  row('D1.in_plan(2.5 along, 0.1 out of the front face)', pt(projectWallLocalPointToPlan(wall, 2.5, 0.1)))
  row('D1.in_plan(2.5 along, 0.1 out of the front face).by_equation', pt(placeInPlan(S, E, 2.5, 0.1)))

  // a neighbour already on the wall: a door 1.0 x 2.0 whose middle is 2.5 m along
  const neighbour = door({ id: 'door_neighbour', position: [2.5, 1, 0], width: 1, height: 2 })
  const hosting = { ...wall, children: [neighbour.id] }
  const nodes = { [wall.id]: hosting, [neighbour.id]: neighbour } as never
  const there = faceRect(2.5, 1, 1, 2)
  const tries: Array<[string, number, number, number, number]> = [
    ['1.0 x 2.0 beside it, edges touching', 3.5, 1, 1, 2],
    ['1.0 x 2.0 beside it, 0.25 over', 3.25, 1, 1, 2],
    ['1.0 x 0.5 above it, edges touching', 2.5, 2.25, 1, 0.5],
    ['1.0 x 0.5 above it, 0.25 over', 2.5, 2, 1, 0.5],
  ]
  for (const [name, x, y, w, h] of tries) {
    row(`D1.overlap(${name})`, hasWallChildOverlap(wall.id, nodes, x, y, w, h))
    row(`D1.overlap(${name}).by_equation`, overlap(faceRect(x, y, w, h), there))
  }
}

title('D2 resizing by the arrows: a door 0.9 x 2.1 whose middle is 2.0 m along, handle at 1.05')
{
  const handles = doorDefinition.handles as unknown as Array<{
    apply: (node: Node, value: number) => { width?: number; height?: number; position: number[]; handleHeight?: number }
    max: (node: Node, scene: unknown) => number
  }>
  const wall = WallNode.parse({ id: 'wall_d2', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5 })
  for (const [face, yaw] of [['front', 0], ['back', Math.PI]] as Array<[string, number]>) {
    const d = door({ wallId: wall.id, position: [2, 1.05, 0], rotation: [0, yaw, 0] })
    for (const [arrow, index] of [['left', 1], ['right', 2]] as Array<['left' | 'right', number]>) {
      const got = handles[index]!.apply(d, 1.2)
      const mine = widthResized(plain(d), arrow, 1.2)
      row(`D2.${face}.${arrow}_arrow_to_1.2`, `width ${num(got.width ?? Number.NaN)} along ${num(got.position[0]!)}`)
      row(`D2.${face}.${arrow}_arrow_to_1.2.by_equation`, `width ${num(mine.width)} along ${num(mine.x)}`)
    }
  }
  const d = door({ wallId: wall.id, position: [2, 1.05, 0] })
  for (const height of [2.4, 0.5]) {
    const got = handles[3]!.apply(d, height)
    const mine = heightResized(plain(d), height)
    row(`D2.height_to_${height}`, `height ${num(got.height ?? Number.NaN)} up ${num(got.position[1]!)} handle ${num(got.handleHeight ?? Number.NaN)}`)
    row(`D2.height_to_${height}.by_equation`, `height ${num(mine.height)} up ${num(mine.y)} handle ${num(mine.handleHeight)}`)
  }
  for (const [g, h, h2] of [[2.05, 2.1, 2.1], [1.05, 2.1, 4.2], [1.05, 0, 3]] as Array<[number, number, number]>) {
    row(`D2.handle(${g}, ${h} to ${h2})`, scaleHandleHeight(g, h, h2))
    row(`D2.handle(${g}, ${h} to ${h2}).by_equation`, handleAfterResize(g, h, h2))
  }
  const scene = { get: (id: string) => (id === wall.id ? wall : undefined), nodes: () => ({ [wall.id]: wall }) }
  row('D2.arrows.max_width', handles[2]!.max(d, scene))
  row('D2.arrows.max_height', handles[3]!.max(d, scene))
  // the same wall is 4.0 long: a door whose right edge is at its end, widened by the right arrow
  const last = door({ wallId: wall.id, position: [3.5, 1.05, 0], width: 1 })
  const got = handles[2]!.apply(last, 1.5)
  const mine = widthResized(plain(last), 'right', 1.5)
  row('D2.at_the_wall_end.right_arrow_to_1.5', `width ${num(got.width ?? Number.NaN)} along ${num(got.position[0]!)} right edge ${num(got.position[0]! + (got.width ?? Number.NaN) / 2)}`)
  row('D2.at_the_wall_end.right_arrow_to_1.5.by_equation', `width ${num(mine.width)} along ${num(mine.x)} right edge ${num(mine.x + mine.width / 2)}`)
}

title('D3 the hole of a door 0.9 x 2.1 standing on the base, middle 2.0 m along, in a wall 0.2 thick: each shape')
for (const [name, more] of [
  ['rectangle', {}],
  ['arch', { openingShape: 'arch' }],
  ['rounded', { openingShape: 'rounded' }],
] as Array<[string, Record<string, unknown>]>) {
  const d = door({ position: [2, 1.05, 0], ...more })
  const rect = cutterRect(d)
  const corners = cornersOf(buildOpeningCutoutShape(d, rect))
  const mine = holeOutline(plain(d), 0.2)
  row(`D3.${name}.corners`, corners.length)
  row(`D3.${name}.corners.by_equation`, mine.drawn.length)
  row(`D3.${name}.first_corners`, pts(corners.slice(0, name === 'rectangle' ? 4 : 5)))
  row(`D3.${name}.first_corners.by_equation`, pts(mine.drawn.slice(0, name === 'rectangle' ? 4 : 5)))
  if (name === 'arch') {
    row('D3.arch.corner_18', pt(corners[18]!))
    row('D3.arch.corner_18.by_equation', pt(mine.drawn[18]!))
    row('D3.arch.last_corner', pt(corners[corners.length - 1]!))
    row('D3.arch.last_corner.by_equation', pt(mine.drawn[mine.drawn.length - 1]!))
  }
  if (name === 'rounded') {
    row('D3.rounded.corner_50', pt(corners[50]!))
    row('D3.rounded.corner_50.by_equation', pt(mine.drawn[50]!))
    row('D3.rounded.corner_51', pt(corners[51]!))
    row('D3.rounded.corner_51.by_equation', pt(mine.drawn[51]!))
  }
  row(`D3.${name}.outline_area`, areaOf(corners))
  row(`D3.${name}.outline_area.by_equation`, areaOf(mine.drawn))
  if (name === 'arch') {
    row('D3.arch.outline_area.exact', 0.9 * (1.65 + 0.02) + (Math.PI * 0.45 * 0.45) / 2)
    row('D3.arch.head_share_of_true_half_ellipse', (areaOf(corners) - 0.9 * 1.67) / ((Math.PI * 0.45 * 0.45) / 2))
    row('D3.arch.head_share_of_true_half_ellipse.by_equation', archHeadShare())
  }
  if (name === 'rounded') row('D3.rounded.outline_area.exact', 0.9 * 2.12 - 2 * 0.15 * 0.15 * (1 - Math.PI / 4))
  // the cutter: the outline pushed through twice the wall's thickness
  const cutter = buildOpeningCutoutGeometry(d, rect, 0.4, 0.2)
  const facts = meshFacts(cutter)
  const section = sectionOf(cutter, 0.4)
  row(`D3.${name}.cutter_box`, boxText(facts.min, facts.max))
  row(`D3.${name}.cutter_box.by_equation`, boxOfPoints(mine.cut, 0.2 + mine.growth))
  row(`D3.${name}.cut_corners`, section.length)
  row(`D3.${name}.cut_corners.by_equation`, mine.cut.length)
  row(`D3.${name}.cut_area`, areaOf(section))
  row(`D3.${name}.cut_area.by_equation`, areaOf(mine.cut))
  cutter.dispose()
}

title('D4 the rule that lowers a flat bottom: the bottom edge at -0.1, 0, 0.004, 0.005 and 0.2 over the base')
for (const bottom of [-0.1, 0, 0.004, 0.005, 0.2]) {
  row(`D4.lowered(${bottom})`, getOpeningCutoutBottomPadding(door(), bottom))
  row(`D4.lowered(${bottom}).by_equation`, bottomLowering(bottom))
}
row('D4.flat_bottom', ['rectangle', 'rounded', 'arch'].map((shape) => `${shape} ${hasFlatOpeningCutoutBottom(door({ openingShape: shape }))}`).join(', '))

title('D5 limits of the arch and of the corners: a door 0.9 x 2.1 on the base (the hole is then 2.12 high)')
{
  for (const [name, more] of [
    ['arch_height 0.45', { archHeight: 0.45 }],
    ['arch_height 5', { archHeight: 5 }],
    ['arch_height 0', { archHeight: 0 }],
    ['arch_height 5, door 0.2 up', { archHeight: 5, position: [2, 1.25, 0] }],
  ] as Array<[string, Record<string, unknown>]>) {
    const d = door({ position: [2, 1.05, 0], openingShape: 'arch', ...more })
    const rect = cutterRect(d)
    const mine = holeRect(plain(d))
    row(`D5.rise(${name})`, rect.top - springOf(d))
    row(`D5.rise(${name}).by_equation`, archRise(plain(d).archHeight, mine.right - mine.left, mine.top - mine.bottom))
  }
  const absent = { ...door({ position: [2, 1.05, 0], openingShape: 'arch', width: 1.2 }), archHeight: undefined } as unknown as Node
  row('D5.rise(no arch_height stored, width 1.2)', cutterRect(absent).top - springOf(absent))
  row('D5.rise(no arch_height stored, width 1.2).by_equation', archRise(undefined, 1.2, 2.12))

  for (const [name, more] of [
    ['radius 0.15', { cornerRadius: 0.15 }],
    ['radius 0.6', { cornerRadius: 0.6 }],
    ['each: left 0.6 right 0.6', { openingRadiusMode: 'individual', openingTopRadii: [0.6, 0.6] }],
    ['each: left 0.6 right 0.3', { openingRadiusMode: 'individual', openingTopRadii: [0.6, 0.3] }],
    ['each: left 0.2 right 0', { openingRadiusMode: 'individual', openingTopRadii: [0.2, 0] }],
    ['each: left 3 right 0', { openingRadiusMode: 'individual', openingTopRadii: [3, 0] }],
  ] as Array<[string, Record<string, unknown>]>) {
    const d = door({ position: [2, 1.05, 0], openingShape: 'rounded', ...more })
    const shape = buildOpeningCutoutShape(d, cutterRect(d))
    // the right corner's arc starts at angle 0, the left one's at a quarter turn
    const arcs = shape.curves.filter((curve) => (curve as { isEllipseCurve?: boolean }).isEllipseCurve) as unknown as Array<{ aStartAngle: number; xRadius: number }>
    const left = arcs.find((arc) => arc.aStartAngle > 1)?.xRadius ?? 0
    const right = arcs.find((arc) => arc.aStartAngle < 1)?.xRadius ?? 0
    const mine = topRadii(plain(d), 0.9, 2.12)
    row(`D5.corners(${name})`, `left ${num(left)} right ${num(right)}`)
    row(`D5.corners(${name}).by_equation`, `left ${num(mine.left)} right ${num(mine.right)}`)
  }

  for (const [name, more, thickness] of [
    ['reveal 0.025, wall 0.2, radius 0.15', {}, 0.2],
    ['reveal 0.08, wall 0.2, radius 0.15', { openingRevealRadius: 0.08 }, 0.2],
    ['reveal 0.025, wall 0.05, radius 0.15', {}, 0.05],
    ['reveal 0.025, wall 0.2, radius 0', { cornerRadius: 0 }, 0.2],
    ['reveal 0, wall 0.2, radius 0.15', { openingRevealRadius: 0 }, 0.2],
  ] as Array<[string, Record<string, unknown>, number]>) {
    const d = door({ position: [2, 1.05, 0], openingShape: 'rounded', ...more })
    const rect = cutterRect(d)
    const cutter = buildOpeningCutoutGeometry(d, rect, 2 * thickness, thickness)
    row(`D5.grown_by(${name})`, meshFacts(cutter).max[0] - rect.right)
    row(`D5.grown_by(${name}).by_equation`, revealGrowth(plain(d), thickness))
    cutter.dispose()
  }
}

title('D6 how far open: the open fraction, and what a sectional door makes of it')
{
  for (const value of [-0.2, 0.4, 1.7]) {
    row(`D6.open_fraction(${value})`, clampDoorOperationState(value))
    row(`D6.open_fraction(${value}).by_equation`, openFraction(value))
  }
  row('D6.open_fraction(none)', clampDoorOperationState(undefined))
  row('D6.open_fraction(none).by_equation', openFraction(undefined))
  for (const [type, values] of [['garage-sectional', [0.5, 0.88, 1]], ['garage-rollup', [0.5]]] as Array<['garage-sectional' | 'garage-rollup', number[]]>) {
    for (const value of values) {
      row(`D6.${type}.drawn_open(${value})`, getDoorRenderOpenAmount(type, value))
      row(`D6.${type}.drawn_open(${value}).by_equation`, drawnOpen(type, value))
      row(`D6.${type}.clear_opening(${value})`, getGarageVisibleOpeningRatio(type, value))
      row(`D6.${type}.clear_opening(${value}).by_equation`, clearOpening(type, value))
    }
  }
  const types = ['hinged', 'double', 'french', 'folding', 'pocket', 'barn', 'sliding', 'garage-sectional', 'garage-rollup', 'garage-tiltup']
  row('D6.types_that_use_the_open_fraction', types.filter((type) => isOperationDoorType(type)).join(' '))
  row('D6.types_that_use_the_open_fraction.by_equation', types.filter((type) => SLIDES_OR_FOLDS.includes(type)).join(' '))
}

title('D7 a press (which number moves, and to where) and the way there at progress 0, 0.25, 0.5, 1')
{
  let clock: THREE.Clock | null = null
  const Grab = () => {
    clock = useThree((state) => state.clock)
    return null
  }
  const renderer = await ReactThreeTestRenderer.create(
    createElement(Fragment, null, createElement(Grab), createElement(DoorAnimationSystem)),
  )
  let seconds = 100
  ;(clock as unknown as { getElapsedTime: () => number }).getElapsedTime = () => seconds

  const cases: Array<[string, Record<string, unknown>]> = [
    ['hinged_shut_all_the_way', { doorType: 'hinged', swingAngle: 0 }],
    ['hinged_0.7_rad_open', { doorType: 'hinged', swingAngle: 0.7 }],
    ['hinged_0.8_rad_open', { doorType: 'hinged', swingAngle: 0.8 }],
    ['sliding_0.3_open_all_the_way', { doorType: 'sliding', operationState: 0.3 }],
    ['sliding_0.5_open', { doorType: 'sliding', operationState: 0.5 }],
  ]
  for (const [name, more] of cases) {
    const d = door({ id: `door_${name}`, ...more })
    const id = d.id as never
    useScene.setState({ nodes: { [d.id]: d } as never })
    toggleDoorOpenState(id, { persist: false })
    const queued = useInteractive.getState().doorAnimations[id]!
    const shown = queued.field === 'swingAngle' ? d.swingAngle : d.operationState
    const mine = toggle(d.doorType, shown)
    row(`D7.${name}.press`, `${queued.field} from ${num(queued.from)} to ${num(queued.to)} in ${queued.durationMs} ms`)
    row(`D7.${name}.press.by_equation`, `${mine.field} from ${num(mine.from)} to ${num(mine.to)} in ${mine.ms} ms`)
    if (!name.endsWith('_way')) {
      // the press alone: which number moves and to where
      useInteractive.getState().cancelDoorAnimation(id)
      continue
    }
    seconds += 1
    const began = seconds // the first frame notes this as the start
    for (const progress of [0, 0.25, 0.5, 1]) {
      // the last frame a thousandth of a millisecond late, so that rounding cannot leave it short of the end
      seconds = began + (progress * queued.durationMs + (progress === 1 ? 0.001 : 0)) / 1000
      await renderer.advanceFrames(1, 0.016)
      const value = useInteractive.getState().doors[id]?.[queued.field] ?? Number.NaN
      row(`D7.${name}.at(${progress})`, value)
      row(`D7.${name}.at(${progress}).by_equation`, tween(mine.from, mine.to, progress * mine.ms, mine.ms))
    }
    row(`D7.${name}.still_moving_after`, Boolean(useInteractive.getState().doorAnimations[id]))
    useInteractive.getState().removeDoorOpenState(id)
  }
  await renderer.unmount()
}
