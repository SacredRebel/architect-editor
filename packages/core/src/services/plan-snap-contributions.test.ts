import { describe, expect, test } from 'bun:test'
import {
  clearPlanSnapProviders,
  registerPlanSnapProvider,
  snapToPlanContributions,
} from './plan-snap-contributions'

describe('snapToPlanContributions', () => {
  test('snaps to nearest segment within radius', () => {
    clearPlanSnapProviders()
    registerPlanSnapProvider(() => ({
      segments: [{ a: [0, 0], b: [10, 0] }],
    }))
    const r = snapToPlanContributions([5, 0.2], { radius: 0.55 })
    expect(r.snapped).toBe(true)
    expect(r.point[0]).toBeCloseTo(5, 5)
    expect(r.point[1]).toBeCloseTo(0, 5)
  })

  test('acceptance: within 10 cm of edge when drawing along it', () => {
    clearPlanSnapProviders()
    registerPlanSnapProvider(() => ({
      segments: [{ a: [-8, 0], b: [8, 0] }],
    }))
    // Cursor 8 cm off the leaf edge
    const r = snapToPlanContributions([0, 0.08], { radius: 0.55 })
    expect(r.snapped).toBe(true)
    expect(Math.abs(r.point[1])).toBeLessThan(0.001)
  })

  test('Alt/suspended leaves the point alone', () => {
    clearPlanSnapProviders()
    registerPlanSnapProvider(() => ({
      segments: [{ a: [0, 0], b: [10, 0] }],
    }))
    const r = snapToPlanContributions([5, 0.2], { suspended: true })
    expect(r.snapped).toBe(false)
    expect(r.point).toEqual([5, 0.2])
  })

  test('horizontal band suggests y', () => {
    clearPlanSnapProviders()
    registerPlanSnapProvider(() => ({
      segments: [],
      horizontals: [{ y: 3.2, minX: -5, maxX: 5, minZ: -5, maxZ: 5 }],
    }))
    const r = snapToPlanContributions([0, 0], { radius: 0.55 })
    expect(r.y).toBeCloseTo(3.2, 5)
  })
})
