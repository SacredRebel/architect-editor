#!/usr/bin/env bun
/**
 * H19 scene fixture — built once, as data.
 *
 * One small house (four rooms, a gable roof, six openings, one stair), twenty
 * catalog items and thirty catalog trees from Pascal's own item library, on a
 * synthetic EcoSite (a terrain heightfield with a flat pad round the house).
 * Deterministic: explicit ids, closed-form positions, no randomness, no clock.
 *
 * Nodes are made with core's own zod parsers (defaults filled, types checked)
 * and the graph is checked with core's validateBuildJson. The capture harness
 * loads it through the eco/1 bridge, the path the world uses:
 *   eco:hello → eco:load-scene (the graph) → eco:load-site (the EcoSite).
 * Item models are the copies the editor serves itself
 * (apps/editor/public/items/<id>/); their URLs are written as {{origin}} and
 * filled in by the harness, so one committed file serves every local port.
 *
 *   bun packages/viewer/test/fixtures/make-h19-scene.mjs
 *   → packages/viewer/test/fixtures/h19-scene.json
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BuildingNode,
  DoorNode,
  ItemNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  SiteNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  validateBuildJson,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core'
import { CATALOG_ITEMS } from '../../../editor/src/components/ui/item-catalog/catalog-items.tsx'

// Parsing needs a real allow-listed origin; it is swapped for {{origin}} on write.
const SENTINEL_ORIGIN = 'http://127.0.0.1:65535'
const LEVEL = 'level_h19_0'
const LEVEL_HEIGHT = 2.7
// The house is 12 m x 9 m; the building is placed so its centre sits on the origin.
const HOUSE_W = 12
const HOUSE_D = 9
const BUILDING_POSITION = [-HOUSE_W / 2, 0, -HOUSE_D / 2]

const nodes = {}
const add = (node) => {
  nodes[node.id] = node
  return node
}
const round = (value, places = 3) => Number(value.toFixed(places))

// ---------------------------------------------------------------- structure
const site = add(SiteNode.parse({ id: 'site_h19', children: ['building_h19'] }))
add(
  BuildingNode.parse({
    id: 'building_h19',
    parentId: site.id,
    position: BUILDING_POSITION,
    children: [LEVEL],
  }),
)
const levelChildren = []

// Perimeter walls (T-junctions with the partitions, as in upstream's templates);
// the two partitions are split where they cross.
const WALLS = [
  ['wall_h19_south', [0, 0], [HOUSE_W, 0], 0.2],
  ['wall_h19_east', [HOUSE_W, 0], [HOUSE_W, HOUSE_D], 0.2],
  ['wall_h19_north', [HOUSE_W, HOUSE_D], [0, HOUSE_D], 0.2],
  ['wall_h19_west', [0, HOUSE_D], [0, 0], 0.2],
  ['wall_h19_part_ns_a', [6, 0], [6, 4.5], 0.12],
  ['wall_h19_part_ns_b', [6, 4.5], [6, HOUSE_D], 0.12],
  ['wall_h19_part_ew_a', [0, 4.5], [6, 4.5], 0.12],
  ['wall_h19_part_ew_b', [6, 4.5], [HOUSE_W, 4.5], 0.12],
]
// Openings: [id, kind, wallId, metres along the wall, width, height, sill]
const OPENINGS = [
  ['door_h19_front', 'door', 'wall_h19_south', 2.2, 0.9, 2.1, 0],
  ['door_h19_kitchen', 'door', 'wall_h19_part_ns_a', 3.2, 0.9, 2.1, 0],
  ['door_h19_bedroom', 'door', 'wall_h19_part_ew_a', 3.6, 0.9, 2.1, 0],
  ['window_h19_kitchen', 'window', 'wall_h19_south', 9.0, 1.5, 1.2, 0.9],
  ['window_h19_bedroom', 'window', 'wall_h19_north', 9.0, 1.5, 1.2, 0.9],
  ['window_h19_bath', 'window', 'wall_h19_east', 6.75, 0.8, 0.8, 1.4],
]
for (const [id, start, end, thickness] of WALLS) {
  add(
    WallNode.parse({
      id,
      parentId: LEVEL,
      start,
      end,
      thickness,
      frontSide: 'unknown',
      backSide: 'unknown',
      children: OPENINGS.filter((o) => o[2] === id).map((o) => o[0]),
    }),
  )
  levelChildren.push(id)
}
for (const [id, kind, wallId, along, width, height, sill] of OPENINGS) {
  const common = {
    id,
    parentId: wallId,
    wallId,
    position: [along, round(sill + height / 2), 0],
    rotation: [0, 0, 0],
    side: 'front',
    width,
    height,
  }
  add(kind === 'door' ? DoorNode.parse(common) : WindowNode.parse(common))
}

// Four rooms: zones over one floor slab.
const ROOMS = [
  ['zone_h19_living', 'Living', [[0, 0], [6, 0], [6, 4.5], [0, 4.5]]],
  ['zone_h19_kitchen', 'Kitchen', [[6, 0], [12, 0], [12, 4.5], [6, 4.5]]],
  ['zone_h19_bedroom', 'Bedroom', [[0, 4.5], [6, 4.5], [6, 9], [0, 9]]],
  ['zone_h19_bath', 'Bath', [[6, 4.5], [12, 4.5], [12, 9], [6, 9]]],
]
for (const [id, name, polygon] of ROOMS) {
  add(ZoneNode.parse({ id, parentId: LEVEL, name, polygon, spaceRole: 'room' }))
  levelChildren.push(id)
}
add(
  SlabNode.parse({
    id: 'slab_h19_floor',
    parentId: LEVEL,
    polygon: [
      [0, 0],
      [HOUSE_W, 0],
      [HOUSE_W, HOUSE_D],
      [0, HOUSE_D],
    ],
  }),
)
levelChildren.push('slab_h19_floor')

// Gable roof resting on the level (not re-fitted to the walls at load).
add(
  RoofNode.parse({
    id: 'roof_h19',
    parentId: LEVEL,
    position: [HOUSE_W / 2, LEVEL_HEIGHT, HOUSE_D / 2],
    support: { kind: 'level' },
    children: ['rseg_h19_main'],
  }),
)
add(
  RoofSegmentNode.parse({
    id: 'rseg_h19_main',
    parentId: 'roof_h19',
    position: [0, 0, 0],
    roofType: 'gable',
    width: HOUSE_W + 0.4,
    depth: HOUSE_D + 0.4,
    pitch: 30,
    wallHeight: 0,
    overhang: 0.4,
  }),
)
levelChildren.push('roof_h19')

// One straight stair in the living room, rising the full storey.
add(
  StairNode.parse({
    id: 'stair_h19',
    parentId: LEVEL,
    position: [0.8, 0, 0.5],
    stairType: 'straight',
    width: 1,
    stepCount: 15,
    totalRise: LEVEL_HEIGHT,
    slabOpeningMode: 'none',
    fromLevelId: LEVEL,
    toLevelId: null,
    children: ['sseg_h19_run'],
  }),
)
add(
  StairSegmentNode.parse({
    id: 'sseg_h19_run',
    parentId: 'stair_h19',
    segmentType: 'stair',
    width: 1,
    length: 3.6,
    height: LEVEL_HEIGHT,
    stepCount: 15,
  }),
)
levelChildren.push('stair_h19')

// ------------------------------------------------------------- catalog items
const catalog = new Map(CATALOG_ITEMS.map((item) => [item.id, item]))
function assetFor(catalogId) {
  const entry = catalog.get(catalogId)
  if (!entry) throw new Error(`catalog item missing: ${catalogId}`)
  const { tool: _tool, floorPlanUrl: _plan, tags: _tags, ...asset } = entry
  return {
    ...asset,
    // The copy the editor serves itself, not the remote bucket.
    src: `${SENTINEL_ORIGIN}/items/${catalogId}/model.glb`,
    thumbnail: `${SENTINEL_ORIGIN}/items/${catalogId}/thumbnail.webp`,
    source: 'library',
  }
}
// [catalog id, x, z, yaw] in level coordinates (the house spans 0..12 x 0..9).
const FURNITURE = [
  ['sofa', 3.8, 3.8, Math.PI],
  ['coffee-table', 3.8, 2.6, 0],
  ['livingroom-chair', 2.4, 2.4, Math.PI / 2],
  ['livingroom-chair', 5.2, 2.4, -Math.PI / 2],
  ['tv-stand', 3.8, 0.35, 0],
  ['television', 3.8, 0.35, 0],
  ['bookshelf', 5.7, 4.2, Math.PI],
  ['indoor-plant', 1.9, 0.6, 0],
  ['dining-table', 9, 2.2, 0],
  ['dining-chair', 8.5, 1.55, 0],
  ['dining-chair', 9.5, 1.55, 0],
  ['dining-chair', 8.5, 2.85, Math.PI],
  ['dining-chair', 9.5, 2.85, Math.PI],
  ['fridge', 11.5, 3.9, -Math.PI / 2],
  ['double-bed', 3, 7.9, Math.PI],
  ['bedside-table', 1.9, 8.6, Math.PI],
  ['bedside-table', 4.1, 8.6, Math.PI],
  ['dresser', 5.3, 5.1, -Math.PI / 2],
  ['toilet', 11.5, 8.4, Math.PI],
  ['bathroom-sink', 8.6, 8.6, Math.PI],
]
const seen = new Map()
for (const [catalogId, x, z, yaw] of FURNITURE) {
  const n = (seen.get(catalogId) ?? 0) + 1
  seen.set(catalogId, n)
  const asset = assetFor(catalogId)
  const item = ItemNode.parse({
    id: `item_h19_${catalogId}_${n}`,
    parentId: LEVEL,
    name: asset.name,
    position: [x, 0, z],
    rotation: [0, round(yaw, 6), 0],
    scale: [1, 1, 1],
    asset,
  })
  add(item)
  levelChildren.push(item.id)
}

// Thirty trees on the flat pad round the house, on a golden-angle spiral.
const TREE_COUNT = 30
for (let k = 0; k < TREE_COUNT; k++) {
  const catalogId = k % 5 < 3 ? 'tree' : 'fir-tree'
  const angle = k * 2.399963229728653
  const radius = 12 + 28 * Math.sqrt((k + 0.5) / TREE_COUNT)
  // World x/z, then into level coordinates (the building sits at -6, -4.5).
  const wx = radius * Math.cos(angle)
  const wz = radius * Math.sin(angle)
  const s = round(0.9 + (((k * 7) % 10) / 10) * 0.2)
  const item = ItemNode.parse({
    id: `item_h19_tree_${String(k + 1).padStart(2, '0')}`,
    parentId: LEVEL,
    name: catalogId === 'tree' ? 'Tree' : 'Fir',
    position: [round(wx - BUILDING_POSITION[0]), 0, round(wz - BUILDING_POSITION[2])],
    rotation: [0, round((k * 1.7) % (2 * Math.PI), 6), 0],
    scale: [s, s, s],
    asset: assetFor(catalogId),
  })
  add(item)
  levelChildren.push(item.id)
}

add(
  LevelNode.parse({
    id: LEVEL,
    parentId: 'building_h19',
    level: 0,
    height: LEVEL_HEIGHT,
    baseElevation: 0,
    children: levelChildren,
  }),
)

const scene = { nodes, rootNodeIds: [site.id] }
const report = validateBuildJson(scene)
if (!report.ok) {
  console.error('validateBuildJson rejected the fixture', report.errors, report.schemaIssues)
  process.exit(1)
}

// ------------------------------------------------------------------ EcoSite
// Synthetic terrain: flat pad (r < 45 m) round the house, smooth relief beyond.
const W = 97
const STEP = 2.5
const HALF = ((W - 1) * STEP) / 2
const ORIGIN_ELEV = 100
function relief(x, zNorth) {
  const r = Math.hypot(x, zNorth)
  const t = Math.min(1, Math.max(0, (r - 45) / 30))
  const ramp = t * t * (3 - 2 * t)
  const hills =
    4 * Math.sin(x / 23) * Math.cos(zNorth / 31) +
    2.5 * Math.sin((x + 2 * zNorth) / 17) +
    1.5 * Math.cos((x - zNorth) / 11)
  return ramp * (hills + 6 * t)
}
const heights = []
for (let j = 0; j < W; j++) {
  // Rows run north to south; sample [0, 0] is the north-west corner.
  const zNorth = HALF - j * STEP
  for (let i = 0; i < W; i++) {
    const x = -HALF + i * STEP
    heights.push(round(ORIGIN_ELEV + relief(x, zNorth), 2))
  }
}
const square = (h) => [
  [-h, -h],
  [h, -h],
  [h, h],
  [-h, h],
  [-h, -h],
]
const site_ = {
  v: 'eco/1',
  // plugin-eco's own default sun location (eco-site-sun.ts), not a real parcel.
  originLL: [-119.1554, 34.4331],
  originElevM: ORIGIN_ELEV,
  terrain: { w: W, h: W, stepM: STEP, originOffsetM: [-HALF, HALF], heights },
  guides: [
    { kind: 'boundary', pts: square(42), name: 'H19 fixture lot' },
    {
      kind: 'massing-outline',
      pts: [
        [-9, -7.5],
        [9, -7.5],
        [9, 7.5],
        [-9, 7.5],
        [-9, -7.5],
      ],
      name: 'H19 house frame',
    },
  ],
  northDeg: 0,
}

const count = (type) => Object.values(nodes).filter((n) => n.type === type).length
const fixture = {
  name: 'h19-scene',
  version: 1,
  generator: 'packages/viewer/test/fixtures/make-h19-scene.mjs',
  manifest: 'packages/viewer/test/fixtures/MANIFEST.md',
  // The bridge installs lazily and the editor's first load replaces the graph,
  // so post only once both have happened.
  readyWhen:
    "typeof window.ecoEmbedded === 'boolean' && !!window.__pascalPerf && window.__pascalPerf.listNodes('site').length === 1",
  postMessages: [
    { t: 'eco:hello', v: 'eco/1' },
    { t: 'eco:load-scene', scene },
    { t: 'eco:load-site', site: site_ },
  ],
  expect: {
    wall: count('wall'),
    door: count('door'),
    window: count('window'),
    zone: count('zone'),
    slab: count('slab'),
    roof: count('roof'),
    stair: count('stair'),
    item: count('item'),
  },
}

const text = `${JSON.stringify(fixture)}\n`.replaceAll(SENTINEL_ORIGIN, '{{origin}}')
const out = join(import.meta.dir, 'h19-scene.json')
writeFileSync(out, text)
// The committed file is exactly this output after the repository's formatter.
const fmt = Bun.spawnSync([process.execPath, 'x', 'biome', 'format', '--write', out])
if (fmt.exitCode !== 0) {
  console.error(String(fmt.stderr))
  process.exit(1)
}
console.log('wrote', out, `${(text.length / 1024).toFixed(1)} KB`, JSON.stringify(fixture.expect))
console.log('validateBuildJson', JSON.stringify(report.stats ?? {}), 'warnings', report.warnings?.length ?? 0)
