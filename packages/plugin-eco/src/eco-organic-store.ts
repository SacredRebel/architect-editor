import {
  makeDefaultLeafLoft,
  type EcoLoft,
} from './eco-loft'
import {
  makeDefaultCatenary,
  type EcoCatenary,
  type EcoMinimalPatch,
} from './eco-catenary'
import { makeDefaultBarrelVault, type EcoVault } from './eco-vault'

export type EcoOrganicState = {
  lofts: EcoLoft[]
  vaults: EcoVault[]
  catenaries: EcoCatenary[]
  minimal: EcoMinimalPatch[]
}

const listeners = new Set<() => void>()
let state: EcoOrganicState = {
  lofts: [],
  vaults: [],
  catenaries: [],
  minimal: [],
}

function emit() {
  for (const l of listeners) l()
}

export function getEcoOrganicState(): EcoOrganicState {
  return state
}

export function subscribeEcoOrganic(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEcoOrganicState(next: EcoOrganicState): void {
  state = next
  emit()
}

export function addEcoLoft(loft: EcoLoft): void {
  state = { ...state, lofts: [...state.lofts.filter((l) => l.id !== loft.id), loft] }
  emit()
}

export function removeEcoLoft(id: string): void {
  state = { ...state, lofts: state.lofts.filter((l) => l.id !== id) }
  emit()
}

export function updateEcoLoft(id: string, patch: Partial<EcoLoft>): void {
  state = {
    ...state,
    lofts: state.lofts.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  }
  emit()
}

export function addEcoVault(vault: EcoVault): void {
  state = { ...state, vaults: [...state.vaults.filter((v) => v.id !== vault.id), vault] }
  emit()
}

export function removeEcoVault(id: string): void {
  state = { ...state, vaults: state.vaults.filter((v) => v.id !== id) }
  emit()
}

export function updateEcoVault(id: string, patch: Partial<EcoVault>): void {
  state = {
    ...state,
    vaults: state.vaults.map((v) => (v.id === id ? { ...v, ...patch } : v)),
  }
  emit()
}

export function addEcoCatenary(cat: EcoCatenary): void {
  state = {
    ...state,
    catenaries: [...state.catenaries.filter((c) => c.id !== cat.id), cat],
  }
  emit()
}

export function removeEcoCatenary(id: string): void {
  state = { ...state, catenaries: state.catenaries.filter((c) => c.id !== id) }
  emit()
}

export function updateEcoCatenary(id: string, patch: Partial<EcoCatenary>): void {
  state = {
    ...state,
    catenaries: state.catenaries.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }
  emit()
}

export function addEcoMinimal(patch: EcoMinimalPatch): void {
  state = {
    ...state,
    minimal: [...state.minimal.filter((m) => m.id !== patch.id), patch],
  }
  emit()
}

export function clearEcoOrganic(): void {
  state = { lofts: [], vaults: [], catenaries: [], minimal: [] }
  emit()
}

export {
  makeDefaultLeafLoft,
  makeDefaultBarrelVault,
  makeDefaultCatenary,
}
