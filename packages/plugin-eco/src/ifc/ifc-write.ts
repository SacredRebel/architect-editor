/**
 * Low-level IFC4X3 writing for the eco exporter: axes, placements, profiles,
 * extrusions, triangle meshes, styles and property sets. Everything here writes
 * lines into one web-ifc model; nothing knows about Pascal nodes.
 *
 * Axes: Pascal is Y-up with +x east and +z south (the eco site frame). IFC is
 * Z-up with +X east and +Y north. So IFC (X, Y, Z) = Pascal (x, −z, y) — a
 * proper rotation, not a mirror — and a plan point [x, z] is IFC (x, −z).
 */
import * as WebIFC from 'web-ifc'
import { ifcGlobalId } from './ifc-guid'

export const ns = WebIFC.IFC4X3

export type Vec3 = [number, number, number]

/** Pascal world (x, y, z) → IFC (X, Y, Z). */
export function toIfc([x, y, z]: Vec3): Vec3 {
  return [x, -z, y]
}

/** A Pascal plan point [x, z] → IFC plan (X, Y). */
export function planToIfc([x, z]: [number, number]): [number, number] {
  return [x, -z]
}

export class IfcWriter {
  readonly api: WebIFC.IfcAPI
  readonly model: number
  private styles = new Map<string, unknown>()

  constructor(api: WebIFC.IfcAPI, model: number) {
    this.api = api
    this.model = model
  }

  write<T>(entity: T): T {
    this.api.WriteLine(this.model, entity as never)
    return entity
  }

  guid(name: string) {
    return new ns.IfcGloballyUniqueId(ifcGlobalId(name))
  }

  label(text: string | undefined | null) {
    return text ? new ns.IfcLabel(text) : null
  }

  point3([x, y, z]: Vec3) {
    return this.write(
      new ns.IfcCartesianPoint([
        new ns.IfcLengthMeasure(x),
        new ns.IfcLengthMeasure(y),
        new ns.IfcLengthMeasure(z),
      ]),
    )
  }

  point2([x, y]: [number, number]) {
    return this.write(new ns.IfcCartesianPoint([new ns.IfcLengthMeasure(x), new ns.IfcLengthMeasure(y)]))
  }

  direction3([x, y, z]: Vec3) {
    return this.write(new ns.IfcDirection([new ns.IfcReal(x), new ns.IfcReal(y), new ns.IfcReal(z)]))
  }

  direction2([x, y]: [number, number]) {
    return this.write(new ns.IfcDirection([new ns.IfcReal(x), new ns.IfcReal(y)]))
  }

  /** An axis placement at `origin`, turned `angle` radians about +Z (IFC plan angle). */
  axis3(origin: Vec3, angle = 0) {
    if (Math.abs(angle) < 1e-12) return this.write(new ns.IfcAxis2Placement3D(this.point3(origin), null, null))
    return this.write(
      new ns.IfcAxis2Placement3D(
        this.point3(origin),
        this.direction3([0, 0, 1]),
        this.direction3([Math.cos(angle), Math.sin(angle), 0]),
      ),
    )
  }

  placement(relativeTo: unknown | null, origin: Vec3, angle = 0) {
    return this.write(new ns.IfcLocalPlacement(relativeTo as never, this.axis3(origin, angle)))
  }

  /** A closed polyline profile from IFC plan points (optionally with holes). */
  polygonProfile(outer: [number, number][], holes: [number, number][][] = []) {
    const curve = (pts: [number, number][]) => {
      const points = pts.map((p) => this.point2(p))
      return this.write(new ns.IfcPolyline([...points, points[0] as never]))
    }
    if (holes.length === 0) {
      return this.write(new ns.IfcArbitraryClosedProfileDef(ns.IfcProfileTypeEnum.AREA, null, curve(outer)))
    }
    return this.write(
      new ns.IfcArbitraryProfileDefWithVoids(
        ns.IfcProfileTypeEnum.AREA,
        null,
        curve(outer),
        holes.map((h) => curve(h)),
      ),
    )
  }

