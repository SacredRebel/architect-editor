import { useScene } from '@pascal-app/core'
import { applySceneGraphToEditor, type SceneGraph } from '@pascal-app/editor'
import { applyEcoSite } from './apply-site'
import type { EcoMsg, EcoSite } from './bridge-types'
import { siteToWorldXz } from './coords'
import { ecoDebug, ecoDebugWarn } from './eco-debug'
import { setEcoExportState } from './eco-export-store'
import { createEcoOriginGate } from './eco-origins'
import { exportEcoScenePayload, restoreEcoSceneExtras } from './eco-scene'
import { getEcoSiteState } from './eco-site-store'
import { arrayBufferToBase64, downloadBytes, exportEcoGlb } from './export-glb'

const PROTOCOL = 'eco/1' as const
const HELLO_TIMEOUT_MS = 3000

/**
 * Which origins are heard: the world, its previews and local development
 * (eco-origins.ts). The first of them to say hello is the host, and every reply
 * goes to that origin only.
 */
const gate = createEcoOriginGate()

/** Capabilities advertised in eco:ready. */
export const CAPS = ['site', 'scene', 'assets', 'glb'] as const

type BridgeHandlers = {
  onLoadSite?: (site: EcoSite) => void
  onLoadScene?: (scene: unknown) => void
  onRequestGlb?: () => void
}

