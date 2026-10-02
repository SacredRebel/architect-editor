// Reference cases for the stair's body (port note entry 7): what the old editor's own stair
// renderer and stair system build, read back from the meshes, and the same numbers from the
// note's equations.
// cd packages/viewer && bun ../../ports/refcases/07-stair-body.ts
//
// The old editor builds a stair in two places: the straight body in the viewer's StairSystem
// (once a frame), the curved and spiral bodies and every railing in the stair's renderer. Both
// are run here as the old editor's own tests run a system: without a window, through
// @react-three/test-renderer. Nothing of the old editor is changed or copied.
import {
  type AnyNode,
  type AnyNodeId,
  LevelNode,
  StairNode,
  StairSegmentNode,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { create } from '@react-three/test-renderer'
import { createElement } from 'react'
import * as THREE from 'three'
import { StairRenderer } from '../../packages/nodes/src/stair/renderer'
import { StairSystem } from '../../packages/viewer/src/systems/stair/stair-system'
import { meshFacts } from './_mesh'
import { num, pt, row, title } from './_print'
import {
  type Arc,
  arcOf,
  arcRail,
  arcTread,
  arcVolume,
  bodyPoints,
  box3Of,
  chordsOf,
  midRailOf,
  onArc,
  type Part,
  railsOf,
  soffitDrop,
  spiralExtras,
  type Standing,
  toPlan,
  treadOf,
  type V3,
  volumeOf,
  wedgePoints,
} from './_stair-equations'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Stair = ReturnType<typeof StairNode.parse>
const STAIR = 'stair_a'
const LEVEL = 'level_a'

const flight = (more: Partial<Part> = {}): Part => ({
  flight: true, width: 1, length: 3, height: 2.5, steps: 10, side: 'front', filled: true, thickness: 0.25, ...more,
})
const landing = (more: Partial<Part> = {}): Part => ({
  flight: false, width: 1, length: 1, height: 0, steps: 0, side: 'front', filled: true, thickness: 0.32, ...more,
})
// the L stair of the note: a flight, a landing in front of it, a flight on the landing's left
const lStair: Part[] = [
  flight({ length: 1.5, height: 1.35, steps: 5 }),
  landing(),
  flight({ length: 1.5, height: 1.35, steps: 5, side: 'left' }),
]

// the stair in a storey of 2.7 m, drawn by the old editor's renderer and built by its system
async function built(stairFields: Record<string, unknown>, parts: Part[] = []) {
  const segments = parts.map((part, i) =>
    StairSegmentNode.parse({
      id: `sseg_${i}`,
      parentId: STAIR,
      segmentType: part.flight ? 'stair' : 'landing',
      width: part.width,
      length: part.length,
      height: part.height,
      stepCount: part.steps,
      attachmentSide: part.side,
      fillToFloor: part.filled,
      thickness: part.thickness,
      visible: !part.hidden,
    }),
  )
  const stair = StairNode.parse({ id: STAIR, parentId: LEVEL, children: segments.map((segment) => segment.id), ...stairFields })
  const level = LevelNode.parse({ id: LEVEL, level: 0, height: 2.7, children: [stair.id] })
  const nodes = Object.fromEntries([level, stair, ...segments].map((node) => [node.id, node])) as Record<AnyNodeId, AnyNode>
  useScene.setState({ nodes, rootNodeIds: [level.id as AnyNodeId] })
  const renderer = await create(
    createElement('group', null, createElement(StairRenderer, { node: stair }), createElement(StairSystem)),
  )
  await renderer.advanceFrames(2, 1 / 60)
  const group = sceneRegistry.nodes.get(stair.id) as THREE.Group
  ;(renderer.scene.instance as THREE.Object3D).updateMatrixWorld(true)
  const done = async () => {
    await renderer.unmount()
    sceneRegistry.clear()
    useScene.setState({ nodes: {} as Record<AnyNodeId, AnyNode>, rootNodeIds: [] })
  }
  return { stair, group, done }
}
const standing = (stair: Stair): Standing => ({ P: { x: stair.position[0], y: stair.position[2] }, rho: stair.rotation })

const boxText = (min: readonly number[], max: readonly number[]) =>
  `x ${num(min[0]!)}..${num(max[0]!)} y ${num(min[1]!)}..${num(max[1]!)} z ${num(min[2]!)}..${num(max[2]!)}`
const meshesUnder = (root: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh)
  })
  return meshes
}
// meshes read back: their triangles, what they enclose, their box in the level's frame
function summed(meshes: THREE.Mesh[]) {
  let triangles = 0
  let volume = 0
  const corners: V3[] = []
  for (const mesh of meshes) {
    const own = meshFacts(mesh.geometry)
    triangles += own.triangles
    volume += own.volume
    const placed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    const inLevel = meshFacts(placed)
    corners.push(inLevel.min, inLevel.max)
    placed.dispose()
  }
  return { triangles, volume, box: box3Of(corners) }
}
function facts(key: string, meshes: THREE.Mesh[], volume: number, points: V3[], brief = false) {
  const f = summed(meshes)
  if (!brief) row(`${key}.triangles`, f.triangles)
  row(`${key}.volume`, f.volume)
  row(`${key}.volume.by_equation`, volume)
  row(`${key}.box`, boxText(f.box.min, f.box.max))
  const mine = box3Of(points)
  row(`${key}.box.by_equation`, boxText(mine.min, mine.max))
}

