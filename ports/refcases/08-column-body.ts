// Reference cases for the column's body (port note entry 8): the old editor's own column tree,
// built without a window, and the same parts worked out from the note's equations.
// cd packages/viewer && bun ../../ports/refcases/08-column-body.ts
//
// The old editor builds a column as a tree of React components (nodes/src/column/renderer.tsx),
// one mesh per part. Here that tree is mounted with the editor's own test renderer and every
// mesh is read back in the column's own frame: how many triangles, its box, what it holds.
// A line `K.by_equation` is the same part from _column-equations.ts, which calls nothing of the
// old editor (verify.ts holds the two together). With PORT_SWEEP=1 set, a wider sweep runs after
// the cases (several hundred columns, every part held against the equations; see the end).
import { COLUMN_PRESETS, ColumnNode } from '@pascal-app/core'
import { createColumnBoxGeometry, createColumnTorusGeometry } from '@pascal-app/viewer'
import { create } from '@react-three/test-renderer'
import { createElement } from 'react'
import * as THREE from 'three'
import ColumnRenderer, { ColumnPreview } from '../../packages/nodes/src/column/renderer'
import {
  type Bar,
  BALL,
  boxOf,
  type Column,
  column,
  layoutOf,
  lengthOf,
  type Part,
  placeOf,
  revolvedProfileOf,
  revolvedVolume,
  scaleAt,
  slicesOf,
  structureOf,
  trianglesOf,
  trueShaftVolume,
  trueSolidVolume,
  trueVolumeOf,
  type V3,
  volumeOf,
} from './_column-equations'
import { meshFacts } from './_mesh'
import { num, pt, row, title } from './_print'

type Over = Record<string, unknown>
type Seen = { slot: string; triangles: number; min: V3; max: V3; volume: number; start: V3; end: V3; width: number; depth: number }

// A bar is drawn with every face twice, once each way round, so its triangles enclose nothing
// when summed. The first two triangles of every four are the outward ones: they give its
// volume. Its first face is the end at its start, its second the end at its end.
function barFacts(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position')
  const at = (i: number): V3 => [p.getX(i), p.getY(i), p.getZ(i)]
  const middle = (list: V3[]): V3 => [0, 1, 2].map((axis) => list.reduce((sum, v) => sum + v[axis]!, 0) / list.length) as V3
  let volume = 0
  for (let face = 0; face < 6; face += 1) {
    for (let k = 0; k < 2; k += 1) {
      const o = face * 12 + k * 3
      const [a, b, c] = [at(o), at(o + 1), at(o + 2)]
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
  }
  return {
    start: middle([at(0), at(1), at(2), at(5)]),
    end: middle([at(12), at(13), at(14), at(17)]),
    width: Math.hypot(at(1)[0] - at(0)[0], at(1)[2] - at(0)[2]),
    depth: Math.hypot(at(5)[0] - at(0)[0], at(5)[2] - at(0)[2]),
    volume: Math.abs(volume),
  }
}

let made = 0
// every mesh of a column as the old editor draws it: in the column's own frame, or (placed) in its level
async function drawn(over: Over, placed = false): Promise<Seen[]> {
  made += 1
  const node = ColumnNode.parse({ id: `column_b${made}`, ...over })
  const renderer = await create(createElement(placed ? ColumnRenderer : ColumnPreview, { node }))
  const scene = renderer.scene.instance as unknown as THREE.Object3D
  scene.updateMatrixWorld(true)
  const seen: Seen[] = []
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    const facts = meshFacts(geometry)
    const slot = String(mesh.userData.slotId)
    const bar = slot === 'frame' && facts.triangles === 24 ? barFacts(geometry) : null
    seen.push({
      slot,
      triangles: facts.triangles,
      min: facts.min,
      max: facts.max,
      volume: bar ? bar.volume : facts.volume,
      start: bar?.start ?? [0, 0, 0],
      end: bar?.end ?? [0, 0, 0],
      width: bar?.width ?? 0,
      depth: bar?.depth ?? 0,
    })
    geometry.dispose()
  })
  await renderer.unmount()
  return seen
}

const own = (over: Over): Part[] => structureOf(column(over as Partial<Column>))
const preset = (name: keyof typeof COLUMN_PRESETS): Over => {
  const { label: _label, ...rest } = COLUMN_PRESETS[name] as { label: string } & Over
  return rest
}
const SLOTS = ['base', 'shaft', 'capital', 'frame'] as const
const counts = (list: Array<{ slot: string }>) =>
  SLOTS.map((slot) => [slot, list.filter((entry) => entry.slot === slot).length] as const)
    .filter(([, n]) => n > 0)
    .map(([slot, n]) => `${slot} ${n}`)
    .join(' ')
const box = (min: V3, max: V3) => `x ${num(min[0])}..${num(max[0])} y ${num(min[1])}..${num(max[1])} z ${num(min[2])}..${num(max[2])}`
const seenText = (s: Seen) => `${s.triangles} triangles ${box(s.min, s.max)} volume ${num(s.volume)}`
const partText = (p: Part) => `${trianglesOf(p)} triangles ${box(boxOf(p).min, boxOf(p).max)} volume ${num(volumeOf(p))}`
const barSeen = (s: Seen) => `from ${pt(s.start)} to ${pt(s.end)} section ${num(s.width)} x ${num(s.depth)} length ${num(Math.hypot(s.end[0] - s.start[0], s.end[1] - s.start[1], s.end[2] - s.start[2]))} volume ${num(s.volume)}`
const barOwn = (b: Bar) => `from ${pt(b.start)} to ${pt(b.end)} section ${num(b.width)} x ${num(b.depth)} length ${num(lengthOf(b))} volume ${num(volumeOf(b))}`
const sum = (list: number[]) => list.reduce((total, value) => total + value, 0)
const topOf = (list: Seen[]) => Math.max(...list.map((s) => s.max[1]))
const fromOf = (list: Seen[], slot: string) => Math.min(...list.filter((s) => s.slot === slot).map((s) => s.min[1]))

