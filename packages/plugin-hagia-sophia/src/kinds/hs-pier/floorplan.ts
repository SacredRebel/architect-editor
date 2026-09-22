import type { FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import { footprintBounds } from './geometry'
import type { HsPierNode } from './schema'

type ViewChrome = { stroke: string | null; selected: boolean }

function chromeOf(ctx: GeometryContext): ViewChrome {
  const view = ctx.viewState
  const palette = view?.palette
  if ((view?.selected || view?.highlighted) && palette)
    return { stroke: palette.selectedStroke, selected: view?.selected ?? false }
  if (view?.hovered && palette) return { stroke: palette.wallHoverStroke, selected: false }
  return { stroke: null, selected: false }
}

function worldPolygon(
  footprint: readonly (readonly [number, number])[],
  ox: number,
  oz: number,
  rotY: number,
): [number, number][] {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  return footprint.map(([lx, lz]) => {
    // the same turn three.js gives the shaft for rotation.y (plan +z is south)
    const wx = ox + lx * cos + lz * sin
    const wz = oz - lx * sin + lz * cos
    return [wx, wz] as [number, number]
  })
}

/** 2D plan: footprint polygon fill + impost AABB outline. */
export function buildPierFloorplan(node: HsPierNode, ctx: GeometryContext): FloorplanGeometry {
  const [x, , z] = node.position ?? [0, 0, 0]
  const rotY = node.rotation?.[1] ?? 0
  const swatch = '#c8c2b4'
  const chrome = chromeOf(ctx)
  const stroke = chrome.stroke ?? swatch
  const poly = worldPolygon(node.footprint, x, z, rotY)
  const bounds = footprintBounds(node.footprint)
  const halfW = (bounds.width + node.impostSize) / 2
  const halfD = (bounds.depth + node.impostSize) / 2
  const impostLocal: [number, number][] = [
    [bounds.cx - halfW, bounds.cz - halfD],
    [bounds.cx + halfW, bounds.cz - halfD],
    [bounds.cx + halfW, bounds.cz + halfD],
    [bounds.cx - halfW, bounds.cz + halfD],
  ]
  const impost = worldPolygon(impostLocal, x, z, rotY)

  const children: FloorplanGeometry[] = [
    {
      kind: 'polygon',
      points: poly,
      stroke,
      strokeWidth: 0.04,
      fill: swatch,
      fillOpacity: 0.18,
      pointerEvents: 'all',
    },
    {
      kind: 'polygon',
      points: impost,
      stroke,
      strokeWidth: 0.025,
      strokeDasharray: '0.15 0.1',
      fill: 'none',
      pointerEvents: 'stroke',
    },
  ]
  if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
  return { kind: 'group', children }
}
