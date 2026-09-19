export type EcoShell = {
  id: string
  name: string
  /** Closed plan outline [x, z] (editor frame). First ≠ last OK — we close it. */
  outline: [number, number][]
  /** Ridge polyline [x, z] in plan. */
  ridge: [number, number][]
  /** Height (m) at each ridge point — same length as ridge. */
  ridgeHeights: number[]
  /** Constant eave height (m). */
  eaveHeight: number
  /** Shell thickness (m). */
  thickness: number
  /** Optional rib spacing along the ridge (m); 0 = none. */
  ribSpacing: number
}

type ShellState = {
  shells: EcoShell[]
}

const listeners = new Set<() => void>()
let state: ShellState = { shells: [] }

function emit() {
  for (const l of listeners) l()
}

export function getEcoShellsState(): ShellState {
  return state
}

export function subscribeEcoShells(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoShells(shells: EcoShell[]): void {
  state = { shells }
  emit()
}

export function addEcoShell(shell: EcoShell): void {
  state = { shells: [...state.shells.filter((s) => s.id !== shell.id), shell] }
  emit()
}

export function removeEcoShell(id: string): void {
  state = { shells: state.shells.filter((s) => s.id !== id) }
  emit()
}

/** Default Oak-Leaf-ish leaf for F2 acceptance / panel “Add leaf”. */
export function makeDefaultLeafShell(id = `shell-${Date.now()}`): EcoShell {
  const length = 26
  const width = 13
  const halfL = length / 2
  const halfW = width / 2
  // Ellipse outline with exact 26×13 extents
  const outline: [number, number][] = []
  const n = 64
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    outline.push([Math.cos(a) * halfL, Math.sin(a) * halfW])
  }
  const ridge: [number, number][] = [
    [-halfL, 0],
    [-halfL / 3, 0.2],
    [halfL / 3, -0.15],
    [halfL, 0],
  ]
  const ridgeHeights = [3.0, 7.2, 9.8, 3.0]
  return {
    id,
    name: 'Leaf',
    outline,
    ridge,
    ridgeHeights,
    eaveHeight: 3,
    thickness: 0.12,
    ribSpacing: 2.5,
  }
}
