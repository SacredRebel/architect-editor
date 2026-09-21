export type EcoAssetRole = 'prop' | 'massing'

export type EcoAssetMeta = {
  id: string
  name: string
  hash: string
  byteLength: number
  thumbDataUrl: string
  /** H14: prop (placeable) vs massing reference (locked, not walk). */
  role?: EcoAssetRole
  /** Atlas provider id when sourced via image3d. */
  sourceProvider?: string
  sourceKind?: 'object' | 'building' | 'upload'
}

export type EcoAsset = EcoAssetMeta & {
  bytesBase64: string
}

export type EcoPlacement = {
  id: string
  assetId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  /**
   * Massing references are locked (no TransformControls) and semi-transparent.
   * Defaults false for props.
   */
  locked?: boolean
  /** 0–1; massing defaults ~0.45. */
  opacity?: number
  /** Exclude from walk / eco:glb export when true (massing). */
  excludeFromWalkExport?: boolean
}

type EcoAssetsState = {
  assets: EcoAsset[]
  placements: EcoPlacement[]
  selectedPlacementId: string | null
}

const META_KEY = 'eco:assets:meta'
const listeners = new Set<() => void>()

let state: EcoAssetsState = {
  assets: [],
  placements: [],
  selectedPlacementId: null,
}

function emit() {
  for (const l of listeners) l()
}

function persistMeta(): void {
  if (typeof window === 'undefined') return
  const meta = state.assets.map(
    ({ id, name, hash, byteLength, thumbDataUrl, role, sourceProvider, sourceKind }) => ({
      id,
      name,
      hash,
      byteLength,
      thumbDataUrl,
      role,
      sourceProvider,
      sourceKind,
    }),
  )
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // quota — ignore; bytes stay in memory for the session
  }
}

export function getEcoAssetsState(): EcoAssetsState {
  return state
}

export function subscribeEcoAssets(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]!)
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function totalAssetBytes(): number {
  return state.assets.reduce((sum, a) => sum + a.byteLength, 0)
}

export function assetRole(asset: EcoAssetMeta): EcoAssetRole {
  return asset.role ?? 'prop'
}

export function addEcoAsset(asset: EcoAsset): void {
  state = {
    ...state,
    assets: [...state.assets.filter((a) => a.id !== asset.id && a.hash !== asset.hash), asset],
  }
  persistMeta()
  emit()
}

export function removeEcoAsset(id: string): void {
  state = {
    ...state,
    assets: state.assets.filter((a) => a.id !== id),
    placements: state.placements.filter((p) => p.assetId !== id),
    selectedPlacementId:
      state.placements.find((p) => p.id === state.selectedPlacementId)?.assetId === id
        ? null
        : state.selectedPlacementId,
  }
  persistMeta()
  emit()
}

export function placeEcoAsset(assetId: string): EcoPlacement | null {
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return null
  const role = assetRole(asset)
  const isMassing = role === 'massing'
  const placement: EcoPlacement = {
    id: `place-${crypto.randomUUID()}`,
    assetId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    locked: isMassing,
    opacity: isMassing ? 0.45 : 1,
    excludeFromWalkExport: isMassing,
  }
  state = {
    ...state,
    placements: [...state.placements, placement],
    selectedPlacementId: isMassing ? state.selectedPlacementId : placement.id,
  }
  emit()
  return placement
}

export function updateEcoPlacement(id: string, patch: Partial<EcoPlacement>): void {
  const existing = state.placements.find((p) => p.id === id)
  if (existing?.locked && (patch.position || patch.rotation || patch.scale)) {
    // Massing references stay locked for wall tracing — ignore transform edits.
    const { position: _p, rotation: _r, scale: _s, ...rest } = patch
    patch = rest
    if (Object.keys(patch).length === 0) return
  }
  state = {
    ...state,
    placements: state.placements.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  }
  emit()
}

export function selectEcoPlacement(id: string | null): void {
  state = { ...state, selectedPlacementId: id }
  emit()
}

/** Placements that must never enter the walk / eco:glb export. */
export function placementsExcludedFromWalkExport(): EcoPlacement[] {
  return state.placements.filter((p) => {
    if (p.excludeFromWalkExport) return true
    const asset = state.assets.find((a) => a.id === p.assetId)
    return asset ? assetRole(asset) === 'massing' : false
  })
}

export function serializeEcoAssetsForScene(): {
  assets: EcoAsset[]
  placements: EcoPlacement[]
} {
  return {
    assets: state.assets.map((a) => ({ ...a })).sort((a, b) => a.id.localeCompare(b.id)),
    placements: state.placements.map((p) => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function restoreEcoAssetsFromScene(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  const data = payload as { assets?: EcoAsset[]; placements?: EcoPlacement[] }
  if (!Array.isArray(data.assets) || !Array.isArray(data.placements)) return
  state = {
    assets: [...data.assets].sort((a, b) => a.id.localeCompare(b.id)),
    placements: [...data.placements].sort((a, b) => a.id.localeCompare(b.id)),
    selectedPlacementId: null,
  }
  persistMeta()
  emit()
}

/** Test helper — wipe in-memory assets (not persisted). */
export function clearEcoAssets(): void {
  state = { assets: [], placements: [], selectedPlacementId: null }
  emit()
}
