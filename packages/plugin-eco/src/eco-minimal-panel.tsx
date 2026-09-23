'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { tessellateMinimalPatch } from './eco-catenary'
import { minimalPatchAreaM2 } from './eco-organic-building-geometry'
import {
  addMinimalFromClosedCurve,
  getEcoOrganicBuildingState,
  subscribeEcoOrganicBuilding,
  undoEcoOrganicBuilding,
  updateMinimalRelaxation,
} from './eco-organic-building-store'
import { getEcoOrganicState, subscribeEcoOrganic } from './eco-organic-store'
import { formatArea } from './eco-true-size'

function useMinimal() {
  return useSyncExternalStore(subscribeEcoOrganic, getEcoOrganicState, getEcoOrganicState)
}

function useOrg() {
  return useSyncExternalStore(
    subscribeEcoOrganicBuilding,
    getEcoOrganicBuildingState,
    getEcoOrganicBuildingState,
  )
}

/**
 * H15.3 — minimal surface panel (boundary from selected closed curve).
 */
export default function EcoMinimalPanel() {
  const { minimal } = useMinimal()
  const org = useOrg()
  const [relax, setRelax] = useState(40)
  const [thick, setThick] = useState(0.08)
  const selected = minimal[0]

  const area = useMemo(() => {
    if (!selected) return 0
    const { positions, indices } = tessellateMinimalPatch(selected)
    return minimalPatchAreaM2(positions, indices)
  }, [selected])

  const closedCurve = useMemo(() => {
    const b = org.buildings[0]
    if (b?.wallControls?.length) return b.wallControls
    return null
  }, [org.buildings])

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Minimal surface (H15)</div>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Boundary comes from the selected organic wall (closed curve). Relaxation and thickness each
        take one undo step.
      </div>
      <button
        disabled={!closedCurve}
        onClick={() => {
          if (!closedCurve) return
          addMinimalFromClosedCurve({
            ring: closedCurve,
            heightM: 3.2,
            iterations: relax,
            thickness: thick,
          })
        }}
        style={{ padding: '6px 10px', cursor: closedCurve ? 'pointer' : 'not-allowed' }}
        type="button"
      >
        Make from closed curve
      </button>
      {!closedCurve && (
        <div style={{ opacity: 0.65 }}>Grow an organic building first (needs a closed wall).</div>
      )}

      {selected && (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 88 }}>Relaxation</span>
            <input
              max={120}
              min={1}
              onChange={(e) => {
                const v = Number(e.target.value)
                setRelax(v)
                updateMinimalRelaxation(selected.id, v, thick)
              }}
              step={1}
              type="range"
              value={relax}
              style={{ flex: 1 }}
            />
            <span style={{ width: 36, textAlign: 'right' }}>{relax}</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 88 }}>Thickness</span>
            <input
              max={0.4}
              min={0.02}
              onChange={(e) => {
                const v = Number(e.target.value)
                setThick(v)
                updateMinimalRelaxation(selected.id, relax, v)
              }}
              step={0.01}
              type="range"
              value={thick}
              style={{ flex: 1 }}
            />
            <span style={{ width: 48, textAlign: 'right' }}>{thick.toFixed(2)}m</span>
          </label>
          <div>Live area {formatArea(area, org.lengthOrder)}</div>
          <button onClick={() => undoEcoOrganicBuilding()} style={{ padding: '6px 10px' }} type="button">
            Undo
          </button>
        </>
      )}
    </div>
  )
}
