/**
 * Pascal scene → IFC 4.3 (IFC4X3) that FreeCAD 1.1 opens north-up, with
 * windows at their sills, storeys stacked, and the same GlobalIds every time.
 *
 * - Ids: every IfcRoot entity's GlobalId is a name-based UUID of a Pascal node
 *   id (ifc-guid.ts); the node id is also the element's Tag and
 *   Pset_Playground.PascalId.
 * - Structure: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey, the
 *   storeys at the levels' stacked elevations (core getLevelElevations);
 *   elements contained in their storey, spaces aggregated to it.
 * - Axes: IFC (X, Y, Z) = Pascal (x, −z, y), so +Y is the site's north
 *   (ifc-write.ts). The site carries RefLatitude/RefLongitude/RefElevation
 *   from the eco site, and the model context's TrueNorth from northDeg.
 * - Parametric where Pascal is parametric: walls (IfcWall with an Axis and a
 *   swept Body), door and window openings (IfcOpeningElement, voids + fills,
 *   placed at the opening's centre and sill), slabs, zones (IfcSpace).
 * - Everything else is its rendered geometry (triangles from the live scene):
 *   ceilings, roofs, stairs, columns, fences, items, doors and windows, and as
 *   IfcBuildingElementProxy with Pset_Playground {Kind, Params}: blocks,
 *   shelves, bodies, temple forms, eco forms and placed assets.
 * - No owner history, no person, no organisation: the header says Playground.
 */
import {
  type AnyNode,
  type BuildingNode,
  DEFAULT_WALL_THICKNESS,
  type DoorNode,
  getLevelElevations,
  getWallBaseElevationForNodes,
  getWallEffectiveHeightForNodes,
  type LevelNode,
  type SlabNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
} from '@pascal-app/core'
import { Color, Euler, Matrix4, type Object3D, Quaternion, Vector3 } from 'three'
import * as WebIFC from 'web-ifc'
import { collectMeshes, type MeshPart } from './ifc-meshes'
import { IfcWriter, ns, planToIfc } from './ifc-write'

export type EcoIfcSite = { originLL: [number, number]; originElevM: number; northDeg?: number }

/** Geometry that is not a scene node (eco forms, placed assets), in scene-world coordinates. */
export type EcoIfcExtra = {
  id: string
  kind: string
  name: string
  params?: Record<string, unknown>
  object: Object3D
}

export type EcoIfcInput = {
  nodes: Record<string, AnyNode>
  rootNodeIds: string[]
  /** The live object of a node (sceneRegistry), for kinds written as rendered geometry. */
  objectOf?: (id: string) => Object3D | undefined
  extras?: EcoIfcExtra[]
  site?: EcoIfcSite | null
  wasmPath?: string
  projectName?: string
}

export type EcoIfcWarning = { nodeId: string; nodeType: string; message: string }

export type EcoIfcResult = {
  data: Uint8Array
  warnings: EcoIfcWarning[]
  stats: Record<string, number>
}

type MeshClass = 'IfcCovering' | 'IfcRoof' | 'IfcStair' | 'IfcColumn' | 'IfcRailing' | 'IfcFurniture' | 'IfcBuildingElementProxy'

const MESH_CLASS: Record<string, MeshClass> = {
  ceiling: 'IfcCovering',
  roof: 'IfcRoof',
  stair: 'IfcStair',
  column: 'IfcColumn',
  fence: 'IfcRailing',
  item: 'IfcFurniture',
}

/** Their geometry is merged into the parent's (roof, stair) or they draw nothing. */
const NOT_EXPORTED = new Set(['roof-segment', 'stair-segment', 'body-group', 'spawn'])

/** Parameters kept in Pset_Playground.Params: the node without its graph links and bulky fields. */
function nodeParams(node: AnyNode): Record<string, unknown> {
  const { id, parentId, children, metadata, topology, ...rest } = node as Record<string, unknown>
  void id
  void parentId
  void children
  void metadata
  void topology
  return rest
}

function childIds(node: AnyNode | undefined): string[] {
  const children = (node as { children?: unknown } | undefined)?.children
  return Array.isArray(children) ? (children as string[]) : []
}

