'use client'

import { useScene } from '@pascal-app/core'
import { useMemo, useState } from 'react'
import {
  boundsFromNodes,
  type DrawingKind,
  downloadCanvasPng,
  layoutOrthoDrawing,
  paintOrthoDrawing,
  planStrokesFromNodes,
} from './eco-drawings'

const SCALES = [50, 100, 200] as const
const DPIS = [150, 300] as const

const KINDS: { id: DrawingKind; label: string }[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'section', label: 'Section' },
  { id: 'elevation-n', label: 'Elevation N' },
  { id: 'elevation-s', label: 'Elevation S' },
  { id: 'elevation-e', label: 'Elevation E' },
  { id: 'elevation-w', label: 'Elevation W' },
]

/**
 * Orthographic drawing export — measured PNG at a true paper scale.
 */
export default function EcoDrawingsPanel() {
  const nodes = useScene((s) => s.nodes)
  const [scale, setScale] = useState<(typeof SCALES)[number]>(100)
  const [dpi, setDpi] = useState<(typeof DPIS)[number]>(150)
  const [kind, setKind] = useState<DrawingKind>('plan')
  const [section, setSection] = useState({ x0: 0, z0: 0, x1: 10, z1: 0 })

  const bounds = useMemo(() => boundsFromNodes(nodes as never), [nodes])
  const strokes = useMemo(() => planStrokesFromNodes(nodes as never), [nodes])
  const layout = useMemo(
    () => layoutOrthoDrawing({ kind, bounds, scale, dpi }),
    [kind, bounds, scale, dpi],
  )

  const onExport = () => {
    const canvas = document.createElement('canvas')
    canvas.width = layout.widthPx
    canvas.height = layout.heightPx
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintOrthoDrawing(ctx, {
      layout,
      bounds,
      strokes,
      levelName: 'Level',
      sectionLine: kind === 'section' ? section : undefined,
    })
    downloadCanvasPng(canvas, `eco-${kind}-1-${scale}-${dpi}dpi.png`)
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Drawings</div>
      <div style={{ opacity: 0.65 }}>
        Orthographic PNG at true scale. Plan at 1:100 of a 20 m building → 20 cm on paper (±1 mm).
      </div>

      <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        View
        <select
          onChange={(e) => setKind(e.target.value as DrawingKind)}
          style={{ fontSize: 12 }}
          value={kind}
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        Scale
        <select
          onChange={(e) => setScale(Number(e.target.value) as (typeof SCALES)[number])}
          style={{ fontSize: 12 }}
          value={scale}
        >
          {SCALES.map((s) => (
            <option key={s} value={s}>
              1:{s}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        DPI
        <select
          onChange={(e) => setDpi(Number(e.target.value) as (typeof DPIS)[number])}
          style={{ fontSize: 12 }}
          value={dpi}
        >
          {DPIS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {kind === 'section' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontWeight: 600 }}>Section line (plan m)</div>
          {(['x0', 'z0', 'x1', 'z1'] as const).map((k) => (
            <label key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              {k}
              <input
                onChange={(e) => setSection({ ...section, [k]: Number(e.target.value) })}
                style={{ width: 80 }}
                type="number"
                value={section[k]}
              />
            </label>
          ))}
        </div>
      )}

      <div style={{ opacity: 0.7 }}>
        Content {layout.longSideWorldM.toFixed(2)} m → {layout.longSidePaperCm.toFixed(2)} cm paper ·{' '}
        {layout.widthPx}×{layout.heightPx} px
      </div>

      <button
        onClick={onExport}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Download PNG
      </button>
    </div>
  )
}
