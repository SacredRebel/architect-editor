// Reference cases for the door's bodies (port note entry 3): the wall with the hole cut out,
// by the old editor's own wall builder; the door itself (frame, threshold, leaf, hardware) and
// the poses of its moving parts, by the old editor's own door builder.
// cd packages/viewer && bun ../../ports/refcases/03-door-body.ts
//
// A line `K` is what the old editor's code builds; a line `K.by_equation` is the same thing
// from the port note's equations alone (_door-equations.ts and, for a wall's prism,
// _wall-equations.ts); `K.exact` is the true value where the old editor draws a curve as chords.
import {
  calculateLevelMiters,
  DoorNode,
  sceneRegistry,
  useInteractive,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import * as THREE from 'three'
import { buildDoorPreviewMesh, poseDoorMovingParts } from '../../packages/viewer/src/systems/door/door-system'
import { generateExtrudedWall } from '../../packages/viewer/src/systems/wall/wall-system'
import {
  archFrame,
  areaOf,
  barnDoor,
  type Box,
  type Door,
  faceRect,
  foldingDoor,
  frameBoxes,
  freeEdge,
  holeVolume,
  inWallFrame,
  LEAF_DEPTH,
  leafBox,
  type LeafPlace,
  lengths,
  plainDoor,
  pocketDoor,
  rollupDoor,
  roundedFrameArea,
  sectionalDoor,
  shapedLeaf,
  shapedPieces,
  slidingDoor,
  swingDoorBoxes,
  swingLeaves,
  tiltupDoor,
  type V3,
} from './_door-equations'
import { meshFacts, polygonArea } from './_mesh'
import { num, pt, row, title } from './_print'
import { footprintOf, mitresOf, plain as plainWall } from './_wall-equations'

type Node = ReturnType<typeof DoorNode.parse>
const door = (more: Record<string, unknown> = {}): Node => DoorNode.parse({ id: 'door_case', ...more })
const plain = (node: unknown): Door => plainDoor(node as Record<string, unknown>)

// ------------------------------------------------------------------ the wall with its holes

// the cutters are only made when the wall's mesh is known to the scene, as it is in the running editor
function withRegistered<T>(wallId: string, run: () => T): T {
  const mesh = new THREE.Mesh()
  sceneRegistry.nodes.set(wallId, mesh)
  try {
    return run()
  } finally {
    sceneRegistry.nodes.delete(wallId)
    mesh.geometry.dispose()
  }
}

// `floor`: the height the wall's own base stands at; `base`: the height its body goes down to
type WallCase = { thickness?: number; height?: number; curveOffset?: number; base?: number; floor?: number }
function wallOf(id: string, more: WallCase = {}) {
  return WallNode.parse({
    id,
    start: [0, 0],
    end: [4, 0],
    thickness: more.thickness ?? 0.2,
    height: more.height ?? 2.5,
    curveOffset: more.curveOffset,
  })
}
// the old editor: the wall's mesh with these children cut out
function cut(key: string, children: unknown[], more: WallCase = {}, register = true) {
  const wall = wallOf(`wall_${key.replace(/\W/g, '_')}`, more)
  const floor = more.floor ?? 0
  const base = more.base ?? floor
  const build = () =>
    generateExtrudedWall(wall, children as never, calculateLevelMiters([wall]), floor, base, [{ start: 0, end: 1, elevation: base }])
  const geometry = register ? withRegistered(wall.id, build) : build()
  const facts = meshFacts(geometry)
  geometry.dispose()
  row(`${key}.volume`, facts.volume)
  return facts
}
// the equations: the wall's prism (entry 1, equations 6 to 8), and the wall's face as the holes see it
function prism(more: WallCase = {}): number {
  const wall = plainWall(wallOf('wall_prism', more))
  const floor = more.floor ?? 0
  const base = more.base ?? floor
  const top = floor > 0 ? floor + (more.height ?? 2.5) : (more.height ?? 2.5)
  return polygonArea(footprintOf(wall, mitresOf([wall]))) * (top - Math.min(base, floor))
}
function face(more: WallCase = {}) {
  const floor = more.floor ?? 0
  const base = more.base ?? floor
  return { L: 4, thickness: more.thickness ?? 0.2, bottom: Math.min(base, floor) - floor, top: more.height ?? 2.5 }
}
const boxText = (min: readonly number[], max: readonly number[]) =>
  `x ${num(min[0]!)}..${num(max[0]!)} y ${num(min[1]!)}..${num(max[1]!)} z ${num(min[2]!)}..${num(max[2]!)}`

title('DB1 a wall (0, 0) to (4, 0), 0.2 thick, 2.5 high, with a rectangular door 0.9 x 2.1 whose middle is 1.0 m along')
{
  const d = door({ position: [1, 1.05, 0] })
  const facts = cut('DB1', [d])
  row('DB1.volume.by_equation', prism() - holeVolume(plain(d), face()))
  row('DB1.triangles', facts.triangles)
  row('DB1.box', boxText(facts.min, facts.max))
  cut('DB1.wall_mesh_not_known_to_the_scene', [d], {}, false)
  row('DB1.wall_mesh_not_known_to_the_scene.volume.by_equation', prism())
  const opening = door({ position: [1, 1.05, 0], openingKind: 'opening' })
  cut('DB1.frameless_opening', [opening])
  row('DB1.frameless_opening.volume.by_equation', prism() - holeVolume(plain(opening), face()))
  const raised = door({ position: [1, 1.25, 0] })
  cut('DB1.door_0.2_up', [raised])
  row('DB1.door_0.2_up.volume.by_equation', prism() - holeVolume(plain(raised), face()))
}

title('DB2 the same wall with an arched door, middle 2.0 m along')
{
  const semicircle = door({ position: [2, 1.05, 0], openingShape: 'arch' })
  cut('DB2.0.9x2.1_rise_0.45', [semicircle])
  row('DB2.0.9x2.1_rise_0.45.volume.by_equation', prism() - holeVolume(plain(semicircle), face()))
  row('DB2.0.9x2.1_rise_0.45.volume.exact', 2 - (0.9 * 1.65 + (Math.PI * 0.45 * 0.45) / 2) * 0.2)
  const flat = door({ position: [2, 1.05, 0], width: 1.2, openingShape: 'arch', archHeight: 0.3 })
  cut('DB2.1.2x2.1_rise_0.3', [flat])
  row('DB2.1.2x2.1_rise_0.3.volume.by_equation', prism() - holeVolume(plain(flat), face()))
  row('DB2.1.2x2.1_rise_0.3.volume.exact', 2 - (1.2 * 1.8 + (Math.PI * 0.6 * 0.3) / 2) * 0.2)
  const tall = door({ position: [2, 0.5, 0], height: 1.0, openingShape: 'arch', archHeight: 1.5 })
  cut('DB2.0.9x1.0_rise_asked_1.5', [tall])
  row('DB2.0.9x1.0_rise_asked_1.5.volume.by_equation', prism() - holeVolume(plain(tall), face()))
  const sliding = door({ position: [2, 1.05, 0], doorType: 'sliding', openingShape: 'arch' })
  cut('DB2.sliding_door_with_arch_stored', [sliding])
  row('DB2.sliding_door_with_arch_stored.volume.by_equation', prism() - holeVolume(plain(sliding), face()))
}

title('DB3 the same wall with a round-cornered door 0.9 x 2.1, middle 2.0 m along')
{
  const cases: Array<[string, Record<string, unknown>, WallCase]> = [
    ['radius_0.15', {}, {}],
    ['radius_0.15_reveal_0', { openingRevealRadius: 0 }, {}],
    ['radius_0.45', { cornerRadius: 0.45 }, {}],
    ['left_0.6_right_0.3', { openingRadiusMode: 'individual', openingTopRadii: [0.6, 0.3] }, {}],
    ['radius_0.15_wall_0.05_thick', {}, { thickness: 0.05 }],
  ]
  for (const [name, more, wall] of cases) {
    const d = door({ position: [2, 1.05, 0], openingShape: 'rounded', ...more })
    cut(`DB3.${name}`, [d], wall)
    row(`DB3.${name}.volume.by_equation`, prism(wall) - holeVolume(plain(d), face(wall)))
    // the true arcs: the outline, and the outline 0.025 larger all round
    if (name === 'radius_0.15') row('DB3.radius_0.15.volume.exact', 2 - (0.95 * 2.125 - 2 * 0.175 * 0.175 * (1 - Math.PI / 4)) * 0.2)
    if (name === 'radius_0.15_reveal_0') row('DB3.radius_0.15_reveal_0.volume.exact', 2 - (0.9 * 2.1 - 2 * 0.15 * 0.15 * (1 - Math.PI / 4)) * 0.2)
  }
}

title('DB4 two things at once on the same wall')
{
  const first = door({ id: 'door_first', position: [1, 1.05, 0] })
  // a window 1.0 x 1.0 that overlaps the door (placed with Alt held)
  const window = WindowNode.parse({ id: 'window_over', position: [1.6, 1.5, 0], width: 1.0, height: 1.0 })
  cut('DB4.door_and_window_overlapping', [first, window])
  const a = faceRect(1, 1.05, 0.9, 2.1)
  const b = faceRect(1.6, 1.5, 1.0, 1.0)
  const shared = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom))
  row('DB4.door_and_window_overlapping.volume.by_equation', prism() - (0.9 * 2.1 + 1.0 * 1.0 - shared) * 0.2)

  const second = door({ id: 'door_second', position: [1.9, 1.05, 0], openingShape: 'arch' })
  cut('DB4.two_doors_edge_to_edge', [first, second])
  row('DB4.two_doors_edge_to_edge.volume.by_equation', prism() - holeVolume(plain(first), face()) - holeVolume(plain(second), face()))

  const high = door({ position: [2, 1.5, 0], height: 3.0 })
  cut('DB4.door_3.0_high_in_the_2.5_wall', [high])
  row('DB4.door_3.0_high_in_the_2.5_wall.volume.by_equation', prism() - holeVolume(plain(high), face()))

  const hanging = door({ position: [0.2, 1.05, 0] })
  cut('DB4.door_0.2_along', [hanging])
  row('DB4.door_0.2_along.volume.by_equation', prism() - holeVolume(plain(hanging), face()))

  // the wall's base is 0.15 up (on a slab) and its body goes down to 0: the hole reaches 0.02 below the base
  const low: WallCase = { floor: 0.15, base: 0 }
  const onSlab = door({ position: [2, 1.05, 0] })
  const facts = cut('DB4.wall_body_0.15_below_its_base', [onSlab], low)
  row('DB4.wall_body_0.15_below_its_base.volume.by_equation', prism(low) - holeVolume(plain(onSlab), face(low)))
  row('DB4.wall_body_0.15_below_its_base.box', boxText(facts.min, facts.max))

  // a bent wall (sagitta 1): the cutter stays on the chord and misses the body
  const bent: WallCase = { curveOffset: 1 }
  cut('DB4.bent_wall', [door({ position: [2, 1.05, 0] })], bent)
  row('DB4.bent_wall.volume.by_equation', prism(bent))
}

