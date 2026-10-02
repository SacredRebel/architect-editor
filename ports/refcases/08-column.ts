// Reference cases for the column (port note entry 8): its numbers, where it stands, the box the
// level takes it for, and its plan symbol. The body is in 08-column-body.ts.
// cd packages/viewer && bun ../../ports/refcases/08-column.ts
//
// Two halves. The first calls the old editor's own functions. The second works the same things
// out again from the port note's equations alone (_column-equations.ts), calling nothing of the
// old editor: a line `K.by_equation` must give the number of the line `K` (verify.ts holds the
// two together). With PORT_TABLE=1 set, case K1 also prints the presets as the two tables of
// the entry (not part of the reference block).
import {
  type AnyNode,
  COLUMN_PRESETS,
  ColumnNode,
  type GeometryContext,
  getFloorStackedPosition,
  LevelNode,
  nodeRegistry,
  registerNode,
  SlabNode,
  spatialGridManager,
} from '@pascal-app/core'
import { planFootprintCorners } from '@pascal-app/core/plan-footprint'
import { columnDefinition } from '../../packages/nodes/src/column/definition'
import { buildColumnFloorplan, getColumnFloorplanFootprint } from '../../packages/nodes/src/column/floorplan'
import {
  type Column,
  centreMarkOf,
  column,
  type P,
  planSymbolOf,
  type Slab,
  standingBoxOf,
  standingCornersOf,
  supportOf,
  turned,
} from './_column-equations'
import { num, pt, pts, row, title } from './_print'

type Over = Record<string, unknown>
let made = 0
function node(over: Over = {}): ColumnNode {
  made += 1
  return ColumnNode.parse({ id: `column_k${made}`, ...over })
}
const mine = (over: Over = {}) => column(over as Partial<Column>)
const say = (value: unknown) => (Array.isArray(value) ? `[${value.join(', ')}]` : String(value))
const deg = (degrees: number) => (degrees * Math.PI) / 180
const symbol = (over: Over) => getColumnFloorplanFootprint(node(over)).map(([x, y]) => ({ x, y }))
const sizeOf = (points: P[]) =>
  `${num(Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y))} x ${num(Math.hypot(points[3]!.x - points[0]!.x, points[3]!.y - points[0]!.y))}`
const reachOf = (points: P[]) =>
  `${num(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)))} x ${num(Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)))}`

