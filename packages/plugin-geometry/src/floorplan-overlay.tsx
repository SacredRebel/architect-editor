'use client'

import type { FloorplanGeometry } from '@pascal-app/core'
import { FloorplanGeometryRenderer, useFloorplanRender } from '@pascal-app/editor'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { figureBounds } from './archimedean'
import { buildForm } from './build'
import {
  getGeometryState,
  setSelectedFigure,
  subscribeGeometry,
  updatePlacedFigure,
} from './store'

const STROKE = '#94a3b8'
const SELECTED = '#38bdf8'
const HANDLE = '#0ea5e9'

function useGeometry() {
  return useSyncExternalStore(subscribeGeometry, getGeometryState, getGeometryState)
}

function figureToGeometry(
  fig: ReturnType<typeof getGeometryState>['figures'][number],
  selected: boolean,
): FloorplanGeometry {
  const stroke = selected ? SELECTED : STROKE
  const children: FloorplanGeometry[] = []
  for (const poly of fig.figure.polylines) {
    if (poly.length < 2) continue
    children.push({
      kind: 'polyline',
      points: poly.map(([x, z]) => [x, z] as const),
      stroke,
      strokeWidth: selected ? 0.04 : 0.03,
      strokeOpacity: selected ? 0.95 : 0.7,
      fill: 'none',
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'stroke',
    })
  }
  for (const c of fig.figure.circles ?? []) {
    children.push({
      kind: 'circle',
      cx: c.c[0],
      cy: c.c[1],
      r: c.r,
      stroke,
      strokeWidth: selected ? 0.035 : 0.025,
      strokeOpacity: selected ? 0.9 : 0.65,
      strokeDasharray: '0.12 0.08',
      fill: 'none',
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'stroke',
    })
  }
  if (fig.solid) {
    for (const [ia, ib] of fig.solid.edges) {
      const a = fig.solid.vertices[ia]!
      const b = fig.solid.vertices[ib]!
      children.push({
        kind: 'line',
        x1: a[0] + fig.origin[0],
        y1: a[2] + fig.origin[1],
        x2: b[0] + fig.origin[0],
        y2: b[2] + fig.origin[1],
        stroke: selected ? SELECTED : '#64748b',
        strokeWidth: 0.025,
        strokeOpacity: 0.55,
        vectorEffect: 'non-scaling-stroke',
        pointerEvents: 'none',
      })
    }
  }
  return { kind: 'group', children }
}

/**
 * Thin construction lines in the 2D floor-plan SVG, plus a scale handle on the
 * selected unlocked figure (drag corner toward/away from origin).
 */
export default function GeometryFloorplanOverlay() {
  const { figures, selectedId } = useGeometry()
  const { unitsPerPixel } = useFloorplanRender()
  const drag = useRef<{
    id: string
    origin: [number, number]
    startSize: number
    startDist: number
  } | null>(null)

  const onScalePointerDown = useCallback(
    (id: string, event: React.PointerEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const fig = getGeometryState().figures.find((f) => f.id === id)
      if (!fig || fig.locked) return
      const bounds = figureBounds(fig.figure)
      if (!bounds) return
      const dist = Math.hypot(bounds.maxX - fig.origin[0], bounds.maxZ - fig.origin[1]) || fig.size
      drag.current = { id, origin: fig.origin, startSize: fig.size, startDist: dist }
      event.currentTarget.setPointerCapture(event.pointerId)
      setSelectedFigure(id)
    },
    [],
  )

  const onScalePointerMove = useCallback((event: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current
    if (!d) return
    const fig = getGeometryState().figures.find((f) => f.id === d.id)
    if (!fig || fig.locked) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const parent = event.currentTarget.parentElement as unknown as SVGGElement | null
    const parentCtm = parent?.getScreenCTM()
    if (!parentCtm) return
    const plan = pt.matrixTransform(parentCtm.inverse())
    const dist = Math.hypot(plan.x - d.origin[0], plan.y - d.origin[1])
    if (!(dist > 1e-6) || !(d.startDist > 1e-6)) return
    const nextSize = Math.max(0.05, d.startSize * (dist / d.startDist))
    const built = buildForm(fig.formId, {
      size: nextSize,
      origin: fig.origin,
      bearingDeg: fig.bearingDeg,
    })
    updatePlacedFigure(fig.id, {
      size: nextSize,
      figure: built.figure,
      solid: built.solid,
    })
  }, [])

  const onScalePointerUp = useCallback((event: React.PointerEvent<SVGCircleElement>) => {
    if (drag.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        /* already released */
      }
    }
    drag.current = null
  }, [])

  if (!figures.length) return null

  const handleR = Math.max(0.08, 6 * unitsPerPixel)

  return (
    <g data-geometry-floorplan-overlay="true" style={{ pointerEvents: 'auto' }}>
      {figures.map((fig) => {
        const selected = fig.id === selectedId
        const geom = figureToGeometry(fig, selected)
        const bounds = figureBounds(fig.figure)
        return (
          <g key={fig.id}>
            <g
              onClick={(e) => {
                e.stopPropagation()
                setSelectedFigure(fig.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              <FloorplanGeometryRenderer geometry={geom} />
            </g>
            {selected && !fig.locked && bounds && (
              <circle
                cx={bounds.maxX}
                cy={bounds.maxZ}
                r={handleR}
                fill={HANDLE}
                fillOpacity={0.95}
                stroke="#ffffff"
                strokeWidth={0.03}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: 'nwse-resize' }}
                onPointerDown={(e) => onScalePointerDown(fig.id, e)}
                onPointerMove={onScalePointerMove}
                onPointerUp={onScalePointerUp}
                onPointerCancel={onScalePointerUp}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
