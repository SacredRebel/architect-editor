import type { FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import type { HsDomeNode } from './schema'

type ViewChrome = { stroke: string | null; selected: boolean }

function chromeOf(ctx: GeometryContext): ViewChrome {
  const view = ctx.viewState
  const palette = view?.palette
  if ((view?.selected || view?.highlighted) && palette)
    return { stroke: palette.selectedStroke, selected: view?.selected ?? false }
  if (view?.hovered && palette) return { stroke: palette.wallHoverStroke, selected: false }
  return { stroke: null, selected: false }
}

/** 2D plan: drum circle + lighter outer radius ring. */
export function buildDomeFloorplan(node: HsDomeNode, ctx: GeometryContext): FloorplanGeometry {
  const [x, , z] = node.position ?? [0, 0, 0]
  const swatch = '#b8b2a6'
  const chrome = chromeOf(ctx)
  const stroke = chrome.stroke ?? swatch

  const children: FloorplanGeometry[] = [
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: node.radius,
      stroke,
      strokeWidth: 0.04,
      strokeDasharray: '0.2 0.12',
      fill: swatch,
      fillOpacity: 0.06,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: node.drumRadius,
      stroke,
      strokeWidth: 0.03,
      fill: swatch,
      fillOpacity: 0.1,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: Math.max(0.06, node.radius * 0.04),
      fill: chrome.stroke ?? swatch,
      stroke,
      strokeWidth: 0.02,
      opacity: 0.95,
    },
  ]
  if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
  return { kind: 'group', children }
}