// the treads of a straight body: the triangles the old editor itself marks as tread (its first
// material group), by their height
function treadsOf(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute('position')
  const levels = new Map<string, { height: number; from: number; to: number }>()
  for (const group of mesh.geometry.groups) {
    if (group.materialIndex !== 0) continue
    for (let i = group.start; i < group.start + group.count; i += 1) {
      const height = position.getY(i)
      const s = position.getZ(i)
      const key = height.toFixed(5)
      const level = levels.get(key) ?? { height, from: s, to: s }
      level.from = Math.min(level.from, s)
      level.to = Math.max(level.to, s)
      levels.set(key, level)
    }
  }
  return [...levels.values()].sort((a, b) => a.height - b.height)
}
const treadText = (t: { from: number; to: number; height: number }) => `run ${num(t.from)}..${num(t.to)} height ${num(t.height)}`
const merged = (group: THREE.Group) => group.getObjectByName('merged-stair') as THREE.Mesh

// ------------------------------------------------------------------ straight bodies
async function oneFlight(key: string, part: Part, show: number[], brief = false) {
  const { stair, group, done } = await built({}, [part])
  const treads = treadsOf(merged(group))
  row(`${key}.treads`, treads.length)
  row(`${key}.treads.by_equation`, part.steps)
  for (const k of show) {
    row(`${key}.tread(${k})`, treadText(treads[k - 1]!))
    row(`${key}.tread(${k}).by_equation`, treadText(treadOf(part, k)))
  }
  if (brief) {
    row(`${key}.volume`, summed([merged(group)]).volume)
    row(`${key}.volume.by_equation`, volumeOf([part]))
  } else facts(key, [merged(group)], volumeOf([part]), bodyPoints([part], standing(stair)))
  await done()
}

title('B1 the default flight on a storey of 2.7 m: 1.0 wide, 3.0 long, 10 steps, filled to the floor')
await oneFlight('B1', flight({ height: 2.7 }), [1, 2, 10])

title('B2 the same flight rising 3.0 m, rising 2.75 m, and rising 2.6 m in 15 steps')
await oneFlight('B2.rise_3.0', flight({ height: 3.0 }), [1, 10], true)
await oneFlight('B2.rise_2.75', flight({ height: 2.75 }), [1, 10], true)
await oneFlight('B2.rise_2.6_in_15_steps', flight({ height: 2.6, steps: 15 }), [1, 15], true)

