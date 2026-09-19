'use client'

import { heightAt, terrainFieldOf, useScene } from '@pascal-app/core'
import { Line } from '@react-three/drei'
import { useMemo, useSyncExternalStore } from 'react'
import { siteToWorldXz } from './coords'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

const GUIDE_COLORS: Record<string, string> = {
  boundary: '#d4a017',
  easement: '#f59e0b',
  footprint: '#f8fafc',
  'massing-outline': '#8b5cf6',
  road: '#9ca3af',
}

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/**
 * Guide polylines projected onto the site terrain (+0.05 m).
 * Dashed style for easements via Line dashed props.
 */
export function EcoGuides() {
  const { site, guideVisibility } = useEcoSiteStore()
  const siteNode = useScene((s) => {
    const id = s.rootNodeIds.find((rid) => s.nodes[rid]?.type === 'site')
    return id ? s.nodes[id] : null
  })

  const field = useMemo(() => {
    if (siteNode?.type !== 'site') return null
    return terrainFieldOf({ id: siteNode.id, terrain: siteNode.terrain })
  }, [siteNode])

  const segments = useMemo(() => {
    if (!site) return []
    return site.guides
      .map((guide, i) => {
        const key = `${guide.kind}:${i}`
        if (guideVisibility[key] === false) return null
        const points = guide.pts.map(([x, zNorth]) => {
          const [wx, wz] = siteToWorldXz([x, zNorth])
          const y = (field ? heightAt(field, wx, wz) : 0) + 0.05
          return [wx, y, wz] as [number, number, number]
        })
        return {
          key,
          kind: guide.kind,
          color: GUIDE_COLORS[guide.kind] ?? '#ffffff',
          dashed: guide.kind === 'easement',
          points,
        }
      })
      .filter(Boolean)
  }, [site, guideVisibility, field])

  if (!segments.length) return null

  return (
    <group name="eco-guides">
      {segments.map((seg) =>
        seg ? (
          <Line
            key={seg.key}
            points={seg.points}
            color={seg.color}
            lineWidth={1.5}
            dashed={seg.dashed}
            dashScale={seg.dashed ? 8 : undefined}
            dashSize={seg.dashed ? 0.4 : undefined}
            gapSize={seg.dashed ? 0.25 : undefined}
            depthTest
          />
        ) : null,
      )}
    </group>
  )
}