// one part, as drawn and by the equations: the index counts the parts of its slot
function part(key: string, seen: Seen[], parts: Part[], slot: string, index: number, name = `${slot}(${index})`) {
  const s = seen.filter((entry) => entry.slot === slot)[index]
  const p = parts.filter((entry) => entry.slot === slot)[index]
  row(`${key}.${name}`, s ? seenText(s) : 'none')
  row(`${key}.${name}.by_equation`, p ? partText(p) : 'none')
}

// where the shaft and the capital begin and where the body ends
function marks(key: string, seen: Seen[], over: Over) {
  const c = column(over as Partial<Column>)
  const { shaftY, capitalY, hc } = layoutOf(c)
  const parts = structureOf(c)
  const capital = hc > 0 && c.capitalStyle !== 'none'
  row(`${key}.heights`, `shaft from ${num(fromOf(seen, 'shaft'))}${capital ? ` capital from ${num(fromOf(seen, 'capital'))}` : ''} top ${num(topOf(seen))}`)
  row(`${key}.heights.by_equation`, `shaft from ${num(shaftY)}${capital ? ` capital from ${num(capitalY)}` : ''} top ${num(Math.max(...parts.map((p) => boxOf(p).max[1])))}`)
}

// a slice of a round shaft: its radius (half its box along X) and where it stands
const sliceSeen = (s: Seen) => `radius ${num(s.max[0])} y ${num(s.min[1])}..${num(s.max[1])}`
const sliceOwn = (p: Part) => `radius ${num(boxOf(p).max[0])} y ${num(boxOf(p).min[1])}..${num(boxOf(p).max[1])}`

// ------------------------------------------------------------------ the cases
title('B1 the column the tool places (preset basicPillar): round, 2.5 high, radius 0.22, a plinth of two blocks, a round slab on top')
{
  const over = preset('basicPillar')
  const seen = await drawn(over)
  const parts = own(over)
  row('B1.parts', counts(seen))
  row('B1.parts.by_equation', counts(parts))
  marks('B1', seen, over)
  part('B1', seen, parts, 'base', 0)
  part('B1', seen, parts, 'base', 1)
  part('B1', seen, parts, 'shaft', 0)
  row('B1.shaft(0).exact', `volume ${num(trueVolumeOf(parts.filter((p) => p.slot === 'shaft')[0]!))}`)
  part('B1', seen, parts, 'capital', 0)
  row('B1.capital(0).exact', `volume ${num(trueVolumeOf(parts.filter((p) => p.slot === 'capital')[0]!))}`)
  row('B1.volume', sum(seen.map((s) => s.volume)))
  row('B1.volume.by_equation', sum(parts.map(volumeOf)))
  row('B1.volume.exact', trueSolidVolume(column(over as Partial<Column>)))
}

title('B2 a column made with no numbers given (the schema defaults): a plinth with two round bands, a round capital')
{
  const seen = await drawn({})
  const parts = own({})
  row('B2.drawn', counts(seen))
  const capital = seen.filter((s) => s.slot === 'capital')
  const extra = capital.slice(1)
  row(
    'B2.ornament',
    `${extra.length} parts in the capital, within ${box(
      [0, 1, 2].map((axis) => Math.min(...extra.map((s) => s.min[axis]!))) as V3,
      [0, 1, 2].map((axis) => Math.max(...extra.map((s) => s.max[axis]!))) as V3,
    )}`,
  )
  marks('B2', seen, {})
  part('B2', seen, parts, 'base', 0)
  part('B2', seen, parts, 'base', 1)
  part('B2', seen, parts, 'base', 2)
  part('B2', seen, parts, 'shaft', 0)
  part('B2', seen, parts, 'capital', 0)
  const structure = [...seen.filter((s) => s.slot !== 'capital'), capital[0]!]
  row('B2.volume', sum(structure.map((s) => s.volume)))
  row('B2.volume.by_equation', sum(parts.map(volumeOf)))
  row('B2.volume.exact', trueSolidVolume(column()))
  // the eight rounded corners of a block put together, for a radius of 1
  row('B2.rounded_corners', meshFacts(createColumnBoxGeometry(2, 2, 2, 1)).volume)
  row('B2.rounded_corners.by_equation', BALL)
  row('B2.rounded_corners.exact', (4 / 3) * Math.PI)
}

