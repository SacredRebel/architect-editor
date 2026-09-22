'use client'

import { Line } from '@react-three/drei'
import { type ThreeEvent, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { figureBounds } from './archimedean'
import { buildForm } from './build'
import { ensureGeometryPlanSnapInstalled } from './snap'
import {
  getGeometryState,
  setSelectedFigure,
  subscribeGeometry,
  updatePlacedFigure,
} from './store'

const LINE = '#94a3b8'
const SOLID = '#64748b'
const HANDLE = '#0ea5e9'

function useGeometry() {
  return useSyncExternalStore(subscribeGeometry, getGeometryState, getGeometryState)
}

function ScaleHandle3D({
  figId,
  position,
  locked,
}: {
  figId: string
  position: [number, number, number]
  locked: boolean
}) {
  const drag = useRef<{
    startSize: number
    startDist: number
    origin: [number, number]
  } | null>(null)
  const { gl } = useThree()

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (locked) return
      e.stopPropagation()
      const fig = getGeometryState().figures.find((f) => f.id === figId)
      if (!fig) return
      setSelectedFigure(figId)
      const dist =
        Math.hypot(position[0] - fig.origin[0], position[2] - fig.origin[1]) || fig.size
      drag.current = { startSize: fig.size, startDist: dist, origin: fig.origin }
      gl.domElement.setPointerCapture(e.pointerId)
    },
    [figId, gl.domElement, locked, position],
  )

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current
      if (!d) return
      e.stopPropagation()
      const fig = getGeometryState().figures.find((f) => f.id === figId)
      if (!fig || fig.locked) return
      const hit = e.point
      const dist = Math.hypot(hit.x - d.origin[0], hit.z - d.origin[1])
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
    },
    [figId],
  )

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return
      e.stopPropagation()
      drag.current = null
      try {
        gl.domElement.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    },
    [gl.domElement],
  )

  return (
    <mesh
      position={position}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshBasicMaterial color={HANDLE} transparent opacity={0.9} depthTest={false} />
    </mesh>
  )
}

/**
 * Thin construction lines on the floor plane (+0.02 m) and faint solid wires in 3D.
 * Selected figures get a plan-corner scale handle.
 */
export default function GeometryPresentation() {
  const { figures, selectedId } = useGeometry()

  useEffect(() => {
    ensureGeometryPlanSnapInstalled()
  }, [])

  const lines = useMemo(() => {
    const out: {
      key: string
      points: [number, number, number][]
      color: string
      selected: boolean
    }[] = []
    for (const fig of figures) {
      const selected = fig.id === selectedId
      const color = selected ? '#38bdf8' : LINE
      fig.figure.polylines.forEach((poly, i) => {
        if (poly.length < 2) return
        out.push({
          key: `${fig.id}-p${i}`,
          color,
          selected,
          points: poly.map(([x, z]) => [x, 0.02, z] as [number, number, number]),
        })
      })
      for (const c of fig.figure.circles ?? []) {
        const pts: [number, number, number][] = []
        const n = 48
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2
          pts.push([c.c[0] + c.r * Math.cos(a), 0.02, c.c[1] + c.r * Math.sin(a)])
        }
        out.push({ key: `${fig.id}-c${c.c[0]}-${c.c[1]}`, color, selected, points: pts })
      }
      if (fig.solid) {
        for (const [ia, ib] of fig.solid.edges) {
          const a = fig.solid.vertices[ia]!
          const b = fig.solid.vertices[ib]!
          out.push({
            key: `${fig.id}-e${ia}-${ib}`,
            color: selected ? '#38bdf8' : SOLID,
            selected,
            points: [
              [a[0] + fig.origin[0], a[1] + 0.05, a[2] + fig.origin[1]],
              [b[0] + fig.origin[0], b[1] + 0.05, b[2] + fig.origin[1]],
            ],
          })
        }
      }
    }
    return out
  }, [figures, selectedId])

  const selectedFig = figures.find((f) => f.id === selectedId)
  const handlePos = useMemo((): [number, number, number] | null => {
    if (!selectedFig || selectedFig.locked) return null
    const b = figureBounds(selectedFig.figure)
    if (!b) return null
    return [b.maxX, 0.08, b.maxZ]
  }, [selectedFig])

  if (!lines.length) return null
  return (
    <group name="geometry-kit">
      {lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          color={l.color}
          lineWidth={l.selected ? 1.5 : 1}
          transparent
          opacity={l.selected ? 0.75 : 0.55}
          depthTest
          onClick={(e) => {
            e.stopPropagation()
            const id = l.key.split('-')[0]
            if (id) setSelectedFigure(id)
          }}
        />
      ))}
      {selectedFig && handlePos && (
        <ScaleHandle3D figId={selectedFig.id} position={handlePos} locked={selectedFig.locked} />
      )}
    </group>
  )
}
