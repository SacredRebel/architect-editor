/**
 * The eco IFC exporter on a node-only scene (no live objects: doors and
 * windows go out as panels, nothing is drawn). Every expectation is derived
 * here, apart from the exporter: GlobalIds from node:crypto's SHA-1, positions
 * from the building's own transform, placements composed from the file's
 * IfcLocalPlacement chain, and the converter reading the file back.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertIfcToPascal } from '@pascal-app/ifc-converter'
import * as WebIFC from 'web-ifc'
import { type EcoIfcSite, exportEcoIfc } from './eco-ifc-export'

const wasmPath = `${dirname(fileURLToPath(import.meta.resolve('web-ifc')))}/`

// The published id scheme: UUIDv5 in this namespace, IFC's 22-character base 64.
const NAMESPACE = '3d8f5b52-6a3e-4c1b-9f0e-2b7c8a41d6e9'
const IFC64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
function expectedGlobalId(name: string): string {
  const namespace = Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex')
  const bytes = createHash('sha1')
    .update(Buffer.concat([namespace, Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16)
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex')}`)
  let out = ''
  for (let i = 0; i < 22; i++) {
    out = IFC64[Number(n % 64n)] + out
    n /= 64n
  }
  return out
}

// The pack's georeference, with a turned north so TrueNorth is not the default.
const SITE: EcoIfcSite = { originLL: [-119.15536, 34.4331], originElevM: 425.9, northDeg: 12 }
const BUILDING = { position: [2, 0, -3] as [number, number, number], turn: 0.4 }
const LEVEL_HEIGHTS = [3, 2.8]

function node(id: string, type: string, parentId: string | null, rest: Record<string, unknown>) {
  return { object: 'node', id, type, parentId, visible: true, metadata: {}, ...rest }
}

const NODES: Record<string, Record<string, unknown>> = {
  site_t: node('site_t', 'site', null, {
    children: ['building_t'],
    polygon: {
      type: 'polygon',
      points: [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
      ],
    },
  }),
  building_t: node('building_t', 'building', 'site_t', {
    children: ['level_t0', 'level_t1'],
    position: BUILDING.position,
    rotation: [0, BUILDING.turn, 0],
  }),
  level_t0: node('level_t0', 'level', 'building_t', {
    level: 0,
    height: LEVEL_HEIGHTS[0],
    children: ['wall_t_s', 'wall_t_e', 'slab_t0', 'zone_t0'],
  }),
  level_t1: node('level_t1', 'level', 'building_t', {
    level: 1,
    height: LEVEL_HEIGHTS[1],
    children: ['wall_t_n1', 'zone_t1'],
  }),
  wall_t_s: node('wall_t_s', 'wall', 'level_t0', {
    start: [0, 0],
    end: [10, 0],
    thickness: 0.2,
    height: 2.7,
    children: ['window_t_s', 'door_t_s'],
  }),
  // Runs from the south-east corner to the north-east one: Pascal −z is north.
  wall_t_e: node('wall_t_e', 'wall', 'level_t0', {
    start: [10, 0],
    end: [10, -8],
    thickness: 0.2,
    height: 2.7,
    children: [],
  }),
  window_t_s: node('window_t_s', 'window', 'wall_t_s', {
    wallId: 'wall_t_s',
    position: [3, 1.5, 0],
    width: 1.4,
    height: 1.2,
  }),
  door_t_s: node('door_t_s', 'door', 'wall_t_s', {
    wallId: 'wall_t_s',
    position: [7, 1.05, 0],
    width: 0.9,
    height: 2.1,
  }),
  slab_t0: node('slab_t0', 'slab', 'level_t0', {
    polygon: [
      [0.2, -0.2],
      [9.8, -0.2],
      [9.8, -7.8],
      [0.2, -7.8],
    ],
    holes: [],
    elevation: 0.05,
    thickness: 0.2,
  }),
  zone_t0: node('zone_t0', 'zone', 'level_t0', {
    name: 'Living',
    polygon: [
      [0, 0],
      [10, 0],
      [10, -8],
      [0, -8],
    ],
  }),
  wall_t_n1: node('wall_t_n1', 'wall', 'level_t1', {
    start: [0, -8],
    end: [10, -8],
    thickness: 0.2,
    height: 2.6,
    children: ['window_t_n1'],
  }),
  window_t_n1: node('window_t_n1', 'window', 'wall_t_n1', {
    wallId: 'wall_t_n1',
    position: [5, 1.6, 0],
    width: 2,
    height: 1.1,
  }),
  zone_t1: node('zone_t1', 'zone', 'level_t1', {
    name: 'Studio',
    polygon: [
      [0, 0],
      [10, 0],
      [10, -8],
      [0, -8],
    ],
  }),
}

/** A building-local Pascal point → the site frame (three's Y rotation, then the offset). */
function toSite([x, y, z]: [number, number, number]): [number, number, number] {
  const c = Math.cos(BUILDING.turn)
  const s = Math.sin(BUILDING.turn)
  const [px, py, pz] = BUILDING.position
  return [px + x * c + z * s, py + y, pz - x * s + z * c]
}
/** Pascal (x, y, z) → IFC (X, Y, Z) with +Y north: the axes FreeCAD must see. */
const ifcOf = ([x, y, z]: [number, number, number]) => [x, -z, y]