title('B3 the square block (preset squarePillar, 0.48 square): a shaft of two crossed blocks and four round corners; and a rectangular shaft with sharp corners')
{
  const over = preset('squarePillar')
  const seen = await drawn(over)
  const parts = own(over)
  row('B3.parts', counts(seen))
  row('B3.parts.by_equation', counts(parts))
  marks('B3', seen, over)
  part('B3', seen, parts, 'base', 0)
  for (let i = 0; i < 3; i += 1) part('B3', seen, parts, 'shaft', i)
  part('B3', seen, parts, 'capital', 0)
  row('B3.shaft_volume', sum(seen.filter((s) => s.slot === 'shaft').map((s) => s.volume)))
  row('B3.shaft_volume.by_equation', sum(parts.filter((p) => p.slot === 'shaft').map(volumeOf)))
  row('B3.shaft_volume.exact', trueShaftVolume(column(over as Partial<Column>)))
  row('B3.volume', sum(seen.map((s) => s.volume)))
  row('B3.volume.by_equation', sum(parts.map(volumeOf)))
  row('B3.volume.exact', trueSolidVolume(column(over as Partial<Column>)))
  const sharp = { capitalBandCount: 0, crossSection: 'rectangular', width: 0.6, depth: 0.3, shaftCornerRadius: 0 }
  const seenSharp = await drawn(sharp)
  row('B3.sharp.parts', counts(seenSharp))
  row('B3.sharp.parts.by_equation', counts(own(sharp)))
  part('B3.sharp', seenSharp, own(sharp), 'shaft', 0)
  part('B3.sharp', seenSharp, own(sharp), 'capital', 0)
}

title('B4 shafts of 8 and of 16 sides: the default column with crossSection octagonal, then sixteen-sided')
for (const crossSection of ['octagonal', 'sixteen-sided']) {
  const over = { capitalBandCount: 0, crossSection }
  const seen = await drawn(over)
  const parts = own(over)
  part(`B4.${crossSection}`, seen, parts, 'shaft', 0)
  row(`B4.${crossSection}.shaft(0).exact`, `volume ${num(trueVolumeOf(parts.filter((p) => p.slot === 'shaft')[0]!))}`)
  part(`B4.${crossSection}`, seen, parts, 'capital', 0)
}

title('B5 the shaft in slices: the tapered, bulged and hourglass presets, a straight taper, the count of slices, a twist')
{
  const profiles: Array<[string, Over, number[], boolean]> = [
    ['taperedPillar', preset('taperedPillar'), [0, 15, 30], true],
    ['straight_taper(scale 0.8, taper 0.25, 5 slices)', { capitalBandCount: 0, shaftProfile: 'tapered', shaftStartScale: 0.8, shaftEndScale: 0.8, shaftTaper: 0.25, shaftSegmentCount: 5 }, [0, 4], true],
    ['bulgedPillar', preset('bulgedPillar'), [0, 15, 31], true],
    ['baluster(as bulgedPillar)', { ...preset('bulgedPillar'), shaftProfile: 'baluster' }, [15], false],
    ['hourglassPillar', preset('hourglassPillar'), [0, 15, 31], true],
  ]
  for (const [name, over, shown, whole] of profiles) {
    const seen = (await drawn(over)).filter((s) => s.slot === 'shaft')
    const parts = own(over).filter((p) => p.slot === 'shaft')
    if (whole) {
      row(`B5.${name}.slices`, seen.length)
      row(`B5.${name}.slices.by_equation`, slicesOf(column(over as Partial<Column>)))
    }
    for (const i of shown) {
      row(`B5.${name}.slice(${i})`, sliceSeen(seen[i]!))
      row(`B5.${name}.slice(${i}).by_equation`, sliceOwn(parts[i]!))
    }
    if (!whole) continue
    row(`B5.${name}.shaft_volume`, sum(seen.map((s) => s.volume)))
    row(`B5.${name}.shaft_volume.by_equation`, sum(parts.map(volumeOf)))
    row(`B5.${name}.shaft_volume.exact`, trueShaftVolume(column(over as Partial<Column>)))
  }
  {
    // the straight taper is a true cone's frustum: pi h (r1^2 + r1 r2 + r2^2) / 3
    const c = column({ shaftProfile: 'tapered', shaftStartScale: 0.8, shaftEndScale: 0.8, shaftTaper: 0.25 })
    const [r1, r2, h] = [c.radius * scaleAt(c, 0), c.radius * scaleAt(c, 1), layoutOf(c).hs]
    row('B5.straight_taper.frustum', `from radius ${num(r1)} to ${num(r2)} over ${num(h)}: ${num((Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3)}`)
  }
  const counted: Array<[string, Over]> = [
    ['straight', {}],
    ['straight, taper 0.2, 6 asked', { shaftTaper: 0.2, shaftSegmentCount: 6 }],
    ['straight, twist 15, 2 asked', { shaftTwistStep: 15, shaftSegmentCount: 2 }],
    ['straight, twist 15, 12 asked', { shaftTwistStep: 15, shaftSegmentCount: 12 }],
    ['tapered, taper 0, 5 asked', { shaftProfile: 'tapered', shaftSegmentCount: 5 }],
    ['bulged, 1 asked', { shaftProfile: 'bulged', shaftSegmentCount: 1 }],
    ['straight, scale 0.9 to 0.5', { shaftStartScale: 0.9, shaftEndScale: 0.5 }],
  ]
  for (const [name, more] of counted) {
    const over = { capitalBandCount: 0, ...more }
    const seen = (await drawn(over)).filter((s) => s.slot === 'shaft')
    row(`B5.slices(${name})`, `${seen.length}, the first of radius ${num(seen[0]!.max[0])}`)
    row(`B5.slices(${name}).by_equation`, `${slicesOf(column(over as Partial<Column>))}, the first of radius ${num(boxOf(own(over).filter((p) => p.slot === 'shaft')[0]!).max[0])}`)
  }
  const twist = { capitalBandCount: 0, crossSection: 'square', shaftTwistStep: 15, shaftSegmentCount: 4 }
  const seen = await drawn(twist)
  const parts = own(twist)
  row('B5.twist.parts', counts(seen))
  row('B5.twist.parts.by_equation', counts(parts))
  for (const slice of [0, 1, 3]) part('B5.twist', seen, parts, 'shaft', slice * 6, `slice(${slice}).block`)
  part('B5.twist', seen, parts, 'shaft', 8, 'slice(1).corner')
}

