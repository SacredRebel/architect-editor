'use client'

import { TransformControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import {
  getEcoTreeMeshBundle,
  type EcoTreeMeshBundle,
} from './eco-tree-mesh'
import {
  ECO_TREE_VARIANT_IDS,
  getEcoTreesState,
  subscribeEcoTrees,
  updateEcoTree,
  type EcoTreePlacement,
  type EcoTreeVariantId,
} from './eco-trees-store'

/** Impostor / low detail beyond this distance (metres) — Notion H2 note. */
export const ECO_TREE_IMPOSTOR_DISTANCE_M = 120

function useEcoTrees() {
  return useSyncExternalStore(subscribeEcoTrees, getEcoTreesState, getEcoTreesState)
}

function groupByVariant(trees: EcoTreePlacement[]) {
  const map = new Map<EcoTreeVariantId, EcoTreePlacement[]>()
  for (const t of trees) {
    const list = map.get(t.variant) ?? []
    list.push(t)
    map.set(t.variant, list)
  }
  return map
}

/**
 * Instanced bark+leaves per variant. One seed's geometry is shared across all
 * instances of that variant (seed variance is secondary for mass scatter).
 */
function VariantInstances({
  variant,
  trees,
  selectedId,
  onSelect,
}: {
  variant: EcoTreeVariantId
  trees: EcoTreePlacement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { camera } = useThree()
  const barkRef = useRef<THREE.InstancedMesh>(null)
  const leafRef = useRef<THREE.InstancedMesh>(null)
  const [bundle, setBundle] = useState<EcoTreeMeshBundle | null>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seed = trees[0]?.seed ?? 1

  useEffect(() => {
    let cancelled = false
    void getEcoTreeMeshBundle(variant, seed).then((b) => {
      if (!cancelled) setBundle(b)
    })
    return () => {
      cancelled = true
    }
  }, [variant, seed])

  useFrame(() => {
    if (!bundle || !barkRef.current || !leafRef.current) return
    const cam = camera.position
    let visible = 0
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]!
      const dx = t.position[0] - cam.x
      const dy = t.position[1] - cam.y
      const dz = t.position[2] - cam.z
      const dist = Math.hypot(dx, dy, dz)
      // Past impostor distance: keep instance but flatten scale in Y slightly
      // (cheap silhouette) — full card impostors land with world pack later.
      const far = dist > ECO_TREE_IMPOSTOR_DISTANCE_M
      dummy.position.set(...t.position)
      dummy.rotation.set(...t.rotation)
      const s = far
        ? ([t.scale[0] * 1.1, t.scale[1] * 0.85, t.scale[2] * 1.1] as const)
        : t.scale
      dummy.scale.set(...s)
      dummy.updateMatrix()
      barkRef.current.setMatrixAt(visible, dummy.matrix)
      leafRef.current.setMatrixAt(visible, dummy.matrix)
      visible++
    }
    barkRef.current.count = visible
    leafRef.current.count = visible
    barkRef.current.instanceMatrix.needsUpdate = true
    leafRef.current.instanceMatrix.needsUpdate = true
  })

  if (!bundle || trees.length === 0) return null

  return (
    <group name={`eco-trees:${variant}`}>
      <instancedMesh
        ref={barkRef}
        args={[bundle.barkGeometry, bundle.barkMaterial, trees.length]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          // Nearest tree in this variant batch
          let best: EcoTreePlacement | null = null
          let bestD = Infinity
          for (const t of trees) {
            const d = e.point.distanceTo(
              new THREE.Vector3(t.position[0], t.position[1], t.position[2]),
            )
            if (d < bestD) {
              bestD = d
              best = t
            }
          }
          if (best) onSelect(best.id)
        }}
      />
      <instancedMesh
        ref={leafRef}
        args={[bundle.leafGeometry, bundle.leafMaterial, trees.length]}
        castShadow
      />
      {selectedId && trees.some((t) => t.id === selectedId) ? (
        <SelectedTreeGizmo
          tree={trees.find((t) => t.id === selectedId)!}
          onChange={(patch) => updateEcoTree(selectedId, patch)}
        />
      ) : null}
    </group>
  )
}

function SelectedTreeGizmo({
  tree,
  onChange,
}: {
  tree: EcoTreePlacement
  onChange: (patch: Partial<EcoTreePlacement>) => void
}) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.position.set(...tree.position)
    ref.current.rotation.set(...tree.rotation)
    ref.current.scale.set(...tree.scale)
  }, [tree])

  return (
    <group ref={ref}>
      <mesh visible={false}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
      </mesh>
      <TransformControls
        object={ref as never}
        mode="translate"
        onMouseUp={() => {
          const o = ref.current
          if (!o) return
          onChange({
            position: [o.position.x, o.position.y, o.position.z],
            rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
            scale: [o.scale.x, o.scale.y, o.scale.z],
          })
        }}
      />
    </group>
  )
}

/** Viewer presentation — instanced eco trees. */
export function EcoTrees() {
  const { trees } = useEcoTrees()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const byVariant = useMemo(() => groupByVariant(trees), [trees])

  return (
    <group name="eco-trees">
      {ECO_TREE_VARIANT_IDS.map((variant) => {
        const list = byVariant.get(variant)
        if (!list?.length) return null
        return (
          <VariantInstances
            key={variant}
            variant={variant}
            trees={list}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )
      })}
    </group>
  )
}
