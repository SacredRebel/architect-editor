/**
 * The host's ground lands whatever the scene holds when load-site arrives, and
 * stays through the scene loads that follow. The terrain is read back as it
 * would be saved (a JSON copy, decoded by core's codec) and compared with the
 * sent heights, relative to originElevM, worked out here.
 */
import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  clearSceneHistory,
  commitTerrainField,
  createTerrainField,
  decodeTerrainField,
  LevelNode,
  SiteNode,
  useScene,
} from '@pascal-app/core'
import { applyEcoSite, ecoSiteLandings } from './apply-site'
import type { EcoSite } from './bridge-types'

globalThis.requestAnimationFrame ??= (callback) => {
  callback(0)
  return 0
}
globalThis.cancelAnimationFrame ??= () => {}

const W = 5
const H = 4
const SITE: EcoSite = {
  v: 'eco/1',
  originLL: [-119.15536, 34.4331],
  originElevM: 425.9,
  terrain: {
    w: W,
    h: H,
    stepM: 2,
    originOffsetM: [-4, 3],
    heights: Array.from(
      { length: W * H },
      (_, i) => 425.9 + Math.floor(i / W) * 0.5 + (i % W) * 0.25,
    ),
  },
  guides: [
    {
      kind: 'boundary',
      pts: [
        [-2, 2],
        [2, 2],
        [2, -2],
        [-2, -2],
      ],
    },
  ],
  northDeg: 0,
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function siteRoots() {
  const scene = useScene.getState()
  return scene.rootNodeIds.filter((id) => scene.nodes[id]?.type === 'site')
}

/** The site root's terrain as it would be saved and reopened, or null. */
function savedGround(siteId: string) {
  const node = (useScene.getState().nodes as Record<string, { terrain?: unknown }>)[siteId]
  return node?.terrain ? decodeTerrainField(JSON.parse(JSON.stringify(node.terrain))) : null
}

/** The sent heightfield, relative to originElevM, row r and column c. */
const sentAt = (r: number, c: number) =>
  (SITE.terrain.heights[r * W + c] as number) - SITE.originElevM

function expectSentGround(siteId: string) {
  const field = savedGround(siteId)
  expect(field).not.toBeNull()
  if (!field) return
  expect([field.cols, field.rows, field.spacing]).toEqual([W, H, 2])
  // The site frame's north-west corner (−4 east, 3 north) is the editor's (−4, −3): +z is south.
  expect([field.origin[0], field.origin[1]]).toEqual([-4, -3])
  // Heights are stored as counts of `step` metres.
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++)
      expect(
        Math.abs((field.heights[r * W + c] as number) * field.step - sentAt(r, c)),
      ).toBeLessThan(0.006)
}

/** A saved scene: site → building → level → nothing else, the site without terrain. */
function savedScene(siteId?: string) {
  const site = SiteNode.parse(siteId ? { id: siteId } : {})
  const building = BuildingNode.parse({ parentId: site.id })
  const level = LevelNode.parse({ parentId: building.id, level: 0, height: 3 })
  const nodes = {
    [site.id]: { ...site, children: [building.id] },
    [building.id]: { ...building, children: [level.id] },
    [level.id]: level,
  } as Record<string, AnyNode>
  return { nodes, rootNodeIds: [site.id], siteId: site.id, buildingId: building.id }
}

function load(nodes: Record<string, AnyNode>, rootNodeIds: string[]) {
  useScene.getState().unloadScene()
  useScene.getState().setScene(nodes as never, rootNodeIds as never)
  clearSceneHistory()
}

describe('the host’s ground (eco:load-site)', () => {
  test('an empty scene gets a site root, with the ground on it', async () => {
    useScene.getState().unloadScene()
    applyEcoSite(SITE)
    await settle()
    const roots = siteRoots()
    expect(roots.length).toBe(1)
    expectSentGround(roots[0] as string)
    // The editor's own default beneath it: a building with a level.
    const scene = useScene.getState()
    const site = scene.nodes[roots[0] as keyof typeof scene.nodes] as { children: string[] }
    expect(site.children.map((id) => scene.nodes[id as never]?.type)).toEqual(['building'])
    expect(ecoSiteLandings().at(-1)).toEqual({
      via: 'load-site',
      hadSiteRoot: false,
      made: 'default',
    })
  })

  test('the editor’s own load after load-site gets the ground back', async () => {
    useScene.getState().unloadScene()
    applyEcoSite(SITE)
    const { nodes, rootNodeIds, siteId } = savedScene()
    load(nodes, rootNodeIds)
    await settle()
    expect(siteRoots()).toEqual([siteId])
    expectSentGround(siteId)
  })

  test('a host scene without a site: a site adopts its building, the ground goes on it', async () => {
    applyEcoSite(SITE)
    const { nodes, buildingId } = savedScene()
    const orphanRoots: Record<string, AnyNode> = {}
    for (const [id, node] of Object.entries(nodes)) {
      if (node.type === 'site') continue
      orphanRoots[id] = id === buildingId ? ({ ...node, parentId: null } as AnyNode) : node
    }
    load(orphanRoots, [buildingId])
    await settle()
    const roots = siteRoots()
    expect(roots.length).toBe(1)
    const scene = useScene.getState()
    const site = scene.nodes[roots[0] as keyof typeof scene.nodes] as { children: string[] }
    expect(site.children).toContain(buildingId)
    expect(scene.nodes[buildingId as keyof typeof scene.nodes]?.parentId).toBe(roots[0] as never)
    expect(scene.rootNodeIds).not.toContain(buildingId as never)
    expectSentGround(roots[0] as string)
    expect(ecoSiteLandings().at(-1)).toEqual({
      via: 'new-scene',
      hadSiteRoot: false,
      made: 'adopted',
    })
  })

  test('the same site reloaded (a host scene) gets the ground back', async () => {
    const first = savedScene()
    load(first.nodes, first.rootNodeIds)
    applyEcoSite(SITE)
    const again = savedScene(first.siteId)
    load(again.nodes, again.rootNodeIds)
    await settle()
    expectSentGround(first.siteId)
  })

  test('the ground is not an undo step', async () => {
    const { nodes, rootNodeIds } = savedScene()
    load(nodes, rootNodeIds)
    applyEcoSite(SITE)
    await settle()
    expect(useScene.temporal.getState().pastStates.length).toBe(0)
  })

  test('a terrain the user sculpts after that stays theirs', async () => {
    const { nodes, rootNodeIds, siteId } = savedScene()
    load(nodes, rootNodeIds)
    applyEcoSite(SITE)
    const sculpted = createTerrainField({
      cols: 3,
      rows: 3,
      spacing: 5,
      origin: [0, 0],
      step: 0.01,
    })
    sculpted.heights.fill(150)
    useScene
      .getState()
      .updateNode(siteId as never, { terrain: commitTerrainField(sculpted) } as never)
    await settle()
    const field = savedGround(siteId)
    expect([field?.cols, field?.rows]).toEqual([3, 3])
    expect(((field?.heights[4] as number) ?? 0) * (field?.step ?? 0)).toBeCloseTo(1.5, 6)
  })
})