title('B6 the limits: caps of base and capital, the least shaft, no capital, the scale floor, the corner radius, the tiers, the rounding of edges')
{
  const cases: Array<[string, Over]> = [
    ['caps(height 1, base 0.6, capital 0.5)', { height: 1, baseHeight: 0.6, capitalHeight: 0.5 }],
    ['short(height 0.3)', { height: 0.3 }],
    ['no_capital', { capitalStyle: 'none' }],
  ]
  for (const [name, more] of cases) {
    const over = { capitalBandCount: 0, ...more }
    marks(`B6.${name}`, await drawn(over), over)
  }
  const floor = { capitalBandCount: 0, shaftProfile: 'hourglass', shaftBulge: 0.8, shaftStartScale: 0.2, shaftEndScale: 0.2, shaftSegmentCount: 4 }
  row('B6.scale_floor.slice(1)', sliceSeen((await drawn(floor)).filter((s) => s.slot === 'shaft')[1]!))
  row('B6.scale_floor.slice(1).by_equation', sliceOwn(own(floor).filter((p) => p.slot === 'shaft')[1]!))
  const corner = { capitalBandCount: 0, crossSection: 'rectangular', depth: 0.2, shaftCornerRadius: 0.3 }
  const seenCorner = await drawn(corner)
  part('B6.corner_radius(depth 0.2, corner 0.3)', seenCorner, own(corner), 'shaft', 0)
  part('B6.corner_radius(depth 0.2, corner 0.3)', seenCorner, own(corner), 'shaft', 2)
  const tiers = { capitalBandCount: 0, edgeSoftness: 0, baseStyle: 'stepped-square', baseTierCount: 1, baseStepSpread: 1 }
  const seenTiers = await drawn(tiers)
  row('B6.tiers(1 asked, spread 1).parts', counts(seenTiers))
  row('B6.tiers(1 asked, spread 1).parts.by_equation', counts(own(tiers)))
  for (let i = 0; i < 3; i += 1) part('B6.tiers(1 asked, spread 1)', seenTiers, own(tiers), 'base', i)
  const soft = { capitalBandCount: 0, edgeSoftness: 0.12, baseStyle: 'simple-square' }
  part('B6.soft(edgeSoftness 0.12)', await drawn(soft), own(soft), 'base', 0)
  const sharp = { capitalBandCount: 0, edgeSoftness: 0, baseStyle: 'simple-square' }
  part('B6.sharp(edgeSoftness 0)', await drawn(sharp), own(sharp), 'base', 0)
}

title('B7 every base: a round column 0.44 wide and 0.3 deep (radius 0.22), base 0.3 high, its scales 1.24 across and 1.1 deep, edges sharp')
{
  const common = { capitalBandCount: 0, edgeSoftness: 0, depth: 0.3, baseHeight: 0.3, baseDepthScale: 1.1 }
  const styles: Array<[string, Over, number[]]> = [
    ['simple-square', {}, [0]],
    ['square-plinth', {}, [0, 1]],
    ['stepped-square', {}, [0, 1, 2]],
    ['round-rings', {}, [0, 1, 2]],
    ['lotus', { baseRibCount: 6 }, [0, 1, 2, 3, 8]],
    ['ribbed-lotus', { baseRibCount: 6 }, [8]],
    ['panelled-pedestal', {}, [0, 1, 3]],
    ['none', {}, []],
  ]
  for (const [baseStyle, more, shown] of styles) {
    const over = { ...common, baseStyle, ...more }
    const seen = await drawn(over)
    const parts = own(over)
    if (baseStyle === 'lotus' || baseStyle === 'panelled-pedestal' || baseStyle === 'none') {
      row(`B7.${baseStyle}.parts`, counts(seen))
      row(`B7.${baseStyle}.parts.by_equation`, counts(parts))
    }
    for (const i of shown) part(`B7.${baseStyle}`, seen, parts, 'base', i)
    if (baseStyle === 'none') marks('B7.none', seen, over)
  }
}

title('B8 every capital: the same column, capital 0.3 high, its scales 1.46 across and 1.2 deep; then on a rectangular shaft')
{
  const common = { capitalBandCount: 0, edgeSoftness: 0, depth: 0.3, capitalHeight: 0.3, capitalDepthScale: 1.2 }
  const styles: Array<[string, Over, number[]]> = [
    ['simple', {}, [0]],
    ['simple-slab', {}, [0]],
    ['simple(rectangular)', { capitalStyle: 'simple', crossSection: 'rectangular' }, [0]],
    ['rounded', {}, [0, 1, 2]],
    ['doric', {}, [2]],
    ['stepped', {}, [0, 1, 2]],
    ['wood-bracket', {}, [0, 1, 2]],
    ['south-indian-bracket', {}, [2]],
    ['volute', {}, [0, 1, 2]],
    ['corinthian-leaf(rectangular)', { capitalStyle: 'corinthian-leaf', crossSection: 'rectangular', leafCount: 0 }, [0, 1, 2]],
  ]
  for (const [name, more, shown] of styles) {
    const over = { ...common, capitalStyle: name, ...more }
    const seen = await drawn(over)
    const parts = own(over)
    for (const i of shown) part(`B8.${name}`, seen, parts, 'capital', i)
    if (name === 'volute') {
      const extra = seen.filter((s) => s.slot === 'capital').slice(3)
      row('B8.volute.ornament', `${extra.length} rings, y ${num(Math.min(...extra.map((s) => s.min[1])))}..${num(Math.max(...extra.map((s) => s.max[1])))}`)
    }
  }
  // the ring primitive of the volutes, asked for with two tube radii
  for (const tubeRadius of [0.0144, 0.05]) {
    const f = meshFacts(createColumnTorusGeometry({ ringRadius: 0.08, tubeRadius, scaleZ: 0.0224 }))
    row(`B8.ring(radius 0.08, tube ${tubeRadius})`, `${f.triangles} triangles ${box(f.min, f.max)} volume ${num(f.volume)}`)
  }
}