// ------------------------------------------------------------------ the door itself

type Found = { size: V3; at: V3 }
const isBox = (object: THREE.Object3D) =>
  (object as THREE.Mesh).isMesh && object.name !== 'cutout' && ((object as THREE.Mesh).geometry as { type: string }).type === 'BoxGeometry'
const isSolid = (object: THREE.Object3D) =>
  (object as THREE.Mesh).isMesh && object.name !== 'cutout' && ((object as THREE.Mesh).geometry as { type: string }).type !== 'BoxGeometry'

// every box under an object, in the order they were made, each with its middle in that object's own frame
function boxesOf(root: THREE.Object3D): Found[] {
  root.updateWorldMatrix(true, true)
  const out: Found[] = []
  const visit = (object: THREE.Object3D) => {
    for (const child of object.children) {
      if (isBox(child)) {
        const q = ((child as THREE.Mesh).geometry as THREE.BoxGeometry).parameters
        const p = root.worldToLocal(child.getWorldPosition(new THREE.Vector3()))
        out.push({ size: [q.width, q.height, q.depth], at: [p.x, p.y, p.z] })
      }
      visit(child)
    }
  }
  visit(root)
  return out
}
// every other solid (an outline pushed through, a cylinder), in the order they were made
function solidsOf(root: THREE.Object3D): Array<{ volume: number; min: V3; max: V3 }> {
  const out: Array<{ volume: number; min: V3; max: V3 }> = []
  root.traverse((object) => {
    if (object === root || !isSolid(object)) return
    const facts = meshFacts((object as THREE.Mesh).geometry)
    out.push({ volume: facts.volume, min: facts.min, max: facts.max })
  })
  return out
}
const boxLine = (b: { size: readonly number[]; at: readonly number[] }) => `size ${pt(b.size)} at ${pt(b.at)}`
// the box round some boxes: a leaf's outer size, from its two rails and two stiles
function span(found: readonly Found[]): string {
  const min = [0, 1, 2].map((axis) => Math.min(...found.map((b) => b.at[axis]! - b.size[axis]! / 2)))
  const max = [0, 1, 2].map((axis) => Math.max(...found.map((b) => b.at[axis]! + b.size[axis]! / 2)))
  return boxText(min, max)
}
const spanOf = (leaf: LeafPlace) => boxText(leafBox(leaf).min, leafBox(leaf).max)
// the old editor's boxes, named here in the order they are made, each followed by the equations' box of that place
function listed(key: string, found: readonly Found[], names: readonly string[], mine: readonly Box[]) {
  row(`${key}.boxes`, found.length)
  row(`${key}.boxes.by_equation`, mine.length)
  for (let i = 0; i < Math.max(found.length, mine.length); i += 1) {
    if (found[i]) row(`${key}.${names[i] ?? `box_${i}`}`, boxLine(found[i]!))
    if (mine[i]) row(`${key}.${mine[i]!.name}.by_equation`, boxLine(mine[i]!))
  }
}
const swingGroups = (mesh: THREE.Object3D) => mesh.children.filter((child) => child.userData.pascalSwingLeaf)

