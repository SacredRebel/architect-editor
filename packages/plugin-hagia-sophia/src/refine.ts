import type { AnyNode } from '@pascal-app/core'
import type { HsColumnNode } from './schema'

const HS_KIND = 'hagia-sophia:column'
const EPSILON = 1e-6

export type SceneOps = {
  create: HsColumnNode[]
  update: {
    id: string
    patch: Partial<
      Pick<
        HsColumnNode,
        | 'position'
        | 'rotation'
        | 'shaftHeight'
        | 'capitalHeight'
        | 'shaftRadius'
        | 'variant'
        | 'flutes'
        | 'entasis'
      >
    >
  }[]
  remove: string[]
}

type Patchable = SceneOps['update'][number]['patch']

/**
 * Plugin kinds are not members of the host's closed `AnyNode` union.
 * Narrow by runtime `type` string, then re-interpret as HsColumnNode.
 */
function asHsColumn(node: AnyNode): HsColumnNode | null {
  if ((node as { type: string }).type !== HS_KIND) return null
  return node as unknown as HsColumnNode
}

function nearEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON
}

function tupleDrift(
  a: readonly [number, number, number] | undefined,
  b: readonly [number, number, number] | undefined,
): boolean {
  const aa = a ?? [0, 0, 0]
  const bb = b ?? [0, 0, 0]
  return !nearEqual(aa[0], bb[0]) || !nearEqual(aa[1], bb[1]) || !nearEqual(aa[2], bb[2])
}

function numericDrift(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return false
  if (a === undefined || b === undefined) return true
  return !nearEqual(a, b)
}

/**
 * Pure diff: target desired HS columns vs current scene nodes.
 * Only `hagia-sophia:column` nodes participate; all other kinds are ignored.
 */
export function planRefine(target: HsColumnNode[], currentNodes: AnyNode[]): SceneOps {
  const currentById = new Map<string, HsColumnNode>()
  for (const node of currentNodes) {
    const hs = asHsColumn(node)
    if (hs) currentById.set(hs.id, hs)
  }

  const targetById = new Map<string, HsColumnNode>(target.map((n) => [n.id, n]))
  const create: HsColumnNode[] = []
  const update: SceneOps['update'] = []
  const remove: string[] = []

  for (const t of target) {
    const cur = currentById.get(t.id)
    if (!cur) {
      create.push(t)
      continue
    }
    const patch: Patchable = {}
    if (tupleDrift(t.position, cur.position)) patch.position = t.position
    if (tupleDrift(t.rotation, cur.rotation)) patch.rotation = t.rotation
    if (numericDrift(t.shaftHeight, cur.shaftHeight)) patch.shaftHeight = t.shaftHeight
    if (numericDrift(t.capitalHeight, cur.capitalHeight)) patch.capitalHeight = t.capitalHeight
    if (numericDrift(t.shaftRadius, cur.shaftRadius)) patch.shaftRadius = t.shaftRadius
    if (t.variant !== cur.variant) patch.variant = t.variant
    if (numericDrift(t.flutes, cur.flutes)) patch.flutes = t.flutes
    if (numericDrift(t.entasis, cur.entasis)) patch.entasis = t.entasis
    if (Object.keys(patch).length > 0) update.push({ id: t.id, patch })
  }

  for (const id of currentById.keys()) {
    if (!targetById.has(id)) remove.push(id)
  }

  create.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  update.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  remove.sort()
  return { create, update, remove }
}

export type RefineStore = {
  createNode: (n: HsColumnNode, parentId?: string | null) => void
  updateNode: (id: string, u: Patchable) => void
  deleteNode: (id: string) => void
}

/** Apply planned ops through an injected store (stays free of useScene imports). */
export function applyRefine(ops: SceneOps, store: RefineStore): void {
  for (const node of ops.create) {
    store.createNode(node, null)
  }
  for (const { id, patch } of ops.update) {
    store.updateNode(id, patch)
  }
  for (const id of ops.remove) {
    store.deleteNode(id)
  }
}
