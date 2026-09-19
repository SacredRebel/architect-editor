'use client'

import type { SceneGraph } from '@pascal-app/editor'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SceneLoader, type SceneMeta } from '@/components/scene-loader'
import { isSceneServerAvailable } from '@/lib/eco-mode'
import { getLocalScene } from '@/lib/local-scene-store'
import { SceneNotFound } from './scene-not-found'

const EMPTY_GRAPH: SceneGraph = { nodes: {}, rootNodeIds: [] }

function emptyMeta(id: string): SceneMeta {
  const now = new Date().toISOString()
  return {
    id,
    name: 'Local scene',
    projectId: 'local-static',
    thumbnailUrl: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ownerId: null,
    sizeBytes: 0,
    nodeCount: 0,
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing'; id: string }
  | { status: 'ready'; meta: SceneMeta; graph: SceneGraph }

/**
 * Loads a scene from the server API when available, otherwise localStorage.
 * Keeps `/scene/[id]` compatible with `output: 'export'`.
 */
export function LocalScenePage() {
  const params = useParams<{ id: string }>()
  const id =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    if (!id) return
    let cancelled = false

    ;(async () => {
      if (isSceneServerAvailable()) {
        try {
          const response = await fetch(`/api/scenes/${encodeURIComponent(id)}`, {
            cache: 'no-store',
          })
          if (cancelled) return
          if (response.status === 404) {
            setState({ status: 'missing', id })
            return
          }
          if (!response.ok) {
            const local = getLocalScene(id)
            setState(
              local
                ? { status: 'ready', meta: local, graph: local.graph }
                : { status: 'missing', id },
            )
            return
          }
          const scene = (await response.json()) as SceneMeta & { graph: SceneGraph }
          const { graph, ...meta } = scene
          setState({ status: 'ready', meta, graph })
          return
        } catch {
          if (cancelled) return
        }
      }

      const local = getLocalScene(id)
      if (cancelled) return
      if (local) {
        setState({ status: 'ready', meta: local, graph: local.graph })
        return
      }
      // Static shell `/scene/local` and brand-new ids open an empty editor.
      setState({ status: 'ready', meta: emptyMeta(id), graph: EMPTY_GRAPH })
    })()

    return () => {
      cancelled = true
    }
  }, [id])

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Missing scene id.</p>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading scene…</p>
      </div>
    )
  }

  if (state.status === 'missing') {
    return <SceneNotFound id={state.id} />
  }

  return <SceneLoader initialScene={state.graph} meta={state.meta} />
}