title('B9 on the shaft: rings, lathe bands, flutes; and the cluster of five')
{
  const plain = { capitalBandCount: 0 }
  const cases: Array<[string, Over, number[]]> = [
    ['rings(4, at the ends)', { ringCount: 4 }, [1, 2, 3, 4]],
    ['rings(3, even, on a bulge of 0.2 in 4 slices)', { ringCount: 3, ringPlacement: 'even', shaftProfile: 'bulged', shaftBulge: 0.2, shaftSegmentCount: 4 }, [4, 5]],
    ['rings(3, at the top, spread 0.3)', { ringCount: 3, ringPlacement: 'top', ringSpread: 0.3 }, [1, 2, 3]],
    ['lathe(3, at the ends)', { latheRingCount: 3 }, [1, 2, 3]],
    ['lathe(2, at the bottom, square)', { latheRingCount: 2, latheRingSpacing: 'bottom', crossSection: 'square', edgeSoftness: 0 }, [6, 7]],
    ['flutes(8)', { fluteCount: 8 }, [1, 2]],
    ['flutes(shaftDetail fluted)', { shaftDetail: 'fluted' }, []],
    ['cluster', { style: 'cluster' }, [0, 1, 3]],
  ]
  for (const [name, more, shown] of cases) {
    const over = { ...plain, ...more }
    const seen = await drawn(over)
    const parts = own(over)
    if (name.startsWith('flutes') || name === 'cluster') {
      row(`B9.${name}.parts`, counts(seen))
      row(`B9.${name}.parts.by_equation`, counts(parts))
    }
    for (const i of shown) part(`B9.${name}`, seen, parts, 'shaft', i)
  }
  // the other words of `style` on the same column
  for (const style of ['plain', 'faceted', 'fluted', 'lathe-turned']) {
    const over = { ...plain, style }
    const seen = await drawn(over)
    row(`B9.style(${style})`, `${counts(seen)}, together ${num(sum(seen.map((s) => s.volume)))} m3`)
    row(`B9.style(${style}).by_equation`, `${counts(own(over))}, together ${num(sum(own(over).map(volumeOf)))} m3`)
  }
}

// how many members a frame has, then its members (all of them, or the ones named)
async function frame(key: string, over: Over, shown?: number[]) {
  const seen = await drawn(over)
  const parts = own(over)
  const bars = seen.filter((s) => s.triangles === 24)
  const ownBars = parts.filter((p): p is Bar => p.shape === 'bar')
  if (shown) {
    row(`${key}.members`, bars.length)
    row(`${key}.members.by_equation`, ownBars.length)
  }
  for (const i of shown ?? bars.map((_, index) => index)) {
    row(`${key}.member(${i})`, barSeen(bars[i]!))
    row(`${key}.member(${i}).by_equation`, barOwn(ownBars[i]!))
  }
  return { seen, parts }
}

title('B10 frames in one plane, 2.5 high (the presets): A, Y, V, X, K and the single strut; and the A frame placed in its level')
{
  for (const name of ['aFrameSupport', 'yFrameSupport', 'vFrameSupport', 'xBraceSupport', 'kBraceSupport', 'singleStrutSupport'] as const) {
    const over = preset(name)
    await frame(`B10.${String(over.supportStyle)}`, over)
  }
  // the A frame at (2, 0.3, 3), turned by 30 degrees: its first leg in the level's (u, height, v)
  const over = { ...preset('aFrameSupport'), position: [2, 0.3, 3], rotation: Math.PI / 6 }
  const leg = (await drawn(over, true))[0]!
  const bar = own(over)[0] as Bar
  const c = column(over as Partial<Column>)
  row('B10.a-frame.placed(2, 0.3, 3; 30 deg).member(0)', `from ${pt(leg.start)} to ${pt(leg.end)}`)
  row('B10.a-frame.placed(2, 0.3, 3; 30 deg).member(0).by_equation', `from ${pt(placeOf(c, bar.start))} to ${pt(placeOf(c, bar.end))}`)
}

