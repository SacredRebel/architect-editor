'use client'

import { heightAt, terrainFieldOf, useScene } from '@pascal-app/core'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/webgpu/Line2.js'
import { Line2NodeMaterial } from 'three/webgpu'
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
 * One guide polyline as a WebGPU fat line. drei's <Line> uses the WebGL-only
 * LineMaterial, which the node builder rejects: with a site loaded the
 * post-processing pipeline failed and rebuilt every frame (H19.2, profile of the
 * H19 scene). Line2NodeMaterial is the same screen-space line for WebGPU.
 */
function GuideLine({
  points,
  color,
  dashed,
}: {
  points: [number, number, number][]
  color: string
  dashed: boolean
}) {
  const line = useMemo(() => {
    const geometry = new LineGeometry()
    geometry.setPositions(points.flat())
    const material = new Line2NodeMaterial({
      color,
      linewidth: 1.5,
      dashed,
      // drei's dashScale / dashSize / gapSize.
      scale: dashed ? 8 : 1,
      dashSize: 0.4,
      gapSize: 0.25,
      depthTest: true,
    })
    const guide = new Line2(geometry, material)
    if (dashed) guide.computeLineDistances()
    return guide
  }, [points, color, dashed])

  useEffect(
    () => () => {
      line.geometry.dispose()
      ;(line.material as Line2NodeMaterial).dispose()
    },
    [line],
  )

  return <primitive object={line} />
}

/**
 * Guide polylines projected onto the site terrain (+0.05 m).
 * Easements are dashed.
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
          <GuideLine key={seg.key} points={seg.points} color={seg.color} dashed={seg.dashed} />
        ) : null,
      )}
    </group>
  )
}
