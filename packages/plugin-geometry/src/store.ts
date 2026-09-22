/**
 * Placed construction figures — presentation + snap only (not scene graph).
 */
import type { FormId } from './catalog'
import type { Figure2D } from './forms'

export type PlacedFigure = {
  id: string
  formId: FormId
  label: string
  /** Size parameter in metres (form-specific meaning). */
  size: number
  /** Plan origin [x, z] in editor metres. */
  origin: [number, number]
  bearingDeg: number
  locked: boolean
  figure: Figure2D
  /** Optional solid wireframe for 3D forms. */
  solid?: {
    vertices: [number, number, number][]
    edges: [number, number][]
  }
  user?: boolean
}

export type UserForm = {
  id: string
  name: string
  formId: FormId
  size: number
  params?: Record<string, number>
}

type State = {
  figures: PlacedFigure[]
  selectedId: string | null
  userForms: UserForm[]
}

let state: State = { figures: [], selectedId: null, userForms: [] }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeGeometry(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

export function getGeometryState(): State {
  return state
}

export function addPlacedFigure(fig: PlacedFigure): void {
  state = { ...state, figures: [...state.figures, fig], selectedId: fig.id }
  emit()
}

export function updatePlacedFigure(id: string, patch: Partial<PlacedFigure>): void {
  state = {
    ...state,
    figures: state.figures.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }
  emit()
}

export function removePlacedFigure(id: string): void {
  state = {
    ...state,
    figures: state.figures.filter((f) => f.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
  }
  emit()
}

export function clearPlacedFigures(): void {
  state = { ...state, figures: [], selectedId: null }
  emit()
}

export function setSelectedFigure(id: string | null): void {
  state = { ...state, selectedId: id }
  emit()
}

export function addUserForm(form: UserForm): void {
  state = { ...state, userForms: [...state.userForms, form] }
  emit()
}

export function removeUserForm(id: string): void {
  state = { ...state, userForms: state.userForms.filter((f) => f.id !== id) }
  emit()
}
