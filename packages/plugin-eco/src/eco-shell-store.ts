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
  /**
   * Parametric rise multiplier on (ridgeHeight − eave). Default 1.
   * Changing rise regenerates tessellation — never baked at creation.
   */
  rise: number
  /** Leaf mid-width / span (m). Present on leaf shells driven by the H10 panel. */
  leafSpan?: number
  /** Leaf spine length along ridge (m). */
  spineLength?: number
  /**
   * Mid-span curl factor in height falloff (0 = linear ridge→eave).
   * Default 0.15 matches the original leaf shell.
   */
  curvature?: number
}

export type LeafShellParams = {
  leafSpan: number
  spineLength: number
  rise: number
  curvature: number
}

export const DEFAULT_LEAF_SHELL_PARAMS: LeafShellParams = {
  leafSpan: 13,
  spineLength: 26,
  rise: 1,
  curvature: 0.15,
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

export function clearEcoShells(): void {
  state = { shells: [] }
  emit()
}

export function updateEcoShell(id: string, patch: Partial<EcoShell>): void {
  state = {
    shells: state.shells.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)),
  }
  emit()
}

/** Scale ridge rise above eave; eave stays put. Tessellation follows on next build. */
export function setShellRise(id: string, rise: number): void {
  updateEcoShell(id, { rise: Math.max(0.05, rise) })
}

/** Effective ridge heights after applying parametric `rise`. */
export function effectiveRidgeHeights(shell: EcoShell): number[] {
  const rise = shell.rise > 0 ? shell.rise : 1
  return shell.ridgeHeights.map((h) => shell.eaveHeight + (h - shell.eaveHeight) * rise)
}

/** Build leaf plan (outline + ridge) from span × spine — same ellipse family as the demo. */
export function leafShellPlan(
  spineLength: number,
  leafSpan: number,
): { outline: [number, number][]; ridge: [number, number][] } {
  const length = Math.max(2, spineLength)
  const width = Math.max(1, leafSpan)
  const halfL = length / 2
  const halfW = width / 2
  const outline: [number, number][] = []
  const n = 64
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    outline.push([Math.cos(a) * halfL, Math.sin(a) * halfW])
  }
  const ridge: [number, number][] = [
    [-halfL, 0],
    [-halfL / 3, 0.2 * (width / 13)],
    [halfL / 3, -0.15 * (width / 13)],
    [halfL, 0],
  ]
  return { outline, ridge }
}

/** Default Oak-Leaf-ish leaf for F2 / H10 acceptance / panel “Add leaf”. */
export function makeDefaultLeafShell(id = `shell-${Date.now()}`): EcoShell {
  const { leafSpan, spineLength, rise, curvature } = DEFAULT_LEAF_SHELL_PARAMS
  const { outline, ridge } = leafShellPlan(spineLength, leafSpan)
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
    rise,
    leafSpan,
    spineLength,
    curvature,
  }
}

export function getLeafShellParams(shell: EcoShell): LeafShellParams {
  return {
    leafSpan: shell.leafSpan ?? DEFAULT_LEAF_SHELL_PARAMS.leafSpan,
    spineLength: shell.spineLength ?? DEFAULT_LEAF_SHELL_PARAMS.spineLength,
    rise: shell.rise > 0 ? shell.rise : DEFAULT_LEAF_SHELL_PARAMS.rise,
    curvature:
      typeof shell.curvature === 'number'
        ? shell.curvature
        : DEFAULT_LEAF_SHELL_PARAMS.curvature,
  }
}

/**
 * Live H10 leaf controls — regenerates outline/ridge from span + spine;
 * rise/curvature stay parametric (tessellation / height fn pick them up).
 */
export function setLeafShellParams(id: string, patch: Partial<LeafShellParams>): void {
  const shell = state.shells.find((s) => s.id === id)
  if (!shell) return
  const next = { ...getLeafShellParams(shell), ...patch }
  next.leafSpan = Math.max(1, next.leafSpan)
  next.spineLength = Math.max(2, next.spineLength)
  next.rise = Math.max(0.05, next.rise)
  next.curvature = Math.max(0, Math.min(1, next.curvature))
  const { outline, ridge } = leafShellPlan(next.spineLength, next.leafSpan)
  updateEcoShell(id, {
    outline,
    ridge,
    rise: next.rise,
    leafSpan: next.leafSpan,
    spineLength: next.spineLength,
    curvature: next.curvature,
  })
}