title('DB5 the body of the default door: 0.9 x 2.1, hinged, shut. In its own frame: x along, y up from its middle, z out of its face')
{
  const d = door()
  const mesh = buildDoorPreviewMesh(d)
  const names = [
    'frame.post_left', 'frame.post_right', 'frame.head', 'threshold',
    'leaf.rail_top', 'leaf.rail_bottom', 'leaf.stile_left', 'leaf.stile_right',
    'leaf.row1.column1.panel', 'leaf.row1.column1.raised', 'leaf.row2.column1.panel', 'leaf.row2.column1.raised',
    'leaf.handle.front_plate', 'leaf.handle.front_grip', 'leaf.handle.back_plate', 'leaf.handle.back_grip',
    'leaf.hinge_bottom', 'leaf.hinge_middle', 'leaf.hinge_top',
  ]
  listed('DB5', boxesOf(mesh), names, swingDoorBoxes(plain(d)))
  const root = (mesh.geometry as THREE.BoxGeometry).parameters
  row('DB5.picking_box', pt([root.width, root.height, root.depth]))
  row('DB5.frameless_opening.boxes', boxesOf(buildDoorPreviewMesh(door({ openingKind: 'opening' }))).length)
  const bare = door({ threshold: false, handle: false, segments: [{ type: 'empty', heightRatio: 1 }] })
  row('DB5.no_threshold_no_handle_empty_leaf.boxes', boxesOf(buildDoorPreviewMesh(bare)).length)
  row('DB5.no_threshold_no_handle_empty_leaf.boxes.by_equation', swingDoorBoxes(plain(bare)).length)
}