function exportFixture() {
  return exportEcoIfc({
    nodes: NODES as never,
    rootNodeIds: ['site_t'],
    site: SITE,
    wasmPath,
  })
}

type Mat = number[][]
const mul = (a: Mat, b: Mat): Mat =>
  a.map((row) => b[0]!.map((_, j) => row.reduce((sum, v, k) => sum + v * (b[k]![j] as number), 0)))
const apply = (m: Mat, [x, y, z]: number[]) =>
  [0, 1, 2].map((i) => (m[i]![0] as number) * x! + (m[i]![1] as number) * y! + (m[i]![2] as number) * z! + (m[i]![3] as number))

async function readIfc(data: Uint8Array) {
  const api = new WebIFC.IfcAPI()
  api.SetWasmPath(wasmPath, true)
  await api.Init()
  const model = api.OpenModel(data)
  const line = (id: number) => api.GetLine(model, id)
  const byGlobalId = new Map<string, { id: number; type: number; entity: any }>()
  const all = api.GetAllLines(model)
  for (let i = 0; i < all.size(); i++) {
    const id = all.get(i)
    const entity = line(id)
    if (entity?.GlobalId?.value) byGlobalId.set(entity.GlobalId.value, { id, type: api.GetLineType(model, id), entity })
  }
  const vector = (id: number) => line(id).DirectionRatios.map((d: { value: number }) => d.value)
  const axisMatrix = (id: number): Mat => {
    const a = line(id)
    const o = line(a.Location.value).Coordinates.map((c: { value: number }) => c.value)
    const zAxis: number[] = a.Axis ? vector(a.Axis.value) : [0, 0, 1]
    const ref: number[] = a.RefDirection ? vector(a.RefDirection.value) : [1, 0, 0]
    const dot = ref[0]! * zAxis[0]! + ref[1]! * zAxis[1]! + ref[2]! * zAxis[2]!
    let xAxis = ref.map((v, i) => v - dot * zAxis[i]!)
    const len = Math.hypot(...xAxis)
    xAxis = xAxis.map((v) => v / len)
    const yAxis = [
      zAxis[1]! * xAxis[2]! - zAxis[2]! * xAxis[1]!,
      zAxis[2]! * xAxis[0]! - zAxis[0]! * xAxis[2]!,
      zAxis[0]! * xAxis[1]! - zAxis[1]! * xAxis[0]!,
    ]
    return [
      [xAxis[0]!, yAxis[0]!, zAxis[0]!, o[0] ?? 0],
      [xAxis[1]!, yAxis[1]!, zAxis[1]!, o[1] ?? 0],
      [xAxis[2]!, yAxis[2]!, zAxis[2]!, o[2] ?? 0],
      [0, 0, 0, 1],
    ]
  }
  const placement = (id: number): Mat => {
    const p = line(id)
    const local = axisMatrix(p.RelativePlacement.value)
    return p.PlacementRelTo ? mul(placement(p.PlacementRelTo.value), local) : local
  }
  const find = (name: string) => {
    const found = byGlobalId.get(expectedGlobalId(name))
    if (!found) throw new Error(`no entity with the GlobalId of ${name}`)
    return found
  }
  const worldOf = (name: string, local: number[] = [0, 0, 0]) =>
    apply(placement(find(name).entity.ObjectPlacement.value), local)
  const idsOfType = (type: number) => {
    const ids = api.GetLineIDsWithType(model, type)
    return Array.from({ length: ids.size() }, (_, i) => ids.get(i))
  }
  return { api, model, line, byGlobalId, find, worldOf, placement, idsOfType }
}

