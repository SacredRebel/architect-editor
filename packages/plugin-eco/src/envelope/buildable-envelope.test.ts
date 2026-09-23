import { describe, expect, test } from 'bun:test'
import { classifyEdgeRoles, deriveBuildableEnvelope } from './buildable-envelope'
import { VENTURA_ENVELOPE } from './ventura-envelope'

describe('Ventura buildable envelope', () => {
  test('classifies front/side/rear on a quad', () => {
    expect(classifyEdgeRoles(4, 0)).toEqual(['front', 'side', 'rear', 'side'])
  })

  test('erodes a 30×30 m square by Ventura setbacks', () => {
    const parcel = [
      [-15, -15],
      [15, -15],
      [15, 15],
      [-15, 15],
    ] as const
    const env = deriveBuildableEnvelope(parcel, { frontEdgeIndex: 0 })
    expect(env.isDegenerate).toBe(false)
    expect(env.heightM).toBe(VENTURA_ENVELOPE.maxHeightM)
    // Depth: 30 − front − rear; width: 30 − 2×side
    const expectedDepth = 30 - VENTURA_ENVELOPE.frontSetbackM - VENTURA_ENVELOPE.rearSetbackM
    const expectedWidth = 30 - 2 * VENTURA_ENVELOPE.sideSetbackM
    expect(env.areaM2).toBeCloseTo(expectedDepth * expectedWidth, 3)
  })

  test('collapses when setbacks exceed parcel', () => {
    const parcel = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ] as const
    const env = deriveBuildableEnvelope(parcel)
    expect(env.isDegenerate).toBe(true)
    expect(env.polygon).toEqual([])
  })
})