// ------------------------------------------------------------------ the cases
title('K0 a column made with no numbers given: its defaults, and what each number may be')
{
  const fresh = node() as unknown as Record<string, unknown>
  const own = mine() as unknown as Record<string, unknown>
  const groups: Array<[string, string[]]> = [
    ['main', ['supportStyle', 'crossSection', 'style', 'height', 'radius', 'width', 'depth', 'edgeSoftness']],
    ['base', ['baseStyle', 'baseHeight', 'baseWidthScale', 'baseDepthScale', 'baseTierCount', 'baseStepSpread', 'basePlinthHeightRatio', 'baseRoundBandScale', 'baseNeckScale', 'baseRibCount', 'basePanelInset']],
    ['shaft', ['shaftProfile', 'shaftStartScale', 'shaftEndScale', 'shaftTaper', 'shaftBulge', 'shaftSegmentCount', 'shaftTwistStep', 'shaftDetail', 'shaftCornerRadius']],
    ['capital', ['capitalStyle', 'capitalHeight', 'capitalWidthScale', 'capitalDepthScale', 'capitalTierCount', 'capitalStepSpread', 'bracketTierCount', 'bracketDepth']],
    ['details', ['ringCount', 'ringPlacement', 'ringThickness', 'ringSpread', 'latheRingCount', 'latheRingSpacing', 'fluteCount', 'fluteWidth']],
    ['frame', ['bracePlateEnabled', 'braceWidth', 'braceDepth', 'braceBottomSpread', 'braceTopSpread']],
    ['place', ['rotation', 'supportSlabId', 'position']],
  ]
  for (const [name, keys] of groups) {
    row(`K0.default.${name}`, keys.map((key) => `${key} ${say(fresh[key])}`).join(' '))
    row(`K0.default.${name}.by_equation`, keys.map((key) => `${key} ${say(own[key])}`).join(' '))
  }
  const listed = new Set(groups.flatMap(([, keys]) => keys))
  const shape = (ColumnNode as unknown as { shape: Record<string, unknown> }).shape
  const general = ['object', 'id', 'type', 'name', 'parentId', 'visible', 'camera', 'metadata', 'children', 'material', 'materialPreset', 'slots']
  const ornament = Object.keys(shape).filter((key) => !listed.has(key) && !general.includes(key))
  row('K0.default.ornament', ornament.map((key) => `${key} ${say(fresh[key])}`).join(' '))

  // what the schema lets each number be
  type Check = { _zod?: { def?: { check?: string; value?: number; inclusive?: boolean } } }
  type Inner = { minValue?: number | null; maxValue?: number | null; isInt?: boolean; options?: string[]; def?: { type?: string; checks?: Check[] } }
  const innerOf = (key: string) => ((shape[key] as { unwrap?: () => unknown }).unwrap?.() ?? shape[key]) as Inner
  const limitOf = (key: string): string | null => {
    const inner = innerOf(key)
    if (inner.def?.type !== 'number') return null
    const lower = (inner.def.checks ?? []).map((check) => check._zod?.def).find((def) => def?.check === 'greater_than')
    const low = lower ? (lower.inclusive ? String(lower.value) : `above ${lower.value}`) : 'any'
    const high = Number.isFinite(inner.maxValue ?? Number.POSITIVE_INFINITY) ? ` to ${inner.maxValue}` : lower?.inclusive ? ' or more' : ''
    return `${key} ${low}${high}${inner.isInt ? ' whole' : ''}`
  }
  for (const [name, keys] of [...groups, ['ornament', ornament] as [string, string[]]]) {
    const limits = keys.map(limitOf).filter((entry): entry is string => entry !== null)
    if (limits.length > 0) row(`K0.limits.${name}`, limits.join(', '))
  }
  for (const key of Object.keys(shape)) {
    const options = innerOf(key).options
    if (options) row(`K0.choices.${key}`, options.join(' '))
  }

  // the smallest value each handle of the 3D view lets a number take, and the inspector's fields
  type Handle = { min?: number; apply: (n: ColumnNode, value: never) => Record<string, unknown> }
  const handlesOf = (n: ColumnNode) => (typeof columnDefinition.handles === 'function' ? columnDefinition.handles(n) : (columnDefinition.handles ?? [])) as unknown as Handle[]
  for (const [name, over] of [['round', {}], ['square', { crossSection: 'square' }], ['rectangular', { crossSection: 'rectangular' }], ['a-frame', { supportStyle: 'a-frame' }], ['box-frame', { supportStyle: 'box-frame' }]] as Array<[string, Over]>) {
    const n = node(over)
    row(
      `K0.handle_minimum.${name}`,
      handlesOf(n)
        .filter((handle) => typeof handle.min === 'number')
        .map((handle) => `${Object.keys(handle.apply(n, 9 as never)).join('+')} ${handle.min}`)
        .join(', '),
    )
  }
  const fields = (columnDefinition.parametrics as unknown as { groups: Array<{ fields: Array<{ key: string; min: number; max: number; step: number }> }> }).groups[0]!.fields
  row('K0.inspector', fields.map((field) => `${field.key} ${field.min} to ${field.max} step ${field.step}`).join(', '))
}

