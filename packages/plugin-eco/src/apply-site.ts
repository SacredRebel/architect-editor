import {
  type AnyNode,
  BuildingNode,
  commitTerrainField,
  createTerrainField,
  emitter,
  pauseSceneHistory,
  quantize,
  resumeSceneHistory,
  SiteNode,
  type TerrainField,
  useScene,
} from '@pascal-app/core'
import type { EcoSite } from './bridge-types'
import { siteToWorldXz } from './coords'
import { ecoDebug } from './eco-debug'
import { setEcoTimeOfDayHours } from './eco-presentation-store'
import { setEcoSite } from './eco-site-store'
import { ECO_DEFAULT_TZ, localHoursAt, parseSunAt } from './eco-site-sun'

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
 * The site the editor was last given, and the scene its ground was last
 * written into. Kept so the ground survives that scene being replaced: the
 * editor's own first load can land after the host's load-site, and a host
 * scene can follow it (or carry no site at all).
 */
let given: {
  site: EcoSite
  field: TerrainField
  rootNodeIds: readonly string[] | null
  siteId: string | null
  hydrationId: object | null
} | null = null
let placing = false
let watching = false
let recheckQueued = false

/** How a given site's ground landed: on load-site or on a scene that replaced the last. */
export type EcoSiteLanding = {
  via: 'load-site' | 'new-scene'
  /** Whether the scene had a site root when the ground came. */
  hadSiteRoot: boolean
  /** What was made for it: the editor's default site → building → level, or a site adopting root buildings. */
  made: 'default' | 'adopted' | null
}
const landings: EcoSiteLanding[] = []

/** Every landing so far, oldest first — read-only, for checks (window.ecoSiteLandings). */
export function ecoSiteLandings(): EcoSiteLanding[] {
  return landings.map((landing) => ({ ...landing }))
}

type SceneStateNow = ReturnType<typeof useScene.getState>

function siteRootOf(scene: SceneStateNow): string | null {
  return scene.rootNodeIds.find((id) => scene.nodes[id]?.type === 'site') ?? null
}
/**
 * Apply an EcoSite to the editor:
 * - heightfield → site.terrain (heights relative to originElevM so y≈0 at knoll)
 * - expand site polygon to cover the grid
 * - stash site in the eco store for guides/ghost/compass overlays
 *
 * A scene without a site root gets one first (ensureSiteRoot), and the ground
 * goes back onto every scene that replaces this one (keepGroundOnNewScenes).
 * The ground is the host's, not an edit: it is written outside undo history.
 *
 * Eco terrain is north-row-first in a z-north frame. After converting the
 * grid origin with siteToWorldXz, Pascal's +z (south) means Eco row 0 (north)
 * lands on Pascal row 0 when the origin is the NW corner — no row flip.
 */
export function applyEcoSite(site: EcoSite): void {
  const field = terrainFieldFromEcoSite(site)

  // A5: the world's sun. The time slider starts at the sent instant's local
  // time, and the lighting uses that exact instant until the slider moves.
  const sunAt = parseSunAt(site.sunAt)
  if (sunAt) setEcoTimeOfDayHours(localHoursAt(sunAt, ECO_DEFAULT_TZ))

  setEcoSite(site)
  given = { site, field, rootNodeIds: null, siteId: null, hydrationId: null }
  placeGround('load-site')
  keepGroundOnNewScenes()
}

