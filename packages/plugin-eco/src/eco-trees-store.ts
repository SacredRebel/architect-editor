/**
 * Eco trees — six oak/chamise variants via ez-tree presets (client generate).
 * Placements are tiny JSON (no GLB bytes) so eco:scene stays light.
 */

export type EcoTreeVariantId =
  | 'oak-small'
  | 'oak-medium'
  | 'oak-large'
  | 'chamise-a'
  | 'chamise-b'
  | 'chamise-c'

/** Map to @dgreenheck/ez-tree preset names. Chamise ≈ bush presets (chaparral). */
export const ECO_TREE_VARIANTS: Record<
  EcoTreeVariantId,
  { label: string; preset: string; species: 'oak' | 'chamise' }
> = {
  'oak-small': { label: 'Oak · small', preset: 'Oak Small', species: 'oak' },
  'oak-medium': { label: 'Oak · medium', preset: 'Oak Medium', species: 'oak' },
  'oak-large': { label: 'Oak · large', preset: 'Oak Large', species: 'oak' },
  'chamise-a': { label: 'Chamise · a', preset: 'Bush 1', species: 'chamise' },
  'chamise-b': { label: 'Chamise · b', preset: 'Bush 2', species: 'chamise' },
  'chamise-c': { label: 'Chamise · c', preset: 'Bush 3', species: 'chamise' },
}

export const ECO_TREE_VARIANT_IDS = Object.keys(ECO_TREE_VARIANTS) as EcoTreeVariantId[]

export type EcoTreePlacement = {
  id: string
  variant: EcoTreeVariantId
  seed: number
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

type TreeState = {
  trees: EcoTreePlacement[]
}

const listeners = new Set<() => void>()
let state: TreeState = { trees: [] }

function emit() {
  for (const l of listeners) l()
}

export function getEcoTreesState(): TreeState {
  return state
}

export function subscribeEcoTrees(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoTrees(trees: EcoTreePlacement[]): void {
  state = { trees }
  emit()
}

export function addEcoTree(tree: EcoTreePlacement): void {
  state = { trees: [...state.trees.filter((t) => t.id !== tree.id), tree] }
  emit()
}

export function updateEcoTree(id: string, patch: Partial<EcoTreePlacement>): void {
  state = {
    trees: state.trees.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)),
  }
  emit()
}

export function removeEcoTree(id: string): void {
  state = { trees: state.trees.filter((t) => t.id !== id) }
  emit()
}

export function clearEcoTrees(): void {
  state = { trees: [] }
  emit()
}

export function makeEcoTreePlacement(
  variant: EcoTreeVariantId,
  overrides: Partial<EcoTreePlacement> = {},
): EcoTreePlacement {
  return {
    id: overrides.id ?? `tree-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    variant,
    seed: overrides.seed ?? Math.floor(Math.random() * 1e9),
    position: overrides.position ?? [0, 0, 0],
    rotation: overrides.rotation ?? [0, 0, 0],
    scale: overrides.scale ?? [1, 1, 1],
  }
}

export function isEcoTreeVariantId(value: unknown): value is EcoTreeVariantId {
  return typeof value === 'string' && value in ECO_TREE_VARIANTS
}
