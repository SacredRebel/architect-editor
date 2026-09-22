import { describe, expect, test } from 'bun:test'
import { buildDomeProfile, sectorWindowAngle, windowAngle } from './geometry'

describe('buildDomeProfile', () => {
  test('first point is (radius, 0)', () => {
    const pts = buildDomeProfile(15.55, 0.5, 24)
    expect(pts[0]!.x).toBeCloseTo(15.55, 10)
    expect(pts[0]!.y).toBeCloseTo(0, 10)
  })

  test('hemisphere last point x≈0 and y≈radius', () => {
    const radius = 10
    const pts = buildDomeProfile(radius, 0.5, 32)
    const last = pts[pts.length - 1]!
    expect(last.x).toBeCloseTo(0, 10)
    expect(last.y).toBeCloseTo(radius, 10)
  })

  test('y is monotonic non-decreasing', () => {
    const pts = buildDomeProfile(12, 0.55, 40)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.y).toBeGreaterThanOrEqual(pts[i - 1]!.y - 1e-12)
    }
  })
})

describe('windowAngle', () => {
  test('covers 2π uniformly', () => {
    const count = 40
    const angles = Array.from({ length: count }, (_, i) => windowAngle(i, count))
    expect(angles[0]).toBeCloseTo(0, 12)
    const step = (Math.PI * 2) / count
    for (let i = 1; i < count; i++) {
      expect(angles[i]! - angles[i - 1]!).toBeCloseTo(step, 12)
    }
    // Full circle: last step back to 2π ≡ 0
    expect(angles[count - 1]! + step).toBeCloseTo(Math.PI * 2, 12)
  })
})

describe('sectorWindowAngle', () => {
  test('full sector matches windowAngle when start is 0', () => {
    const count = 40
    for (let i = 0; i < count; i++) {
      expect(sectorWindowAngle(i, count, 0, Math.PI * 2)).toBeCloseTo(windowAngle(i, count), 12)
    }
  })

  test('half sector keeps windows strictly inside the sweep', () => {
    const start = -Math.PI / 2
    const length = Math.PI
    const count = 12
    for (let i = 0; i < count; i++) {
      const a = sectorWindowAngle(i, count, start, length)
      expect(a).toBeGreaterThan(start)
      expect(a).toBeLessThan(start + length)
    }
  })
})
