'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { maxDprForQuality, type GpuQuality } from '../../lib/gpu-quality'

/**
 * H17.1 — demand-friendly AdaptiveDpr for frameloop="never".
 * Drops DPR under sustained slow frames; restores toward the tier cap when idle.
 * Hard cap remains 2 (via maxDprForQuality).
 */
export function AdaptiveDpr({ quality }: { quality: GpuQuality }) {
  const setDpr = useThree((s) => s.setDpr)
  const current = useRef(1)
  const slowStreak = useRef(0)
  const fastStreak = useRef(0)

  const coarse =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const cap = maxDprForQuality(quality, coarse)

  useEffect(() => {
    current.current = Math.min(cap, Math.max(1, window.devicePixelRatio || 1))
    setDpr(current.current)
  }, [cap, setDpr])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      // Ignore huge gaps (tab background).
      if (dt > 0 && dt < 250) {
        if (dt > 22) {
          slowStreak.current++
          fastStreak.current = 0
        } else if (dt < 17) {
          fastStreak.current++
          slowStreak.current = 0
        }
        if (slowStreak.current >= 8 && current.current > 1) {
          current.current = Math.max(1, Number((current.current - 0.25).toFixed(2)))
          setDpr(current.current)
          slowStreak.current = 0
        } else if (fastStreak.current >= 45 && current.current < cap) {
          current.current = Math.min(cap, Number((current.current + 0.25).toFixed(2)))
          setDpr(current.current)
          fastStreak.current = 0
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cap, setDpr])

  return null
}

export default AdaptiveDpr
