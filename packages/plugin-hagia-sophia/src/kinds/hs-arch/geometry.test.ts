import { describe, expect, test } from 'bun:test'
import { buildArchOuterPoints } from './geometry'

describe('buildArchOuterPoints', () => {
  const span = 7.62
  const rise = 3.81
  const segments = 32

  test('round profile endpoints at ±span/2 y=0 and apex y=rise', () => {
    const pts = buildArchOuterPoints('round', span, rise, segments)
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    expect(first.x).toBeCloseTo(-span / 2, 6)
    expect(first.y).toBeCloseTo(0, 6)
    expect(last.x).toBeCloseTo(span / 2, 6)
    expect(last.y).toBeCloseTo(0, 6)

    const apex = pts.reduce((best, p) => (p.y > best.y ? p : best), pts[0]!)
    expect(apex.x).toBeCloseTo(0, 5)
    expect(apex.y).toBeCloseTo(rise, 5)
  })

  test('pointed profile has a single apex near (0, rise)', () => {
    const pts = buildArchOuterPoints('pointed', span, rise * 1.2, segments)
    const maxY = Math.max(...pts.map((p) => p.y))
    const atApex = pts.filter((p) => Math.abs(p.y - maxY) < 1e-9)
    // One geometric apex (duplicate samples allowed within epsilon of x≈0)
    expect(atApex.length).toBeGreaterThanOrEqual(1)
    for (const p of atApex) {
      expect(Math.abs(p.x)).toBeLessThan(1e-3)
    }
    expect(maxY).toBeCloseTo(rise * 1.2, 4)
  })

  test('segmental apex is lower than round for same span/rise', () => {
    const roundPts = buildArchOuterPoints('round', span, rise, segments)
    const segPts = buildArchOuterPoints('segmental', span, rise, segments)
    const roundApex = Math.max(...roundPts.map((p) => p.y))
    const segApex = Math.max(...segPts.map((p) => p.y))
    expect(segApex).toBeLessThan(roundApex)
    expect(roundApex).toBeCloseTo(rise, 5)
  })
})