title('K1 the 15 presets: the numbers each one sets')
{
  type Preset = Record<string, unknown>
  const presets = COLUMN_PRESETS as unknown as Record<string, Preset>
  const names = Object.keys(presets)
  const frames = names.filter((name) => 'supportStyle' in presets[name]!)
  const pillars = names.filter((name) => !frames.includes(name))
  const keysOf = (list: string[]) => [...new Set(list.flatMap((name) => Object.keys(presets[name]!)))].filter((key) => key !== 'label')
  const same = (list: string[], key: string) => list.every((name) => key in presets[name]! && presets[name]![key] === presets[list[0]!]![key])
  const inAll = keysOf(names).filter((key) => same(names, key))
  const inPillars = keysOf(pillars).filter((key) => !inAll.includes(key) && same(pillars, key))
  const inFrames = keysOf(frames).filter((key) => !inAll.includes(key) && same(frames, key))
  const pairs = (preset: Preset, keys: string[]) => keys.map((key) => `${key} ${say(preset[key])}`).join(' ')
  row('K1.presets', `${names.length}: ${pillars.length} columns, ${frames.length} frames`)
  row('K1.in_all', pairs(presets[names[0]!]!, inAll))
  row('K1.in_all_columns', pairs(presets[pillars[0]!]!, inPillars))
  row('K1.in_all_frames', pairs(presets[frames[0]!]!, inFrames))
  for (const name of names) {
    const shared = [...inAll, ...(pillars.includes(name) ? inPillars : inFrames)]
    const ownKeys = Object.keys(presets[name]!).filter((key) => key !== 'label' && !shared.includes(key))
    row(`K1.${name}`, `"${String(presets[name]!.label)}" ${pairs(presets[name]!, ownKeys)}`)
  }
  if (process.env.PORT_TABLE) {
    // the same numbers as the two tables of the entry (not part of the reference block)
    const cell = (value: unknown) => String(value)
    const table = (list: string[], keys: string[]) => {
      console.log(`| preset | label | ${keys.join(' | ')} |`)
      console.log(`|---|---|${keys.map(() => '---').join('|')}|`)
      for (const name of list) console.log(`| \`${name}\` | ${cell(presets[name]!.label)} | ${keys.map((key) => cell(presets[name]![key])).join(' | ')} |`)
    }
    table(pillars, keysOf(pillars).filter((key) => !inAll.includes(key) && !inPillars.includes(key)))
    table(frames, keysOf(frames).filter((key) => !inAll.includes(key) && !inFrames.includes(key)))
  }
}

title('K2 the turn: a rectangular column 0.6 by 0.3 at (2, 3), its plan symbol turned by 0, 30 and 90 degrees')
for (const degrees of [0, 30, 90]) {
  const over = { crossSection: 'rectangular', width: 0.6, depth: 0.3, baseWidthScale: 1, baseDepthScale: 1, capitalWidthScale: 1, capitalDepthScale: 1, position: [2, 0, 3], rotation: deg(degrees) }
  const drawn = symbol(over)
  const own = planSymbolOf(mine(over))
  row(`K2.symbol(${degrees} deg)`, pts(drawn))
  row(`K2.symbol(${degrees} deg).by_equation`, pts(own))
  // where the column's own +X points: from the symbol's first corner to its second
  row(`K2.own_x(${degrees} deg)`, pt({ x: (drawn[1]!.x - drawn[0]!.x) / 0.6, y: (drawn[1]!.y - drawn[0]!.y) / 0.6 }))
  const [du, dv] = turned(1, 0, deg(degrees))
  row(`K2.own_x(${degrees} deg).by_equation`, pt({ x: du, y: dv }))
}