title('B3 the flight of B1 with a soffit 0.25 thick instead of a filling')
{
  const part = flight({ height: 2.7, filled: false })
  const { stair, group, done } = await built({}, [part])
  const position = merged(group).geometry.getAttribute('position')
  let headLow = Number.POSITIVE_INFINITY
  let footFar = 0
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(position.getZ(i) - part.length) < 1e-6) headLow = Math.min(headLow, position.getY(i))
    if (Math.abs(position.getY(i)) < 1e-6) footFar = Math.max(footFar, position.getZ(i))
  }
  row('B3.underside', `from run ${num(part.length)} height ${num(headLow)} down to run ${num(footFar)} height ${num(0)}`)
  row('B3.underside.by_equation', `from run ${num(part.length)} height ${num(part.height - soffitDrop(part))} down to run ${num((part.length * soffitDrop(part)) / part.height)} height ${num(0)}`)
  facts('B3', [merged(group)], volumeOf([part]), bodyPoints([part], standing(stair)))
  await done()
}

title('B4 the L stair (a flight 1.5 long rising 1.35 in 5 steps, a landing 1.0 by 1.0, a flight on its left), filled')
{
  const { stair, group, done } = await built({}, lStair)
  facts('B4', [merged(group)], volumeOf(lStair), bodyPoints(lStair, standing(stair)))
  await done()
  const turned = await built({ position: [2, 0, 1], rotation: Math.PI / 2 }, lStair)
  facts('B4.at_(2,1)_turned_a_quarter', [merged(turned.group)], volumeOf(lStair), bodyPoints(lStair, standing(turned.stair)), true)
  await turned.done()
  const lifted = await built({ position: [0, 0.2, 0] }, lStair)
  facts('B4.lifted_0.2', [merged(lifted.group)], volumeOf(lStair), bodyPoints(lStair, standing(lifted.stair), 0.2), true)
  await lifted.done()
}

title('B5 the same L stair with soffits: flights 0.25 thick, the landing 0.32 thick; then the flight of B3 after a landing 0.2 thick')
{
  const open = lStair.map((part) => ({ ...part, filled: false }))
  const { stair, group, done } = await built({}, open)
  facts('B5', [merged(group)], volumeOf(open), bodyPoints(open, standing(stair)))
  await done()
  // whether a flight's soffit runs to the floor is decided by its start height being 0 exactly:
  // the flight of B3 after a landing 0.2 thick that lies on the floor, then after one 0.001 high
  for (const [name, height] of [['flight_of_B3_after_a_landing_at_the_floor', 0], ['flight_of_B3_after_a_landing_0.001_high', 0.001]] as const) {
    const parts = [landing({ filled: false, height, thickness: 0.2 }), flight({ height: 2.7, filled: false })]
    const made = await built({}, parts)
    facts(`B5.${name}`, [merged(made.group)], volumeOf(parts), bodyPoints(parts, standing(made.stair)), true)
    await made.done()
  }
}

title('B6 a straight stair with no part of its own, and the L stair with its landing hidden')
{
  const bare = await built({ railingMode: 'both' })
  const stood = flight({ height: 2.7 })
  facts('B6.no_parts', [merged(bare.group)], volumeOf([stood]), bodyPoints([stood], standing(bare.stair)))
  row('B6.no_parts.railing_posts', meshesUnder(bare.group).filter((mesh) => mesh.name === 'stair-railing-baluster').length)
  await bare.done()
  const hidden = lStair.map((part, i) => (i === 1 ? { ...part, hidden: true } : part))
  const made = await built({ railingMode: 'left' }, hidden)
  facts('B6.landing_hidden', [merged(made.group)], volumeOf(hidden), bodyPoints(hidden, standing(made.stair)))
  const rails = railsBuilt(made.group).rails
  row('B6.landing_hidden.rail_of_the_second_flight_starts_at', pt(rails[rails.length - 1]!.posts[0]!))
  const mine = railsOf(hidden, 'left')
  row('B6.landing_hidden.rail_of_the_second_flight_starts_at.by_equation', pt(mine[mine.length - 1]!.posts[0]!))
  await made.done()
}

