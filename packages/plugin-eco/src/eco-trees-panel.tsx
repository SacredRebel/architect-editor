'use client'

import { useSyncExternalStore } from 'react'
import {
  ECO_TREE_VARIANT_IDS,
  ECO_TREE_VARIANTS,
  addEcoTree,
  getEcoTreesState,
  makeEcoTreePlacement,
  removeEcoTree,
  subscribeEcoTrees,
  type EcoTreeVariantId,
} from './eco-trees-store'

function useEcoTrees() {
  return useSyncExternalStore(subscribeEcoTrees, getEcoTreesState, getEcoTreesState)
}

/** Panel: place six oak/chamise variants into the studio. */
export default function EcoTreesPanel() {
  const { trees } = useEcoTrees()

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Trees (ez-tree)</div>
      <div style={{ opacity: 0.7, lineHeight: 1.35 }}>
        Six oak / chamise variants. Placements export in the GLB (arrive in the world). Viewport
        uses instancing; impostor thinning past 120&nbsp;m.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {ECO_TREE_VARIANT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              addEcoTree(
                makeEcoTreePlacement(id as EcoTreeVariantId, {
                  position: [(Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8],
                }),
              )
            }
            style={{ padding: '6px 8px', cursor: 'pointer', textAlign: 'left' }}
          >
            + {ECO_TREE_VARIANTS[id].label}
          </button>
        ))}
      </div>
      <div style={{ fontWeight: 600 }}>Placed ({trees.length})</div>
      {trees.length === 0 ? (
        <div style={{ opacity: 0.65 }}>No trees yet.</div>
      ) : (
        trees.map((t) => (
          <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {ECO_TREE_VARIANTS[t.variant].label} · seed {t.seed}
            </span>
            <button type="button" onClick={() => removeEcoTree(t.id)}>
              Remove
            </button>
          </label>
        ))
      )}
    </div>
  )
}
