'use client'

import { useFloorplanRender } from '@pascal-app/editor'
import { useMemo, useSyncExternalStore } from 'react'
import { siteToWorldXz } from './coords'
import { siteContours, siteTreesInScene } from './eco-site-reference'
import { getEcoSiteState, subscribeEcoSite } from './eco-site-store'

function useEcoSiteStore() {
  return useSyncExternalStore(subscribeEcoSite, getEcoSiteState, getEcoSiteState)
}

/** The 3D guide palette, with the footprint darkened to read on the plan. */
const GUIDE_COLORS: Record<string, string> = {
  boundary: '#d4a017',
  easement: '#f59e0b',
  footprint: '#94a3b8',
  'massing-outline': '#8b5cf6',
  road: '#9ca3af',
}

const toPoints = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([x, z]) => `${x},${z}`).join(' ')

/**
 * A5 — the site as reference in the plan (Editor `floorplanSceneSlot`): the
 * contours of the surveyed ground (1 m, every 5th bold and labelled), the
 * survey line and the other guides, and the standing trees' canopies. Plan
 * units are metres with plan y = scene z, so north is up. Nothing here takes
 * a pointer: tools drawing in the plan reach the plan.
 */
export default function EcoFloorplanOverlay() {
  const { site, guideVisibility, showSiteTrees, showContours } = useEcoSiteStore()
  const floorplan = useFloorplanRender()
  const contours = useMemo(() => (site ? siteContours(site, 1, 5) : []), [site])
  const trees = useMemo(() => siteTreesInScene(site), [site])

  if (!site || !floorplan) return null
  const labelSize = Math.max(0.2, 10 * floorplan.unitsPerPixel)

  return (
    <g data-eco-plan="site" style={{ pointerEvents: 'none' }}>
      {showContours && (
        <g data-eco-plan="contours">
          {contours.map((line, i) => (
            <polyline
              data-level={line.levelAsl}
              fill="none"
              key={`c${i}`}
              points={toPoints(line.points)}
              stroke={line.major ? '#8b6f47' : '#a8916f'}
              strokeOpacity={line.major ? 0.8 : 0.45}
              strokeWidth={line.major ? 1.25 : 0.6}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {contours
            .filter((line) => line.major && line.points.length > 4)
            .map((line, i) => {
              const [x, z] = line.points[Math.floor(line.points.length / 2)]!
              return (
                <text
                  data-level-label={line.levelAsl}
                  fill="#8b6f47"
                  fontSize={labelSize}
                  key={`l${i}`}
                  textAnchor="middle"
                  x={x}
                  y={z}
                >
                  {line.levelAsl.toFixed(0)}
                </text>
              )
            })}
        </g>
      )}
      <g data-eco-plan="guides">
        {site.guides.map((guide, i) =>
          guideVisibility[`${guide.kind}:${i}`] === false ? null : (
            <polyline
              data-kind={guide.kind}
              data-name={guide.name ?? ''}
              fill="none"
              key={`g${i}`}
              points={toPoints(guide.pts.map((pt) => siteToWorldXz(pt)))}
              stroke={GUIDE_COLORS[guide.kind] ?? '#9ca3af'}
              strokeDasharray={guide.kind === 'easement' ? '6 4' : undefined}
              strokeWidth={guide.kind === 'boundary' ? 2 : 1.25}
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </g>
      {showSiteTrees && trees.length > 0 && (
        <g data-eco-plan="trees">
          {trees.map((tree, i) => (
            <g key={`t${i}`}>
              <circle
                cx={tree.x}
                cy={tree.z}
                data-canopy={tree.canopyM}
                data-height={tree.heightM}
                fill="#7f9670"
                fillOpacity={0.18}
                r={tree.canopyM / 2}
                stroke="#5f7552"
                strokeOpacity={0.7}
                strokeWidth={0.75}
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={tree.x} cy={tree.z} fill="#5f7552" r={0.15} />
            </g>
          ))}
        </g>
      )}
    </g>
  )
}