// ------------------------------------------------------------------ curved and spiral bodies
const arcFields = (a: Arc, more: Record<string, unknown> = {}) => ({
  stairType: a.spiral ? 'spiral' : 'curved',
  innerRadius: a.innerRadius,
  width: a.width,
  sweepAngle: a.sweep,
  stepCount: a.stepCount,
  thickness: a.thickness,
  fillToFloor: a.filled,
  totalRise: a.rise,
  showCenterColumn: a.column !== false,
  showStepSupports: a.supports !== false,
  topLandingMode: a.landingDepth === undefined ? 'none' : 'integrated',
  ...(a.landingDepth === undefined ? {} : { topLandingDepth: a.landingDepth }),
  ...more,
})
// a tread as the old editor built it: the two ends of its inner rim, its outer radius, its
// underside and its top, in the stair's frame
function treadFromMesh(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute('position')
  const chords = (position.count / 3 - 4) / 8
  const baseY = (mesh.parent?.position.y ?? 0) + mesh.position.y
  let outer = 0
  let top = Number.NEGATIVE_INFINITY
  let bottom = Number.POSITIVE_INFINITY
  for (let i = 0; i < position.count; i += 1) {
    outer = Math.max(outer, Math.hypot(position.getX(i), position.getZ(i)))
    top = Math.max(top, position.getY(i))
    bottom = Math.min(bottom, position.getY(i))
  }
  const start = chords * 24 // the first corner of the face that closes the tread's lower end
  const end = start + 6 // and of the one that closes its upper end
  return {
    chords,
    from: [position.getX(start), position.getZ(start)] as [number, number],
    to: [position.getX(end), position.getZ(end)] as [number, number],
    outer,
    bottom: baseY + bottom,
    top: baseY + top,
  }
}
const arcTreadText = (t: { from: readonly number[]; to: readonly number[]; outer: number; bottom: number; top: number }) =>
  `inner rim ${pt(t.from)} to ${pt(t.to)} outer radius ${num(t.outer)} from height ${num(t.bottom)} to ${num(t.top)}`
function myArcTread(a: Arc, k: number) {
  const { ri, ro } = arcOf(a)
  const tread = arcTread(a, k)
  const from = onArc(ri, tread.from)
  const to = onArc(ri, tread.to)
  return { from: [from.x, from.y], to: [to.x, to.y], outer: ro, bottom: tread.bottom, top: tread.top }
}
// every corner of a curved or spiral body, in the level's frame
function arcPoints(a: Arc, stair: Standing): V3[] {
  const { N, H, ri, ro, delta, th } = arcOf(a)
  const points: V3[] = []
  for (let k = 0; k < N; k += 1) {
    const tread = arcTread(a, k)
    points.push(...wedgePoints(ri, ro, tread.from, delta, tread.bottom, tread.top))
  }
  if (a.spiral) {
    const extras = spiralExtras(a)
    if (a.column !== false) points.push([0, 0, 0], [0, H + th, 0])
    if (extras.landing) {
      points.push(...wedgePoints(ri, ro, extras.landing.from, extras.landing.sweep, extras.landing.bottom, extras.landing.bottom + extras.landing.thickness))
    }
  }
  return points.map(([x, y, z]) => {
    const plan = toPlan(stair, x, z)
    return [plan.x, y, plan.y]
  })
}
const treadMeshes = (body: THREE.Object3D) =>
  body.children.filter((child) => child.type === 'Group').map((step) => step.children.find((child) => child.name === '') as THREE.Mesh)

