import type { FloorplanGeometry, GeometryContext } from '@pascal-app/core'
import { COLUMN_SPECS } from './math/constants'
import type { HsColumnNode } from './schema'

type ViewChrome = { stroke: string | null; selected: boolean }

function chromeOf(ctx: GeometryContext): ViewChrome {
  const view = ctx.viewState
  const palette = view?.palette
  if ((view?.selected || view?.highlighted) && palette)
    return { stroke: palette.selectedStroke, selected: view?.selected ?? false }
  if (view?.hovered && palette) return { stroke: palette.wallHoverStroke, selected: false }
  return { stroke: null, selected: false }
}

/**
 * 2D plan symbol: dashed circle at shaft radius + solid center dot.
 * Mirrors plugin-trees floorplan contract (`FloorplanGeometry` group).
 */
export function buildColumnFloorplan(node: HsColumnNode, ctx: GeometryContext): FloorplanGeometry {
  const [x, , z] = node.position ?? [0, 0, 0]
  const swatch = COLUMN_SPECS[node.variant].color
  const chrome = chromeOf(ctx)
  const stroke = chrome.stroke ?? swatch
  const r = node.shaftRadius

  const children: FloorplanGeometry[] = [
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r,
      stroke,
      strokeWidth: 0.03,
      strokeDasharray: '0.12 0.08',
      fill: swatch,
      fillOpacity: 0.08,
      pointerEvents: 'stroke',
    },
    {
      kind: 'circle',
      cx: x,
      cy: z,
      r: Math.max(0.04, r * 0.2),
      fill: chrome.stroke ?? swatch,
      stroke,
      strokeWidth: 0.02,
      opacity: 0.95,
    },
  ]
  if (chrome.selected) children.push({ kind: 'move-handle', point: [x, z] })
  return { kind: 'group', children }
}
