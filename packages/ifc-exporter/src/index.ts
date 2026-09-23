import {
  type AnyNode,
  type BuildingNode,
  DEFAULT_MATERIALS,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  type DoorNode,
  getEffectiveWallSurfaceMaterial,
  type LevelNode,
  type MaterialProperties,
  type SiteNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
} from '@pascal-app/core'
import * as WebIFC from 'web-ifc'

/**
 * Pascal scene graph -> IFC 4.3 (IFC4X3) SPF export.
 *
 * The inverse of `@pascal-app/ifc-converter`. Where the converter reads a
 * loosely-followed real-world IFC file and does its best to reconstruct a
 * Pascal scene, this exporter writes a clean, canonical IFC4X3 file FROM a
 * known-good Pascal scene graph — the "authoring truth" direction, which is
 * a structurally easier problem (no guessing, we know exactly what every
 * node means).
 *
 * Scope (v0.1):
 *  - IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey spatial tree
 *  - IfcWall (extruded rectangular profile from wall.start/end/thickness/height)
 *  - IfcDoor / IfcWindow as openings cut into their host wall
 *    (IfcRelVoidsElement + IfcRelFillsElement)
 *  - IfcSpace for each Pascal zone, contained in its level
 *
 * Eco H16.5 deliberately omits Turkish zoning property sets. Buildable
 * envelope lives in `@eco/plugin-eco` as a Ventura translucent volume, not
 * as IFC property sets.
 *
 * Out of scope for v0.1 (tracked as follow-up work, not silently dropped):
 *  roofs, stairs, columns, slabs/ceilings as their own IFC entities (they
 *  exist in Pascal but aren't mapped to IFC yet), MEP elements, and
 *  non-rectangular wall profiles (curved walls export as their straight
 *  chord — flagged in the returned `warnings` array).
 */

export type IfcExportWarning = {
  nodeId: string
  nodeType: string
  message: string
}

export type IfcExportResult = {
  /** IFC 4.3 SPF file content, ready to write to disk / return as a download. */
  data: Uint8Array
  warnings: IfcExportWarning[]
  stats: {
    sites: number
    buildings: number
    levels: number
    walls: number
    doors: number
    windows: number
    zones: number
    skipped: number
  }
}

const ns = WebIFC.IFC4X3