async function arcBody(key: string, a: Arc, show: number[], o: { more?: Record<string, unknown>; brief?: boolean } = {}) {
  const { stair, group, done } = await built(arcFields(a, o.more))
  const body = group.getObjectByName(a.spiral ? 'spiral-stair' : 'curved-stair') as THREE.Object3D
  const steps = treadMeshes(body)
  const { N, ri, ro, delta } = arcOf(a)
  if (!o.brief) {
    row(`${key}.treads`, steps.length)
    row(`${key}.treads.by_equation`, N)
    row(`${key}.straight_pieces_per_tread`, treadFromMesh(steps[0]!).chords)
    row(`${key}.straight_pieces_per_tread.by_equation`, chordsOf(delta, ri, ro))
  }
  for (const k of show) {
    row(`${key}.tread(${k})`, arcTreadText(treadFromMesh(steps[k]!)))
    row(`${key}.tread(${k}).by_equation`, arcTreadText(myArcTread(a, k)))
  }
  facts(key, meshesUnder(body), arcVolume(a), arcPoints(a, standing(stair)), o.brief)
  row(`${key}.volume.exact`, arcVolume(a, true))
  return { stair, group, body, done }
}

const curved: Arc = { spiral: false, innerRadius: 0.9, width: 1, sweep: Math.PI / 2, stepCount: 10, thickness: 0.25, filled: true, rise: 2.7 }

title('B7 a curved stair: inner radius 0.9, width 1.0, sweep a quarter turn, 10 steps, rise 2.7, filled')
{
  const made = await arcBody('B7', curved, [0, 1, 9])
  row('B7.straight_body_mesh', (made.group.getObjectByName('merged-stair') as THREE.Mesh | undefined) ? 'there' : 'none')
  await made.done()
  await (await arcBody('B7.at_(2,1)_turned_a_quarter', curved, [], { more: { position: [2, 0, 1], rotation: Math.PI / 2 }, brief: true })).done()
}

title('B8 the same curved stair not filled (treads 0.25 thick, then 0.3), sweeping the other way, at its least numbers (inner radius 0.1, width 0.3, 1.4 steps, rise 0.05, thickness 0.01), and 8 wide')
await (await arcBody('B8.thick_0.25', { ...curved, filled: false }, [0, 1, 9], { brief: true })).done()
await (await arcBody('B8.thick_0.3', { ...curved, filled: false, thickness: 0.3 }, [0, 1], { brief: true })).done()
await (await arcBody('B8.sweep_the_other_way', { ...curved, sweep: -Math.PI / 2 }, [0, 9], { brief: true })).done()
await (await arcBody('B8.least', { ...curved, innerRadius: 0.1, width: 0.3, stepCount: 1.4, rise: 0.05, thickness: 0.01 }, [0, 1])).done()
{
  // a tread is never built from more than 24 straight pieces
  const wide = { ...curved, width: 8 }
  const { group, done } = await built(arcFields(wide))
  const steps = treadMeshes(group.getObjectByName('curved-stair') as THREE.Object3D)
  row('B8.width_8.straight_pieces_per_tread', treadFromMesh(steps[0]!).chords)
  row('B8.width_8.straight_pieces_per_tread.by_equation', chordsOf(arcOf(wide).delta, arcOf(wide).ri, arcOf(wide).ro))
  await done()
}

const spiral: Arc = { spiral: true, innerRadius: 0.3, width: 1, sweep: (400 * Math.PI) / 180, stepCount: 16, thickness: 0.25, filled: true, rise: 2.7, landingDepth: 0.9 }

