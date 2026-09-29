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
 *   swept Body), door and window openings (IfcOpeningElement placed at the
 *   opening's centre and sill, voids + fills), slabs (placed at their walking
 *   surface, extruded down), zones (IfcSpace).
 * - Everything else is its rendered geometry (triangles from the live scene),
 *   placed at its object's origin and turn: ceilings, columns, fences, items,
 *   the frames and leaves of doors and windows; roofs and stairs as IfcRoof /
 *   IfcStair aggregating one IfcSlab ROOF / IfcStairFlight that carries the
 *   geometry; and IfcBuildingElementProxy with Pset_Playground {Kind, Params}
 *   for blocks, shelves, bodies, temple forms, eco forms and placed assets.
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
import { sha1 } from './ifc-guid'
import { collectMeshes, type MeshPart } from './ifc-meshes'
import { IfcWriter, ns, planToIfc, toIfc, type Vec3 } from './ifc-write'

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
  /** Called when web-ifc is ready, right before the scene is walked; `afterWalk` right after. */
  beforeWalk?: () => void
  afterWalk?: () => void
  /** Geometry that is not a node; called after `beforeWalk`, so it sees the prepared scene. */
  extras?: () => EcoIfcExtra[]
  site?: EcoIfcSite | null
  wasmPath?: string
  projectName?: string
}

export type EcoIfcWarning = { nodeId: string; nodeType: string; message: string }

export type EcoIfcResult = {
  data: Uint8Array
  warnings: EcoIfcWarning[]
  stats: Record<string, number>
  /** Every GlobalId in the file, sorted. */
  globalIds: string[]
  /** SHA-1 of the sorted GlobalIds, first 8 hex digits: the same scene prints the same. */
  idPrint: string
}

type MeshClass =
  | 'IfcCovering'
  | 'IfcColumn'
  | 'IfcRailing'
  | 'IfcFurnishingElement'
  | 'IfcBuildingElementProxy'

const MESH_CLASS: Record<string, MeshClass> = {
  ceiling: 'IfcCovering',
  column: 'IfcColumn',
  fence: 'IfcRailing',
  item: 'IfcFurnishingElement',
}

/**
 * Not written: parts whose geometry is merged into their parent's (roof and
 * stair segments), groups that draw nothing, and annotations and references
 * that are not building (guides, measurements, dimensions, grids, scans, spawn).
 */
const NOT_EXPORTED = new Set([
  'roof-segment',
  'stair-segment',
  'body-group',
  'spawn',
  'guide',
  'measurement',
  'construction-dimension',
  'structural-grid',
  'scan',
])

/** Parameters small enough for a property: long strings and long lists are left out. */
export function compactParams(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string' && v.length > 200) continue
    if (Array.isArray(v) && v.length > 64) continue
    out[key] = v
  }
  return out
}

