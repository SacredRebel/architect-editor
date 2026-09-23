/**
 * H18 — locomotion speeds (m/s). Shared by editor walkthrough + GLB walk.
 * CC0 character mesh / recast navmesh land in follow-ups; speeds apply now.
 */
export const WALK_SPEED_MS = 1.4
export const RUN_SPEED_MS = 4
export const SPRINT_SPEED_MS = 7

/** Fly / drone — base and scroll-wheel range (m/s). */
export const FLY_SPEED_MIN_MS = 10
export const FLY_SPEED_MAX_MS = 40
export const FLY_SPEED_DEFAULT_MS = 16

/** Double-tap Shift window for sprint (ms). */
export const SPRINT_DOUBLE_TAP_MS = 280

export const WALK_SPEEDS = {
  walk: WALK_SPEED_MS,
  run: RUN_SPEED_MS,
  sprint: SPRINT_SPEED_MS,
  flyMin: FLY_SPEED_MIN_MS,
  flyMax: FLY_SPEED_MAX_MS,
  flyDefault: FLY_SPEED_DEFAULT_MS,
} as const