const near = (actual: number[], expected: number[], tolerance = 1e-4) =>
  actual.length === expected.length &&
  actual.every((v, i) => Math.abs(v - (expected[i] as number)) <= tolerance)

describe('eco IFC export', () => {
  test('the same scene gives the same model: same data section, same GlobalIds', async () => {
    const [first, second] = [await exportFixture(), await exportFixture()]
    const data = (bytes: Uint8Array) => {
      const text = new TextDecoder().decode(bytes)
      return text.slice(text.indexOf('DATA;'))
    }
    expect(data(second.data)).toBe(data(first.data))
    expect(second.globalIds).toEqual(first.globalIds)
    expect(second.idPrint).toBe(first.idPrint)
  })

  test("every element's GlobalId is the UUIDv5 of its node id, and its Tag is the id", async () => {
    const { data } = await exportFixture()
    const ifc = await readIfc(data)
    const expected: [string, number][] = [
      ['site_t#project', WebIFC.IFCPROJECT],
      ['site_t', WebIFC.IFCSITE],
      ['building_t', WebIFC.IFCBUILDING],
      ['level_t0', WebIFC.IFCBUILDINGSTOREY],
      ['level_t1', WebIFC.IFCBUILDINGSTOREY],
      ['wall_t_s', WebIFC.IFCWALL],
      ['wall_t_e', WebIFC.IFCWALL],
      ['wall_t_n1', WebIFC.IFCWALL],
      ['window_t_s', WebIFC.IFCWINDOW],
      ['window_t_n1', WebIFC.IFCWINDOW],
      ['door_t_s', WebIFC.IFCDOOR],
      ['window_t_s#opening', WebIFC.IFCOPENINGELEMENT],
      ['slab_t0', WebIFC.IFCSLAB],
      ['zone_t0', WebIFC.IFCSPACE],
      ['zone_t1', WebIFC.IFCSPACE],
    ]
    for (const [name, type] of expected) expect(ifc.find(name).type).toBe(type)
    for (const id of ['wall_t_s', 'window_t_s', 'door_t_s', 'slab_t0'])
      expect(ifc.find(id).entity.Tag?.value).toBe(id)
    for (const globalId of ifc.byGlobalId.keys()) expect(globalId).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)
  })

  test('the project aggregates the site; storeys stack at the levels’ heights', async () => {
    const ifc = await readIfc((await exportFixture()).data)
    const project = ifc.find('site_t#project').id
    const site = ifc.find('site_t').id
    const aggregates = ifc.idsOfType(WebIFC.IFCRELAGGREGATES).map(ifc.line)
    expect(
      aggregates.some(
        (rel: any) =>
          rel.RelatingObject.value === project &&
          rel.RelatedObjects.some((o: { value: number }) => o.value === site),
      ),
    ).toBe(true)
    const storeyZ = ['level_t0', 'level_t1'].map((id) => ifc.worldOf(id)[2] as number)
    const elevation = ['level_t0', 'level_t1'].map((id) => ifc.find(id).entity.Elevation.value)
    const stacked = [0, LEVEL_HEIGHTS[0] as number]
    expect(near(storeyZ, stacked)).toBe(true)
    expect(near(elevation, stacked)).toBe(true)
  })

  test('north-up: a wall running to Pascal −z runs to IFC +Y, in the building’s turn', async () => {
    const ifc = await readIfc((await exportFixture()).data)
    const wall = ifc.find('wall_t_e').entity
    const axis = wall.Representation.value
    const shape = ifc
      .line(axis)
      .Representations.map((r: { value: number }) => ifc.line(r.value))
      .find((r: any) => r.RepresentationIdentifier.value === 'Axis')
    const points = ifc
      .line(shape.Items[0].value)
      .Points.map((p: { value: number }) => ifc.line(p.value).Coordinates.map((c: any) => c.value))
    const start = ifc.worldOf('wall_t_e', [points[0][0], points[0][1], 0])
    const end = ifc.worldOf('wall_t_e', [points[1][0], points[1][1], 0])
    expect(near(start, ifcOf(toSite([10, 0, 0])))).toBe(true)
    expect(near(end, ifcOf(toSite([10, 0, -8])))).toBe(true)
    // Unturned, the same wall would run due north: +Y grows.
    expect((end[1] as number) - (start[1] as number)).toBeGreaterThan(0)
  })

  test('openings sit at their centres along the wall and at their sills', async () => {
    const ifc = await readIfc((await exportFixture()).data)
    const cases: [string, [number, number, number], number][] = [
      // [opening, its centre-bottom in the building (x, y above the storey, z), storey elevation]
      ['window_t_s', [3, 1.5 - 0.6, 0], 0],
      ['door_t_s', [7, 1.05 - 1.05, 0], 0],
      ['window_t_n1', [5, 1.6 - 0.55, -8], LEVEL_HEIGHTS[0] as number],
    ]
    for (const [id, [x, sill, z], storey] of cases) {
      const at = ifc.worldOf(`${id}#opening`)
      expect(near(at, ifcOf(toSite([x, storey + sill, z])))).toBe(true)
      // The filling shares the placement.
      expect(near(ifc.worldOf(id), at)).toBe(true)
    }
  })

  test('the site carries the pack’s georeference and the model its true north', async () => {
    const ifc = await readIfc((await exportFixture()).data)
    const site = ifc.find('site_t').entity
    const dms = (deg: number) => {
      const sign = Math.sign(deg)
      const micro = Math.round(Math.abs(deg) * 3600e6)
      return [
        Math.floor(micro / 3600e6),
        Math.floor((micro % 3600e6) / 60e6),
        Math.floor((micro % 60e6) / 1e6),
        micro % 1e6,
      ].map((v) => sign * v)
    }
    const values = (angle: any) => angle.value.map((v: any) => (typeof v === 'object' ? v.value : v))
    expect(values(site.RefLatitude)).toEqual(dms(34.4331))
    expect(values(site.RefLongitude)).toEqual(dms(-119.15536))
    expect(site.RefElevation.value).toBeCloseTo(425.9, 9)
    const context = ifc.idsOfType(WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT).map(ifc.line)[0]
    const north = ifc.line(context.TrueNorth.value).DirectionRatios.map((d: any) => d.value)
    const n = (12 * Math.PI) / 180
    expect(near(north, [-Math.sin(n), Math.cos(n)], 1e-9)).toBe(true)
  })

  test('no owner history, no person, no organisation in the model', async () => {
    const ifc = await readIfc((await exportFixture()).data)
    for (const type of [WebIFC.IFCOWNERHISTORY, WebIFC.IFCPERSON, WebIFC.IFCORGANIZATION])
      expect(ifc.idsOfType(type).length).toBe(0)
  })

  test('the converter, reading north-up, gives back the walls, openings and storeys', async () => {
    const { data } = await exportFixture()
    const read = async (northUp: boolean) => {
      const log = console.log
      console.log = () => {}
      try {
        return await convertIfcToPascal(data, undefined, { northUp, wasmPath, simplify: false })
      } finally {
        console.log = log
      }
    }
    const byGlobalId = (graph: Awaited<ReturnType<typeof read>>) => {
      const map = new Map<string, any>()
      for (const n of Object.values(graph.nodes) as any[]) {
        const id = n.metadata?.globalId
        if (id) map.set(id, n)
      }
      return map
    }
    const graph = byGlobalId(await read(true))
    const get = (id: string) => {
      const found = graph.get(expectedGlobalId(id))
      if (!found) throw new Error(`converter lost ${id}`)
      return found
    }
    for (const id of ['wall_t_s', 'wall_t_e', 'wall_t_n1']) {
      const wall = NODES[id] as { start: [number, number]; end: [number, number] }
      const [sx, , sz] = toSite([wall.start[0], 0, wall.start[1]])
      const [ex, , ez] = toSite([wall.end[0], 0, wall.end[1]])
      expect(near([...get(id).start, ...get(id).end], [sx, sz, ex, ez])).toBe(true)
    }
    expect(get('window_t_s').position[0]).toBeCloseTo(3, 4)
    expect(get('window_t_s').metadata.sillHeight).toBeCloseTo(0.9, 4)
    expect(get('window_t_n1').position[0]).toBeCloseTo(5, 4)
    expect(get('window_t_n1').metadata.sillHeight).toBeCloseTo(1.05, 4)
    expect(get('door_t_s').position[0]).toBeCloseTo(7, 4)
    expect(get('level_t1').metadata.elevation).toBeCloseTo(LEVEL_HEIGHTS[0] as number, 4)
    expect(get('slab_t0').elevation).toBeCloseTo(0.05, 4)

    // Read the old way, the same file comes back mirrored north–south.
    const mirrored = byGlobalId(await read(false)).get(expectedGlobalId('wall_t_e'))
    const [, , ez] = toSite([10, 0, -8])
    expect(mirrored.end[1]).toBeCloseTo(-ez, 4)
  })
})