function newGuid(): string {
  // IFC GlobalId is a 22-character base64-like compressed GUID. A real
  // implementation should compress a proper UUID (per the IFC spec's
  // "IfcGloballyUniqueId" compression algorithm); this is a placeholder
  // that produces a well-formed 22-char string so the file is valid, but
  // GUIDs are NOT stable across re-exports of the same node yet — a
  // follow-up should derive them deterministically from the Pascal node
  // id so IFC GlobalId stays stable across export runs (needed for the
  // ADR-0004 hashed-snapshot-per-submission audit trail to diff cleanly
  // between submissions).
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
  let out = ''
  for (let i = 0; i < 22; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

function point3(x: number, y: number, z: number) {
  return new ns.IfcCartesianPoint([
    new ns.IfcLengthMeasure(x),
    new ns.IfcLengthMeasure(y),
    new ns.IfcLengthMeasure(z),
  ])
}

function hexToRgb01(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return [0.8, 0.8, 0.8]
  const int = Number.parseInt(match[1] as string, 16)
  return [((int >> 16) & 0xff) / 255, ((int >> 8) & 0xff) / 255, (int & 0xff) / 255]
}

/**
 * Resolves a Pascal MaterialProperties object (color/roughness/metalness/
 * opacity — see packages/core/src/schema/material.ts) to an IFC
 * IfcSurfaceStyle, and caches one IfcSurfaceStyle line per distinct
 * (color, opacity, roughness, metalness) tuple so multiple elements
 * sharing a material preset (e.g. every plain wall using the default
 * preset) reuse a single style instead of duplicating identical lines.
 *
 * Uses ReflectanceMethod.PHYSICAL with DiffuseColour (base color),
 * SpecularColour (an IfcNormalisedRatioMeasure carrying metalness, per the
 * schema's factor-based IfcColourOrFactor union) and SpecularHighlight (an
 * IfcSpecularRoughness carrying roughness) — this specific field mapping
 * matches what IfcOpenShell/Bonsai's `Loader.create_surface_style_rendering`
 * reads back into a Blender Principled BSDF (see
 * bonsai/tool/loader.py:create_surface_style_rendering); PLASTIC/METAL,
 * which read more naturally from a Pascal MaterialPreset name, are only
 * used by IFC as classification categories, not values Bonsai's importer
 * (or, per a spot-check, most other IFC viewers) actually pulls color/PBR
 * data from — using them left every wall untextured with a "Unsupported
 * reflectance method" warning in earlier testing.
 */
function makeStyleCache(ifcApi: WebIFC.IfcAPI, modelID: number) {
  const cache = new Map<string, any>()
  return function getOrCreateStyle(name: string, props: MaterialProperties): any {
    const key = `${props.color}|${props.opacity}|${props.roughness}|${props.metalness}`
    const existing = cache.get(key)
    if (existing) return existing

    const [r, g, b] = hexToRgb01(props.color)
    const colour = writeLine(
      ifcApi,
      modelID,
      new ns.IfcColourRgb(
        null,
        new ns.IfcNormalisedRatioMeasure(r),
        new ns.IfcNormalisedRatioMeasure(g),
        new ns.IfcNormalisedRatioMeasure(b),
      ),
    )
    const transparency =
      props.opacity < 1 ? new ns.IfcNormalisedRatioMeasure(1 - props.opacity) : null
    const rendering = writeLine(
      ifcApi,
      modelID,
      new ns.IfcSurfaceStyleRendering(
        colour,
        transparency,
        colour,
        null,
        null,
        null,
        new ns.IfcNormalisedRatioMeasure(props.metalness),
        new ns.IfcSpecularRoughness(props.roughness),
        ns.IfcReflectanceMethodEnum.PHYSICAL,
      ),
    )
    const style = writeLine(
      ifcApi,
      modelID,
      new ns.IfcSurfaceStyle(new ns.IfcLabel(name), ns.IfcSurfaceSide.BOTH, [rendering]),
    )
    cache.set(key, style)
    return style
  }
}

function applyStyleToShape(ifcApi: WebIFC.IfcAPI, modelID: number, solid: any, style: any): void {
  writeLine(ifcApi, modelID, new ns.IfcStyledItem(solid, [style], null))
}

/**
 * Resolves a wall/door/window's `{ material, materialPreset }` spec (as
 * returned by `getEffectiveWallSurfaceMaterial` for walls, or read directly
 * off `door.material`/`window.material` for openings) down to concrete
 * `MaterialProperties` (color/roughness/metalness/opacity).
 *
 * Priority, matching how the viewer resolves the same fields
 * (packages/viewer/src/lib/materials.ts): an inline `material.properties`
 * object wins if present; otherwise `material.preset` or the legacy
 * `materialPreset` string looks up `DEFAULT_MATERIALS`. `materialPreset`
 * values that are library/scene refs (`library:...` / `scene:...`, used by
 * the slot-based material system) aren't resolvable here — this exporter
 * doesn't have viewer access to the material catalog — so those fall
 * through to the default. Returns null when nothing is configured, so the
 * caller can skip writing a style (letting the element inherit whatever
 * default appearance the consuming tool assigns unstyled geometry).
 */
function resolveMaterialProperties(spec: {
  material?: { preset?: string; properties?: MaterialProperties }
  materialPreset?: string
}): MaterialProperties | null {
  if (spec.material?.properties) return spec.material.properties
  const presetName = spec.material?.preset ?? spec.materialPreset
  if (presetName && presetName in DEFAULT_MATERIALS) {
    return DEFAULT_MATERIALS[presetName as keyof typeof DEFAULT_MATERIALS]
  }
  return null
}

function direction3(x: number, y: number, z: number) {
  return new ns.IfcDirection([new ns.IfcReal(x), new ns.IfcReal(y), new ns.IfcReal(z)])
}

function axisPlacement3D(origin: { x: number; y: number; z: number }, rotationRadians = 0) {
  const location = point3(origin.x, origin.y, origin.z)
  if (rotationRadians === 0) {
    return new ns.IfcAxis2Placement3D(location, null, null)
  }
  const refDirection = direction3(Math.cos(rotationRadians), Math.sin(rotationRadians), 0)
  return new ns.IfcAxis2Placement3D(location, direction3(0, 0, 1), refDirection)
}

function localPlacement(
  relativeTo: any | null,
  origin: { x: number; y: number; z: number },
  rotationRadians = 0,
) {
  return new ns.IfcLocalPlacement(relativeTo, axisPlacement3D(origin, rotationRadians))
}

/**
 * Build a rectangular-profile extruded box for a wall: profile is the
 * thickness x height cross-section, extruded along the wall's own length
 * axis. This mirrors how `packages/ifc-converter` reads plain
 * `IfcWallStandardCase` geometry back (see its `measureWallLocalExtents`),
 * so a Pascal-exported wall re-imports through the converter cleanly.
 */
function wallExtrudedSolid(length: number, thickness: number, height: number) {
  const profile = new ns.IfcRectangleProfileDef(
    ns.IfcProfileTypeEnum.AREA,
    null,
    new ns.IfcAxis2Placement2D(
      new ns.IfcCartesianPoint([new ns.IfcLengthMeasure(length / 2), new ns.IfcLengthMeasure(0)]),
      null,
    ),
    new ns.IfcPositiveLengthMeasure(length),
    new ns.IfcPositiveLengthMeasure(thickness),
  )
  return new ns.IfcExtrudedAreaSolid(
    profile,
    null,
    direction3(0, 0, 1),
    new ns.IfcPositiveLengthMeasure(height),
  )
}

function writeLine<T>(ifcApi: WebIFC.IfcAPI, modelID: number, entity: T): T {
  ifcApi.WriteLine(modelID, entity as never)
  return entity
}

function childrenOf(node: { children?: unknown }): string[] {
  return Array.isArray(node.children) ? (node.children as string[]) : []
}

function wallLength(wall: WallNode): number {
  const [sx, sy] = wall.start
  const [ex, ey] = wall.end
  return Math.hypot(ex - sx, ey - sy)
}

function wallRotation(wall: WallNode): number {
  const [sx, sy] = wall.start
  const [ex, ey] = wall.end
  return Math.atan2(ey - sy, ex - sx)
}

export type IfcExportOptions = {
  projectName?: string
  author?: string
  organization?: string
}

export async function exportPascalToIfc(
  scene: { nodes: Record<string, AnyNode>; rootNodeIds: string[] },
  options: IfcExportOptions = {},
): Promise<IfcExportResult> {
  const warnings: IfcExportWarning[] = []
  const stats = {
    sites: 0,
    buildings: 0,
    levels: 0,
    walls: 0,
    doors: 0,
    windows: 0,
    zones: 0,
    skipped: 0,
  }

  const ifcApi = new WebIFC.IfcAPI()
  await ifcApi.Init()

  const modelID = ifcApi.CreateModel({
    schema: 'IFC4X3',
    name: options.projectName ?? 'Eco IFC Export',
    description: ['Pascal scene graph → IFC 4.3 export'],
    authors: [options.author ?? 'Eco'],
    organizations: [options.organization ?? 'SacredRebel'],
  })

  // --- Units: meters (Pascal's native unit, per packages/mcp README's
  // "coordinate conventions" — lengths are always in metres) ---
  const lengthUnit = writeLine(
    ifcApi,
    modelID,
    new ns.IfcSIUnit(ns.IfcUnitEnum.LENGTHUNIT, null, ns.IfcSIUnitName.METRE),
  )
  const areaUnit = writeLine(
    ifcApi,
    modelID,
    new ns.IfcSIUnit(ns.IfcUnitEnum.AREAUNIT, null, ns.IfcSIUnitName.SQUARE_METRE),
  )
  const volumeUnit = writeLine(
    ifcApi,
    modelID,
    new ns.IfcSIUnit(ns.IfcUnitEnum.VOLUMEUNIT, null, ns.IfcSIUnitName.CUBIC_METRE),
  )
  const unitAssignment = writeLine(
    ifcApi,
    modelID,
    new ns.IfcUnitAssignment([lengthUnit, areaUnit, volumeUnit]),
  )

  const worldOrigin = axisPlacement3D({ x: 0, y: 0, z: 0 })
  const geometricContext = writeLine(
    ifcApi,
    modelID,
    new ns.IfcGeometricRepresentationContext(
      null,
      new ns.IfcLabel('Model'),
      new ns.IfcDimensionCount(3),
      new ns.IfcReal(1e-5),
      worldOrigin,
      null,
    ),
  )

  const project = writeLine(
    ifcApi,
    modelID,
    new ns.IfcProject(
      new ns.IfcGloballyUniqueId(newGuid()),
      null,
      new ns.IfcLabel(options.projectName ?? 'ConstructionOS Project'),
      null,
      null,
      null,
      null,
      [geometricContext],
      unitAssignment,
    ),
  )

  const nodes = scene.nodes
  const idToIfc = new Map<string, any>()
  const aggregateRelations: Array<{ parent: any; children: any[] }> = []
  const containmentRelations: Array<{
    structure: any
    elements: any[]
  }> = []
  const getOrCreateStyle = makeStyleCache(ifcApi, modelID)

  for (const rootId of scene.rootNodeIds) {
    const site = nodes[rootId]
    if (site?.type !== 'site') continue
    exportSite(site as SiteNode)
  }

  function exportSite(site: SiteNode) {
    stats.sites += 1
    const placement = writeLine(ifcApi, modelID, localPlacement(null, { x: 0, y: 0, z: 0 }))
    const ifcSite = writeLine(
      ifcApi,
      modelID,
      new ns.IfcSite(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        site.name ? new ns.IfcLabel(site.name) : new ns.IfcLabel('Site'),
        null,
        null,
        placement,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ),
    )
    idToIfc.set(site.id, ifcSite)

    const buildingIds = childrenOf(site).filter((id) => nodes[id]?.type === 'building')
    const buildingHandles: any[] = []
    for (const buildingId of buildingIds) {
      const building = nodes[buildingId] as BuildingNode
      buildingHandles.push(exportBuilding(building, placement))
    }
    if (buildingHandles.length > 0) {
      aggregateRelations.push({ parent: ifcSite, children: buildingHandles })
    }
  }

  function exportBuilding(building: BuildingNode, sitePlacement: any) {
    stats.buildings += 1
    const [px, py, pz] = building.position ?? [0, 0, 0]
    const placement = writeLine(
      ifcApi,
      modelID,
      localPlacement(sitePlacement, { x: px, y: py, z: pz }),
    )
    const ifcBuilding = writeLine(
      ifcApi,
      modelID,
      new ns.IfcBuilding(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        building.name ? new ns.IfcLabel(building.name) : new ns.IfcLabel('Building'),
        null,
        null,
        placement,
        null,
        null,
        null,
        null,
        null,
        null,
      ),
    )
    idToIfc.set(building.id, ifcBuilding)

    const levelIds = childrenOf(building).filter((id) => nodes[id]?.type === 'level')
    const levelHandles: any[] = []
    for (const levelId of levelIds) {
      const level = nodes[levelId] as LevelNode
      levelHandles.push(exportLevel(level, placement))
    }
    if (levelHandles.length > 0) {
      aggregateRelations.push({ parent: ifcBuilding, children: levelHandles })
    }

    return ifcBuilding
  }

  function exportLevel(level: LevelNode, buildingPlacement: any) {
    stats.levels += 1
    // Pascal levels don't carry an absolute elevation field on the node
    // itself (stacked height is computed by the level system from
    // accumulated level heights, per packages/mcp's coordinate
    // conventions) — v0.1 exports storeys at Z=0 relative to their
    // building and records the Pascal level index in Name/Description
    // instead of attempting to recompute stacked elevation here. A
    // follow-up should thread the live-computed elevation through.
    const placement = writeLine(
      ifcApi,
      modelID,
      localPlacement(buildingPlacement, { x: 0, y: 0, z: 0 }),
    )
    const ifcStorey = writeLine(
      ifcApi,
      modelID,
      new ns.IfcBuildingStorey(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        level.name ? new ns.IfcLabel(level.name) : new ns.IfcLabel(`Level ${level.level}`),
        null,
        null,
        placement,
        null,
        null,
        null,
        new ns.IfcLengthMeasure(0),
      ),
    )
    idToIfc.set(level.id, ifcStorey)

    const elementHandles: any[] = []
    for (const childId of childrenOf(level)) {
      const child = nodes[childId]
      if (!child) continue
      if (child.type === 'wall') {
        elementHandles.push(exportWall(child as WallNode, ifcStorey, placement))
      } else if (child.type === 'zone') {
        elementHandles.push(exportZone(child as ZoneNode, ifcStorey, placement))
      } else {
        // Doors/windows are exported as part of their host wall below
        // (IfcRelVoidsElement/IfcRelFillsElement), not as independent
        // storey-contained elements, so only flag genuinely unsupported
        // kinds here.
        if (child.type !== 'door' && child.type !== 'window') {
          stats.skipped += 1
          warnings.push({
            nodeId: child.id,
            nodeType: child.type,
            message: `Node type "${child.type}" is not yet exported to IFC (v0.1 scope: wall, door, window, zone only).`,
          })
        }
      }
    }
    if (elementHandles.length > 0) {
      containmentRelations.push({ structure: ifcStorey, elements: elementHandles })
    }

    return ifcStorey
  }

  function exportWall(wall: WallNode, ifcStorey: any, storeyPlacement: any) {
    stats.walls += 1
    const length = wallLength(wall)
    const rotation = wallRotation(wall)
    const thickness = wall.thickness ?? DEFAULT_WALL_THICKNESS
    const height = wall.height ?? DEFAULT_WALL_HEIGHT

    if (wall.curveOffset && Math.abs(wall.curveOffset) > 1e-6) {
      warnings.push({
        nodeId: wall.id,
        nodeType: 'wall',
        message:
          'Curved wall exported as its straight start-end chord — curve geometry is not yet represented in IFC output.',
      })
    }

    const [sx, sy] = wall.start
    const placement = writeLine(
      ifcApi,
      modelID,
      localPlacement(storeyPlacement, { x: sx, y: sy, z: 0 }, rotation),
    )
    const solid = writeLine(ifcApi, modelID, wallExtrudedSolid(length, thickness, height))
    // Prefer the wall's exterior surface material for the whole solid — IFC's
    // IfcStyledItem styles the entire shape representation item, not per-face
    // (that would need per-face IfcStyledItem on split geometry, out of scope
    // for v0.1's single extruded-box wall body). Falls back to interior, then
    // the legacy single `material`/`materialPreset` fields, matching
    // `getEffectiveWallSurfaceMaterial`'s own interior->legacy fallback order.
    const wallMaterialProps =
      resolveMaterialProperties(getEffectiveWallSurfaceMaterial(wall, 'exterior')) ??
      resolveMaterialProperties(getEffectiveWallSurfaceMaterial(wall, 'interior'))
    if (wallMaterialProps) {
      applyStyleToShape(
        ifcApi,
        modelID,
        solid,
        getOrCreateStyle(wall.name ?? 'Wall material', wallMaterialProps),
      )
    }
    const shapeRep = writeLine(
      ifcApi,
      modelID,
      new ns.IfcShapeRepresentation(
        geometricContext,
        new ns.IfcLabel('Body'),
        new ns.IfcLabel('SweptSolid'),
        [solid],
      ),
    )
    const productShape = writeLine(
      ifcApi,
      modelID,
      new ns.IfcProductDefinitionShape(null, null, [shapeRep]),
    )

    const ifcWall = writeLine(
      ifcApi,
      modelID,
      new ns.IfcWallStandardCase(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        wall.name ? new ns.IfcLabel(wall.name) : new ns.IfcLabel('Wall'),
        null,
        null,
        placement,
        productShape,
        null,
        null,
      ),
    )
    idToIfc.set(wall.id, ifcWall)

    // Openings (doors/windows) hosted on this wall. Their IfcLocalPlacement
    // must chain to the wall's own ObjectPlacement (`placement`, an
    // IfcLocalPlacement) — not to the IfcWallStandardCase product entity
    // itself. IfcLocalPlacement.PlacementRelTo is typed as
    // IfcObjectPlacement; passing the product entity instead produced a
    // spec-invalid file that web-ifc happily wrote but IfcOpenShell/Bonsai
    // rejected at import time with "IfcWallStandardCase has no attribute
    // PlacementRelTo" while walking the placement chain.
    for (const childId of childrenOf(wall)) {
      const child = nodes[childId]
      if (child?.type === 'door') {
        exportOpening(child as DoorNode, placement, ifcWall, wall, sx, sy, rotation, 'door')
      } else if (child?.type === 'window') {
        exportOpening(child as WindowNode, placement, ifcWall, wall, sx, sy, rotation, 'window')
      }
    }

    return ifcWall
  }

  function exportOpening(
    opening: DoorNode | WindowNode,
    wallPlacement: any,
    ifcWall: any,
    wall: WallNode,
    wallStartX: number,
    wallStartY: number,
    wallRotationRadians: number,
    kind: 'door' | 'window',
  ) {
    // opening.position[0] is metres along the wall, per the MCP
    // coordinate-conventions doc ("wall-attached coordinates are
    // wall-local... stored door/window position[0]... is metres along
    // the wall").
    const along = opening.position[0]
    const worldX = wallStartX + along * Math.cos(wallRotationRadians)
    const worldY = wallStartY + along * Math.sin(wallRotationRadians)
    const thickness = wall.thickness ?? DEFAULT_WALL_THICKNESS
    // position[2] is the opening's vertical offset in wall-local
    // coordinates (sill height for a window; 0 for a door), per the same
    // wall-local convention documented in packages/mcp's coordinate
    // conventions ("wall-attached rotations are wall-local too").
    const sillHeight = opening.position[2] ?? 0

    const placement = writeLine(
      ifcApi,
      modelID,
      localPlacement(wallPlacement, { x: along, y: 0, z: sillHeight }),
    )
    const solid = writeLine(
      ifcApi,
      modelID,
      wallExtrudedSolid(opening.width, thickness * 1.05, opening.height),
    )
    const openingMaterialProps = resolveMaterialProperties(
      opening.material ? { material: opening.material } : {},
    )
    if (openingMaterialProps) {
      const fallbackName = kind === 'door' ? 'Door material' : 'Window material'
      applyStyleToShape(
        ifcApi,
        modelID,
        solid,
        getOrCreateStyle(opening.name ?? fallbackName, openingMaterialProps),
      )
    }
    const shapeRep = writeLine(
      ifcApi,
      modelID,
      new ns.IfcShapeRepresentation(
        geometricContext,
        new ns.IfcLabel('Body'),
        new ns.IfcLabel('SweptSolid'),
        [solid],
      ),
    )
    const productShape = writeLine(
      ifcApi,
      modelID,
      new ns.IfcProductDefinitionShape(null, null, [shapeRep]),
    )

    const ifcOpening = writeLine(
      ifcApi,
      modelID,
      new ns.IfcOpeningElement(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        new ns.IfcLabel(`${kind === 'door' ? 'Door' : 'Window'} opening`),
        null,
        null,
        placement,
        productShape,
        null,
        null,
      ),
    )

    writeLine(
      ifcApi,
      modelID,
      new ns.IfcRelVoidsElement(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        null,
        null,
        ifcWall as never,
        ifcOpening,
      ),
    )

    if (kind === 'door') {
      stats.doors += 1
      const door = opening as DoorNode
      const ifcDoor = writeLine(
        ifcApi,
        modelID,
        new ns.IfcDoor(
          new ns.IfcGloballyUniqueId(newGuid()),
          null,
          door.name ? new ns.IfcLabel(door.name) : new ns.IfcLabel('Door'),
          null,
          null,
          placement,
          productShape,
          null,
          new ns.IfcPositiveLengthMeasure(door.height),
          new ns.IfcPositiveLengthMeasure(door.width),
          null,
          null,
          null,
        ),
      )
      idToIfc.set(door.id, ifcDoor)
      writeLine(
        ifcApi,
        modelID,
        new ns.IfcRelFillsElement(
          new ns.IfcGloballyUniqueId(newGuid()),
          null,
          null,
          null,
          ifcOpening,
          ifcDoor as never,
        ),
      )
    } else {
      stats.windows += 1
      const window = opening as WindowNode
      const ifcWindow = writeLine(
        ifcApi,
        modelID,
        new ns.IfcWindow(
          new ns.IfcGloballyUniqueId(newGuid()),
          null,
          window.name ? new ns.IfcLabel(window.name) : new ns.IfcLabel('Window'),
          null,
          null,
          placement,
          productShape,
          null,
          new ns.IfcPositiveLengthMeasure(window.height),
          new ns.IfcPositiveLengthMeasure(window.width),
          null,
          null,
          null,
        ),
      )
      idToIfc.set(window.id, ifcWindow)
      writeLine(
        ifcApi,
        modelID,
        new ns.IfcRelFillsElement(
          new ns.IfcGloballyUniqueId(newGuid()),
          null,
          null,
          null,
          ifcOpening,
          ifcWindow as never,
        ),
      )
    }
  }

  function exportZone(zone: ZoneNode, ifcStorey: any, storeyPlacement: any) {
    stats.zones += 1
    // IfcSpace boundary polygon export (the geometry side of
    // IfcRelSpaceBoundary, ADR-0004's rule-engine backbone relationship)
    // is deferred — v0.1 exports the space as a located, named container
    // without a swept solid. Downstream area/emsal calculation from this
    // IFC file therefore isn't possible yet from the exported geometry
    // alone; ConstructionOS's own rule engine (07-RULE_ENGINE) computes
    // areas from the live Pascal scene graph directly (see
    // deriveZoningReport), not by re-reading the exported IFC.
    const placement = writeLine(
      ifcApi,
      modelID,
      localPlacement(storeyPlacement, { x: 0, y: 0, z: 0 }),
    )
    const ifcSpace = writeLine(
      ifcApi,
      modelID,
      new ns.IfcSpace(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        zone.name ? new ns.IfcLabel(zone.name) : new ns.IfcLabel('Space'),
        null,
        null,
        placement,
        null,
        null,
        null,
        null,
        null,
      ),
    )
    idToIfc.set(zone.id, ifcSpace)
    warnings.push({
      nodeId: zone.id,
      nodeType: 'zone',
      message:
        'Zone exported as IfcSpace without boundary geometry (IfcRelSpaceBoundary) — area must still be read from the Pascal scene graph, not from this IFC file, until a follow-up adds space boundary export.',
    })
    return ifcSpace
  }

  // Flush structural relationships now that all handles exist.
  for (const { parent, children } of aggregateRelations) {
    writeLine(
      ifcApi,
      modelID,
      new ns.IfcRelAggregates(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        null,
        null,
        parent as never,
        children as never[],
      ),
    )
  }
  for (const { structure, elements } of containmentRelations) {
    writeLine(
      ifcApi,
      modelID,
      new ns.IfcRelContainedInSpatialStructure(
        new ns.IfcGloballyUniqueId(newGuid()),
        null,
        null,
        null,
        elements as never[],
        structure as never,
      ),
    )
  }

  const data = ifcApi.SaveModel(modelID)
  ifcApi.CloseModel(modelID)

  void project

  return { data, warnings, stats }
}
