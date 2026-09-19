import {
  commitTerrainField,
  createTerrainField,
  emitter,
  quantize,
  type SiteNode,
  type TerrainField,
  useScene,
} from '@pascal-app/core'
import type { EcoSite } from './bridge-types'
import { siteToWorldXz } from './coords'
import { setEcoSite } from './eco-site-store'

const MAX_DIM = 257

type BoundsXZ = {
  min: [number, number]
  max: [number, number]
  center: [number, number]
  size: [number, number]
}

/** Prefer massing-outline; else guide pts that fall on the terrain patch; else terrain extents. */
export function siteFrameBounds(site: EcoSite, terrainWorld: BoundsXZ): BoundsXZ {
  const massing = site.guides.find((g) => g.kind === 'massing-outline')
  const fromGuide = (pts: readonly (readonly [number, number])[]): BoundsXZ | null => {
    if (!pts.length) return null
    let minX = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const pt of pts) {
      const [x, z] = siteToWorldXz(pt)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    if (!Number.isFinite(minX)) return null
    return {
      min: [minX, minZ],
      max: [maxX, maxZ],
      center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
      size: [Math.max(maxX - minX, 0.1), Math.max(maxZ - minZ, 0.1)],
    }
  }

  if (massing?.pts?.length) {
    const b = fromGuide(massing.pts)
    if (b) return b
  }

  const onPatch: [number, number][] = []
  const [tMinX, tMinZ] = terrainWorld.min
  const [tMaxX, tMaxZ] = terrainWorld.max
  for (const guide of site.guides) {
    for (const pt of guide.pts) {
      const [x, z] = siteToWorldXz(pt)
      if (x >= tMinX && x <= tMaxX && z >= tMinZ && z <= tMaxZ) onPatch.push([pt[0], pt[1]])
    }
  }
  const fromPatch = fromGuide(onPatch)
  return fromPatch ?? terrainWorld
}

function emitSiteFrame(bounds: BoundsXZ): void {
  const fire = () => emitter.emit('camera-controls:fit-scene', { bounds })
  // Defer so CustomCameraControls has subscribed after the embed mounts.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(fire)
    })
  } else {
    fire()
  }
}

/**
 * Build a Pascal TerrainField from an EcoSite heightfield (heights relative to
 * originElevM). Pure — used by applyEcoSite and F0 round-trip checks.
 */
export function terrainFieldFromEcoSite(site: EcoSite): TerrainField {
  const { w, h, stepM, originOffsetM, heights } = site.terrain
  const cols = Math.min(Math.max(1, Math.floor(w)), MAX_DIM)
  const rows = Math.min(Math.max(1, Math.floor(h)), MAX_DIM)
  if (heights.length < cols * rows) {
    throw new Error(`eco:load-site terrain.heights length ${heights.length} < ${cols * rows}`)
  }

  const [ox, oz] = siteToWorldXz(originOffsetM)
  const field = createTerrainField({
    cols,
    rows,
    spacing: stepM,
    origin: [ox, oz],
    step: 0.01,
  })

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const asl = heights[r * w + c] ?? site.originElevM
      field.heights[r * cols + c] = quantize(field, asl - site.originElevM)
    }
  }
  return field
}

/**
 * Apply an EcoSite to the editor:
 * - heightfield → site.terrain (heights relative to originElevM so y≈0 at knoll)
 * - expand site polygon to cover the grid
 * - stash site in the eco store for guides/ghost/compass overlays
 *
 * Eco terrain is north-row-first in a z-north frame. After converting the
 * grid origin with siteToWorldXz, Pascal's +z (south) means Eco row 0 (north)
 * lands on Pascal row 0 when the origin is the NW corner — no row flip.
 */
export function applyEcoSite(site: EcoSite): void {
  const field = terrainFieldFromEcoSite(site)
  const { cols, rows, spacing, origin } = field
  const ox = origin[0]
  const oz = origin[1]

  const scene = useScene.getState()
  const siteId = scene.rootNodeIds.find((id) => scene.nodes[id]?.type === 'site')
  if (!siteId) {
    console.warn('[eco] applyEcoSite: no site root in scene')
    setEcoSite(site)
    const massing = site.guides.find((g) => g.kind === 'massing-outline')
    if (massing?.pts?.length) {
      emitSiteFrame(siteFrameBounds(site, { min: [0, 0], max: [1, 1], center: [0.5, 0.5], size: [1, 1] }))
    }
    return
  }

  const maxX = ox + (cols - 1) * spacing
  const maxZ = oz + (rows - 1) * spacing
  const pad = spacing
  const polygon = {
    type: 'polygon' as const,
    points: [
      [ox - pad, oz - pad],
      [maxX + pad, oz - pad],
      [maxX + pad, maxZ + pad],
      [ox - pad, maxZ + pad],
    ] as [number, number][],
  }

  scene.updateNode(siteId as SiteNode['id'], {
    terrain: commitTerrainField(field),
    polygon,
  })

  setEcoSite(site)

  const terrainBounds: BoundsXZ = {
    min: [ox, oz],
    max: [maxX, maxZ],
    center: [(ox + maxX) / 2, (oz + maxZ) / 2],
    size: [Math.max(maxX - ox, 0.1), Math.max(maxZ - oz, 0.1)],
  }
  emitSiteFrame(siteFrameBounds(site, terrainBounds))
}
