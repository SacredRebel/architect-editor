'use client'

import { Line } from '@react-three/drei'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ensureGeometryPlanSnapInstalled } from './snap'
import { getGeometryState, subscribeGeometry } from './store'

const LINE = '#94a3b8'
const SOLID = '#64748b'

function useGeometry() {
  return useSyncExternalStore(subscribeGeometry, getGeometryState, getGeometryState)
}

/**
 * Thin construction lines on the floor plane (+0.02 m) and faint solid wires in 3D.
 */
export default function GeometryPresentation() {
  const { figures } = useGeometry()

  useEffect(() => {
    ensureGeometryPlanSnapInstalled()
  }, [])

  const lines = useMemo(() => {
    const out: { key: string; points: [number, number, number][]; color: string }[] = []
    for (const fig of figures) {
      fig.figure.polylines.forEach((poly, i) => {
        if (poly.length < 2) return
        out.push({
          key: `${fig.id}-p${i}`,
          color: LINE,
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
        out.push({ key: `${fig.id}-c${c.c[0]}-${c.c[1]}`, color: LINE, points: pts })
      }
      if (fig.solid) {
        for (const [ia, ib] of fig.solid.edges) {
          const a = fig.solid.vertices[ia]!
          const b = fig.solid.vertices[ib]!
          out.push({
            key: `${fig.id}-e${ia}-${ib}`,
            color: SOLID,
            points: [
              [a[0] + fig.origin[0], a[1] + 0.05, a[2] + fig.origin[1]],
              [b[0] + fig.origin[0], b[1] + 0.05, b[2] + fig.origin[1]],
            ],
          })
        }
      }
    }
    return out
  }, [figures])

  if (!lines.length) return null
  return (
    <group name="geometry-kit">
      {lines.map((l) => (
        <Line
          key={l.key}
          points={l.points}
          color={l.color}
          lineWidth={1}
          transparent
          opacity={0.55}
          depthTest
        />
      ))}
    </group>
  )
}
