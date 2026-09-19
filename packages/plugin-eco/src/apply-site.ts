import {
  commitTerrainField,
  createTerrainField,
  quantize,
  type SiteNode,
  useScene,
} from '@pascal-app/core'
import type { EcoSite } from './bridge-types'
import { siteToWorldXz } from './coords'
import { setEcoSite } from './eco-site-store'

const MAX_DIM = 257

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

  const scene = useScene.getState()
  const siteId = scene.rootNodeIds.find((id) => scene.nodes[id]?.type === 'site')
  if (!siteId) {
    console.warn('[eco] applyEcoSite: no site root in scene')
    setEcoSite(site)
    return
  }

  const maxX = ox + (cols - 1) * stepM
  const maxZ = oz + (rows - 1) * stepM
  const pad = stepM
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
}