// what a spiral has more than a curved stair: its column, the support under tread 1, its landing
function spiralLines(key: string, a: Arc, body: THREE.Object3D) {
  const extras = spiralExtras(a)
  const column = body.children[0] as THREE.Mesh
  const columnShape = (column.geometry as THREE.CylinderGeometry).parameters
  row(`${key}.column`, `radius ${num(columnShape.radiusTop)} sides ${num(columnShape.radialSegments)} from height ${num(column.position.y - columnShape.height / 2)} to ${num(column.position.y + columnShape.height / 2)} volume ${num(meshFacts(column.geometry).volume)}`)
  row(`${key}.column.by_equation`, `radius ${num(extras.column.radius)} sides ${num(10)} from height ${num(0)} to ${num(extras.column.height)} volume ${num(extras.column.volume)}`)
  const stepGroup = body.children.filter((child) => child.type === 'Group')[1]!
  const support = stepGroup.children.find((child) => child.name === 'stair-side') as THREE.Mesh
  const box = (support.geometry as THREE.BoxGeometry).parameters
  row(`${key}.support(1)`, `size ${pt([box.width, box.height, box.depth])} middle ${pt([support.position.x, stepGroup.position.y + support.position.y, support.position.z])} turned ${num(support.rotation.y)}`)
  const middle = (arcTread(a, 1).from + arcTread(a, 1).to) / 2
  const at = onArc(extras.support.radius, middle)
  row(`${key}.support(1).by_equation`, `size ${pt(extras.support.size)} middle ${pt([at.x, arcTread(a, 1).bottom + extras.support.size[1] / 2, at.y])} turned ${num(-middle)}`)
  row(`${key}.top_landing`, arcTreadText(treadFromMesh(body.children[body.children.length - 1] as THREE.Mesh)))
  const lo = onArc(arcOf(a).ri, extras.landing!.from)
  const hi = onArc(arcOf(a).ri, extras.landing!.from + extras.landing!.sweep)
  row(`${key}.top_landing.by_equation`, arcTreadText({ from: [lo.x, lo.y], to: [hi.x, hi.y], outer: extras.ro, bottom: extras.landing!.bottom, top: extras.landing!.bottom + extras.landing!.thickness }))
}

title('B9 a spiral stair: inner radius 0.3, width 1.0, sweep 400 degrees, 16 steps, rise 2.7, treads 0.25 thick, a top landing 0.9 deep')
{
  const { body, done } = await arcBody('B9', spiral, [0, 1, 15])
  spiralLines('B9', spiral, body)
  await done()
  // treads as thick as one riser, no column, no supports, no landing: the top tread meets the rise
  await (await arcBody('B9.treads_one_riser_thick_and_bare', { ...spiral, column: false, supports: false, landingDepth: undefined, thickness: 0.16875 }, [0, 15], { brief: true })).done()
  // its least numbers, sweeping the other way: inner radius 0.01, width 0.3, treads 0.01 thick,
  // 3 steps over half a turn, rise 0.6, a landing asked 5 deep
  const least: Arc = { spiral: true, innerRadius: 0.01, width: 0.3, sweep: -Math.PI, stepCount: 3, thickness: 0.01, filled: true, rise: 0.6, landingDepth: 5 }
  const small = await arcBody('B9.least', least, [0, 2], { brief: true })
  spiralLines('B9.least', least, small.body)
  await small.done()
}

