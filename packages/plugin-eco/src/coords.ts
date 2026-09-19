/**
 * EcoSite authoring frame uses z = north.
 * The walkable world uses z = south (x east, y up).
 *
 * Convert exactly once at the bridge boundary — negate z — so the rest of
 * the editor can keep "north is +z" authoring sanity.
 */

export type Xz = readonly [number, number]

/** EcoSite (z-north) → world / GLB frame (z-south). */
export function siteToWorldXz([x, zNorth]: Xz): [number, number] {
  return [x, -zNorth]
}

/** World / GLB frame (z-south) → EcoSite (z-north). */
export function worldToSiteXz([x, zSouth]: Xz): [number, number] {
  return [x, -zSouth]
}

/** Round-trip must be identity (within float noise). */
export function roundTripSiteXz(pt: Xz): [number, number] {
  return worldToSiteXz(siteToWorldXz(pt))
}
