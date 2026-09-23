import { describe, expect, test } from 'bun:test'
import {
  analyseThrust,
  catenaryY,
  fitCatenary,
  fitEndpointError,
  fitPassesEndpoints,
  sampleCatenary,
  sampleCatenaryMeridian,
} from './catenary'

describe('fitCatenary', () => {
  test('passes springings and crown within 1 mm for shallow, medium and steep rises', () => {
    const cases: Array<[number, number]> = [
      [6, 1],
      [10, 4],
      [20 * 0.3048, 10 * 0.3048],
      [12, 8],
      [31.2, 15.6],
    ]
    for (const [span, rise] of cases) {
      const fit = fitCatenary(span, rise)
      expect(fitPassesEndpoints(fit, 0.001)).toBe(true)
      expect(fitEndpointError(fit)).toBeLessThanOrEqual(0.001)
      expect(catenaryY(fit, 0)).toBeCloseTo(rise, 6)
      expect(catenaryY(fit, -span / 2)).toBeCloseTo(0, 6)
      expect(catenaryY(fit, span / 2)).toBeCloseTo(0, 6)
    }
  })

  test('samples are symmetric and peak at midspan', () => {
    const fit = fitCatenary(8, 3)
    const pts = sampleCatenary(fit, 64)
    expect(pts[0]!.x).toBeCloseTo(-4, 12)
    expect(pts[pts.length - 1]!.x).toBeCloseTo(4, 12)
    const apex = pts.reduce((b, p) => (p.y > b.y ? p : b), pts[0]!)
    expect(apex.x).toBeCloseTo(0, 6)
    expect(apex.y).toBeCloseTo(3, 6)
  })
})

describe('Poleni thrust (middle third)', () => {
  test('a catenary centreline keeps the thrust inside the middle third', () => {
    const span = 8
    const rise = 3
    const thickness = 0.6
    const fit = fitCatenary(span, rise)
    const centreline = sampleCatenary(fit, 48)
    const analysis = analyseThrust(centreline, thickness, span, rise, 48)
    expect(analysis.withinMiddleThird).toBe(true)
    expect(analysis.maxOffset).toBeLessThan(thickness / 6)
  })

  test('a semicircle of the same span/rise can leave the middle third when the ring is thin', () => {
    const span = 8
    const rise = 4 // semicircle
    const thickness = 0.15
    // Circular centreline
    const half = span / 2
    const cy = (rise * rise - half * half) / (2 * rise)
    const R = rise - cy
    const centreline = Array.from({ length: 49 }, (_, i) => {
      const x = -half + (span * i) / 48
      const y = cy + Math.sqrt(Math.max(0, R * R - x * x))
      return { x, y }
    })
    const analysis = analyseThrust(centreline, thickness, span, rise, 48)
    // Classic result: circular and catenary diverge at the haunches
    expect(analysis.maxOffset).toBeGreaterThan(thickness / 6)
    expect(analysis.withinMiddleThird).toBe(false)
  })
})

describe('catenary meridian (dome of revolution)', () => {
  test('rim at (radius, 0) and crown at (0, height) within 1 mm', () => {
    const radius = 5
    const height = 4
    const pts = sampleCatenaryMeridian(radius, height, 32)
    expect(pts[0]!.x).toBeCloseTo(radius, 6)
    expect(pts[0]!.y).toBeLessThanOrEqual(0.001)
    const last = pts[pts.length - 1]!
    expect(last.x).toBeCloseTo(0, 6)
    expect(Math.abs(last.y - height)).toBeLessThanOrEqual(0.001)
  })
})
