'use client'

import { useState, useSyncExternalStore } from 'react'
import { isEcoBridgeReady, requestEcoGlbExport } from './bridge'
import {
  getEcoExportState,
  subscribeEcoExport,
} from './eco-export-store'
import {
  ECO_CURVE_WALK_TOLERANCE_M,
  ECO_WALL_SAMPLE_STEP_M,
} from './eco-curve-tolerance'
import {
  addEcoCatenary,
  addEcoLoft,
  addEcoVault,
  getEcoOrganicState,
  makeDefaultBarrelVault,
  makeDefaultCatenary,
  makeDefaultLeafLoft,
  removeEcoCatenary,
  removeEcoLoft,
  removeEcoVault,
  subscribeEcoOrganic,
  updateEcoVault,
} from './eco-organic-store'
import {
  addEcoShell,
  getEcoShellsState,
  makeDefaultLeafShell,
  removeEcoShell,
  setShellRise,
  subscribeEcoShells,
} from './eco-shell-store'
import {
  getEcoPresentationState,
  setEcoPresentation,
  setEcoTimeOfDayHours,
  subscribeEcoPresentation,
  toggleEcoPresentation,
} from './eco-presentation-store'
import {
  getEcoSiteState,
  setGuideVisible,
  setShowCompass,
  setShowGhost,
  subscribeEcoSite,
} from './eco-site-store'
import { getEcoWalkState, setWalkEnabled, subscribeEcoWalk } from './eco-walk-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

function useWalkStore() {
  return useSyncExternalStore(subscribeEcoWalk, getEcoWalkState, getEcoWalkState)
}

function useShells() {
  return useSyncExternalStore(subscribeEcoShells, getEcoShellsState, getEcoShellsState)
}

function useOrganic() {
  return useSyncExternalStore(subscribeEcoOrganic, getEcoOrganicState, getEcoOrganicState)
}

function usePresentation() {
  return useSyncExternalStore(
    subscribeEcoPresentation,
    getEcoPresentationState,
    getEcoPresentationState,
  )
}

function useEcoExport() {
  return useSyncExternalStore(subscribeEcoExport, getEcoExportState, getEcoExportState)
}

/**
 * Legend + visibility toggles for Eco site overlays, Walk, and world export.
 */
