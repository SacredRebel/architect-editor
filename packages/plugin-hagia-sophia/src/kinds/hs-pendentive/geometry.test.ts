import { describe, expect, test } from 'bun:test'
import { quadrantToPhiStart } from './geometry'

describe('quadrantToPhiStart', () => {
  test('maps quadrants to {0, π/2, π, 3π/2}', () => {
    expect(quadrantToPhiStart('ne')).toBe(0)
    expect(quadrantToPhiStart('nw')).toBeCloseTo(Math.PI / 2, 12)
    expect(quadrantToPhiStart('se')).toBeCloseTo(Math.PI, 12)
    expect(quadrantToPhiStart('sw')).toBeCloseTo((3 * Math.PI) / 2, 12)
  })
})