let installed = false
/** True once the host has sent a scene or a site. */
let hostContent = false
let helloTimer: ReturnType<typeof setTimeout> | null = null
let lastDirty: boolean | null = null
let unsubTemporal: (() => void) | null = null
let handlers: BridgeHandlers = {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isEcoMsg(data: unknown): data is EcoMsg {
  if (!isRecord(data) || typeof data.t !== 'string') return false
  if (data.t === 'eco:hello') return data.v === PROTOCOL
  if (data.t === 'eco:load-site') return isRecord(data.site)
  if (data.t === 'eco:load-scene') return 'scene' in data
  if (data.t === 'eco:request-export') return data.what === 'scene' || data.what === 'glb'
  if (data.t === 'eco:error') return typeof data.message === 'string'
  return false
}

function postToHost(msg: EcoMsg): void {
  const host = gate.host()
  if (typeof window === 'undefined' || !host) return
  if (window.parent === window) return
  window.parent.postMessage(msg, host)
}

function exportScenePayload(): unknown {
  return exportEcoScenePayload({
    onAssetsTooLarge: () => {
      postToHost({
        t: 'eco:error',
        message: 'Embedded assets exceed 20 MB — export as GLB instead.',
      })
    },
  })
}

function handleLoadSite(site: EcoSite): void {
  try {
    applyEcoSite(site)
    if (site.guides[0]?.pts[0]) {
      const [x, zSouth] = siteToWorldXz(site.guides[0].pts[0])
      ecoDebug(
        `load-site applied originLL=${site.originLL.join(',')} guide0→world xz=(${x}, ${zSouth})`,
      )
    } else {
      ecoDebug('load-site applied', site.originLL)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load-site failed'
    postToHost({ t: 'eco:error', message })
  }
  handlers.onLoadSite?.(site)
}

function handleLoadScene(scene: unknown): void {
  ecoDebug('load-scene')
  handlers.onLoadScene?.(scene)
  if (isRecord(scene) && isRecord(scene.nodes) && Array.isArray(scene.rootNodeIds)) {
    applySceneGraphToEditor(scene as SceneGraph)
    restoreEcoSceneExtras(scene)
    emitDirty(false)
  }
}

async function runGlbExport(): Promise<void> {
  setEcoExportState({
    status: 'exporting',
    error: null,
    sizeLabel: null,
    beforeBytes: null,
    afterBytes: null,
  })
  try {
    const { nodes } = useScene.getState()
    const originLL = getEcoSiteState().site?.originLL ?? ([0, 0] as [number, number])
    const { buffer, walk, sizeLabel, optimise } = await exportEcoGlb({
      nodes: nodes as never,
      originLL,
      includePlacedAssets: true,
    })
    setEcoExportState({
      status: 'ok',
      sizeLabel,
      error: null,
      beforeBytes: optimise.beforeBytes,
      afterBytes: optimise.afterBytes,
    })
    if (gate.host() && typeof window !== 'undefined' && window.parent !== window) {
      postToHost({
        t: 'eco:glb',
        glb: arrayBufferToBase64(buffer),
        walk,
        originLL,
      })
    } else {
      downloadBytes('eco-design.glb', buffer, 'model/gltf-binary')
      downloadBytes('eco-design.walk.json', JSON.stringify(walk, null, 2), 'application/json')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GLB export failed'
    setEcoExportState({
      status: 'error',
      error: message,
      sizeLabel: null,
      beforeBytes: null,
      afterBytes: null,
    })
    if (gate.host()) postToHost({ t: 'eco:error', message })
    else console.error('[eco:bridge]', message)
  }
}

function handleRequestExport(what: 'scene' | 'glb'): void {
  if (what === 'glb') {
    void runGlbExport()
    handlers.onRequestGlb?.()
    return
  }
  postToHost({ t: 'eco:scene', scene: exportScenePayload() })
}

function onMessage(event: MessageEvent): void {
  if (!isEcoMsg(event.data)) return
  // Silence for any origin off the list, and for any other origin once a host
  // has said hello — hello included.
  const admitted = gate.admit(event.origin, event.data.t === 'eco:hello')
  if (!admitted) return

  if (admitted === 'hello') {
    if (helloTimer) {
      clearTimeout(helloTimer)
      helloTimer = null
    }
    postToHost({ t: 'eco:ready', v: PROTOCOL, caps: [...CAPS] })
    emitDirty(readDirty())
    return
  }

  switch (event.data.t) {
    case 'eco:load-site':
      hostContent = true
      handleLoadSite(event.data.site)
      break
    case 'eco:load-scene':
      hostContent = true
      handleLoadScene(event.data.scene)
      break
    case 'eco:request-export':
      handleRequestExport(event.data.what)
      break
    case 'eco:error':
      ecoDebugWarn('host error:', event.data.message)
      break
    default:
      break
  }
}

function readDirty(): boolean {
  try {
    const temporal = useScene.temporal.getState()
    return temporal.pastStates.length > 0
  } catch {
    return false
  }
}

function emitDirty(dirty: boolean): void {
  if (lastDirty === dirty) return
  lastDirty = dirty
  postToHost({ t: 'eco:dirty', dirty })
}

function watchDirty(): void {
  if (unsubTemporal) return
  try {
    unsubTemporal = useScene.temporal.subscribe(() => {
      emitDirty(readDirty())
    })
  } catch (err) {
    ecoDebugWarn('temporal subscribe failed', err)
  }
}

/**
 * Install the eco/1 postMessage bridge once per page.
 * A valid `eco:hello` from an allowed origin (eco-origins.ts) opens the
 * session; the bridge then hears and answers that origin only. If no hello
 * arrives within 3s while embedded, continues standalone (no error).
 */
export function installEcoBridge(nextHandlers: BridgeHandlers = {}): void {
  if (typeof window === 'undefined') return
  handlers = { ...handlers, ...nextHandlers }
  if (installed) return
  installed = true

  window.addEventListener('message', onMessage)
  watchDirty()

  const embedded = window.self !== window.top
  ;(window as Window & { ecoEmbedded?: boolean }).ecoEmbedded = embedded
  // Read-only, for checks: the origin whose hello opened the session (or null).
  Object.defineProperty(window, 'ecoHost', { get: () => gate.host(), configurable: true })

  if (embedded) {
    helloTimer = setTimeout(() => {
      helloTimer = null
      if (!gate.host()) {
        ecoDebug('no eco:hello within 3s — standalone embed mode')
      }
    }, HELLO_TIMEOUT_MS)
  }
}

/** Whether the host (the world's studio) has sent a scene or a site. */
export function hasEcoHostContent(): boolean {
  return hostContent
}

/**
 * Apply a scene and/or a site exactly as `eco:load-scene` / `eco:load-site`
 * would, without a host: no hello, so the host origin stays unset and the
 * world's own hello is still accepted if it arrives later. Used by the demo
 * fallback when nothing arrives.
 */
export function applyEcoPayloadsLocally(payload: { scene?: unknown; site?: EcoSite }): void {
  if (payload.scene !== undefined) handleLoadScene(payload.scene)
  if (payload.site) handleLoadSite(payload.site)
}

export function requestEcoClose(): void {
  postToHost({ t: 'eco:close' })
}

/** Export design GLB + walk — posts eco:glb when embedded, else downloads. */
export function requestEcoGlbExport(): void {
  void runGlbExport()
}

export function getEcoHostOrigin(): string | null {
  return gate.host()
}

export function isEcoBridgeReady(): boolean {
  return gate.host() !== null
}
