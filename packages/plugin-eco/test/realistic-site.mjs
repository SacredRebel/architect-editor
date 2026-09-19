/**
 * Shared realistic EcoSite for F0 host harness + round-trip checks.
 * 97×97 @ 1.5 m with real relief (not flat).
 */
export function buildRealisticSite(refGlb) {
  const w = 97
  const h = 97
  const stepM = 1.5
  const originElevM = 412.4
  const heights = []
  const cx = (w - 1) / 2
  const cz = (h - 1) / 2
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const dx = (c - cx) / cx
      const dz = (r - cz) / cz
      const ridge = Math.exp(-(dx * dx * 2.2 + dz * dz * 0.9)) * 14
      const saddle = Math.sin(dx * Math.PI) * Math.cos(dz * Math.PI * 0.7) * 3.5
      const noise = Math.sin(c * 0.37) * Math.cos(r * 0.29) * 1.2
      heights.push(originElevM + ridge + saddle + noise)
    }
  }
  // Grid origin in EcoSite z-north metres: NW corner of the field.
  const half = ((w - 1) * stepM) / 2
  return {
    v: 'eco/1',
    originLL: [-119.1776, 34.4481],
    originElevM,
    terrain: {
      w,
      h,
      stepM,
      originOffsetM: [-half, half],
      heights,
    },
    guides: [
      {
        kind: 'boundary',
        name: 'survey',
        pts: [
          [-60, -55],
          [62, -58],
          [58, 60],
          [-64, 57],
          [-60, -55],
        ],
      },
      {
        kind: 'easement',
        name: 'setback',
        pts: [
          [-40, -35],
          [42, -38],
          [38, 40],
          [-44, 37],
          [-40, -35],
        ],
      },
      {
        kind: 'footprint',
        name: 'pad',
        pts: [
          [-12, -8],
          [14, -10],
          [12, 16],
          [-14, 14],
          [-12, -8],
        ],
      },
      {
        kind: 'massing-outline',
        name: 'oak-leaf',
        pts: [
          [-8, 0],
          [-2, -10],
          [6, -8],
          [10, 2],
          [4, 12],
          [-6, 10],
          [-8, 0],
        ],
      },
    ],
    refGlb: refGlb || undefined,
    northDeg: 12,
  }
}

/** Sample ASL height at grid cell (col,row) from a site payload. */
export function siteHeightAsl(site, col, row) {
  const { w, heights } = site.terrain
  return heights[row * w + col]
}