  /** A rectangle profile `x` by `y`, centred on (cx, cy). */
  rectangleProfile(x: number, y: number, cx = 0, cy = 0) {
    return this.write(
      new ns.IfcRectangleProfileDef(
        ns.IfcProfileTypeEnum.AREA,
        null,
        this.write(new ns.IfcAxis2Placement2D(this.point2([cx, cy]), null)),
        new ns.IfcPositiveLengthMeasure(x),
        new ns.IfcPositiveLengthMeasure(y),
      ),
    )
  }

  /** Extrude a profile along +Z by `depth`, starting at z = `base`. */
  extrude(profile: unknown, depth: number, base = 0) {
    return this.write(
      new ns.IfcExtrudedAreaSolid(
        profile as never,
        base === 0 ? null : this.axis3([0, 0, base]),
        this.direction3([0, 0, 1]),
        new ns.IfcPositiveLengthMeasure(depth),
      ),
    )
  }

  /** A triangle mesh (IFC coordinates, local to the element's placement). */
  triangles(positions: number[], indices: number[]) {
    const coords: WebIFC.IFC4X3.IfcLengthMeasure[][] = []
    for (let i = 0; i < positions.length; i += 3) {
      coords.push([
        new ns.IfcLengthMeasure(round(positions[i] as number)),
        new ns.IfcLengthMeasure(round(positions[i + 1] as number)),
        new ns.IfcLengthMeasure(round(positions[i + 2] as number)),
      ])
    }
    const list = this.write(new ns.IfcCartesianPointList3D(coords, null))
    const faces: WebIFC.IFC4X3.IfcPositiveInteger[][] = []
    for (let i = 0; i < indices.length; i += 3) {
      faces.push([
        new ns.IfcPositiveInteger((indices[i] as number) + 1),
        new ns.IfcPositiveInteger((indices[i + 1] as number) + 1),
        new ns.IfcPositiveInteger((indices[i + 2] as number) + 1),
      ])
    }
    return this.write(new ns.IfcTriangulatedFaceSet(list, null, null, faces, null))
  }

  /** One colour style per distinct colour, reused. */
  style(color: [number, number, number], opacity = 1) {
    const key = `${color.map((c) => c.toFixed(3)).join(',')}|${opacity.toFixed(3)}`
    const existing = this.styles.get(key)
    if (existing) return existing
    const colour = this.write(
      new ns.IfcColourRgb(
        null,
        new ns.IfcNormalisedRatioMeasure(clamp01(color[0])),
        new ns.IfcNormalisedRatioMeasure(clamp01(color[1])),
        new ns.IfcNormalisedRatioMeasure(clamp01(color[2])),
      ),
    )
    const shading = this.write(
      new ns.IfcSurfaceStyleShading(colour, opacity < 1 ? new ns.IfcNormalisedRatioMeasure(1 - opacity) : null),
    )
    const style = this.write(new ns.IfcSurfaceStyle(null, ns.IfcSurfaceSide.BOTH, [shading]))
    this.styles.set(key, style)
    return style
  }

  styleItem(item: unknown, style: unknown) {
    this.write(new ns.IfcStyledItem(item as never, [style as never], null))
  }

  shape(context: unknown, identifier: 'Body' | 'Axis', type: string, items: unknown[]) {
    return this.write(
      new ns.IfcShapeRepresentation(context as never, new ns.IfcLabel(identifier), new ns.IfcLabel(type), items as never[]),
    )
  }

  productShape(representations: unknown[]) {
    return this.write(new ns.IfcProductDefinitionShape(null, null, representations as never[]))
  }

  /** Pset_Playground on `element`: the Pascal id and kind, plus optional parameters (JSON). */
  playgroundPset(guidName: string, element: unknown, props: Record<string, string>) {
    const properties = Object.entries(props).map(([name, value]) =>
      this.write(new ns.IfcPropertySingleValue(new ns.IfcIdentifier(name), null, new ns.IfcText(value), null)),
    )
    const pset = this.write(
      new ns.IfcPropertySet(this.guid(`${guidName}#pset`), null, new ns.IfcLabel('Pset_Playground'), null, properties),
    )
    this.write(new ns.IfcRelDefinesByProperties(this.guid(`${guidName}#pset-rel`), null, null, null, [element as never], pset))
  }
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

/** Coordinates to 0.01 mm: stable text across exports, far below any building tolerance. */
function round(v: number) {
  return Math.round(v * 1e5) / 1e5
}
