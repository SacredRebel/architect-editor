/** Presentation / H12 view state — considered camera + clean frame. */

type PresState = {
  /** Hide chrome overlays conceptually; lighting + framing switch. */
  presentation: boolean
  /** Local hours 0–24 for site sun. */
  timeOfDayHours: number
}

const listeners = new Set<() => void>()
let state: PresState = {
  presentation: false,
  timeOfDayHours: 15,
}

function emit() {
  for (const l of listeners) l()
}

export function getEcoPresentationState(): PresState {
  return state
}

export function subscribeEcoPresentation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoPresentation(on: boolean): void {
  state = { ...state, presentation: on }
  emit()
}

export function toggleEcoPresentation(): void {
  setEcoPresentation(!state.presentation)
}

export function setEcoTimeOfDayHours(hours: number): void {
  state = { ...state, timeOfDayHours: Math.max(0, Math.min(24, hours)) }
  emit()
}