export default function EcoLegendPanel() {
  const { site, guideVisibility, showGhost, showCompass } = useEcoSiteStore()
  const { enabled: walkEnabled, firstPerson } = useWalkStore()
  const { shells } = useShells()
  const organic = useOrganic()
  const { presentation, timeOfDayHours } = usePresentation()
  const exportUi = useEcoExport()
  const [exporting, setExporting] = useState(false)

  const onExport = () => {
    setExporting(true)
    try {
      requestEcoGlbExport()
    } finally {
      setTimeout(() => setExporting(false), 800)
    }
  }

  const busy = exporting || exportUi.status === 'exporting'

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Presentation (H12)</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          checked={presentation}
          onChange={(e) => setEcoPresentation(e.target.checked)}
          type="checkbox"
        />
        Presentation view — site sun, hide chrome, frame camera
      </label>
      <button
        onClick={() => toggleEcoPresentation()}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        {presentation ? 'Exit presentation' : 'One-click presentation'}
      </button>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        Time of day
        <input
          max={24}
          min={0}
          onChange={(e) => setEcoTimeOfDayHours(Number(e.target.value))}
          step={0.25}
          type="range"
          value={timeOfDayHours}
        />
        <span style={{ width: 36, textAlign: 'right' }}>{timeOfDayHours.toFixed(1)}h</span>
      </label>

      <div style={{ fontWeight: 600 }}>Walk</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          checked={walkEnabled}
          onChange={(e) => setWalkEnabled(e.target.checked)}
          type="checkbox"
        />
        Walk mode (WASD · Shift run · Space jump · C {firstPerson ? 'first' : 'third'}-person)
      </label>

      <div style={{ fontWeight: 600 }}>Shell roofs</div>
      <button
        onClick={() => addEcoShell(makeDefaultLeafShell())}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Add leaf shell (26×13 demo)
      </button>
      {shells.map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{s.name}</span>
            <button onClick={() => removeEcoShell(s.id)} type="button">
              Remove
            </button>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Rise
            <input
              max={2.5}
              min={0.25}
              onChange={(e) => setShellRise(s.id, Number(e.target.value))}
              step={0.05}
              type="range"
              value={s.rise ?? 1}
            />
            <span style={{ width: 36, textAlign: 'right' }}>{(s.rise ?? 1).toFixed(2)}</span>
          </label>
        </div>
      ))}
      <div style={{ opacity: 0.65 }}>Shells export in the GLB only — no walk solids.</div>

      <div style={{ fontWeight: 600 }}>Organic (H10)</div>
      <button
        onClick={() => addEcoLoft(makeDefaultLeafLoft())}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Add lofted leaf surface
      </button>
      {organic.lofts.map((l) => (
        <label key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{l.name}</span>
          <button onClick={() => removeEcoLoft(l.id)} type="button">
            Remove
          </button>
        </label>
      ))}
      <button
        onClick={() => addEcoVault(makeDefaultBarrelVault())}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Add barrel vault + ribs
      </button>
      {organic.vaults.map((v) => (
        <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{v.name}</span>
            <button onClick={() => removeEcoVault(v.id)} type="button">
              Remove
            </button>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Rise
            <input
              max={8}
              min={0.5}
              onChange={(e) => updateEcoVault(v.id, { rise: Number(e.target.value) })}
              step={0.1}
              type="range"
              value={v.rise}
            />
            <span style={{ width: 36, textAlign: 'right' }}>{v.rise.toFixed(1)}</span>
          </label>
        </div>
      ))}
      <button
        onClick={() => addEcoCatenary(makeDefaultCatenary())}
        style={{ padding: '6px 10px', cursor: 'pointer', textAlign: 'left' }}
        type="button"
      >
        Add catenary arch
      </button>
      {organic.catenaries.map((c) => (
        <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{c.name}</span>
          <button onClick={() => removeEcoCatenary(c.id)} type="button">
            Remove
          </button>
        </label>
      ))}

      <div style={{ fontWeight: 600 }}>Export</div>
      <button
        disabled={busy}
        onClick={onExport}
        style={{
          padding: '6px 10px',
          cursor: busy ? 'wait' : 'pointer',
          textAlign: 'left',
        }}
        type="button"
      >
        {busy
          ? 'Exporting…'
          : isEcoBridgeReady()
            ? 'Send to world (eco:glb)'
            : 'Download GLB + walk.json'}
      </button>
      {exportUi.sizeLabel ? (
        <div style={{ fontFamily: 'ui-monospace, monospace', opacity: 0.9 }}>
          {exportUi.sizeLabel}
        </div>
      ) : null}
      {exportUi.status === 'error' && exportUi.error ? (
        <div style={{ color: '#b42318', lineHeight: 1.35 }}>{exportUi.error}</div>
      ) : null}

      {!site ? (
        <div style={{ opacity: 0.7 }}>
          No Eco site loaded yet. Waiting for <code>eco:load-site</code>.
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 600 }}>Snap</div>
          <div style={{ opacity: 0.75, lineHeight: 1.35 }}>
            With the ghost on, wall/slab drafting snaps to the massing outline (and GLB silhouette).
            Hold <kbd>Alt</kbd> to suspend. Curved walls use the sagitta handle /
            <code>curveOffset</code>; walk rings are polylines with chord error ≤{' '}
            {ECO_CURVE_WALK_TOLERANCE_M * 100}&nbsp;cm (max step {ECO_WALL_SAMPLE_STEP_M}&nbsp;m).
          </div>

          <div style={{ fontWeight: 600 }}>Site overlays</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              checked={showGhost}
              disabled={!site.refGlb}
              onChange={(e) => setShowGhost(e.target.checked)}
              type="checkbox"
            />
            Reference ghost {site.refGlb ? '' : '(none)'}
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              checked={showCompass}
              onChange={(e) => setShowCompass(e.target.checked)}
              type="checkbox"
            />
            Compass (northDeg={site.northDeg ?? 0})
          </label>
          <div style={{ fontWeight: 600, marginTop: 4 }}>Guides</div>
          {site.guides.map((guide, i) => {
            const key = `${guide.kind}:${i}`
            return (
              <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  checked={guideVisibility[key] !== false}
                  onChange={(e) => setGuideVisible(key, e.target.checked)}
                  type="checkbox"
                />
                {guide.name ?? guide.kind}
                <span style={{ opacity: 0.55 }}>({guide.kind})</span>
              </label>
            )
          })}
        </>
      )}
    </div>
  )
}