/** Decimal degrees → IFC compound plane angle [d, m, s, millionths of a second], one sign. */
export function toCompoundAngle(degrees: number): number[] {
  const sign = degrees < 0 ? -1 : 1
  let micro = Math.round(Math.abs(degrees) * 3600 * 1e6)
  const d = Math.floor(micro / 3600e6)
  micro -= d * 3600e6
  const m = Math.floor(micro / 60e6)
  micro -= m * 60e6
  const s = Math.floor(micro / 1e6)
  micro -= s * 1e6
  return [d, m, s, micro].map((v) => sign * v)
}

export async function exportEcoIfc(input: EcoIfcInput): Promise<EcoIfcResult> {
  const { nodes } = input
  const warnings: EcoIfcWarning[] = []
  const stats: Record<string, number> = {}
  const count = (key: string) => {
    stats[key] = (stats[key] ?? 0) + 1
  }
  const warn = (node: { id: string; type: string }, message: string) =>
    warnings.push({ nodeId: node.id, nodeType: node.type, message })

  const api = new WebIFC.IfcAPI()
  if (input.wasmPath) api.SetWasmPath(input.wasmPath, true)
  await api.Init()
  const model = api.CreateModel({
    schema: 'IFC4X3',
    name: input.projectName ?? 'Playground building',
    description: ['ViewDefinition [DesignTransferView]'],
    authors: ['Playground'],
    organizations: ['Playground'],
  })
  const w = new IfcWriter(api, model)

  // Objects owned by some node: a node's mesh walk stops at them.
  const owned = new Set<Object3D>()
  if (input.objectOf) {
    for (const id of Object.keys(nodes)) {
      const object = input.objectOf(id)
      if (object) owned.add(object)
    }
  }
  const stopAt = (o: Object3D) => owned.has(o)

  // --- units, contexts, project
  const units = w.write(
    new ns.IfcUnitAssignment([
      w.write(new ns.IfcSIUnit(ns.IfcUnitEnum.LENGTHUNIT, null, ns.IfcSIUnitName.METRE)),
      w.write(new ns.IfcSIUnit(ns.IfcUnitEnum.AREAUNIT, null, ns.IfcSIUnitName.SQUARE_METRE)),
      w.write(new ns.IfcSIUnit(ns.IfcUnitEnum.VOLUMEUNIT, null, ns.IfcSIUnitName.CUBIC_METRE)),
      w.write(new ns.IfcSIUnit(ns.IfcUnitEnum.PLANEANGLEUNIT, null, ns.IfcSIUnitName.RADIAN)),
    ]),
  )
  const north = ((input.site?.northDeg ?? 0) * Math.PI) / 180
  const modelContext = w.write(
    new ns.IfcGeometricRepresentationContext(
      null,
      new ns.IfcLabel('Model'),
      new ns.IfcDimensionCount(3),
      new ns.IfcReal(1e-5),
      w.axis3([0, 0, 0]),
      w.direction2([-Math.sin(north), Math.cos(north)]),
    ),
  )
  const bodyContext = w.write(
    new ns.IfcGeometricRepresentationSubContext(
      new ns.IfcLabel('Body'),
      new ns.IfcLabel('Model'),
      modelContext,
      null,
      ns.IfcGeometricProjectionEnum.MODEL_VIEW,
      null,
    ),
  )
  const axisContext = w.write(
    new ns.IfcGeometricRepresentationSubContext(
      new ns.IfcLabel('Axis'),
      new ns.IfcLabel('Model'),
      modelContext,
      null,
      ns.IfcGeometricProjectionEnum.GRAPH_VIEW,
      null,
    ),
  )
  const sites = input.rootNodeIds.map((id) => nodes[id]).filter((n): n is AnyNode => n?.type === 'site')
  const projectKey = sites[0]?.id ?? 'scene'
  const project = w.write(
    new ns.IfcProject(
      w.guid(`${projectKey}#project`),
      null,
      new ns.IfcLabel(input.projectName ?? 'Playground building'),
      null,
      null,
      null,
      null,
      [modelContext],
      units,
    ),
  )

  const elevations = getLevelElevations(nodes as never)

  // --- shared element helpers
  const bodyFromMeshes = (parts: MeshPart[]) => {
    const items = parts.map((part) => {
      const item = w.triangles(part.positions, part.indices)
      w.styleItem(item, w.style(part.color, part.opacity))
      return item
    })
    return items.length ? w.productShape([w.shape(bodyContext, 'Body', 'Tessellation', items)]) : null
  }

  const colorOf = (object: Object3D | undefined): [number, number, number] | null => {
    let found: [number, number, number] | null = null
    object?.traverse((o) => {
      const material = (o as { material?: { color?: Color; visible?: boolean } }).material
      if (!found && material && !Array.isArray(material) && material.visible !== false && material.color instanceof Color) {
        found = [material.color.r, material.color.g, material.color.b]
      }
    })
    return found
  }

  const pset = (element: unknown, key: string, kind: string, params?: Record<string, unknown>) => {
    const props: Record<string, string> = { PascalId: key, Kind: kind }
    if (params && Object.keys(params).length) props.Params = JSON.stringify(params)
    w.playgroundPset(key, element, props)
  }

  // --- spatial structure
  for (const site of sites) {
    count('IfcSite')
    const sitePlacement = w.placement(null, [0, 0, 0])
    const geo = input.site
    const ifcSite = w.write(
      new ns.IfcSite(
        w.guid(site.id),
        null,
        new ns.IfcLabel((site as { name?: string }).name || 'Site'),
        null,
        null,
        sitePlacement,
        null,
        null,
        ns.IfcElementCompositionEnum.ELEMENT,
        geo ? new ns.IfcCompoundPlaneAngleMeasure(toCompoundAngle(geo.originLL[1])) : null,
        geo ? new ns.IfcCompoundPlaneAngleMeasure(toCompoundAngle(geo.originLL[0])) : null,
        geo ? new ns.IfcLengthMeasure(geo.originElevM) : null,
        null,
        null,
      ),
    )
    w.write(new ns.IfcRelAggregates(w.guid(`${site.id}#in-project`), null, null, null, project, [ifcSite]))

    const buildings = childIds(site)
      .map((id) => nodes[id])
      .filter((n): n is AnyNode => n?.type === 'building') as BuildingNode[]
    const ifcBuildings = buildings.map((building) => exportBuilding(building, sitePlacement))
    if (ifcBuildings.length) {
      w.write(new ns.IfcRelAggregates(w.guid(`${site.id}#buildings`), null, null, null, ifcSite, ifcBuildings))
    }
  }

  function buildingMatrix(building: BuildingNode): Matrix4 {
    const [px, py, pz] = (building.position ?? [0, 0, 0]) as [number, number, number]
    const [rx, ry, rz] = ((building as { rotation?: number[] }).rotation ?? [0, 0, 0]) as [number, number, number]
    return new Matrix4().compose(
      new Vector3(px, py, pz),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
      new Vector3(1, 1, 1),
    )
  }

  function exportBuilding(building: BuildingNode, sitePlacement: unknown) {
    count('IfcBuilding')
    const [px, py, pz] = (building.position ?? [0, 0, 0]) as [number, number, number]
    const rotationY = ((building as { rotation?: number[] }).rotation ?? [0, 0, 0])[1] ?? 0
    const placement = w.placement(sitePlacement, [px, -pz, py], rotationY)
    const ifcBuilding = w.write(
      new ns.IfcBuilding(
        w.guid(building.id),
        null,
        new ns.IfcLabel(building.name || 'Building'),
        null,
        null,
        placement,
        null,
        null,
        ns.IfcElementCompositionEnum.ELEMENT,
        null,
        null,
        null,
      ),
    )
    const levels = childIds(building)
      .map((id) => nodes[id])
      .filter((n): n is AnyNode => n?.type === 'level') as LevelNode[]
    const storeys: unknown[] = []
    const frames: { storey: unknown; placement: unknown; worldToFrame: Matrix4 }[] = []
    for (const level of levels) {
      const frame = exportLevel(level, building, placement)
      storeys.push(frame.storey)
      frames.push(frame)
    }
    if (storeys.length) {
      w.write(new ns.IfcRelAggregates(w.guid(`${building.id}#storeys`), null, null, null, ifcBuilding, storeys))
    }
    // Building-level elements (elevators) and extras go to the lowest storey.
    const ground = frames[0]
    if (ground) {
      const extraElements: unknown[] = []
      for (const childId of childIds(building)) {
        const child = nodes[childId]
        if (!child || child.type === 'level') continue
        const element = exportMeshElement(child, ground.placement, ground.worldToFrame)
        if (element) extraElements.push(element)
      }
      if (building.id === firstBuildingId()) {
        for (const extra of input.extras ?? []) {
          const element = exportExtra(extra, ground.placement, ground.worldToFrame)
          if (element) extraElements.push(element)
        }
      }
      if (extraElements.length) {
        w.write(
          new ns.IfcRelContainedInSpatialStructure(
            w.guid(`${building.id}#contains-extra`),
            null,
            null,
            null,
            extraElements,
            ground.storey,
          ),
        )
      }
    }
    return ifcBuilding
  }

  function firstBuildingId(): string | null {
    for (const site of sites) {
      for (const id of childIds(site)) if (nodes[id]?.type === 'building') return id
    }
    return null
  }

  function exportLevel(level: LevelNode, building: BuildingNode, buildingPlacement: unknown) {
    count('IfcBuildingStorey')
    const baseY = elevations.get(level.id)?.baseY ?? 0
    const placement = w.placement(buildingPlacement, [0, 0, baseY])
    const storey = w.write(
      new ns.IfcBuildingStorey(
        w.guid(level.id),
        null,
        new ns.IfcLabel(level.name || `Level ${level.level ?? 0}`),
        null,
        null,
        placement,
        null,
        null,
        ns.IfcElementCompositionEnum.ELEMENT,
        new ns.IfcLengthMeasure(baseY),
      ),
    )
    // Pascal world → this storey's frame (the building transform, then the level's height).
    const worldToFrame = buildingMatrix(building).multiply(new Matrix4().makeTranslation(0, baseY, 0)).invert()

    const contained: unknown[] = []
    const spaces: unknown[] = []
    const visit = (id: string, parent: AnyNode) => {
      const node = nodes[id]
      if (!node) return
      if (node.type === 'wall') {
        contained.push(...exportWall(node as WallNode, placement, worldToFrame))
      } else if (node.type === 'door' || node.type === 'window') {
        // Hosted on a wall: written with the wall. Elsewhere (a roof face, a dormer): geometry only.
        if (parent.type !== 'wall') {
          warn(node, `${node.type} not hosted on a wall: written without an opening`)
          const element = exportMeshElement(node, placement, worldToFrame)
          if (element) contained.push(element)
        }
      } else if (node.type === 'slab') {
        const element = exportSlab(node as SlabNode, placement)
        if (element) contained.push(element)
      } else if (node.type === 'zone') {
        const space = exportZone(node as ZoneNode, placement, level)
        if (space) spaces.push(space)
      } else if (!NOT_EXPORTED.has(node.type)) {
        const element = exportMeshElement(node, placement, worldToFrame)
        if (element) contained.push(element)
      }
      for (const childId of childIds(node)) visit(childId, node)
    }
    for (const childId of childIds(level)) visit(childId, level)

    if (contained.length) {
      w.write(
        new ns.IfcRelContainedInSpatialStructure(w.guid(`${level.id}#contains`), null, null, null, contained, storey),
      )
    }
    if (spaces.length) {
      w.write(new ns.IfcRelAggregates(w.guid(`${level.id}#spaces`), null, null, null, storey, spaces))
    }
    return { storey, placement, worldToFrame }
  }

  function exportWall(wall: WallNode, storeyPlacement: unknown, worldToFrame: Matrix4): unknown[] {
    const [sx, sy] = planToIfc(wall.start as [number, number])
    const [ex, ey] = planToIfc(wall.end as [number, number])
    const length = Math.hypot(ex - sx, ey - sy)
    if (length < 1e-6) {
      warn(wall, 'zero-length wall skipped')
      return []
    }
    count('IfcWall')
    const angle = Math.atan2(ey - sy, ex - sx)
    const thickness = wall.thickness ?? DEFAULT_WALL_THICKNESS
    const base = getWallBaseElevationForNodes(wall, nodes as never)
    const height = getWallEffectiveHeightForNodes(wall, nodes as never)
    const placement = w.placement(storeyPlacement, [sx, sy, base], angle)

    const axis = w.shape(axisContext, 'Axis', 'Curve2D', [
      w.write(new ns.IfcPolyline([w.point2([0, 0]), w.point2([length, 0])])),
    ])
    const curved = Math.abs(wall.curveOffset ?? 0) > 1e-6
    let body: unknown
    if (curved) {
      // The swept box would be the chord; the rendered wall is the curve.
      warn(wall, 'curved wall: body is its rendered geometry, axis is the chord')
      const object = input.objectOf?.(wall.id)
      const wallFrame = new Matrix4()
        .makeTranslation(sx, sy, base)
        .multiply(new Matrix4().makeRotationZ(angle))
        .invert()
      const parts = object ? collectMeshes(object, stopAt, worldToFrame).map((part) => toElementFrame(part, wallFrame)) : []
      body = parts.length
        ? w.shape(bodyContext, 'Body', 'Tessellation', parts.map((part) => styled(w.triangles(part.positions, part.indices), part)))
        : null
    }
    if (!body) {
      const solid = w.extrude(w.rectangleProfile(length, thickness, length / 2, 0), Math.max(height, 1e-3))
      const color = colorOf(input.objectOf?.(wall.id))
      if (color) w.styleItem(solid, w.style(color))
      body = w.shape(bodyContext, 'Body', 'SweptSolid', [solid])
    }
    const ifcWall = w.write(
      new ns.IfcWall(
        w.guid(wall.id),
        null,
        new ns.IfcLabel(wall.name || 'Wall'),
        null,
        null,
        placement,
        w.productShape([axis, body]),
        new ns.IfcIdentifier(wall.id),
        ns.IfcWallTypeEnum.NOTDEFINED,
      ),
    )
    pset(ifcWall, wall.id, 'wall', { thickness, height, curveOffset: wall.curveOffset ?? 0 })

    const elements: unknown[] = [ifcWall]
    for (const childId of childIds(wall)) {
      const child = nodes[childId]
      if (child?.type === 'door' || child?.type === 'window') {
        const filling = exportOpening(child as DoorNode | WindowNode, wall, ifcWall, placement, thickness, storeyPlacement, worldToFrame)
        if (filling) elements.push(filling)
      }
    }
    return elements
  }

  function styled(item: unknown, part: MeshPart) {
    w.styleItem(item, w.style(part.color, part.opacity))
    return item
  }

  /** Re-express storey-frame IFC triangles in an element's own frame (inverse of its placement). */
  function toElementFrame(part: MeshPart, storeyToElement: Matrix4): MeshPart {
    const v = new Vector3()
    const positions: number[] = []
    for (let i = 0; i < part.positions.length; i += 3) {
      v.set(part.positions[i] as number, part.positions[i + 1] as number, part.positions[i + 2] as number).applyMatrix4(storeyToElement)
      positions.push(v.x, v.y, v.z)
    }
    return { ...part, positions }
  }

  function exportOpening(
    opening: DoorNode | WindowNode,
    wall: WallNode,
    ifcWall: unknown,
    wallPlacement: unknown,
    thickness: number,
    storeyPlacement: unknown,
    worldToFrame: Matrix4,
  ) {
    const kind = opening.type
    count(kind === 'door' ? 'IfcDoor' : 'IfcWindow')
    const [u, v] = (opening.position ?? [0, 0, 0]) as [number, number, number]
    const width = opening.width
    const height = opening.height
    const sill = v - height / 2
    // The void: the opening's full width and height, through the wall, centred on it.
    const voidPlacement = w.placement(wallPlacement, [u - width / 2, 0, sill])
    const voidSolid = w.extrude(w.rectangleProfile(width, thickness + 0.1, width / 2, 0), height)
    const ifcOpening = w.write(
      new ns.IfcOpeningElement(
        w.guid(`${opening.id}#opening`),
        null,
        new ns.IfcLabel(`${kind === 'door' ? 'Door' : 'Window'} opening`),
        null,
        null,
        voidPlacement,
        w.productShape([w.shape(bodyContext, 'Body', 'SweptSolid', [voidSolid])]),
        null,
        ns.IfcOpeningElementTypeEnum.OPENING,
      ),
    )
    w.write(new ns.IfcRelVoidsElement(w.guid(`${opening.id}#voids`), null, null, null, ifcWall as never, ifcOpening))

    // The filling: its rendered frame and leaf, in the storey frame; a thin panel if not drawn.
    const object = input.objectOf?.(opening.id)
    const parts = object ? collectMeshes(object, stopAt, worldToFrame) : []
    let placement: unknown
    let shape: unknown
    if (parts.length) {
      placement = w.placement(storeyPlacement, [0, 0, 0])
      shape = bodyFromMeshes(parts)
    } else {
      warn(opening, `${kind} not drawn: written as a panel`)
      placement = w.placement(wallPlacement, [u - width / 2, 0, sill])
      shape = w.productShape([
        w.shape(bodyContext, 'Body', 'SweptSolid', [w.extrude(w.rectangleProfile(width, 0.05, width / 2, 0), height)]),
      ])
    }
    const name = new ns.IfcLabel(opening.name || (kind === 'door' ? 'Door' : 'Window'))
    const filling =
      kind === 'door'
        ? w.write(
            new ns.IfcDoor(
              w.guid(opening.id),
              null,
              name,
              null,
              null,
              placement as never,
              shape as never,
              new ns.IfcIdentifier(opening.id),
              new ns.IfcPositiveLengthMeasure(height),
              new ns.IfcPositiveLengthMeasure(width),
              ns.IfcDoorTypeEnum.DOOR,
              null,
              null,
            ),
          )
        : w.write(
            new ns.IfcWindow(
              w.guid(opening.id),
              null,
              name,
              null,
              null,
              placement as never,
              shape as never,
              new ns.IfcIdentifier(opening.id),
              new ns.IfcPositiveLengthMeasure(height),
              new ns.IfcPositiveLengthMeasure(width),
              ns.IfcWindowTypeEnum.WINDOW,
              null,
              null,
            ),
          )
    w.write(new ns.IfcRelFillsElement(w.guid(`${opening.id}#fills`), null, null, null, ifcOpening, filling as never))
    pset(filling, opening.id, kind, { wallId: wall.id, u, sill, width, height })
    return filling
  }

  function exportSlab(slab: SlabNode, storeyPlacement: unknown) {
    const polygon = (slab.polygon ?? []) as [number, number][]
    if (polygon.length < 3) {
      warn(slab, 'slab with fewer than 3 points skipped')
      return null
    }
    count('IfcSlab')
    const top = slab.elevation ?? 0.05
    const thickness = Math.max(slab.thickness ?? 0.05, 1e-3)
    const profile = w.polygonProfile(
      polygon.map(planToIfc),
      ((slab.holes ?? []) as [number, number][][]).filter((h) => h.length >= 3).map((h) => h.map(planToIfc)),
    )
    const solid = w.extrude(profile, thickness, top - thickness)
    const color = colorOf(input.objectOf?.(slab.id))
    if (color) w.styleItem(solid, w.style(color))
    const ifcSlab = w.write(
      new ns.IfcSlab(
        w.guid(slab.id),
        null,
        new ns.IfcLabel(slab.name || 'Slab'),
        null,
        null,
        w.placement(storeyPlacement, [0, 0, 0]),
        w.productShape([w.shape(bodyContext, 'Body', 'SweptSolid', [solid])]),
        new ns.IfcIdentifier(slab.id),
        ns.IfcSlabTypeEnum.FLOOR,
      ),
    )
    pset(ifcSlab, slab.id, 'slab', { elevation: top, thickness })
    return ifcSlab
  }

  function exportZone(zone: ZoneNode, storeyPlacement: unknown, level: LevelNode) {
    const polygon = (zone.polygon ?? []) as [number, number][]
    if (polygon.length < 3) {
      warn(zone, 'zone with fewer than 3 points skipped')
      return null
    }
    count('IfcSpace')
    const height = (zone as { ceilingHeight?: number }).ceilingHeight ?? elevations.get(level.id)?.height ?? 2.7
    const solid = w.extrude(w.polygonProfile(polygon.map(planToIfc)), Math.max(height, 1e-3))
    const space = w.write(
      new ns.IfcSpace(
        w.guid(zone.id),
        null,
        new ns.IfcLabel(zone.name || 'Space'),
        null,
        null,
        w.placement(storeyPlacement, [0, 0, 0]),
        w.productShape([w.shape(bodyContext, 'Body', 'SweptSolid', [solid])]),
        zone.name ? new ns.IfcLabel(zone.name) : null,
        ns.IfcElementCompositionEnum.ELEMENT,
        ns.IfcSpaceTypeEnum.INTERNAL,
        null,
      ),
    )
    pset(space, zone.id, 'zone', { ceilingHeight: height })
    return space
  }

  function meshEntity(cls: MeshClass, key: string, name: string, placement: unknown, shape: unknown) {
    const args = [w.guid(key), null, new ns.IfcLabel(name), null, null, placement, shape, new ns.IfcIdentifier(key)] as const
    switch (cls) {
      case 'IfcCovering':
        return w.write(new ns.IfcCovering(...args, ns.IfcCoveringTypeEnum.CEILING))
      case 'IfcRoof':
        return w.write(new ns.IfcRoof(...args, ns.IfcRoofTypeEnum.NOTDEFINED))
      case 'IfcStair':
        return w.write(new ns.IfcStair(...args, ns.IfcStairTypeEnum.NOTDEFINED))
      case 'IfcColumn':
        return w.write(new ns.IfcColumn(...args, ns.IfcColumnTypeEnum.COLUMN))
      case 'IfcRailing':
        return w.write(new ns.IfcRailing(...args, ns.IfcRailingTypeEnum.FENCE))
      case 'IfcFurniture':
        return w.write(new ns.IfcFurniture(...args, ns.IfcFurnitureTypeEnum.NOTDEFINED))
      default:
        return w.write(new ns.IfcBuildingElementProxy(...args, ns.IfcBuildingElementProxyTypeEnum.NOTDEFINED))
    }
  }

  /** A node written as its rendered geometry, in the storey frame. */
  function exportMeshElement(node: AnyNode, storeyPlacement: unknown, worldToFrame: Matrix4) {
    const object = input.objectOf?.(node.id)
    if (!object) {
      warn(node, 'not drawn in the editor: not exported')
      return null
    }
    // Temple forms keep all their levels of detail as siblings: only the first (L0) is the model.
    const root = node.type.startsWith('hagia-sophia:') && object.children[0] ? object.children[0] : object
    const parts = collectMeshes(root, stopAt, worldToFrame)
    if (!parts.length) {
      warn(node, 'no visible geometry: not exported')
      return null
    }
    const cls = node.type === 'door' || node.type === 'window' ? 'IfcBuildingElementProxy' : (MESH_CLASS[node.type] ?? 'IfcBuildingElementProxy')
    count(cls)
    const name = (node as { name?: string }).name || node.type
    const element = meshEntity(cls, node.id, name, w.placement(storeyPlacement, [0, 0, 0]), bodyFromMeshes(parts))
    pset(element, node.id, node.type, cls === 'IfcBuildingElementProxy' ? nodeParams(node) : undefined)
    return element
  }

  /** An eco form or placed asset, in the ground storey's frame. */
  function exportExtra(extra: EcoIfcExtra, storeyPlacement: unknown, worldToFrame: Matrix4) {
    const parts = collectMeshes(extra.object, () => false, worldToFrame)
    if (!parts.length) {
      warnings.push({ nodeId: extra.id, nodeType: extra.kind, message: 'no visible geometry: not exported' })
      return null
    }
    count('IfcBuildingElementProxy')
    const element = meshEntity(
      'IfcBuildingElementProxy',
      extra.id,
      extra.name,
      w.placement(storeyPlacement, [0, 0, 0]),
      bodyFromMeshes(parts),
    )
    pset(element, extra.id, extra.kind, extra.params)
    return element
  }

  const data = api.SaveModel(model)
  api.CloseModel(model)
  return { data, warnings, stats }
}
