import type { FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import { QUADRANT_SIGNS } from '../../temple/proportions'
import type { HsPendentiveNode } from './schema'

type ViewChrome = { stroke: string | null; selected: boolean }

function chromeOf(ctx: GeometryContext): ViewChrome {
  const view = ctx.viewState
  const palette = view?.palette
  if ((view?.selected || view?.highlighted) && palette)
    return { stroke: palette.selectedStroke, selected: view?.selected ?? false }
  if (view?.hovered && palette) return { stroke: palette.wallHoverStroke, selected: false }
  return { stroke: null, selected: false }
}

/** 2D plan: light arc footprint at sphere radius. */
export function buildPendentiveFloorplan(
  node: HsPendentiveNode,
  ctx: GeometryContext,
): FloorplanGeometry {
  const [x, , z] = node.position ?? [0, 0, 0]
  const swatch = '#b8b2a6'
  const chrome = chromeOf(ctx)
  const stroke = chrome.stroke ?? swatch
  if (node.squareSide) {
    // the corner between the ring and the square, turned with the node
    const half = node.squareSide / 2
    const { sx, sz } = QUADRANT_SIGNS[node.quadrant]
    const ry = node.rotation?.[1] ?? 0
    const cos = Math.cos(ry)
    const sin = Math.sin(ry)
    const at = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos]
    const pts: [number, number][] = []
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2)
      pts.push(at(sx * half * Math.cos(a), sz * half * Math.sin(a)))
    }
    pts.push(at(sx * half, sz * half))
    const children: FloorplanGeometry[] = [
      {
        kind: 'polygon',
        points: pts,
        stroke,
        strokeWidth: 0.03,
        strokeDasharray: '0.1 0.08',
        fill: swatch,
        fillOpacity: 0.08,
        pointerEvents: 'all',
      },
    ]
    if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
    return { kind: 'group', children }
  }
  const r = node.sphereRadius * 0.35

  const children: FloorplanGeometry[] = [
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r,
      stroke,
      strokeWidth: 0.03,
      strokeDasharray: '0.1 0.08',
      fill: swatch,
      fillOpacity: 0.08,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: Math.max(0.04, r * 0.15),
      fill: chrome.stroke ?? swatch,
      stroke,
      strokeWidth: 0.02,
      opacity: 0.95,
    },
  ]
  if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
  return { kind: 'group', children }
}
