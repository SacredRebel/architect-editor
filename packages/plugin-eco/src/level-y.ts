/** Shared level-stack world Y for walls/slabs (editor frame). */

export type Levelish = {
  type?: string
  parentId?: string | null
  children?: string[]
  height?: number
  baseElevation?: number
}

export function levelWorldY(nodes: Record<string, Levelish | undefined>, levelId: string): number {
  const level = nodes[levelId]
  if (level?.type !== 'level') return 0
  const buildingId = level.parentId
  const building = buildingId ? nodes[buildingId] : null
  if (building?.type !== 'building') {
    return level.baseElevation ?? 0
  }
  const levelIds = (building.children ?? []).filter((id) => nodes[id]?.type === 'level')
  let y = 0
  for (const id of levelIds) {
    if (id === levelId) return y + (level.baseElevation ?? 0)
    const h = nodes[id]?.height ?? 2.7
    y += h
  }
  return y + (level.baseElevation ?? 0)
}
