/**
 * H10 — chord-error tolerance for curved walk rings.
 *
 * Walk rings are polylines sampled from the tessellated surface / arc, never a
 * single chord. Max plan-distance from the true curve to any ring segment is
 * ECO_CURVE_WALK_TOLERANCE_M (5 cm) so a capsule cannot walk through the bulge.
 *
 * For a circular arc of radius R, chord length L ≈ √(8 R ε). Sample step is
 * min(ECO_WALL_SAMPLE_STEP_M, max(ECO_CURVE_WALK_MIN_STEP_M, L)).
 */

/** Max chord-to-curve error in plan (metres). */
export const ECO_CURVE_WALK_TOLERANCE_M = 0.05

/** Never coarser than this for curved walls (metres along run). */
export const ECO_WALL_SAMPLE_STEP_M = 0.5

/** Floor on adaptive step so rings stay finite (metres). */
export const ECO_CURVE_WALK_MIN_STEP_M = 0.05

/**
 * Adaptive sample step along a circular arc of the given radius.
 * Straight walls ignore this and use two endpoints.
 */
export function adaptiveArcSampleStepM(radiusM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  const L = Math.sqrt(8 * R * ECO_CURVE_WALK_TOLERANCE_M)
  return Math.min(ECO_WALL_SAMPLE_STEP_M, Math.max(ECO_CURVE_WALK_MIN_STEP_M, L))
}

/**
 * Max plan deviation of a chord of length `stepM` from an arc of radius `radiusM`.
 * s ≈ L² / (8 R)
 */
export function chordErrorForStep(radiusM: number, stepM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  return (stepM * stepM) / (8 * R)
}