title('DB6 the swing: where the leaf hangs, how far it is turned, where its free edge is (x, z in the door\'s own frame)')
{
  const said = (hinge: number, yaw: number, open: number, edge: { x: number; z: number }) =>
    `hinge at x ${num(hinge)} turned ${num(yaw)} fully open ${num(open)} free edge (${num(edge.x)}, ${num(edge.z)})`
  const report = (key: string, d: Node, runtime?: number) => {
    if (runtime !== undefined) useInteractive.getState().setDoorOpenState(d.id as never, { swingAngle: runtime })
    const mesh = buildDoorPreviewMesh(d)
    if (runtime !== undefined) useInteractive.getState().removeDoorOpenState(d.id as never)
    mesh.updateWorldMatrix(true, true)
    const groups = swingGroups(mesh)
    const leaves = swingLeaves(plain(d), runtime)
    groups.forEach((group, i) => {
      const rail = group.children[0]! // the top rail: its middle is the leaf's middle
      const far = mesh.worldToLocal(group.localToWorld(new THREE.Vector3(rail.position.x * 2, 0, 0)))
      const name = groups.length > 1 ? `${key}.leaf_${i === 0 ? 'left' : 'right'}` : key
      row(name, said(group.position.x, group.rotation.y, group.userData.pascalSwingLeaf.openRotationY, { x: far.x, z: far.z }))
      const leaf = leaves[i]!
      row(`${name}.by_equation`, said(leaf.hinge, leaf.yaw, leaf.openYaw, freeEdge(leaf)))
    })
    return { mesh, groups, leaves }
  }
  const third = Math.PI / 3
  report('DB6.hinges_left_inward_60deg', door({ swingAngle: third }))
  report('DB6.hinges_right_inward_60deg', door({ swingAngle: third, hingesSide: 'right' }))
  report('DB6.hinges_left_outward_60deg', door({ swingAngle: third, swingDirection: 'outward' }))
  report('DB6.hinges_right_outward_60deg', door({ swingAngle: third, hingesSide: 'right', swingDirection: 'outward' }))
  report('DB6.asked_2.0_rad_while_moving', door(), 2.0)
  report('DB6.double_1.5_wide_inward_30deg', door({ doorType: 'double', width: 1.5, swingAngle: Math.PI / 6 }))
  report('DB6.french_1.5_wide_outward_30deg', door({ doorType: 'french', width: 1.5, swingAngle: Math.PI / 6, swingDirection: 'outward' }))

  // the same first door set on the wall's back face, its middle 2.0 m along: in the wall's own frame
  for (const [faceName, yaw] of [['front', 0], ['back', Math.PI]] as Array<[string, number]>) {
    const d = door({ position: [2, 1.05, 0], rotation: [0, yaw, 0], side: faceName, swingAngle: third })
    const mesh = buildDoorPreviewMesh(d)
    mesh.updateWorldMatrix(true, true)
    const group = swingGroups(mesh)[0]!
    const hinge = group.getWorldPosition(new THREE.Vector3())
    const far = group.localToWorld(new THREE.Vector3(group.children[0]!.position.x * 2, 0, 0))
    const leaf = swingLeaves(plain(d))[0]!
    const edge = freeEdge(leaf)
    row(`DB6.on_the_${faceName}_face.in_the_wall_frame`, `hinge ${pt([hinge.x, hinge.y, hinge.z])} free edge ${pt([far.x, far.y, far.z])}`)
    row(
      `DB6.on_the_${faceName}_face.in_the_wall_frame.by_equation`,
      `hinge ${pt(inWallFrame(plain(d), { x: leaf.hinge, z: 0 }))} free edge ${pt(inWallFrame(plain(d), edge))}`,
    )
  }
}

