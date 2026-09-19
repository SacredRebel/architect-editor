type EcoWalkState = {
  enabled: boolean
  firstPerson: boolean
}

const listeners = new Set<() => void>()

let state: EcoWalkState = {
  enabled: false,
  firstPerson: true,
}

function emit() {
  for (const l of listeners) l()
}

export function getEcoWalkState(): EcoWalkState {
  return state
}

export function subscribeEcoWalk(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setWalkEnabled(enabled: boolean): void {
  state = { ...state, enabled }
  emit()
}

export function setWalkFirstPerson(firstPerson: boolean): void {
  state = { ...state, firstPerson }
  emit()
}

export function toggleWalkFirstPerson(): void {
  state = { ...state, firstPerson: !state.firstPerson }
  emit()
}