/** Write the given site's ground (terrain + a polygon covering it) onto the scene's site root. */
function placeGround(via: EcoSiteLanding['via']): void {
  if (!given) return
  const { site, field } = given
  const { cols, rows, spacing, origin } = field
  const ox = origin[0]
  const oz = origin[1]
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

  let siteId: string
  placing = true
  pauseSceneHistory(useScene)
  try {
    const hadSiteRoot = siteRootOf(useScene.getState()) !== null
    const root = ensureSiteRoot()
    siteId = root.id
    landings.push({ via, hadSiteRoot, made: root.made })
    useScene.getState().updateNode(siteId as SiteNode['id'], {
      terrain: commitTerrainField(field),
      polygon,
    })
  } finally {
    resumeSceneHistory(useScene)
    placing = false
  }
  const scene = useScene.getState()
  given.rootNodeIds = scene.rootNodeIds
  given.siteId = siteId
  given.hydrationId = scene.hydrationId

  const terrainBounds: BoundsXZ = {
    min: [ox, oz],
    max: [maxX, maxZ],
    center: [(ox + maxX) / 2, (oz + maxZ) / 2],
    size: [Math.max(maxX - ox, 0.1), Math.max(maxZ - oz, 0.1)],
  }
  emitSiteFrame(siteFrameBounds(site, terrainBounds))
}

/**
 * The scene's site root, made when it has none. An empty scene (nothing loaded
 * yet) gets the editor's own default, site → building → level. A scene whose
 * roots are buildings, or bare levels, gets a site that adopts them (levels
 * through a new building); any other root stays a root.
 */
function ensureSiteRoot(): { id: string; made: EcoSiteLanding['made'] } {
  const scene = useScene.getState()
  const existing = siteRootOf(scene)
  if (existing) return { id: existing, made: null }

  if (scene.rootNodeIds.length === 0) {
    scene.loadScene()
    const made = siteRootOf(useScene.getState())
    if (made) {
      ecoDebug('load-site: the scene was empty — made the default site, building and level')
      return { id: made, made: 'default' }
    }
  }

  const nodes = { ...scene.nodes } as Record<string, AnyNode>
  const roots = [...scene.rootNodeIds] as string[]
  const buildings = roots.filter((id) => nodes[id]?.type === 'building')
  const levels = roots.filter((id) => nodes[id]?.type === 'level')
  const site = SiteNode.parse({})
  const children = [...buildings]
  for (const id of buildings) nodes[id] = { ...nodes[id], parentId: site.id } as AnyNode
  if (levels.length) {
    const building = BuildingNode.parse({ parentId: site.id, children: levels })
    for (const id of levels) nodes[id] = { ...nodes[id], parentId: building.id } as AnyNode
    nodes[building.id] = building as AnyNode
    children.push(building.id)
  }
  nodes[site.id] = { ...site, children } as AnyNode
  const adopted = new Set([...buildings, ...levels])
  scene.setScene(nodes as never, [site.id, ...roots.filter((id) => !adopted.has(id))] as never, {
    collections: scene.collections,
    materials: scene.materials,
    installedPlugins: scene.installedPlugins,
    hasExplicitPluginInstallState: scene.hasExplicitPluginInstallState,
  })
  ecoDebug(`load-site: the scene had no site — made one for ${adopted.size} root node(s)`)
  return { id: site.id, made: 'adopted' }
}

/**
 * Once per page: when a scene replaces the one the ground was written into — a
 * new list of roots with a different site root, or a scene load — the ground
 * goes back on. Within one scene nothing is re-applied, so a sculpted terrain
 * stays the user's. Checked after the store settles, as a load normalises first.
 */
function keepGroundOnNewScenes(): void {
  if (watching) return
  watching = true
  useScene.subscribe((scene) => {
    if (!given || placing || recheckQueued || scene.rootNodeIds === given.rootNodeIds) return
    recheckQueued = true
    queueMicrotask(() => {
      recheckQueued = false
      const now = useScene.getState()
      // Between scenes (the editor unloads before it loads): wait for the next one.
      if (!given || now.rootNodeIds.length === 0) return
      const siteId = siteRootOf(now)
      const sameScene =
        siteId !== null &&
        siteId === given.siteId &&
        now.hydrationId === given.hydrationId &&
        Boolean((now.nodes as Record<string, { terrain?: unknown }>)[siteId]?.terrain)
      if (sameScene) {
        given.rootNodeIds = now.rootNodeIds
        return
      }
      placeGround('new-scene')
    })
  })
}
