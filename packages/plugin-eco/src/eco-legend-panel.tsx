'use client'

import { useState, useSyncExternalStore } from 'react'
import { isEcoBridgeReady, requestEcoGlbExport } from './bridge'
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

/**
 * Legend + visibility toggles for Eco site overlays, Walk, and world export.
 */
export default function EcoLegendPanel() {
  const { site, guideVisibility, showGhost, showCompass } = useEcoSiteStore()
  const { enabled: walkEnabled, firstPerson } = useWalkStore()
  const [exporting, setExporting] = useState(false)

  const onExport = () => {
    setExporting(true)
    try {
      requestEcoGlbExport()
    } finally {
      setTimeout(() => setExporting(false), 800)
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Walk</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          checked={walkEnabled}
          onChange={(e) => setWalkEnabled(e.target.checked)}
          type="checkbox"
        />
        Walk mode (WASD · Shift run · Space jump · C {firstPerson ? 'first' : 'third'}-person)
      </label>

      <div style={{ fontWeight: 600 }}>Export</div>
      <button
        disabled={exporting}
        onClick={onExport}
        style={{
          padding: '6px 10px',
          cursor: exporting ? 'wait' : 'pointer',
          textAlign: 'left',
        }}
        type="button"
      >
        {exporting
          ? 'Exporting…'
          : isEcoBridgeReady()
            ? 'Send to world (eco:glb)'
            : 'Download GLB + walk.json'}
      </button>

      {!site ? (
        <div style={{ opacity: 0.7 }}>
          No Eco site loaded yet. Waiting for <code>eco:load-site</code>.
        </div>
      ) : (
        <>
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
