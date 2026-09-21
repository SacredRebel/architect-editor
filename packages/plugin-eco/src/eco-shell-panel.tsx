'use client'

import { useSyncExternalStore } from 'react'
import {
  addEcoShell,
  getEcoShellsState,
  getLeafShellParams,
  makeDefaultLeafShell,
  removeEcoShell,
  setLeafShellParams,
  subscribeEcoShells,
} from './eco-shell-store'

function useShells() {
  return useSyncExternalStore(subscribeEcoShells, getEcoShellsState, getEcoShellsState)
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ width: 88 }}>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
        style={{ flex: 1 }}
      />
      <span style={{ width: 40, textAlign: 'right' }}>{format(value)}</span>
    </label>
  )
}

/**
 * H10 — plain parametric leaf-shell controls (span / rise / curvature / spine).
 * Does not redesign Oak Leaf geometry — only drives existing leaf shell params.
 */
export default function EcoShellPanel() {
  const { shells } = useShells()
  const leafShells = shells.filter((s) => s.name === 'Leaf' || s.leafSpan != null)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Leaf shell (H10)</div>
      <button
        onClick={() => addEcoShell(makeDefaultLeafShell())}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Add leaf shell (26×13 demo)
      </button>
      {leafShells.length === 0 ? (
        <div style={{ opacity: 0.65 }}>No leaf shell yet — add one to edit live params.</div>
      ) : null}
      {leafShells.map((s) => {
        const p = getLeafShellParams(s)
        return (
          <div
            key={s.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              paddingTop: 6,
              borderTop: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
            }}
          >
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
              <button onClick={() => removeEcoShell(s.id)} type="button">
                Remove
              </button>
            </label>
            <SliderRow
              label="Leaf span"
              max={40}
              min={4}
              onChange={(leafSpan) => setLeafShellParams(s.id, { leafSpan })}
              step={0.25}
              value={p.leafSpan}
              format={(v) => `${v.toFixed(1)}m`}
            />
            <SliderRow
              label="Spine length"
              max={60}
              min={8}
              onChange={(spineLength) => setLeafShellParams(s.id, { spineLength })}
              step={0.25}
              value={p.spineLength}
              format={(v) => `${v.toFixed(1)}m`}
            />
            <SliderRow
              label="Shell rise"
              max={2.5}
              min={0.25}
              onChange={(rise) => setLeafShellParams(s.id, { rise })}
              step={0.05}
              value={p.rise}
            />
            <SliderRow
              label="Curvature"
              max={0.6}
              min={0}
              onChange={(curvature) => setLeafShellParams(s.id, { curvature })}
              step={0.01}
              value={p.curvature}
            />
          </div>
        )
      })}
      <div style={{ opacity: 0.65 }}>
        Sliders regenerate the leaf plan live. No Oak Leaf redesign — same ellipse family.
      </div>
    </div>
  )
}
