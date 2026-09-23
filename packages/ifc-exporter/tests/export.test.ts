import { describe, expect, test } from 'bun:test'
import type {
  AnyNode,
  BuildingNode,
  LevelNode,
  SiteNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core'
import { exportPascalToIfc } from '../src/index'

/**
 * Builds a minimal but realistic Pascal scene: one site, one building, one
 * ground-floor level, four walls forming a closed 5m x 4m room with one door
 * and one window, and a zone covering the room.
 */
function buildFixtureScene(): { nodes: Record<string, AnyNode>; rootNodeIds: string[] } {
  const nodes: Record<string, AnyNode> = {}

  const site: SiteNode = {
    object: 'node',
    id: 'site_1',
    type: 'site',
    name: 'Test Parcel',
    parentId: null,
    visible: true,
    metadata: {},
    polygon: {
      type: 'polygon',
      points: [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
      ],
    },
    children: ['building_1'],
  } as SiteNode

  const building: BuildingNode = {
    object: 'node',
    id: 'building_1',
    type: 'building',
    name: 'Main Building',
    parentId: 'site_1',
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: ['level_ground'],
  } as BuildingNode

  const level: LevelNode = {
    object: 'node',
    id: 'level_ground',
    type: 'level',
    name: 'Ground Floor',
    parentId: 'building_1',
    visible: true,
    metadata: {},
    level: 0,
    children: ['wall_south', 'wall_east', 'wall_north', 'wall_west', 'zone_room'],
  } as LevelNode

  const wall = (
    id: string,
    start: [number, number],
    end: [number, number],
    children: string[] = [],
  ): WallNode =>
    ({
      object: 'node',
      id,
      type: 'wall',
      name: id,
      parentId: 'level_ground',
      visible: true,
      metadata: {},
      thickness: 0.2,
      height: 2.7,
      start,
      end,
      frontSide: 'unknown',
      backSide: 'unknown',
      children,
    }) as WallNode

  nodes.wall_south = wall('wall_south', [0, 0], [5, 0], ['door_main'])
  nodes.wall_east = wall('wall_east', [5, 0], [5, 4], ['window_1'])
  nodes.wall_north = wall('wall_north', [5, 4], [0, 4])
  nodes.wall_west = wall('wall_west', [0, 4], [0, 0])

  nodes.door_main = {
    object: 'node',
    id: 'door_main',
    type: 'door',
    name: 'Main Door',
    parentId: 'wall_south',
    visible: true,
    metadata: {},
    position: [2.5, 0, 0],
    rotation: [0, 0, 0],
    width: 0.9,
    height: 2.1,
  } as AnyNode

  nodes.window_1 = {
    object: 'node',
    id: 'window_1',
    type: 'window',
    name: 'Window 1',
    parentId: 'wall_east',
    visible: true,
    metadata: {},
    position: [2, 0, 0.9],
    rotation: [0, 0, 0],
    width: 1.2,
    height: 1.2,
  } as WindowNode

  nodes.zone_room = {
    object: 'node',
    id: 'zone_room',
    type: 'zone',
    name: 'Living Room',
    parentId: 'level_ground',
    visible: true,
    metadata: {},
    polygon: [
      [0, 0],
      [5, 0],
      [5, 4],
      [0, 4],
    ],
    autoFromWalls: false,
    boundaryWallIds: [],
    color: '#3b82f6',
  } as ZoneNode

  nodes.site_1 = site
  nodes.building_1 = building
  nodes.level_ground = level

  return { nodes, rootNodeIds: ['site_1'] }
}

describe('exportPascalToIfc', () => {
  test('exports a valid IFC4X3 file with correct stats and no warnings for supported node types', async () => {
    const scene = buildFixtureScene()
    const result = await exportPascalToIfc(scene, { projectName: 'Test Export' })

    expect(result.data.length).toBeGreaterThan(0)
    expect(result.stats).toEqual({
      sites: 1,
      buildings: 1,
      levels: 1,
      walls: 4,
      doors: 1,
      windows: 1,
      zones: 1,
      skipped: 0,
    })

    // The zone-boundary-geometry limitation is an expected, documented
    // warning (v0.1 scope) — not a bug. No other warnings should appear
    // for this fixture (no curved walls, no unsupported node types).
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.nodeType).toBe('zone')
  })

  test('produces a well-formed SPF file that re-opens through web-ifc', async () => {
    const WebIFC = await import('web-ifc')
    const scene = buildFixtureScene()
    const result = await exportPascalToIfc(scene)

    const ifcApi = new WebIFC.IfcAPI()
    await ifcApi.Init()
    const modelID = ifcApi.OpenModel(result.data)
    expect(modelID).toBeGreaterThanOrEqual(0)

    const projects = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT)
    expect(projects.size()).toBe(1)

    const sites = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSITE)
    expect(sites.size()).toBe(1)

    const buildings = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDING)
    expect(buildings.size()).toBe(1)

    const storeys = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)
    expect(storeys.size()).toBe(1)

    const walls = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWALLSTANDARDCASE)
    expect(walls.size()).toBe(4)

    const doors = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCDOOR)
    expect(doors.size()).toBe(1)

    const windows = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWINDOW)
    expect(windows.size()).toBe(1)

    const spaces = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSPACE)
    expect(spaces.size()).toBe(1)

    // Eco H16.5: no Turkish zoning Psets on the site.
    const propertySets = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROPERTYSET)
    expect(propertySets.size()).toBe(0)

    ifcApi.CloseModel(modelID)
  })

  test('round-trips core wall/door/window counts through a fresh IFC read (equivalent of ifc-converter, without its browser-only wasm path)', async () => {
    // `@pascal-app/ifc-converter`'s `convertIfcToPascal` hardcodes
    // `SetWasmPath('/', true)` (an absolute browser URL path), which only
    // resolves inside the Next.js apps that serve `web-ifc.wasm` from their
    // public root — it can't run in a plain Bun/Node test process. This test
    // exercises the same read-back guarantee (exported IFC re-parses with
    // the right element counts and types) using web-ifc directly with its
    // default (Node-resolvable) wasm path, which is the same underlying
    // parser `convertIfcToPascal` builds on.
    const WebIFC = await import('web-ifc')
    const scene = buildFixtureScene()
    const exported = await exportPascalToIfc(scene)

    const ifcApi = new WebIFC.IfcAPI()
    await ifcApi.Init()
    const modelID = ifcApi.OpenModel(exported.data)
    expect(modelID).toBeGreaterThanOrEqual(0)

    const wallIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCWALLSTANDARDCASE)
    expect(wallIds.size()).toBe(4)

    // Verify each wall's extruded length matches its Pascal source wall,
    // proving the geometry (not just the entity count) survived the
    // write -> SPF text -> parse round trip.
    const expectedLengths = [5, 4, 5, 4] // south, east, north, west (5x4 room)
    const actualLengths: number[] = []
    for (let i = 0; i < wallIds.size(); i++) {
      const wall = ifcApi.GetLine(modelID, wallIds.get(i))
      const rep = ifcApi.GetLine(modelID, wall.Representation.value)
      const shapeRep = ifcApi.GetLine(modelID, rep.Representations[0].value)
      const solid = ifcApi.GetLine(modelID, shapeRep.Items[0].value)
      const profile = ifcApi.GetLine(modelID, solid.SweptArea.value)
      actualLengths.push(profile.XDim.value)
    }
    actualLengths.sort((a, b) => a - b)
    const sortedExpected = [...expectedLengths].sort((a, b) => a - b)
    for (let i = 0; i < sortedExpected.length; i++) {
      expect(actualLengths[i]).toBeCloseTo(sortedExpected[i] as number, 5)
    }

    ifcApi.CloseModel(modelID)
  })

  test('flags curved walls with a warning instead of silently exporting wrong geometry', async () => {
    const scene = buildFixtureScene()
    ;(scene.nodes.wall_south as WallNode).curveOffset = 0.5

    const result = await exportPascalToIfc(scene)
    const curveWarning = result.warnings.find((w) => w.nodeId === 'wall_south')
    expect(curveWarning).toBeDefined()
    expect(curveWarning?.message).toContain('straight')
  })

  test('flags unsupported node types (e.g. stair) instead of silently dropping them', async () => {
    const scene = buildFixtureScene()
    ;(scene.nodes.level_ground as LevelNode).children.push('stair_1')
    scene.nodes.stair_1 = {
      object: 'node',
      id: 'stair_1',
      type: 'stair',
      name: 'Stair',
      parentId: 'level_ground',
      visible: true,
      metadata: {},
      children: [],
    } as unknown as AnyNode

    const result = await exportPascalToIfc(scene)
    expect(result.stats.skipped).toBe(1)
    const stairWarning = result.warnings.find((w) => w.nodeId === 'stair_1')
    expect(stairWarning).toBeDefined()
    expect(stairWarning?.message).toContain('not yet exported')
  })

  test('every IfcLocalPlacement.PlacementRelTo chains to another placement, never to a product entity', async () => {
    // Regression test for a bug where opening/wall/storey/building placements
    // were built with `localPlacement(someProductEntity, ...)` instead of
    // `localPlacement(thatEntity's own IfcLocalPlacement, ...)`. web-ifc
    // happily writes this (it doesn't validate PlacementRelTo's type), but
    // it produces a spec-invalid file: IfcLocalPlacement.PlacementRelTo must
    // be an IfcObjectPlacement, not an IfcProduct. Bonsai/IfcOpenShell's
    // importer walks this chain when computing world matrices and crashed
    // with e.g. "IFC4X3.IfcWallStandardCase has no attribute
    // PlacementRelTo" — a real interop bug, not a Blender quirk. This test
    // catches it without needing Blender/Bonsai installed in CI: it walks
    // every IfcLocalPlacement's PlacementRelTo and asserts it is either
    // null or another IfcLocalPlacement, matching the schema constraint
    // that IfcLocalPlacement.PlacementRelTo: IfcObjectPlacement.
    const WebIFC = await import('web-ifc')
    const scene = buildFixtureScene()
    const result = await exportPascalToIfc(scene)

    const ifcApi = new WebIFC.IfcAPI()
    await ifcApi.Init()
    const modelID = ifcApi.OpenModel(result.data)

    const placementIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCLOCALPLACEMENT)
    expect(placementIds.size()).toBeGreaterThan(0)
    const placementIdSet = new Set<number>()
    for (let i = 0; i < placementIds.size(); i++) placementIdSet.add(placementIds.get(i))

    for (let i = 0; i < placementIds.size(); i++) {
      const placement = ifcApi.GetLine(modelID, placementIds.get(i))
      const relTo = placement.PlacementRelTo
      if (relTo === null || relTo === undefined) continue
      // relTo must itself be one of the file's IfcLocalPlacement lines —
      // if it pointed at a product entity (e.g. IfcWallStandardCase),
      // its expressID wouldn't appear in this set.
      expect(placementIdSet.has(relTo.value)).toBe(true)
    }

    ifcApi.CloseModel(modelID)
  })

  test('wall/opening materialPreset and inline material.properties export as IfcSurfaceStyle/IfcStyledItem with PHYSICAL reflectance', async () => {
    // Regression coverage for resolveMaterialProperties/getOrCreateStyle
    // (packages/ifc-exporter/src/index.ts): every distinct color/opacity/
    // roughness/metalness combination should produce exactly one shared
    // IfcSurfaceStyle, attached to its geometry via IfcStyledItem, using
    // ReflectanceMethod.PHYSICAL (not PLASTIC/METAL — verified against a
    // real Bonsai/Blender import that PLASTIC/METAL are read by
    // IfcOpenShell's importer as unsupported and silently produce no
    // material at all; PHYSICAL + DiffuseColour/SpecularColour/
    // SpecularHighlight is the mapping Bonsai's loader.py actually reads
    // back into a Principled BSDF's Base Color/Metallic/Roughness/Alpha).
    const WebIFC = await import('web-ifc')
    const scene = buildFixtureScene()
    ;(scene.nodes.wall_south as WallNode & { materialPreset?: string }).materialPreset = 'brick'
    ;(scene.nodes.wall_east as WallNode & { materialPreset?: string }).materialPreset = 'brick'
    ;(
      scene.nodes.wall_north as WallNode & {
        material?: { preset: string; properties: Record<string, unknown> }
      }
    ).material = {
      preset: 'custom',
      properties: {
        color: '#e63946',
        roughness: 0.6,
        metalness: 0,
        opacity: 1,
        transparent: false,
        side: 'front',
      },
    }

    const result = await exportPascalToIfc(scene)
    expect(result.warnings.filter((w) => w.nodeType !== 'zone')).toHaveLength(0)

    const ifcApi = new WebIFC.IfcAPI()
    await ifcApi.Init()
    const modelID = ifcApi.OpenModel(result.data)

    const styleIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSURFACESTYLE)
    // wall_south + wall_east share the 'brick' preset -> 1 style. wall_north's
    // inline custom color is distinct -> 1 more style. wall_west is unstyled.
    expect(styleIds.size()).toBe(2)

    const styledItemIds = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCSTYLEDITEM)
    // One IfcStyledItem per styled wall's solid (south, east, north) — west
    // and the door/window (no material configured in this fixture) get none.
    expect(styledItemIds.size()).toBe(3)

    for (let i = 0; i < styleIds.size(); i++) {
      const style = ifcApi.GetLine(modelID, styleIds.get(i), true)
      const rendering = style.Styles[0]
      expect(rendering.ReflectanceMethod?.value).toBe('PHYSICAL')
      expect(rendering.DiffuseColour).toBeTruthy()
      expect(rendering.SpecularColour).toBeTruthy()
      expect(rendering.SpecularHighlight).toBeTruthy()
    }

    ifcApi.CloseModel(modelID)
  })
})