title('DB7 rows and columns: glass 3 parts high in columns 1 : 2, an empty row 1 part, a panel 2 parts set back 0.02; handle left, closer and panic bar on')
{
  const d = door({
    segments: [
      { type: 'glass', heightRatio: 3, columnRatios: [1, 2] },
      { type: 'empty', heightRatio: 1 },
      { type: 'panel', heightRatio: 2, panelDepth: -0.02 },
    ],
    doorCloser: true,
    panicBar: true,
    handleSide: 'left',
  })
  // after the frame, the threshold, the two rails and the two stiles (boxes 0 to 7, as in DB5)
  const names = [
    'leaf.row1.divider1', 'leaf.row1.column1.glass', 'leaf.row1.column2.glass',
    'leaf.row3.column1.panel', 'leaf.row3.column1.raised',
    'leaf.handle.front_plate', 'leaf.handle.front_grip', 'leaf.handle.back_plate', 'leaf.handle.back_grip',
    'leaf.closer.body', 'leaf.closer.arm', 'leaf.panic_bar',
  ]
  listed('DB7', boxesOf(buildDoorPreviewMesh(d)).slice(8, 20), names, swingDoorBoxes(plain(d)).slice(8, 20))
}

title('DB8 doors under an arch or under round corners: posts, and the volumes of the pushed-through outlines (frame head or ring, leaf border, rows)')
{
  const volumes = (key: string, d: Node, names: readonly string[], mine: readonly number[]) => {
    const mesh = buildDoorPreviewMesh(d)
    const expected = frameBoxes(plain(d)).filter((b) => b.name.startsWith('frame.post'))
    if (expected.length > 0) {
      row(`${key}.frame.post_right`, boxLine(boxesOf(mesh)[1]!))
      row(`${key}.frame.post_right.by_equation`, boxLine(expected[1]!))
    }
    const solids = solidsOf(mesh)
    names.forEach((name, i) => {
      row(`${key}.${name}.volume`, solids[i]?.volume ?? Number.NaN)
      row(`${key}.${name}.volume.by_equation`, mine[i] ?? Number.NaN)
    })
    return solids
  }
  // a leaf's border, then each of its pieces, in the order they are made
  const leafVolumes = (d: Node, index = 0) => {
    const p = plain(d)
    const leaf = swingLeaves(p)[index]!
    return [shapedLeaf(p, leaf).borderArea * LEAF_DEPTH, ...shapedPieces(p, leaf).map((piece) => piece.area * piece.depth)]
  }
  const pieceNames = ['leaf.border', 'leaf.row1.panel', 'leaf.row1.raised', 'leaf.row2.panel', 'leaf.row2.raised']

  const arch = door({ openingShape: 'arch' })
  const solids = volumes('DB8.arch_rise_0.45', arch, ['frame.head', ...pieceNames], [areaOf(archFrame(plain(arch)).head) * 0.07, ...leafVolumes(arch)])
  row('DB8.arch_rise_0.45.frame.head.box', boxText(solids[0]!.min, solids[0]!.max))
  row('DB8.arch_rise_0.45.leaf.row1.raised.from_z_to_z', `${num(solids[3]!.min[2])}..${num(solids[3]!.max[2])}`)

  const shallow = door({ openingShape: 'arch', archHeight: 0.08 })
  volumes('DB8.arch_rise_0.08', shallow, ['frame.head'], [areaOf(archFrame(plain(shallow)).head) * 0.07])

  const rounded = door({ openingShape: 'rounded' })
  volumes('DB8.rounded_0.15', rounded, ['frame.ring', ...pieceNames], [roundedFrameArea(plain(rounded)) * 0.07, ...leafVolumes(rounded)])

  const pairArch = door({ doorType: 'double', width: 1.5, openingShape: 'arch' })
  const left = leafVolumes(pairArch, 0)
  volumes('DB8.double_1.5_arch_rise_0.45', pairArch, ['frame.head', 'leaf_left.border', 'leaf_left.row1.panel'], [areaOf(archFrame(plain(pairArch)).head) * 0.07, left[0]!, left[1]!])

  const pairRounded = door({ doorType: 'double', width: 1.5, openingShape: 'rounded', cornerRadius: 0.3 })
  const leftRounded = leafVolumes(pairRounded, 0)
  volumes('DB8.double_1.5_rounded_0.3', pairRounded, ['frame.ring', 'leaf_left.border', 'leaf_left.row1.panel'], [roundedFrameArea(plain(pairRounded)) * 0.07, leftRounded[0]!, leftRounded[1]!])
}