title('B11 frames with depth (the presets): tripod, trestle, portal, box; the plates (a frame made with no numbers given, plates on); the limits')
{
  await frame('B11.tripod', preset('tripodSupport'))
  await frame('B11.trestle', preset('trestleSupport'))
  await frame('B11.portal-frame', preset('portalFrameSupport'))
  await frame('B11.box-frame', preset('boxFrameSupport'), [0, 4, 8])
  for (const supportStyle of ['a-frame', 'y-frame', 'v-frame', 'x-brace', 'k-brace', 'single-strut', 'tripod', 'trestle', 'portal-frame', 'box-frame']) {
    const over = { supportStyle }
    const seen = await drawn(over)
    const parts = own(over)
    const plates = seen.filter((s) => s.triangles !== 24)
    const ownPlates = parts.filter((p) => p.shape === 'block')
    const reach = (list: Array<{ min: V3; max: V3 }>) => `x ${num(Math.min(...list.map((b) => b.min[0])))}..${num(Math.max(...list.map((b) => b.max[0])))} z ${num(Math.min(...list.map((b) => b.min[2])))}..${num(Math.max(...list.map((b) => b.max[2])))}`
    row(`B11.plates.${supportStyle}`, `${plates.length} plates, together ${num(sum(plates.map((s) => s.volume)))} m3, within ${reach(plates)}`)
    row(`B11.plates.${supportStyle}.by_equation`, `${ownPlates.length} plates, together ${num(sum(ownPlates.map(volumeOf)))} m3, within ${reach(ownPlates.map(boxOf))}`)
    if (supportStyle === 'a-frame') {
      const bars = seen.length - plates.length
      for (let i = 0; i < 3; i += 1) part('B11.plates.a-frame', seen, parts, 'frame', bars + i, `plate(${i})`)
    }
  }
  const { seen, parts } = await frame('B11.limits(y-frame, height 0.1, member 2 x 0.01, top 0)', { supportStyle: 'y-frame', height: 0.1, braceWidth: 2, braceDepth: 0.01, braceTopSpread: 0, edgeSoftness: 0 })
  part('B11.limits(y-frame, height 0.1, member 2 x 0.01, top 0)', seen, parts, 'frame', 3, 'plate(0)')
  await frame('B11.limits(a-frame, bottom 0.5, top 2)', { supportStyle: 'a-frame', braceBottomSpread: 0.5, braceTopSpread: 2, bracePlateEnabled: false })
}

title("R1 the nearest records (lines lane_a and revolved are worked here from lane A's formulas and this entry's rule: not the old editor, not run through FreeCAD): BranchingColumn with one fork against the Y frame and the tripod of the presets, in a record's frame (x east, y north, z up); the round parts of two presets as a Revolved outline")
{
  // freecad/Organic/organic_biomimetic.py, branching_column(), for levels = 1
  const laneA = (height: number, trunk: number, branches: number, spread: number, trunkRadius: number, exponent = 2.3, tipRadius = 0.04) => {
    const ratio = branches ** (-1 / exponent)
    const neck = 0.9 * trunkRadius
    const r0 = Math.max(tipRadius, neck * ratio)
    const r1 = Math.max(tipRadius, r0 * 0.9)
    const cap = 2 * r1
    const rise = height - cap / 2 - trunk
    const forks: V3[] = []
    for (let k = 0; k < branches; k += 1) {
      const a = ((90 + (360 * k) / branches) * Math.PI) / 180
      forks.push([spread * Math.cos(a), spread * Math.sin(a), trunk + rise])
    }
    return { neck, r0, r1, cap, forks }
  }
  // the old editor's frame as a record would hold it: x = X, y = -Z, z = Y
  const record = (p: V3): V3 => [p[0], -p[2], p[1]]
  const y = (await drawn(preset('yFrameSupport'))).filter((s) => s.triangles === 24)
  y.forEach((s, i) => row(`R1.y-frame.member(${i})`, `from ${pt(record(s.start))} to ${pt(record(s.end))} section ${num(s.width)} x ${num(s.depth)}`))
  const a = laneA(2.5, 1.4, 2, 0.5, 0.08)
  row('R1.lane_a(Height 2.5, Trunk 1.4, Branches 2, Spread 0.5, TrunkRadius 0.08).trunk', `from ${pt([0, 0, 0])} to ${pt([0, 0, 1.4])} round, radius ${num(0.08)} to ${num(a.neck)}`)
  a.forks.forEach((end, i) => row(`R1.lane_a.branch(${i})`, `from ${pt([0, 0, 1.4])} to ${pt(end)} round, radius ${num(a.r0)} to ${num(a.r1)}, then a cap ${num(a.cap)} high of radius ${num(1.5 * a.r1)} up to ${num(2.5)}`))
  const tripod = (await drawn(preset('tripodSupport'))).filter((s) => s.triangles === 24)
  row('R1.tripod.feet', tripod.map((s) => `${num(Math.hypot(s.start[0], s.start[2]))} m at ${num((Math.atan2(-s.start[2], s.start[0]) * 180) / Math.PI, 1)} deg`).join(', '))
  const three = laneA(2.5, 1.4, 3, 0.55, 0.07)
  row('R1.lane_a(Branches 3, Spread 0.55).tips', three.forks.map((end) => `${num(Math.hypot(end[0], end[1]))} m at ${num((Math.atan2(end[1], end[0]) * 180) / Math.PI, 1)} deg`).join(', '))
  // the round parts of two presets as the outline of one solid of revolution (radius, height),
  // by the entry's rule; what that outline holds, by the cone's frustum
  for (const name of ['basicPillar', 'taperedPillar'] as const) {
    const outline = revolvedProfileOf(column(preset(name) as Partial<Column>))
    const shown = outline.length <= 4 ? outline.map((p) => pt(p)).join(' ') : `${pt(outline[0]!)} ${pt(outline[1]!)} and so on to ${pt(outline[outline.length - 2]!)} ${pt(outline[outline.length - 1]!)}`
    row(`R1.revolved(${name}: shaft and capital)`, `${outline.length} points ${shown}, holding ${num(revolvedVolume(outline))} m3`)
  }
}