// ------------------------------------------------------------------ railings
// the posts the old editor set up, rail by rail: the foot of each in the level's frame
function railsBuilt(group: THREE.Group) {
  const railing = group.getObjectByName('stair-railing')
  const rails: Array<{ part: number; posts: V3[]; height: number; radius: number }> = []
  const bars: Array<{ radius: number; from: V3; to: V3 }> = []
  const ties: Array<{ radius: number; from: V3; to: V3 }> = []
  if (!railing) return { rails, bars, ties }
  const world = new THREE.Vector3()
  const barOf = (mesh: THREE.Mesh) => {
    const middle = mesh.getWorldPosition(new THREE.Vector3())
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(mesh.scale.y / 2)
    const a = middle.clone().sub(axis)
    const b = middle.clone().add(axis)
    return { radius: mesh.scale.x, from: [a.x, a.y, a.z] as V3, to: [b.x, b.y, b.z] as V3 }
  }
  const sideGroup = (side: THREE.Object3D, part: number) => {
    const posts = side.children.filter((child) => child.name === 'stair-railing-baluster') as THREE.Mesh[]
    rails.push({
      part,
      posts: posts.map((post) => {
        post.getWorldPosition(world)
        return [world.x, world.y - post.scale.y / 2, world.z] as V3
      }),
      height: posts[0]?.scale.y ?? 0,
      radius: posts[0]?.scale.x ?? 0,
    })
    for (const mesh of meshesUnder(side)) if (mesh.name === 'stair-railing-rail') bars.push(barOf(mesh))
  }
  railing.children.forEach((child, i) => {
    if (child.children.some((entry) => entry.name === 'stair-railing-baluster')) sideGroup(child, 0) // a curved stair: one group a side
    else if (child.children.length > 0 && child.children.every((entry) => (entry as THREE.Mesh).isMesh)) {
      for (const mesh of child.children as THREE.Mesh[]) ties.push(barOf(mesh)) // a tie between two flights
    } else for (const side of child.children) sideGroup(side, i)
  })
  return { rails, bars, ties }
}
const countsText = (rails: Array<{ part: number; posts: V3[] }>) => rails.map((rail) => `${rail.part}:${rail.posts.length}`).join(' ') || 'none'
const postsText = (posts: V3[]) => posts.map((post) => pt(post)).join(' ')
const lift = (p: V3, by: number): V3 => [p[0], p[1] + by, p[2]]
const landingsText = (parts: Part[], rails: Array<{ part: number; posts: V3[] }>) =>
  rails.filter((rail) => !parts.filter((part) => !part.hidden)[rail.part]!.flight).map((rail) => `${rail.part}: ${postsText(rail.posts)}`).join(' | ') || 'none'

