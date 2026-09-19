'use client'

import { Html } from '@react-three/drei'
import { useSyncExternalStore } from 'react'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/**
 * Small compass showing EcoSite.northDeg (0 = +z true north in Eco frame;
 * editor world +z is south, so the widget labels N toward -Z).
 */
export function EcoCompass() {
  const { site, showCompass } = useEcoSiteStore()
  if (!site || !showCompass) return null

  const deg = site.northDeg ?? 0

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }} zIndexRange={[40, 0]}>
      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 72,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(15,15,15,0.75)',
          color: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          transform: `rotate(${-deg}deg)`,
          pointerEvents: 'none',
        }}
      >
        <span style={{ position: 'absolute', top: 4 }}>N</span>
        <span
          style={{
            width: 2,
            height: 18,
            background: '#f87171',
            borderRadius: 1,
            transform: 'translateY(-4px)',
          }}
        />
      </div>
    </Html>
  )
}