// ------------------------------------------------------------------ a wider sweep, on request
// PORT_SWEEP=1 bun ../../ports/refcases/08-column-body.ts
// Not part of the reference block. Holds every part of several hundred columns (every base,
// capital, profile, section and frame, with twists, rings, limits) against the equations:
// the same slot, the same triangles, box and volume within 2e-6, a bar's ends and section.
if (process.env.PORT_SWEEP) {
  let columns = 0
  let partsSeen = 0
  let faults = 0
  const hold = async (name: string, over: Over) => {
    const seen = await drawn(over)
    const parts = own(over)
    columns += 1
    partsSeen += seen.length
    const said: string[] = []
    if (seen.length !== parts.length) said.push(`the editor draws ${seen.length} parts, the equations give ${parts.length}`)
    for (let i = 0; i < Math.min(seen.length, parts.length); i += 1) {
      const s = seen[i]!
      const p = parts[i]!
      const b = boxOf(p)
      const bad: string[] = []
      if (s.slot !== p.slot) bad.push('slot')
      if (s.triangles !== trianglesOf(p)) bad.push(`triangles ${s.triangles}/${trianglesOf(p)}`)
      for (let axis = 0; axis < 3; axis += 1) {
        if (Math.abs(s.min[axis]! - b.min[axis]!) > 2e-6 || Math.abs(s.max[axis]! - b.max[axis]!) > 2e-6) bad.push(`box ${axis}: ${num(s.min[axis]!)}..${num(s.max[axis]!)} / ${num(b.min[axis]!)}..${num(b.max[axis]!)}`)
      }
      if (Math.abs(s.volume - volumeOf(p)) > 2e-6) bad.push(`volume ${num(s.volume, 8)}/${num(volumeOf(p), 8)}`)
      if (p.shape === 'bar') {
        for (let axis = 0; axis < 3; axis += 1) {
          if (Math.abs(s.start[axis]! - p.start[axis]!) > 2e-6 || Math.abs(s.end[axis]! - p.end[axis]!) > 2e-6) bad.push(`end ${axis}`)
        }
        if (Math.abs(s.width - p.width) > 2e-6 || Math.abs(s.depth - p.depth) > 2e-6) bad.push('section')
      }
      if (bad.length > 0) said.push(`part ${i} (${p.shape}): ${bad.join(', ')}`)
    }
    if (said.length > 0) {
      faults += 1
      console.log(`FAULT ${name}\n   ${said.slice(0, 8).join('\n   ')}`)
    }
  }
  const plain = { capitalBandCount: 0 }
  title('the sweep')
  await hold('no numbers given, bands off', plain)
  for (const name of Object.keys(COLUMN_PRESETS) as Array<keyof typeof COLUMN_PRESETS>) {
    await hold(`preset ${name}`, preset(name))
    if ('supportStyle' in preset(name)) await hold(`preset ${name}, plates on`, { ...preset(name), bracePlateEnabled: true })
  }
  for (const crossSection of ['round', 'octagonal', 'sixteen-sided', 'square', 'rectangular']) {
    for (const baseStyle of ['none', 'simple-square', 'round-rings', 'square-plinth', 'stepped-square', 'lotus', 'ribbed-lotus', 'panelled-pedestal']) {
      await hold(`base ${baseStyle} on ${crossSection}`, { ...plain, crossSection, baseStyle, baseRibCount: 6, depth: 0.3, baseDepthScale: 1.1 })
      await hold(`base ${baseStyle} on ${crossSection}, tall and soft`, { ...plain, crossSection, baseStyle, baseHeight: 0.6, edgeSoftness: 0.12, baseTierCount: 5, baseStepSpread: 0.2 })
      await hold(`base ${baseStyle} on ${crossSection}, eight tiers, no height to spare`, { ...plain, crossSection, baseStyle, height: 0.05, baseTierCount: 8, baseStepSpread: 1, basePanelInset: 0, edgeSoftness: 0.0011 })
    }
    for (const capitalStyle of ['none', 'simple', 'simple-slab', 'rounded', 'stepped', 'doric', 'south-indian-bracket', 'wood-bracket']) {
      await hold(`capital ${capitalStyle} on ${crossSection}`, { ...plain, crossSection, capitalStyle, depth: 0.3, capitalDepthScale: 1.2 })
      await hold(`capital ${capitalStyle} on ${crossSection}, tall`, { ...plain, crossSection, capitalStyle, capitalHeight: 0.5, capitalTierCount: 6, bracketTierCount: 1, bracketDepth: 0.2 })
      await hold(`capital ${capitalStyle} on ${crossSection}, no tiers asked`, { ...plain, crossSection, capitalStyle, bracketTierCount: 0, capitalTierCount: 1, edgeSoftness: 0.001 })
    }
    for (const shaftProfile of ['straight', 'tapered', 'bulged', 'baluster', 'hourglass']) {
      await hold(`profile ${shaftProfile} on ${crossSection}`, { ...plain, crossSection, shaftProfile, shaftTaper: 0.2, shaftBulge: 0.15, shaftStartScale: 0.9, shaftEndScale: 0.7, shaftSegmentCount: 6, edgeSoftness: 0 })
      await hold(`profile ${shaftProfile} twisted on ${crossSection}`, { ...plain, crossSection, shaftProfile, shaftBulge: 0.1, shaftTwistStep: 15, shaftSegmentCount: 5, edgeSoftness: 0, depth: 0.3 })
      await hold(`profile ${shaftProfile} twisted back on ${crossSection}`, { ...plain, crossSection, shaftProfile, shaftBulge: -0.2, shaftTwistStep: -40, shaftSegmentCount: 2, edgeSoftness: 0 })
      await hold(`profile ${shaftProfile} at its limits on ${crossSection}`, { ...plain, crossSection, shaftProfile, shaftTaper: 0.85, shaftBulge: -0.5, shaftStartScale: 2, shaftEndScale: 0.2, shaftSegmentCount: 7, shaftCornerRadius: 0.001, edgeSoftness: 0 })
    }
    await hold(`rings and bands on ${crossSection}`, { ...plain, crossSection, ringCount: 4, latheRingCount: 3, fluteCount: 8 })
    await hold(`details by name on ${crossSection}`, { ...plain, crossSection, shaftDetail: 'lathe-turned' })
    await hold(`flutes by name on ${crossSection}`, { ...plain, crossSection, shaftDetail: 'fluted', fluteWidth: 0.01 })
    for (const spacing of ['ends', 'even', 'top', 'bottom']) {
      await hold(`rings ${spacing} on ${crossSection}`, { ...plain, crossSection, ringCount: 5, ringPlacement: spacing, latheRingCount: 5, latheRingSpacing: spacing, ringSpread: 0.3, shaftProfile: 'bulged', shaftBulge: 0.3, shaftSegmentCount: 3 })
      await hold(`many rings ${spacing} on ${crossSection}`, { ...plain, crossSection, ringCount: 16, ringPlacement: spacing, latheRingCount: 32, latheRingSpacing: spacing, ringThickness: 0.14, ringSpread: 0.45 })
      await hold(`one ring ${spacing} on ${crossSection}`, { ...plain, crossSection, ringCount: 1, ringPlacement: spacing, latheRingCount: 1, latheRingSpacing: spacing, ringSpread: 0.04, height: 0.6 })
      await hold(`two rings ${spacing} on ${crossSection}`, { ...plain, crossSection, ringCount: 2, ringPlacement: spacing, latheRingCount: 2, latheRingSpacing: spacing })
    }
  }
  for (const shaftTwistStep of [15, -40, 45, 90]) {
    await hold(`a square shaft with sharp corners and soft edges, twisted by ${shaftTwistStep}`, { ...plain, crossSection: 'square', shaftCornerRadius: 0, shaftTwistStep, shaftSegmentCount: 5 })
    await hold(`a rectangular shaft with sharp corners and softer edges, twisted by ${shaftTwistStep}`, { ...plain, crossSection: 'rectangular', depth: 0.3, edgeSoftness: 0.12, shaftCornerRadius: 0.0005, shaftTwistStep, shaftSegmentCount: 4 })
  }
  await hold('cluster', { ...plain, style: 'cluster' })
  await hold('cluster, wide, twisted', { ...plain, style: 'cluster', width: 1, radius: 0.1, shaftTwistStep: 20 })
  await hold('caps', { ...plain, height: 1, baseHeight: 0.6, capitalHeight: 0.5 })
  await hold('short', { ...plain, height: 0.3 })
  await hold('no base height, no capital height', { ...plain, baseHeight: 0, capitalHeight: 0 })
  await hold('corner radius', { ...plain, crossSection: 'rectangular', depth: 0.2, shaftCornerRadius: 0.3 })
  await hold('sharp corners', { ...plain, crossSection: 'square', shaftCornerRadius: 0 })
  await hold('scale floor', { ...plain, shaftProfile: 'hourglass', shaftBulge: 0.8, shaftStartScale: 0.2, shaftEndScale: 0.2, shaftSegmentCount: 4 })
  await hold('tiers', { ...plain, baseStyle: 'stepped-square', baseTierCount: 1, baseStepSpread: 1, capitalStyle: 'stepped', capitalTierCount: 8, capitalStepSpread: 1 })
  await hold('plinth ratio', { ...plain, basePlinthHeightRatio: 0.7 })
  for (const supportStyle of ['a-frame', 'y-frame', 'v-frame', 'x-brace', 'k-brace', 'single-strut', 'tripod', 'trestle', 'portal-frame', 'box-frame']) {
    await hold(`frame ${supportStyle}, no numbers given`, { supportStyle })
    await hold(`frame ${supportStyle}, other numbers`, { supportStyle, height: 3, braceWidth: 0.1, braceDepth: 0.2, braceBottomSpread: 1.6, braceTopSpread: 0.8, edgeSoftness: 0 })
    await hold(`frame ${supportStyle}, wider at the top`, { supportStyle, braceBottomSpread: 0.5, braceTopSpread: 2, edgeSoftness: 0.12 })
    await hold(`frame ${supportStyle}, at its limits`, { supportStyle, height: 0.1, braceWidth: 2, braceDepth: 0.01, braceBottomSpread: 0.2, braceTopSpread: 0, edgeSoftness: 0 })
    await hold(`frame ${supportStyle}, thin members`, { supportStyle, braceWidth: 0.02, braceDepth: 0.05, braceBottomSpread: 0.3, braceTopSpread: 0.3 })
  }
  row('sweep.columns', columns)
  row('sweep.parts', partsSeen)
  row('sweep.columns_that_differ', faults)
}
