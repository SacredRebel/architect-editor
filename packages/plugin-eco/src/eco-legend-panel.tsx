'use client'

import { useSyncExternalStore } from 'react'
import {
  getEcoSiteState,
  setGuideVisible,
  setShowCompass,
  setShowGhost,
  subscribeEcoSite,
} from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/**
 * Legend + visibility toggles for Eco site overlays.
 */
export default function EcoLegendPanel() {
  const { site, guideVisibility, showGhost, showCompass } = useEcoSiteStore()

  if (!site) {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
        No Eco site loaded yet. Waiting for <code>eco:load-site</code>.
      </div>
    )
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
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
    </div>
  )
}
