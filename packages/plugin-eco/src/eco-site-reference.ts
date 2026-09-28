/**
 * A5 — the site's reference layers, derived from the EcoSite as sent: its
 * standing trees and the contours of its surveyed ground. Pure (site in,
 * scene-frame geometry out) so checks can run it headless.
 *
 * Scene frame: x east, z south (`siteToWorldXz`), heights in metres relative
 * to `originElevM` — the frame the terrain, guides and ghost are drawn in.
 */
import type { EcoSite } from './bridge-types'
import { siteToWorldXz } from './coords'

/** Same ceiling as the terrain the editor builds from the heightfield. */
const MAX_DIM = 257

export type SiteTree = {
  x: number
  z: number
  heightM: number
  canopyM: number
  species?: string
}

/** The site's standing trees in the scene frame; malformed entries are dropped. */
export function siteTreesInScene(site: EcoSite | null | undefined): SiteTree[] {
  if (!site || !Array.isArray(site.trees)) return []
  const trees: SiteTree[] = []
  for (const tree of site.trees) {
    if (!tree || !Array.isArray(tree.pt) || tree.pt.length < 2) continue
    const [x, z] = siteToWorldXz([Number(tree.pt[0]), Number(tree.pt[1])])
    const heightM = Number(tree.heightM)
    const canopyM = Number(tree.canopyM)
    if (![x, z, heightM, canopyM].every(Number.isFinite) || heightM <= 0 || canopyM <= 0) continue
    trees.push({
      x,
      z,
      heightM,
      canopyM,
      species: typeof tree.species === 'string' ? tree.species : undefined,
    })
  }
  return trees
}

export type ContourLine = {
  /** Contour height, metres above sea level. */
  levelAsl: number
  /** The same height in the editor's y (relative to `originElevM`). */
  y: number
  major: boolean
  /** Scene-frame [x, z] points; closed rings repeat their first point. */
  points: [number, number][]
}

type Segment = { a: string; b: string }

/**
 * Contours of the site's surveyed ground by marching squares over the EcoSite
 * heightfield, every `intervalM` metres of elevation, `major` every
 * `majorEvery` intervals. Crossings are keyed by grid edge, so neighbouring
 * cells meet exactly and segments chain into polylines.
 */
export function siteContours(site: EcoSite, intervalM = 1, majorEvery = 5): ContourLine[] {
  const { w, h, stepM, originOffsetM, heights } = site.terrain
  const cols = Math.min(Math.max(1, Math.floor(w)), MAX_DIM)
  const rows = Math.min(Math.max(1, Math.floor(h)), MAX_DIM)
  if (cols < 2 || rows < 2 || !(stepM > 0) || !(intervalM > 0)) return []
  const [ox, oz] = siteToWorldXz(originOffsetM)
  const at = (c: number, r: number) => heights[r * w + c] ?? site.originElevM

  let min = Infinity
  let max = -Infinity
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = at(c, r)
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []

  const lines: ContourLine[] = []
  const first = Math.ceil(min / intervalM)
  const last = Math.floor(max / intervalM)
  for (let k = first; k <= last; k++) {
    const level = k * intervalM
    const points = new Map<string, [number, number]>()
    const segments: Segment[] = []
    // Crossing on the edge between grid points (c0,r0) and (c1,r1), keyed by edge.
    const crossing = (c0: number, r0: number, c1: number, r1: number): string => {
      const key = r0 === r1 ? `h${c0},${r0}` : `v${c0},${r0}`
      if (!points.has(key)) {
        const h0 = at(c0, r0)
        const h1 = at(c1, r1)
        const t = (level - h0) / (h1 - h0)
        points.set(key, [ox + (c0 + (c1 - c0) * t) * stepM, oz + (r0 + (r1 - r0) * t) * stepM])
      }
      return key
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const h00 = at(c, r)
        const h10 = at(c + 1, r)
        const h11 = at(c + 1, r + 1)
        const h01 = at(c, r + 1)
        const up = [h00 >= level, h10 >= level, h11 >= level, h01 >= level]
        const count = up.filter(Boolean).length
        if (count === 0 || count === 4) continue
        // Edges in order around the cell: top, right, bottom, left.
        const edge = [
          up[0] !== up[1] ? crossing(c, r, c + 1, r) : null,
          up[1] !== up[2] ? crossing(c + 1, r, c + 1, r + 1) : null,
          up[3] !== up[2] ? crossing(c, r + 1, c + 1, r + 1) : null,
          up[0] !== up[3] ? crossing(c, r, c, r + 1) : null,
        ]
        const hits = edge.filter((e): e is string => e !== null)
        if (hits.length === 2) {
          segments.push({ a: hits[0]!, b: hits[1]! })
        } else if (hits.length === 4) {
          // Saddle: cut off the corners on the other side from the centre.
          const centreUp = (h00 + h10 + h11 + h01) / 4 >= level
          const cornerEdges: [number, number][] = [
            [3, 0],
            [0, 1],
            [1, 2],
            [2, 3],
          ]
          for (let corner = 0; corner < 4; corner++) {
            if (up[corner] === centreUp) continue
            const [ea, eb] = cornerEdges[corner]!
            segments.push({ a: edge[ea]!, b: edge[eb]! })
          }
        }
      }
    }
    for (const chain of chainSegments(segments)) {
      lines.push({
        levelAsl: level,
        y: level - site.originElevM,
        major: k % majorEvery === 0,
        points: chain.map((key) => points.get(key)!),
      })
    }
  }
  return lines
}

/** Join segments that share a crossing into polylines (open ones first, then rings). */
function chainSegments(segments: Segment[]): string[][] {
  const byPoint = new Map<string, number[]>()
  segments.forEach((s, i) => {
    for (const key of [s.a, s.b]) {
      const list = byPoint.get(key)
      if (list) list.push(i)
      else byPoint.set(key, [i])
    }
  })
  const used = new Uint8Array(segments.length)
  const chains: string[][] = []
  const walk = (start: number, from: string): string[] => {
    const chain = [from]
    let current = start
    let at = from
    while (true) {
      used[current] = 1
      const s = segments[current]!
      const next = s.a === at ? s.b : s.a
      chain.push(next)
      const onward = (byPoint.get(next) ?? []).find((i) => !used[i])
      if (onward === undefined) return chain
      current = onward
      at = next
    }
  }
  for (const [key, list] of byPoint) {
    if (list.length !== 1 || used[list[0]!]) continue
    chains.push(walk(list[0]!, key))
  }
  segments.forEach((s, i) => {
    if (!used[i]) chains.push(walk(i, s.a))
  })
  return chains
}