const steps = [0, 0.5, 1]
// the boxes that hang straight on an object, in the order they were made
const ownBoxes = (object: THREE.Object3D): Found[] =>
  object.children.filter(isBox).map((child) => {
    const q = ((child as THREE.Mesh).geometry as THREE.BoxGeometry).parameters
    return { size: [q.width, q.height, q.depth], at: [child.position.x, child.position.y, child.position.z] }
  })

title('DB9 sliding 1.5 wide, pocket 0.9 wide, barn 1.0 wide (all 2.1 high): what is built shut, and how far the moving part has gone at open fractions 0, 0.5, 1')
{
  for (const slide of ['left', 'right'] as const) {
    const d = door({ doorType: 'sliding', width: 1.5, slideDirection: slide })
    const mesh = buildDoorPreviewMesh(d)
    const group = mesh.getObjectByName('door-sliding-active')!
    const mine = slidingDoor(plain(d))
    const key = `DB9.sliding.slide_${slide}`
    // on the door itself: posts, head, threshold, the two rails, then the fixed panel's boxes
    const own = ownBoxes(mesh)
    row(`${key}.fixed_panel`, span(own.slice(6, 10)))
    row(`${key}.fixed_panel.by_equation`, spanOf(mine.fixed))
    row(`${key}.moving_panel`, span(ownBoxes(group).slice(0, 4)))
    row(`${key}.moving_panel.by_equation`, spanOf(mine.moving))
    if (slide === 'left') {
      row(`${key}.top_rail`, boxLine(own[4]!))
      row(`${key}.top_rail.by_equation`, boxLine(mine.topRail))
      row(`${key}.bottom_rail`, boxLine(own[5]!))
      row(`${key}.bottom_rail.by_equation`, boxLine(mine.bottomRail))
    }
    for (const t of slide === 'left' ? steps : [1]) {
      poseDoorMovingParts(d, mesh, t)
      row(`${key}.moved(${t})`, group.position.x)
      row(`${key}.moved(${t}).by_equation`, mine.shift(t))
    }
  }
  for (const [type, width, name] of [['pocket', 0.9, 'door-pocket-leaf'], ['barn', 1.0, 'door-barn-leaf']] as Array<[string, number, string]>) {
    for (const slide of ['left', 'right'] as const) {
      const d = door({ doorType: type, width, slideDirection: slide })
      const mesh = buildDoorPreviewMesh(d)
      const group = mesh.getObjectByName(name)!
      const mine = type === 'pocket' ? pocketDoor(plain(d)) : barnDoor(plain(d))
      const part = 'track' in mine ? mine.track : mine.rail
      const key = `DB9.${type}.slide_${slide}`
      if (slide === 'left') {
        row(`${key}.leaf`, span(ownBoxes(group).slice(0, 4)))
        row(`${key}.leaf.by_equation`, spanOf(mine.leaf))
      }
      row(`${key}.${part.name}`, boxLine(ownBoxes(mesh)[4]!)) // the first box after the frame and the threshold
      row(`${key}.${part.name}.by_equation`, boxLine(part))
      for (const t of slide === 'left' ? steps : [1]) {
        poseDoorMovingParts(d, mesh, t)
        row(`${key}.moved(${t})`, group.position.x)
        row(`${key}.moved(${t}).by_equation`, mine.shift(t))
      }
    }
  }
}