title('K3 the plan symbol of a column: its outline, its size along u and v, the cross at its middle')
{
  const context = { resolve: () => undefined, children: [], siblings: [], parent: null } as unknown as GeometryContext
  const cases: Array<[string, Over]> = [
    ['default', {}],
    ['octagonal', { crossSection: 'octagonal' }],
    ['sixteen-sided', { crossSection: 'sixteen-sided' }],
    ['square', { crossSection: 'square' }],
    ['rectangular_0.6x0.3', { crossSection: 'rectangular', width: 0.6, depth: 0.3 }],
    ['no_base_no_capital', { baseStyle: 'none', capitalStyle: 'none' }],
    ['preset_basicPillar', { ...(COLUMN_PRESETS.basicPillar as Over) }],
    ['slender_radius_0.05', { radius: 0.05, width: 0.1, depth: 0.1 }],
    ['radius_0.15', { radius: 0.15, width: 0.3, depth: 0.3 }],
  ]
  for (const [name, over] of cases) {
    const drawn = symbol(over)
    const own = planSymbolOf(mine(over))
    const built = buildColumnFloorplan(node(over), context) as unknown as { children: Array<{ kind: string; x1?: number; x2?: number }> }
    const line = built.children.find((child) => child.kind === 'line')!
    row(`K3.${name}`, `${drawn.length} corners, ${reachOf(drawn)}, cross ${num((line.x2! - line.x1!) / 2)}`)
    row(`K3.${name}.by_equation`, `${own.length} corners, ${reachOf(own)}, cross ${num(centreMarkOf(mine(over)))}`)
  }
  const eight = symbol({ crossSection: 'octagonal' })
  row('K3.octagonal.outline', pts(eight))
  row('K3.octagonal.outline.by_equation', pts(planSymbolOf(mine({ crossSection: 'octagonal' }))))
  row('K3.default.first_three', pts(symbol({}).slice(0, 3)))
  row('K3.default.first_three.by_equation', pts(planSymbolOf(mine()).slice(0, 3)))
}

title('K4 the plan symbol of a support frame: a rectangle, its size along the frame and across it')
{
  const presets = COLUMN_PRESETS as unknown as Record<string, Over>
  for (const preset of Object.values(presets)) {
    if (!('supportStyle' in preset)) continue
    row(`K4.${String(preset.supportStyle)}`, sizeOf(symbol(preset)))
    row(`K4.${String(preset.supportStyle)}.by_equation`, sizeOf(planSymbolOf(mine(preset))))
  }
  const more: Array<[string, Over]> = [
    ['y-frame(bottom 2, top 0.5)', { supportStyle: 'y-frame', braceBottomSpread: 2, braceTopSpread: 0.5 }],
    ['a-frame(bottom 0.5, top 2)', { supportStyle: 'a-frame', braceBottomSpread: 0.5, braceTopSpread: 2 }],
    ['tripod(bottom 0.6, top 1.4)', { supportStyle: 'tripod', braceBottomSpread: 0.6, braceTopSpread: 1.4 }],
    ['portal-frame(bottom 0.4, member 0.3 x 0.05)', { supportStyle: 'portal-frame', braceBottomSpread: 0.4, braceTopSpread: 0, braceWidth: 0.3, braceDepth: 0.05 }],
  ]
  for (const [name, over] of more) {
    row(`K4.${name}`, sizeOf(symbol(over)))
    row(`K4.${name}.by_equation`, sizeOf(planSymbolOf(mine(over))))
  }
}

title('K5 the box the level takes a column for (what it stands on, what it runs into): its size; and for an A frame at (2, 3) turned by 30 degrees its corners in the plan, against the plan symbol')
{
  const footprint = (n: ColumnNode) => columnDefinition.capabilities!.floorPlaced!.footprint!(n as unknown as AnyNode)!
  const presets = COLUMN_PRESETS as unknown as Record<string, Over>
  const cases: Array<[string, Over]> = [
    ['round', {}],
    ['octagonal', { crossSection: 'octagonal' }],
    ['square(width 0.5, depth 0.3)', { crossSection: 'square', width: 0.5, depth: 0.3 }],
    ['rectangular(0.6 x 0.3)', { crossSection: 'rectangular', width: 0.6, depth: 0.3 }],
    ['a-frame(preset)', presets.aFrameSupport!],
    ['y-frame(preset)', presets.yFrameSupport!],
    ['tripod(preset)', presets.tripodSupport!],
    ['box-frame(preset)', presets.boxFrameSupport!],
    ['a-frame(no numbers given)', { supportStyle: 'a-frame' }],
  ]
  for (const [name, over] of cases) {
    const size = footprint(node(over)).dimensions
    row(`K5.${name}`, `${num(size[0])} x ${num(size[2])}, ${num(size[1])} high`)
    const own = standingBoxOf(mine(over)).size
    row(`K5.${name}.by_equation`, `${num(own[0])} x ${num(own[2])}, ${num(own[1])} high`)
  }
  // an A frame at (2, 3) turned by 30 degrees: the box against the plan symbol
  const over = { supportStyle: 'a-frame', position: [2, 0, 3], rotation: deg(30) }
  const n = node(over)
  const box = footprint(n)
  const corners = planFootprintCorners(n.position, box.dimensions, (box.rotation as [number, number, number])[1]).map(([x, y]) => ({ x, y }))
  row('K5.a-frame(30 deg).box_corners', pts(corners))
  row('K5.a-frame(30 deg).box_corners.by_equation', pts(standingCornersOf(mine(over))))
  row('K5.a-frame(30 deg).symbol_corners', pts(symbol(over)))
  row('K5.a-frame(30 deg).symbol_corners.by_equation', pts(planSymbolOf(mine(over))))
}

