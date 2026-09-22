import type { FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import type { HsArchNode } from './schema'

type ViewChrome = { stroke: string | null; selected: boolean }

function chromeOf(ctx: GeometryContext): ViewChrome {
  const view = ctx.viewState
  const palette = view?.palette
  if ((view?.selected || view?.highlighted) && palette)
    return { stroke: palette.selectedStroke, selected: view?.selected ?? false }
  if (view?.hovered && palette) return { stroke: palette.wallHoverStroke, selected: false }
  return { stroke: null, selected: false }
}

/** 2D plan: pier circles at springing ends + light span band. */
export function buildArchFloorplan(node: HsArchNode, ctx: GeometryContext): FloorplanGeometry {
  const [x, , z] = node.position ?? [0, 0, 0]
  const swatch = '#b8b2a6'
  const chrome = chromeOf(ctx)
  const stroke = chrome.stroke ?? swatch
  const half = node.span / 2
  const pierR = Math.max(0.15, node.thickness * 0.5)
  const rotY = node.rotation?.[1] ?? 0
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  const leftX = x - half * cos
  const leftZ = z + half * sin
  const rightX = x + half * cos
  const rightZ = z - half * sin

  const children: FloorplanGeometry[] = [
    {
      kind: 'circle',
      cx: leftX,
      cy: leftZ,
      r: pierR,
      stroke,
      strokeWidth: 0.03,
      fill: swatch,
      fillOpacity: 0.12,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: rightX,
      cy: rightZ,
      r: pierR,
      stroke,
      strokeWidth: 0.03,
      fill: swatch,
      fillOpacity: 0.12,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: Math.max(0.04, pierR * 0.35),
      fill: chrome.stroke ?? swatch,
      stroke,
      strokeWidth: 0.02,
      opacity: 0.9,
    },
  ]
  if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
  return { kind: 'group', children }
}
