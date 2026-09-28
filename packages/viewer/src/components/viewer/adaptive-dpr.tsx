'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { TimestampQuery } from 'three/webgpu'
import { createDprController, type DprController } from '../../lib/dpr-controller'
import { PERF_OVERLAY_ENABLED } from '../../lib/gpu-perf'
import { type GpuQuality, maxDprForQuality } from '../../lib/gpu-quality'

/**
 * H17.1 — AdaptiveDpr for frameloop="never".
 * The ceiling is the tier's cap (max 2, via maxDprForQuality) and never above
 * the display's own devicePixelRatio (H19.2a): pixels past the display are not
 * seen. Below the ceiling the dpr follows the device's render time per frame
 * (three's timestamp queries) and the achieved render cadence against the frame
 * budget (H19.2b): down when the GPU is slow or holds frames below the cap,
 * back up when there is room — see lib/dpr-controller. Without timestamp-query
 * support it holds at the ceiling.
 */
export function AdaptiveDpr({
  quality,
  budgetMs,
  sampling = true,
}: {
  quality: GpuQuality
  /** Frame budget in ms: 1000 / the viewer's frame cap. */
  budgetMs: number
  /** Off in immersive sessions, where the XR framebuffer sets resolution. */
  sampling?: boolean
}) {
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const displayDpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1
  const ceiling = Math.min(maxDprForQuality(quality, coarse), displayDpr)

  const controller = useMemo(() => createDprController({ ceiling, budgetMs }), [ceiling, budgetMs])
  const current = useRef<DprController>(controller)
  const inFlight = useRef(false)
  // Time between rendered frames (useFrame runs once per rendered frame).
  const lastFrameAt = useRef<number | null>(null)
  const interval = useRef<number | undefined>(undefined)

  useEffect(() => {
    current.current = controller
    setDpr(controller.dpr)
  }, [controller, setDpr])

  useFrame(() => {
    const now = performance.now()
    const gap = lastFrameAt.current === null ? undefined : now - lastFrameAt.current
    lastFrameAt.current = now
    // A hidden tab or a resume leaves one long gap; it says nothing about cost.
    interval.current = gap !== undefined && gap < 250 ? gap : undefined
    if (!sampling || inFlight.current) return
    const renderer = gl as any
    if (renderer.backend?.trackTimestamp !== true || renderer.xr?.isPresenting) return
    // With the ceiling at the floor (a 1x display, or the low tier) the dpr
    // cannot move: resolve only to keep three's query pool drained, and leave
    // even that to ?perf's own resolve when it runs.
    const adaptive = controller.ceiling > controller.floor
    if (!adaptive && PERF_OVERLAY_ENABLED) return
    const pending = renderer.resolveTimestampsAsync?.(TimestampQuery.RENDER)
    if (!pending) return
    inFlight.current = true
    const owner = controller
    const frameInterval = interval.current
    pending
      .then((ms: number | undefined) => {
        inFlight.current = false
        if (!adaptive || typeof ms !== 'number' || current.current !== owner) return
        const next = owner.sample(ms, frameInterval)
        if (next !== null) setDpr(next)
      })
      .catch(() => {
        // Pool disposed mid-flight (pipeline rebuild / unmount).
        inFlight.current = false
      })
  })

  return null
}

export default AdaptiveDpr