title('K6 what it stands on: a level with a floor slab from (0, 0) to (4, 4) whose top is 0.15 m up; a default column at (2, 2), (6, 2), (4.2, 2) and (4.215, 2); an A frame at (4.4, 4.2) turned by +30 and by -30 degrees')
{
  if (!nodeRegistry.get('column')) registerNode(columnDefinition as never)
  const level = LevelNode.parse({ id: 'level_k6' })
  const slab = SlabNode.parse({ id: 'slab_k6', parentId: level.id, polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], elevation: 0.15 })
  spatialGridManager.handleNodeCreated(slab as AnyNode, level.id)
  const slabs: Slab[] = [{ id: slab.id, outline: slab.polygon.map(([x, y]) => ({ x, y })), elevation: 0.15 }]
  const onSlab = (points: P[]) => points.some((p) => p.x > 0 && p.x < 4 && p.y > 0 && p.y < 4)
  const cases: Array<[string, Over, boolean]> = [
    ['on_the_slab', { position: [2, 0, 2] }, false],
    ['off_the_slab', { position: [6, 0, 2] }, false],
    ['on_the_slab_stored_0.3', { position: [2, 0.3, 2] }, false],
    ['on_the_slab_named_ground', { position: [2, 0, 2], supportSlabId: 'ground' }, false],
    ['on_the_slab_named', { position: [2, 0, 2], supportSlabId: slab.id }, false],
    ['box_0.02_over_the_edge', { position: [4.2, 0, 2] }, false],
    ['box_0.005_over_the_edge', { position: [4.215, 0, 2] }, false],
    ['frame(+30 deg)', { supportStyle: 'a-frame', position: [4.4, 0, 4.2], rotation: deg(30) }, true],
    ['frame(-30 deg)', { supportStyle: 'a-frame', position: [4.4, 0, 4.2], rotation: deg(-30) }, true],
  ]
  for (const [name, over, both] of cases) {
    const n = ColumnNode.parse({ id: 'column_k6', parentId: level.id, ...over })
    const nodes = { [level.id]: level, [slab.id]: slab, [n.id]: n } as unknown as Record<string, AnyNode>
    const at = getFloorStackedPosition({ node: n as unknown as AnyNode, nodes, position: n.position, rotation: n.rotation })
    const own = mine(over)
    const foot = own.position[1] + supportOf(own, slabs)
    if (!both) {
      row(`K6.${name}`, `foot ${num(at[1])}`)
      row(`K6.${name}.by_equation`, `foot ${num(foot)}`)
      continue
    }
    const box = columnDefinition.capabilities!.floorPlaced!.footprint!(n as unknown as AnyNode)!
    const corners = planFootprintCorners(n.position, box.dimensions, (box.rotation as [number, number, number])[1]).map(([x, y]) => ({ x, y }))
    const drawn = getColumnFloorplanFootprint(n).map(([x, y]) => ({ x, y }))
    row(`K6.${name}`, `foot ${num(at[1])}, a corner of the box on the slab ${onSlab(corners)}, a corner of the symbol on the slab ${onSlab(drawn)}`)
    row(`K6.${name}.by_equation`, `foot ${num(foot)}, a corner of the box on the slab ${onSlab(standingCornersOf(own))}, a corner of the symbol on the slab ${onSlab(planSymbolOf(own))}`)
  }
}