title('DB10 folding, 1.8 wide, 4 panels: what is built shut; each joint\'s turn and the free end (x, z) at open fractions 0, 0.5, 1')
{
  const d = door({ doorType: 'folding', width: 1.8, leafCount: 4 })
  const mesh = buildDoorPreviewMesh(d)
  const mine = foldingDoor(plain(d))
  const groups = [0, 1, 2, 3].map((i) => mesh.getObjectByName(`door-fold-${i}`)!).filter(Boolean)
  row('DB10.panels', groups.length)
  row('DB10.panels.by_equation', mine.count)
  row('DB10.first_joint_at_x', groups[0]!.position.x)
  row('DB10.first_joint_at_x.by_equation', -lengths(plain(d)).inside / 2)
  row('DB10.panel_length', groups[1]!.position.x)
  row('DB10.panel_length.by_equation', mine.length)
  row('DB10.panel_in_its_own_frame', span(ownBoxes(groups[3]!).slice(0, 4)))
  row('DB10.panel_in_its_own_frame.by_equation', spanOf(mine.panel))
  row('DB10.track', boxLine(ownBoxes(mesh)[4]!))
  row('DB10.track.by_equation', boxLine(mine.track))
  for (const t of steps) {
    poseDoorMovingParts(d, mesh, t)
    mesh.updateWorldMatrix(true, true)
    const end = groups[3]!.localToWorld(new THREE.Vector3(groups[1]!.position.x, 0, 0))
    row(`DB10.joint_turns(${t})`, groups.map((group) => num(group.rotation.y)).join(' '))
    row(`DB10.joint_turns(${t}).by_equation`, mine.yaws(t).map((yaw) => num(yaw)).join(' '))
    row(`DB10.free_end(${t})`, `(${num(end.x)}, ${num(end.z)})`)
    row(`DB10.free_end(${t}).by_equation`, `(${num(mine.end(t).x)}, ${num(mine.end(t).z)})`)
  }
  for (const count of [1, 2, 3]) {
    const other = door({ doorType: 'folding', width: 1.8, leafCount: count })
    let panels = 0
    buildDoorPreviewMesh(other).traverse((object) => {
      if (object.name.startsWith('door-fold-')) panels += 1
    })
    row(`DB10.panels_for_leaf_count_${count}`, panels)
    row(`DB10.panels_for_leaf_count_${count}.by_equation`, foldingDoor(plain(other)).count)
  }
}

title('DB11 garage doors 2.7 x 2.4: sectional (4 panels), roll-up, tilt-up, at open fractions 0, 0.5, 1')
{
  const sectional = door({ doorType: 'garage-sectional', width: 2.7, height: 2.4 })
  const mesh = buildDoorPreviewMesh(sectional)
  const mine = sectionalDoor(plain(sectional))
  const panels = [0, 1, 2, 3].map((i) => mesh.getObjectByName(`door-sectional-${i}`)!)
  row('DB11.sectional.panel', pt(ownBoxes(panels[0]!)[0]!.size))
  row('DB11.sectional.panel.by_equation', pt(mine.panel))
  for (const t of steps) {
    poseDoorMovingParts(sectional, mesh, t)
    const pose = mine.pose(t)
    panels.forEach((panel, i) => {
      row(`DB11.sectional.panel_${i}(${t})`, `up ${num(panel.position.y)} back ${num(panel.position.z)} turned ${num(panel.rotation.x)}`)
      row(`DB11.sectional.panel_${i}(${t}).by_equation`, `up ${num(pose[i]!.y)} back ${num(pose[i]!.z)} turned ${num(pose[i]!.turn)}`)
    })
  }
  for (const count of [1, 12]) {
    const other = door({ doorType: 'garage-sectional', width: 2.7, height: 2.4, garagePanelCount: count })
    let built = 0
    buildDoorPreviewMesh(other).traverse((object) => {
      if (object.name.startsWith('door-sectional-')) built += 1
    })
    row(`DB11.sectional.panels_for_count_${count}`, built)
    row(`DB11.sectional.panels_for_count_${count}.by_equation`, sectionalDoor(plain(other)).count)
  }

  // roll-up: the door is built again for every open fraction
  for (const t of steps) {
    const rollup = door({ doorType: 'garage-rollup', width: 2.7, height: 2.4, operationState: t })
    const curtain = buildDoorPreviewMesh(rollup).getObjectByName('door-rollup-curtain')
    const ours = rollupDoor(plain(rollup)).curtain(t)
    if (curtain) {
      const hung = ownBoxes(curtain) // the sheet, the slat lines, the bottom bar
      row(`DB11.rollup.built_at(${t})`, `sheet ${pt(hung[0]!.size)} middle up ${num(curtain.position.y + hung[0]!.at[1])} lines ${hung.length - 2}`)
    } else row(`DB11.rollup.built_at(${t})`, 'no curtain')
    row(
      `DB11.rollup.built_at(${t}).by_equation`,
      ours.built ? `sheet ${pt(ours.sheet)} middle up ${num(ours.sheetMiddle)} lines ${ours.lines}` : 'no curtain',
    )
  }
  {
    const rollup = door({ doorType: 'garage-rollup', width: 2.7, height: 2.4 })
    const built = buildDoorPreviewMesh(rollup)
    const ours = rollupDoor(plain(rollup))
    const drum = built.children.find((child) => isSolid(child)) as THREE.Mesh
    const q = (drum.geometry as THREE.CylinderGeometry).parameters
    row('DB11.rollup.drum', `radius ${num(q.radiusTop)} length ${num(q.height)} at ${pt([drum.position.x, drum.position.y, drum.position.z])}`)
    row('DB11.rollup.drum.by_equation', `radius ${num(ours.drumRadius)} length ${num(ours.drumLength)} at ${pt(ours.drumAt)}`)
    const curtain = built.getObjectByName('door-rollup-curtain')!
    for (const t of steps) {
      poseDoorMovingParts(rollup, built, t)
      row(`DB11.rollup.squeezed(${t})`, curtain.scale.y)
      row(`DB11.rollup.squeezed(${t}).by_equation`, ours.scale(t))
    }
  }

  const tiltup = door({ doorType: 'garage-tiltup', width: 2.7, height: 2.4 })
  const tilted = buildDoorPreviewMesh(tiltup)
  const group = tilted.getObjectByName('door-tiltup-leaf')!
  const own = tiltupDoor(plain(tiltup))
  row('DB11.tiltup.leaf', boxLine(ownBoxes(group)[0]!))
  row('DB11.tiltup.leaf.by_equation', boxLine(own.leaf))
  const { leafTop, leafBottom } = lengths(plain(tiltup))
  for (const t of steps) {
    poseDoorMovingParts(tiltup, tilted, t)
    tilted.updateWorldMatrix(true, true)
    const low = group.localToWorld(new THREE.Vector3(0, leafBottom, 0))
    const high = group.localToWorld(new THREE.Vector3(0, leafTop, 0))
    const pose = own.pose(t)
    row(`DB11.tiltup.pose(${t})`, `turned ${num(group.rotation.x)} at ${pt([group.position.x, group.position.y, group.position.z])}`)
    row(`DB11.tiltup.pose(${t}).by_equation`, `turned ${num(pose.turn)} at ${pt(pose.at)}`)
    row(`DB11.tiltup.edges(${t})`, `low (${num(low.y)}, ${num(low.z)}) high (${num(high.y)}, ${num(high.z)})`)
    row(`DB11.tiltup.edges(${t}).by_equation`, `low (${num(pose.lowEdge.y)}, ${num(pose.lowEdge.z)}) high (${num(pose.highEdge.y)}, ${num(pose.highEdge.z)})`)
  }
}

