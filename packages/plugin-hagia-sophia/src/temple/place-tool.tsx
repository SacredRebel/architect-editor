'use client'

/**
 * One placement tool for every temple kind: a see-through piece follows the cursor on the active
 * level, R / T turn it (Shift for 15°), a click sets it down and keeps the tool for the next one.
 * Esc is the editor's own cancel. Sizes are edited in the inspector afterwards.
 */
import { type AnyNodeId, emitter, type GridEvent, sceneRegistry, useScene } from '@pascal-app/core'
import { isGridSnapActive, triggerSFX, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { Group, Object3D } from 'three'

type Parser = { parse: (v: unknown) => { id: string } & Record<string, unknown> }

export type PlaceToolSpec = {
  schema: Parser
  defaults: () => Record<string, unknown>
  preset: () => Record<string, unknown>
  build: (node: never) => Object3D
  name: string
}

const GHOST_OPACITY = 0.5

function snap(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v
}

/** rides the active level's stacked height, as the built-in tools' ghosts do */
function OnLevel({ children }: { children: ReactNode }) {
  const levelId = useViewer((s) => s.selection.levelId)
  const ref = useRef<Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const level = levelId ? sceneRegistry.nodes.get(levelId as AnyNodeId) : null
    g.position.y = level ? level.position.y : 0
  })
  return <group ref={ref}>{children}</group>
}

export function makePlaceTool(spec: PlaceToolSpec) {
  return function TemplePlaceTool() {
    const levelId = useViewer((s) => s.selection.levelId)
    const [cursor, setCursor] = useState<[number, number, number] | null>(null)
    const [yaw, setYaw] = useState(0)
    const yawRef = useRef(0)

    const ghost = useMemo(() => {
      const node = spec.schema.parse({ ...spec.defaults(), ...spec.preset(), name: spec.name })
      const obj = spec.build(node as never)
      obj.traverse((child) => {
        const mat = (child as { material?: { transparent: boolean; opacity: number; depthWrite: boolean } }).material
        if (mat) {
          mat.transparent = true
          mat.opacity = GHOST_OPACITY
          mat.depthWrite = false
        }
      })
      return obj
    }, [])

    useEffect(() => {
      if (!levelId) return
      const at = (e: GridEvent): [number, number, number] => {
        const step = isGridSnapActive() ? useEditor.getState().gridSnapStep : 0
        return [snap(e.localPosition[0], step), 0, snap(e.localPosition[2], step)]
      }
      const onMove = (e: GridEvent) => setCursor(at(e))
      const onClick = (e: GridEvent) => {
        const node = spec.schema.parse({
          ...spec.defaults(),
          ...spec.preset(),
          name: spec.name,
          position: at(e),
          rotation: [0, yawRef.current, 0],
          parentId: levelId,
        })
        useScene.getState().createNode(node as never, levelId as AnyNodeId)
        useViewer.getState().setSelection({ selectedIds: [node.id as AnyNodeId] })
        triggerSFX('sfx:item-place')
      }
      const onKey = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        const k = e.key.toLowerCase()
        if (k !== 'r' && k !== 't') return
        e.preventDefault()
        e.stopPropagation()
        const step = e.shiftKey ? Math.PI / 12 : Math.PI / 4
        yawRef.current += k === 't' ? -step : step
        setYaw(yawRef.current)
        triggerSFX('sfx:item-rotate')
      }
      emitter.on('grid:move', onMove)
      emitter.on('grid:click', onClick)
      window.addEventListener('keydown', onKey, true)
      return () => {
        emitter.off('grid:move', onMove)
        emitter.off('grid:click', onClick)
        window.removeEventListener('keydown', onKey, true)
      }
    }, [levelId])

    if (!levelId || !cursor) return null
    return (
      <OnLevel>
        <group position={cursor} rotation={[0, yaw, 0]}>
          <primitive object={ghost} />
        </group>
      </OnLevel>
    )
  }
}
