/**
 * Last GLB export outcome for the Eco legend UI — size label + hard-audit errors.
 */
export type EcoExportUiState = {
  status: 'idle' | 'exporting' | 'ok' | 'error'
  /** e.g. `1.9 MB → 280 KB` when status is ok. */
  sizeLabel: string | null
  error: string | null
  beforeBytes: number | null
  afterBytes: number | null
}

const listeners = new Set<() => void>()

let state: EcoExportUiState = {
  status: 'idle',
  sizeLabel: null,
  error: null,
  beforeBytes: null,
  afterBytes: null,
}

export function getEcoExportState(): EcoExportUiState {
  return state
}

export function subscribeEcoExport(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

function emit(): void {
  for (const l of listeners) l()
}

export function setEcoExportState(partial: Partial<EcoExportUiState>): void {
  state = { ...state, ...partial }
  emit()
}

export function resetEcoExportState(): void {
  state = {
    status: 'idle',
    sizeLabel: null,
    error: null,
    beforeBytes: null,
    afterBytes: null,
  }
  emit()
}
