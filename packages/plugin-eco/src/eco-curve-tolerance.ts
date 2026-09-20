/**
 * H10 — chord-error / sagitta tolerance for curved walk rings.
 *
 * Tolerance ECO_CURVE_WALK_TOLERANCE_M = 0.05 m is a CEILING, not a target.
 * At R = 5 m that is θ ≤ ~16° → about 23 segments around a full circle.
 *
 * Walk rings may be finer than the ceiling (coordinates are cheap).
 * Visual tessellation uses the coarsest count that still meets the ceiling.
 * Rule: walk ≥ visual.
 */

/** Max chord-to-curve / sagitta error in plan (metres) — ceiling. */
export const ECO_CURVE_WALK_TOLERANCE_M = 0.05

/**
 * Max step along a curved walk ring (metres). Finer than the visual ceiling is OK.
 */
export const ECO_WALL_SAMPLE_STEP_M = 0.5

/** Floor on adaptive walk step (metres). */
export const ECO_CURVE_WALK_MIN_STEP_M = 0.05

/** Push solid rings outside the visual wall face (metres). */
export const ECO_WALK_SOLID_OUTSET_M = 0.01

/** Pull floor rings inside the visual slab edge (metres). */
export const ECO_WALK_FLOOR_INSET_M = 0.01

/**
 * Adaptive sample step along a circular arc for WALK rings.
 * May be finer than the visual ceiling.
 */
export function adaptiveArcSampleStepM(radiusM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  const L = Math.sqrt(8 * R * ECO_CURVE_WALK_TOLERANCE_M)
  return Math.min(ECO_WALL_SAMPLE_STEP_M, Math.max(ECO_CURVE_WALK_MIN_STEP_M, L))
}

/**
 * Adaptive sample step for VISUAL mesh tessellation — coarsest that meets tolerance.
 * At R = 5 m: √(8·5·0.05) ≈ 1.41 m → ~23 segments / full circle.
 */
export function adaptiveVisualSampleStepM(radiusM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  const L = Math.sqrt(8 * R * ECO_CURVE_WALK_TOLERANCE_M)
  return Math.max(ECO_CURVE_WALK_MIN_STEP_M, L)
}

/** Exact sagitta for central angle θ (radians): R (1 − cos(θ/2)). */
export function sagittaForAngle(radiusM: number, thetaRad: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  return R * (1 - Math.cos(Math.abs(thetaRad) / 2))
}

/** Max plan deviation of a chord of length `stepM` from an arc of radius `radiusM`. */
export function chordErrorForStep(radiusM: number, stepM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  return (stepM * stepM) / (8 * R)
}

/**
 * Segments around a full circle so sagitta ≤ tolerance at radius R.
 * Uses VISUAL step (coarsest legal) — ~23 at R=5, not the denser walk count.
 */
export function fullCircleSegmentCount(radiusM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  const step = adaptiveVisualSampleStepM(R)
  const circumference = 2 * Math.PI * R
  return Math.max(3, Math.ceil(circumference / step))
}

/** Walk-ring segment count (may exceed visual). */
export function fullCircleWalkSegmentCount(radiusM: number): number {
  const R = Math.max(1e-3, Math.abs(radiusM))
  const step = adaptiveArcSampleStepM(R)
  const circumference = 2 * Math.PI * R
  return Math.max(3, Math.ceil(circumference / step))
}
