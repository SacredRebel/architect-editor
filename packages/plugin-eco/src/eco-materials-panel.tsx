'use client'

import { useSyncExternalStore } from 'react'
import {
  ECO_MATERIALS,
  type EcoMaterialId,
  elementKeyForShell,
  getEcoMaterialsState,
  setEcoMaterialAssignment,
  setEcoMaterialDefaults,
  subscribeEcoMaterials,
} from './eco-materials'
import { getEcoShellsState, subscribeEcoShells } from './eco-shell-store'

function useMats() {
  return useSyncExternalStore(subscribeEcoMaterials, getEcoMaterialsState, getEcoMaterialsState)
}

function useShells() {
  return useSyncExternalStore(subscribeEcoShells, getEcoShellsState, getEcoShellsState)
}

function MatSelect({
  value,
  onChange,
}: {
  value: EcoMaterialId
  onChange: (id: EcoMaterialId) => void
}) {
  return (
    <select
      onChange={(e) => onChange(e.target.value as EcoMaterialId)}
      style={{ fontSize: 12, maxWidth: 140 }}
      value={value}
    >
      {ECO_MATERIALS.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  )
}

/**
 * Materials palette — defaults for walls/slabs/shells plus per-shell assignment.
 * Per-wall/slab overrides use setEcoMaterialAssignment (element keys wall:/slab:).
 */
export default function EcoMaterialsPanel() {
  const state = useMats()
  const { shells } = useShells()

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Materials</div>
      <div style={{ opacity: 0.65 }}>
        Export merges to one mesh per material. Glass ships with transmission + alpha (BLEND).
        Normals are tiny procedural maps (32²) so compat stays under 500 KB.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
        }}
      >
        {ECO_MATERIALS.map((m) => (
          <div
            key={m.id}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              padding: 6,
              textAlign: 'center',
            }}
            title={`roughness ${m.roughness} · metalness ${m.metalness} · opacity ${m.opacity} · nml ${m.normalStrength}`}
          >
            <div
              style={{
                height: 28,
                borderRadius: 4,
                background: m.color,
                opacity: m.opacity,
                marginBottom: 4,
              }}
            />
            <div style={{ fontSize: 10, lineHeight: 1.2 }}>{m.name}</div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 600 }}>Defaults</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        Walls
        <MatSelect
          onChange={(id) => setEcoMaterialDefaults({ defaultWall: id })}
          value={state.defaultWall}
        />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        Slabs
        <MatSelect
          onChange={(id) => setEcoMaterialDefaults({ defaultSlab: id })}
          value={state.defaultSlab}
        />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        Shells
        <MatSelect
          onChange={(id) => setEcoMaterialDefaults({ defaultShell: id })}
          value={state.defaultShell}
        />
      </label>

      {shells.length > 0 && (
        <>
          <div style={{ fontWeight: 600 }}>Shell assignments</div>
          {shells.map((s) => {
            const key = elementKeyForShell(s.id)
            const value = state.assignments[key] ?? state.defaultShell
            return (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                <MatSelect
                  onChange={(id) => setEcoMaterialAssignment(key, id)}
                  value={value}
                />
              </label>
            )
          })}
        </>
      )}
    </div>
  )
}
