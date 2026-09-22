import type { AnyNode } from '@pascal-app/core'
import { describe, expect, test } from 'bun:test'
import { generateGroundFloor } from './generate'
import { applyRefine, planRefine, type SceneOps } from './refine'
import type { HsColumnNode } from './schema'

function asAny(nodes: HsColumnNode[]): AnyNode[] {
  return nodes as unknown as AnyNode[]
}

/** Pure merge of ops into a node map (simulates apply without a real store). */
function applySimulated(current: AnyNode[], ops: SceneOps): AnyNode[] {
  const map = new Map<string, AnyNode>()
  for (const n of current) map.set(n.id, n)
  for (const id of ops.remove) map.delete(id)
  for (const { id, patch } of ops.update) {
    const prev = map.get(id)
    if (prev) map.set(id, { ...prev, ...patch } as AnyNode)
  }
  for (const n of ops.create) map.set(n.id, n as unknown as AnyNode)
  return [...map.values()]
}

describe('planRefine', () => {
  test('empty current ⇒ all 40 creates', () => {
    const target = generateGroundFloor()
    const ops = planRefine(target, [])
    expect(ops.create).toHaveLength(40)
    expect(ops.update).toHaveLength(0)
    expect(ops.remove).toHaveLength(0)
  })

  test('identical target/current ⇒ zero ops', () => {
    const target = generateGroundFloor()
    const ops = planRefine(target, asAny(target))
    expect(ops.create).toHaveLength(0)
    expect(ops.update).toHaveLength(0)
    expect(ops.remove).toHaveLength(0)
  })

  test('moved column ⇒ exactly 1 update with only position', () => {
    const target = generateGroundFloor()
    const current = structuredClone(target)
    const moved = current[0]!
    moved.position = [moved.position[0] + 1, moved.position[1], moved.position[2]]
    // Target keeps original position → update brings current back
    const ops = planRefine(target, asAny(current))
    expect(ops.create).toHaveLength(0)
    expect(ops.remove).toHaveLength(0)
    expect(ops.update).toHaveLength(1)
    expect(ops.update[0]!.id).toBe(moved.id)
    expect(Object.keys(ops.update[0]!.patch)).toEqual(['position'])
    expect(ops.update[0]!.patch.position).toEqual(target[0]!.position)
  })

  test('extra hs-column in current ⇒ removed', () => {
    const target = generateGroundFloor()
    const extra: HsColumnNode = {
      ...target[0]!,
      id: 'hs-column_extra_orphan',
    }
    const ops = planRefine(target, asAny([...target, extra]))
    expect(ops.remove).toEqual(['hs-column_extra_orphan'])
    expect(ops.create).toHaveLength(0)
    expect(ops.update).toHaveLength(0)
  })

  test('NON-hs nodes are ignored', () => {
    const target = generateGroundFloor()
    const foreign = {
      object: 'node' as const,
      id: 'wall_abc',
      type: 'wall',
      parentId: null,
      visible: true,
      metadata: {},
    } as unknown as AnyNode
    const ops = planRefine(target, [...asAny(target), foreign])
    expect(ops.create).toHaveLength(0)
    expect(ops.update).toHaveLength(0)
    expect(ops.remove).toHaveLength(0)
  })

  test('idempotence: second plan after simulated apply is empty', () => {
    const target = generateGroundFloor()
    const current: AnyNode[] = []
    const ops1 = planRefine(target, current)
    const after = applySimulated(current, ops1)
    const ops2 = planRefine(target, after)
    expect(ops2.create).toHaveLength(0)
    expect(ops2.update).toHaveLength(0)
    expect(ops2.remove).toHaveLength(0)
  })

  test('applyRefine invokes store methods', () => {
    const target = generateGroundFloor().slice(0, 2)
    const created: string[] = []
    const updated: string[] = []
    const deleted: string[] = []
    const ops: SceneOps = {
      create: [target[0]!],
      update: [{ id: target[1]!.id, patch: { flutes: 8 } }],
      remove: ['hs-column_gone'],
    }
    applyRefine(ops, {
      createNode: (n) => {
        created.push(n.id)
      },
      updateNode: (id) => {
        updated.push(id)
      },
      deleteNode: (id) => {
        deleted.push(id)
      },
    })
    expect(created).toEqual([target[0]!.id])
    expect(updated).toEqual([target[1]!.id])
    expect(deleted).toEqual(['hs-column_gone'])
  })
})