/** Parameters kept in Pset_Playground.Params: the node without its graph links and bulky fields. */
function nodeParams(node: AnyNode): Record<string, unknown> {
  const { id, parentId, children, metadata, topology, ...rest } = node as Record<string, unknown>
  void id
  void parentId
  void children
  void metadata
  void topology
  return compactParams(rest) ?? {}
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

/** The first 8 hex digits of SHA-1 over the sorted ids, one per line. */
export function globalIdPrint(globalIds: string[]): string {
  const digest = sha1(new TextEncoder().encode([...globalIds].sort().join('\n')))
  return [...digest.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** IFC frame of an element placed at `origin`, turned `angle` about +Z. */
function ifcFrame(origin: Vec3, angle = 0): Matrix4 {
  return new Matrix4()
    .makeTranslation(origin[0], origin[1], origin[2])
    .multiply(new Matrix4().makeRotationZ(angle))
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
  // From here to SaveModel nothing awaits, so the prepared scene cannot change underneath.
  input.beforeWalk?.()
  try {
    writeModel()
  } finally {
    input.afterWalk?.()
  }
  const data = api.SaveModel(model)
  api.CloseModel(model)
  const globalIds = [...w.globalIds].sort()
  return { data, warnings, stats, globalIds, idPrint: globalIdPrint(globalIds) }

  function writeModel() {
    const extras = input.extras?.() ?? []

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
    // Site north (IFC +Y) stands northDeg clockwise from true north (eco-site-sun.ts), so
    // true north is northDeg anticlockwise from +Y: TrueNorth = (−sin n, cos n).
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
    const sites = input.rootNodeIds
      .map((id) => nodes[id])
      .filter((n): n is AnyNode => n?.type === 'site')
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
      const items = parts.map((part) => styled(w.triangles(part.positions, part.indices), part))
      return items.length
        ? w.productShape([w.shape(bodyContext, 'Body', 'Tessellation', items)])
        : null
    }

    const colorOf = (object: Object3D | undefined): [number, number, number] | null => {
      let found: [number, number, number] | null = null
      object?.traverse((o) => {
        const material = (o as { material?: { color?: Color; visible?: boolean } }).material
        if (
          !found &&
          material &&
          !Array.isArray(material) &&
          material.visible !== false &&
          material.color instanceof Color
        ) {
          found = [material.color.r, material.color.g, material.color.b]
        }
      })
      return found
    }

    const pset = (
      element: unknown,
      key: string,
      kind: string,
      params?: Record<string, unknown>,
    ) => {
      const props: Record<string, string> = { PascalId: key, Kind: kind }
      if (params && Object.keys(params).length) props.Params = JSON.stringify(params)
      w.playgroundPset(key, element, props)
    }

    /**
     * Where a drawn object stands in a storey: its origin and its turn about
     * the vertical, and the matrix that takes storey-frame IFC points into it.
     */
    const objectFrame = (object: Object3D, worldToFrame: Matrix4) => {
      object.updateWorldMatrix(true, false)
      const position = new Vector3()
      const rotation = new Quaternion()
      worldToFrame.clone().multiply(object.matrixWorld).decompose(position, rotation, new Vector3())
      const origin = toIfc([position.x, position.y, position.z])
      const angle = new Euler().setFromQuaternion(rotation, 'YXZ').y
      return { origin, angle, storeyToElement: ifcFrame(origin, angle).invert() }
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
      w.write(
        new ns.IfcRelAggregates(w.guid(`${site.id}#in-project`), null, null, null, project, [
          ifcSite,
        ]),
      )

      const buildings = childIds(site)
        .map((id) => nodes[id])
        .filter((n): n is AnyNode => n?.type === 'building') as BuildingNode[]
      const ifcBuildings = buildings.map((building) => exportBuilding(building, sitePlacement))
      if (ifcBuildings.length) {
        w.write(
          new ns.IfcRelAggregates(
            w.guid(`${site.id}#buildings`),
            null,
            null,
            null,
            ifcSite,
            ifcBuildings,
          ),
        )
      }
    }

    function buildingMatrix(building: BuildingNode): Matrix4 {
      const [px, py, pz] = (building.position ?? [0, 0, 0]) as [number, number, number]
      const [rx, ry, rz] = ((building as { rotation?: number[] }).rotation ?? [0, 0, 0]) as [
        number,
        number,
        number,
      ]
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
        w.write(
          new ns.IfcRelAggregates(
            w.guid(`${building.id}#storeys`),
            null,
            null,
            null,
            ifcBuilding,
            storeys as never[],
          ),
        )
      }
      // Building-level elements (elevators) and extras go to the lowest storey.
      const ground = frames[0]
      if (ground) {
        const extraElements: unknown[] = []
        for (const childId of childIds(building)) {
          const child = nodes[childId]
          if (!child || child.type === 'level' || NOT_EXPORTED.has(child.type)) continue
          const element = exportMeshElement(child, ground.placement, ground.worldToFrame)
          if (element) extraElements.push(element)
        }
        if (building.id === firstBuildingId()) {
          for (const extra of extras) {
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
              extraElements as never[],
              ground.storey as never,
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
      const worldToFrame = buildingMatrix(building)
        .multiply(new Matrix4().makeTranslation(0, baseY, 0))
        .invert()

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
        } else if (node.type === 'roof' || node.type === 'stair') {
          const element = exportAssembly(node, placement, worldToFrame)
          if (element) contained.push(element)
        } else if (!NOT_EXPORTED.has(node.type)) {
          const element = exportMeshElement(node, placement, worldToFrame)
          if (element) contained.push(element)
        }
        for (const childId of childIds(node)) visit(childId, node)
      }
      for (const childId of childIds(level)) visit(childId, level)

      if (contained.length) {
        w.write(
          new ns.IfcRelContainedInSpatialStructure(
            w.guid(`${level.id}#contains`),
            null,
            null,
            null,
            contained as never[],
            storey,
          ),
        )
      }
      if (spaces.length) {
        w.write(
          new ns.IfcRelAggregates(
            w.guid(`${level.id}#spaces`),
            null,
            null,
            null,
            storey,
            spaces as never[],
          ),
        )
      }
      return { storey, placement, worldToFrame }
    }

    function exportWall(
      wall: WallNode,
      storeyPlacement: unknown,
      worldToFrame: Matrix4,
    ): unknown[] {
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
      // Storey-frame IFC → the wall's own frame (start point, turned along the wall).
      const wallFrame = ifcFrame([sx, sy, base], angle)

      const axis = w.shape(axisContext, 'Axis', 'Curve2D', [
        w.write(new ns.IfcPolyline([w.point2([0, 0]), w.point2([length, 0])])),
      ])
      const curved = Math.abs(wall.curveOffset ?? 0) > 1e-6
      let body: unknown
      if (curved) {
        // The swept box would be the chord; the rendered wall is the curve.
        warn(wall, 'curved wall: body is its rendered geometry, axis is the chord')
        const object = input.objectOf?.(wall.id)
        const storeyToWall = wallFrame.clone().invert()
        const parts = object
          ? collectMeshes(object, stopAt, worldToFrame).map((part) =>
              toElementFrame(part, storeyToWall),
            )
          : []
        body = parts.length
          ? w.shape(
              bodyContext,
              'Body',
              'Tessellation',
              parts.map((part) => styled(w.triangles(part.positions, part.indices), part)),
            )
          : null
      }
      if (!body) {
        const solid = w.extrude(
          w.rectangleProfile(length, thickness, length / 2, 0),
          Math.max(height, 1e-3),
        )
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
          const filling = exportOpening(
            child as DoorNode | WindowNode,
            wall,
            ifcWall,
            placement,
            wallFrame,
            thickness,
            worldToFrame,
          )
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
        v.set(
          part.positions[i] as number,
          part.positions[i + 1] as number,
          part.positions[i + 2] as number,
        ).applyMatrix4(storeyToElement)
        positions.push(v.x, v.y, v.z)
      }
      return { ...part, positions }
    }

    /**
     * A door or window in its wall: the void (IfcOpeningElement) and the filling
     * (IfcDoor / IfcWindow) share one placement in the wall's frame, at the
     * opening's centre along the wall and its sill, so a reader that takes the
     * placement for the opening's position finds it where Pascal has it.
     */
    function exportOpening(
      opening: DoorNode | WindowNode,
      wall: WallNode,
      ifcWall: unknown,
      wallPlacement: unknown,
      wallFrame: Matrix4,
      thickness: number,
      worldToFrame: Matrix4,
    ) {
      const kind = opening.type
      count(kind === 'door' ? 'IfcDoor' : 'IfcWindow')
      const [u, v] = (opening.position ?? [0, 0, 0]) as [number, number, number]
      const width = opening.width
      const height = opening.height
      const sill = v - height / 2
      // The void: the opening's full width and height, through the wall, centred on the placement.
      const voidSolid = w.extrude(w.rectangleProfile(width, thickness + 0.1), height)
      const ifcOpening = w.write(
        new ns.IfcOpeningElement(
          w.guid(`${opening.id}#opening`),
          null,
          new ns.IfcLabel(`${kind === 'door' ? 'Door' : 'Window'} opening`),
          null,
          null,
          w.placement(wallPlacement, [u, 0, sill]),
          w.productShape([w.shape(bodyContext, 'Body', 'SweptSolid', [voidSolid])]),
          null,
          ns.IfcOpeningElementTypeEnum.OPENING,
        ),
      )
      w.write(
        new ns.IfcRelVoidsElement(
          w.guid(`${opening.id}#voids`),
          null,
          null,
          null,
          ifcWall as never,
          ifcOpening,
        ),
      )

      // The filling: its rendered frame and leaf; a thin panel if it is not drawn.
      const object = input.objectOf?.(opening.id)
      const storeyToOpening = wallFrame
        .clone()
        .multiply(new Matrix4().makeTranslation(u, 0, sill))
        .invert()
      const parts = object
        ? collectMeshes(object, stopAt, worldToFrame).map((part) =>
            toElementFrame(part, storeyToOpening),
          )
        : []
      let shape: unknown = bodyFromMeshes(parts)
      if (!shape) {
        warn(opening, `${kind} not drawn: written as a panel`)
        shape = w.productShape([
          w.shape(bodyContext, 'Body', 'SweptSolid', [
            w.extrude(w.rectangleProfile(width, 0.05), height),
          ]),
        ])
      }
      const placement = w.placement(wallPlacement, [u, 0, sill])
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
                placement,
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
                placement,
                shape as never,
                new ns.IfcIdentifier(opening.id),
                new ns.IfcPositiveLengthMeasure(height),
                new ns.IfcPositiveLengthMeasure(width),
                ns.IfcWindowTypeEnum.WINDOW,
                null,
                null,
              ),
            )
      w.write(
        new ns.IfcRelFillsElement(
          w.guid(`${opening.id}#fills`),
          null,
          null,
          null,
          ifcOpening,
          filling as never,
        ),
      )
      pset(filling, opening.id, kind, { wallId: wall.id, u, sill, width, height })
      return filling
    }

    /** A slab placed at its walking surface, its thickness extruded down, as Pascal draws it. */
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
        ((slab.holes ?? []) as [number, number][][])
          .filter((h) => h.length >= 3)
          .map((h) => h.map(planToIfc)),
      )
      const solid = w.extrude(profile, thickness, 0, -1)
      const color = colorOf(input.objectOf?.(slab.id))
      if (color) w.styleItem(solid, w.style(color))
      const ifcSlab = w.write(
        new ns.IfcSlab(
          w.guid(slab.id),
          null,
          new ns.IfcLabel(slab.name || 'Slab'),
          null,
          null,
          w.placement(storeyPlacement, [0, 0, top]),
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
      const height =
        (zone as { ceilingHeight?: number }).ceilingHeight ??
        elevations.get(level.id)?.height ??
        2.7
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

    /** A drawn node: its object's placement and its visible triangles in that frame, or null. */
    function drawnElement(node: { id: string; type: string }, worldToFrame: Matrix4) {
      const object = input.objectOf?.(node.id)
      if (!object) {
        warn(node, 'not drawn in the editor: not exported')
        return null
      }
      // Temple forms keep all their levels of detail as siblings: only the first (L0) is the model.
      const root =
        node.type.startsWith('hagia-sophia:') && object.children[0] ? object.children[0] : object
      const frame = objectFrame(object, worldToFrame)
      const parts = collectMeshes(root, stopAt, worldToFrame).map((part) =>
        toElementFrame(part, frame.storeyToElement),
      )
      if (!parts.length) {
        warn(node, 'no visible geometry: not exported')
        return null
      }
      return { frame, parts }
    }

    /**
     * Roofs and stairs: the whole (IfcRoof / IfcStair, with the node's
     * parameters and its segments') aggregates one part that carries the
     * rendered geometry (IfcSlab ROOF / IfcStairFlight).
     */
    function exportAssembly(node: AnyNode, storeyPlacement: unknown, worldToFrame: Matrix4) {
      const drawn = drawnElement(node, worldToFrame)
      if (!drawn) return null
      const isRoof = node.type === 'roof'
      count(isRoof ? 'IfcRoof' : 'IfcStair')
      const { frame, parts } = drawn
      const placement = w.placement(storeyPlacement, frame.origin, frame.angle)
      const name = new ns.IfcLabel((node as { name?: string }).name || node.type)
      const tag = new ns.IfcIdentifier(node.id)
      const whole = isRoof
        ? w.write(
            new ns.IfcRoof(
              w.guid(node.id),
              null,
              name,
              null,
              null,
              placement,
              null,
              tag,
              ns.IfcRoofTypeEnum.NOTDEFINED,
            ),
          )
        : w.write(
            new ns.IfcStair(
              w.guid(node.id),
              null,
              name,
              null,
              null,
              placement,
              null,
              tag,
              ns.IfcStairTypeEnum.NOTDEFINED,
            ),
          )
      const partPlacement = w.placement(placement, [0, 0, 0])
      const body = bodyFromMeshes(parts)
      const part = isRoof
        ? w.write(
            new ns.IfcSlab(
              w.guid(`${node.id}#slab`),
              null,
              name,
              null,
              null,
              partPlacement,
              body as never,
              null,
              ns.IfcSlabTypeEnum.ROOF,
            ),
          )
        : w.write(
            new ns.IfcStairFlight(
              w.guid(`${node.id}#flight`),
              null,
              name,
              null,
              null,
              partPlacement,
              body as never,
              null,
              null,
              null,
              null,
              null,
              ns.IfcStairFlightTypeEnum.NOTDEFINED,
            ),
          )
      w.write(
        new ns.IfcRelAggregates(w.guid(`${node.id}#parts`), null, null, null, whole, [
          part as never,
        ]),
      )
      const segments = childIds(node)
        .map((id) => nodes[id])
        .filter((s): s is AnyNode => Boolean(s))
        .map((s) => ({ id: s.id, type: s.type, ...nodeParams(s) }))
      pset(whole, node.id, node.type, { ...nodeParams(node), segments })
      return whole
    }

    function meshEntity(
      cls: MeshClass,
      key: string,
      name: string,
      placement: unknown,
      shape: unknown,
    ) {
      const args = [
        w.guid(key),
        null,
        new ns.IfcLabel(name),
        null,
        null,
        placement as never,
        shape as never,
        new ns.IfcIdentifier(key),
      ] as const
      switch (cls) {
        case 'IfcCovering':
          return w.write(new ns.IfcCovering(...args, ns.IfcCoveringTypeEnum.CEILING))
        case 'IfcColumn':
          return w.write(new ns.IfcColumn(...args, ns.IfcColumnTypeEnum.COLUMN))
        case 'IfcRailing':
          return w.write(new ns.IfcRailing(...args, ns.IfcRailingTypeEnum.FENCE))
        case 'IfcFurnishingElement':
          return w.write(new ns.IfcFurnishingElement(...args))
        default:
          return w.write(
            new ns.IfcBuildingElementProxy(...args, ns.IfcBuildingElementProxyTypeEnum.NOTDEFINED),
          )
      }
    }

    /** A node written as its rendered geometry, placed at its object's origin and turn. */
    function exportMeshElement(node: AnyNode, storeyPlacement: unknown, worldToFrame: Matrix4) {
      const drawn = drawnElement(node, worldToFrame)
      if (!drawn) return null
      const cls =
        node.type === 'door' || node.type === 'window'
          ? 'IfcBuildingElementProxy'
          : (MESH_CLASS[node.type] ?? 'IfcBuildingElementProxy')
      count(cls)
      const name = (node as { name?: string }).name || node.type
      const element = meshEntity(
        cls,
        node.id,
        name,
        w.placement(storeyPlacement, drawn.frame.origin, drawn.frame.angle),
        bodyFromMeshes(drawn.parts),
      )
      pset(
        element,
        node.id,
        node.type,
        cls === 'IfcBuildingElementProxy' ? nodeParams(node) : undefined,
      )
      return element
    }

    /** An eco form or placed asset, in the ground storey, placed at its object's origin and turn. */
    function exportExtra(extra: EcoIfcExtra, storeyPlacement: unknown, worldToFrame: Matrix4) {
      const frame = objectFrame(extra.object, worldToFrame)
      const parts = collectMeshes(extra.object, () => false, worldToFrame).map((part) =>
        toElementFrame(part, frame.storeyToElement),
      )
      if (!parts.length) {
        warnings.push({
          nodeId: extra.id,
          nodeType: extra.kind,
          message: 'no visible geometry: not exported',
        })
        return null
      }
      count('IfcBuildingElementProxy')
      const element = meshEntity(
        'IfcBuildingElementProxy',
        extra.id,
        extra.name,
        w.placement(storeyPlacement, frame.origin, frame.angle),
        bodyFromMeshes(parts),
      )
      pset(element, extra.id, extra.kind, extra.params)
      return element
    }
  }
}