title('DB12 what the two builders do with fields they cannot use')
{
  // a stored swing of 2 rad fails the schema: the body is then the default door at the wall's start, the hole is cut as stored
  const refused = { ...door({ position: [3, 1.05, 0], width: 1.4 }), swingAngle: 2 }
  const mesh = buildDoorPreviewMesh(refused as never)
  const root = (mesh.geometry as THREE.BoxGeometry).parameters
  row('DB12.swing_2_rad_stored.body', `size ${pt([root.width, root.height, root.depth])} at ${pt([mesh.position.x, mesh.position.y, mesh.position.z])}`)
  cut('DB12.swing_2_rad_stored.wall', [refused])
  row('DB12.swing_2_rad_stored.wall.volume.by_equation', prism() - holeVolume(plain(refused), face()))
  // the same with a sectional door 2.7 x 2.4 whose panel count is stored as 2.4
  const fraction = { ...door({ doorType: 'garage-sectional', position: [2, 1.2, 0], width: 2.7, height: 2.4 }), garagePanelCount: 2.4 }
  const drawn = buildDoorPreviewMesh(fraction as never)
  const drawnRoot = (drawn.geometry as THREE.BoxGeometry).parameters
  let sectionalPanels = 0
  drawn.traverse((object) => {
    if (object.name.startsWith('door-sectional-')) sectionalPanels += 1
  })
  row(
    'DB12.panel_count_2.4_stored.body',
    `size ${pt([drawnRoot.width, drawnRoot.height, drawnRoot.depth])} at ${pt([drawn.position.x, drawn.position.y, drawn.position.z])} sectional panels ${sectionalPanels}`,
  )

  // no arch height stored (width 1.2): the hole takes half the width, the body the default 0.45
  const bare = { ...door({ position: [2, 1.05, 0], width: 1.2, openingShape: 'arch' }), archHeight: undefined }
  cut('DB12.no_arch_height_stored.wall', [bare])
  row('DB12.no_arch_height_stored.wall.volume.by_equation', prism() - holeVolume(plain(bare), face()))
  row('DB12.no_arch_height_stored.body.post_right', boxLine(boxesOf(buildDoorPreviewMesh(bare as never))[1]!))
  row('DB12.no_arch_height_stored.body.post_right.by_equation', boxLine(frameBoxes({ ...plain(bare), archHeight: 0.45 })[1]!))

  // an arch asked higher than the door: the hole limits its rise by the door's height + 0.02 (DB2), the frame by the door's height
  const squat = door({ height: 1.0, openingShape: 'arch', archHeight: 1.5 })
  row('DB12.arch_asked_1.5_on_a_door_1.0_high.body.post_right', boxLine(boxesOf(buildDoorPreviewMesh(squat))[1]!))
  row('DB12.arch_asked_1.5_on_a_door_1.0_high.body.post_right.by_equation', boxLine(frameBoxes(plain(squat))[1]!))
}