title('B10 railings of straight stairs, 0.92 high: the foot of each post in the stair, as part:posts for each rail')
{
  const part = flight({ height: 2.7 })
  const { group, done } = await built({ railingMode: 'both' }, [part])
  const made = railsBuilt(group)
  const mine = railsOf([part], 'both')
  row('B10.flight.rails', countsText(made.rails))
  row('B10.flight.rails.by_equation', countsText(mine))
  row('B10.flight.left.first_three', postsText(made.rails[0]!.posts.slice(0, 3)))
  row('B10.flight.left.first_three.by_equation', postsText(mine[0]!.posts.slice(0, 3)))
  row('B10.flight.left.last_two', postsText(made.rails[0]!.posts.slice(-2)))
  row('B10.flight.left.last_two.by_equation', postsText(mine[0]!.posts.slice(-2)))
  row('B10.flight.right.first', postsText(made.rails[1]!.posts.slice(0, 1)))
  row('B10.flight.right.first.by_equation', postsText(mine[1]!.posts.slice(0, 1)))
  row('B10.flight.post', `height ${num(made.rails[0]!.height)} radius ${num(made.rails[0]!.radius)}`)
  const upper = made.bars[2]!
  const lower = made.bars[3]!
  const feet = mine[0]!.posts
  row('B10.flight.bars_between_posts_1_and_2', `top radius ${num(upper.radius)} from ${pt(upper.from)} to ${pt(upper.to)} mid radius ${num(lower.radius)} from ${pt(lower.from)} to ${pt(lower.to)}`)
  row('B10.flight.bars_between_posts_1_and_2.by_equation', `top radius ${num(0.022)} from ${pt(lift(feet[1]!, 0.92))} to ${pt(lift(feet[2]!, 0.92))} mid radius ${num(0.022 * 0.8)} from ${pt(lift(feet[1]!, midRailOf(0.92)))} to ${pt(lift(feet[2]!, midRailOf(0.92)))}`)
  row('B10.flight.bars', made.bars.length)
  row('B10.flight.bars.by_equation', mine.reduce((sum, rail) => sum + 2 * (rail.posts.length - 1), 0))
  await done()

  for (const mode of ['both', 'left', 'right'] as const) {
    const l = await built({ railingMode: mode }, lStair)
    const lMade = railsBuilt(l.group)
    const lMine = railsOf(lStair, mode)
    row(`B10.l_stair.${mode}.rails`, countsText(lMade.rails))
    row(`B10.l_stair.${mode}.rails.by_equation`, countsText(lMine))
    row(`B10.l_stair.${mode}.landing`, landingsText(lStair, lMade.rails))
    row(`B10.l_stair.${mode}.landing.by_equation`, landingsText(lStair, lMine))
    if (mode === 'both') {
      row('B10.l_stair.both.second_flight.left', postsText(lMade.rails[4]!.posts))
      row('B10.l_stair.both.second_flight.left.by_equation', postsText(lMine[4]!.posts))
    }
    await l.done()
  }

  const variants: Array<[string, Part[]]> = [
    ['B10.second_flight_on_the_right', [lStair[0]!, lStair[1]!, { ...lStair[2]!, side: 'right' }]],
    ['B10.landing_last', [lStair[0]!, landing()]],
    ['B10.u_stair', [lStair[0]!, landing(), landing({ side: 'left' }), flight({ length: 1.5, height: 1.35, steps: 5, side: 'left' })]],
    ['B10.landing_on_the_left_side_of_a_flight', [lStair[0]!, landing({ side: 'left' }), flight({ length: 1.5, height: 1.35, steps: 5, side: 'left' })]],
  ]
  for (const [key, parts] of variants) {
    const made2 = await built({ railingMode: 'both' }, parts)
    row(`${key}.landings`, landingsText(parts, railsBuilt(made2.group).rails))
    row(`${key}.landings.by_equation`, landingsText(parts, railsOf(parts, 'both')))
    await made2.done()
  }

  // two flights one after the other: the rails of the second are tied to those of the first
  const two = [flight({ length: 1.5, height: 1.35, steps: 5 }), flight({ length: 1.5, height: 1.35, steps: 5 })]
  const tied = await built({ railingMode: 'both' }, two)
  const tiedMade = railsBuilt(tied.group)
  const tiedMine = railsOf(two, 'both')
  row('B10.two_flights.ties', tiedMade.ties.length)
  row('B10.two_flights.first_tie', `from ${pt(tiedMade.ties[0]!.from)} to ${pt(tiedMade.ties[0]!.to)}`)
  const lastOfFirst = tiedMine[0]!.posts[tiedMine[0]!.posts.length - 1]!
  const firstOfSecond = tiedMine[2]!.posts[0]!
  row('B10.two_flights.first_tie.by_equation', `from ${pt(lift(lastOfFirst, 0.92))} to ${pt(lift(firstOfSecond, 0.92))}`)
  await tied.done()
  const landed = await built({ railingMode: 'both' }, lStair)
  row('B10.l_stair.ties', railsBuilt(landed.group).ties.length)
  await landed.done()
}

title('B11 railings of the curved stair of B7 and of the spiral stair of B9')
for (const [key, a] of [['B11.curved', curved], ['B11.curved_sweeping_the_other_way', { ...curved, sweep: -Math.PI / 2 }], ['B11.spiral', spiral]] as Array<[string, Arc]>) {
  for (const mode of ['left', 'right'] as const) {
    const { group, done } = await built(arcFields(a, { railingMode: mode }))
    const rail = railsBuilt(group).rails[0]!
    const mine = arcRail(a, mode)
    const say = (posts: V3[]) => `posts ${num(posts.length)} radius ${num(Math.hypot(posts[0]![0], posts[0]![2]))} first ${pt(posts[0]!)} last ${pt(posts[posts.length - 1]!)}`
    row(`${key}.${mode}`, say(rail.posts))
    row(`${key}.${mode}.by_equation`, say(mine))
    await done()
  }
}
