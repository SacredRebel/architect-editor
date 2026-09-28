'use client'

import { useEditor } from '@pascal-app/editor'
import { useEffect, useSyncExternalStore } from 'react'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/**
 * A5 — on a real site, a wall drawn on the ground stands on the slope. Upstream
 * gives a ground wall one flat base (the ground under its first point) and
 * offers `fillToTerrain` to carry it down to the ground wherever the ground
 * falls away. While an EcoSite is loaded, every new wall is created with it:
 * `toolDefaults.wall` is spread into each wall the 3D tool or the plan draws,
 * in the same history step. The wall tool clears its defaults when it closes,
 * so the flag is put back whenever they change. Walls not on the ground are
 * unaffected (`terrainSupportLift` is null off the site datum).
 */
export function EcoSiteWallDefaults() {
  const { site } = useEcoSiteStore()
  const hasTerrain = Boolean(site?.terrain?.heights?.length)

  useEffect(() => {
    if (!hasTerrain) return
    const ensure = () => {
      const editor = useEditor.getState()
      const current = editor.toolDefaults.wall
      if (current?.fillToTerrain === true) return
      editor.setToolDefaults('wall', { ...(current ?? {}), fillToTerrain: true })
    }
    ensure()
    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.toolDefaults.wall !== prev.toolDefaults.wall) ensure()
    })
    return () => {
      unsubscribe()
      const editor = useEditor.getState()
      const current = editor.toolDefaults.wall
      if (current?.fillToTerrain !== true) return
      const { fillToTerrain: _drop, ...rest } = current
      editor.setToolDefaults('wall', Object.keys(rest).length ? rest : null)
    }
  }, [hasTerrain])

  return null
}
