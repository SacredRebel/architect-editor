import { expect, test } from 'bun:test'
import { roundTripSiteXz, siteToWorldXz, worldToSiteXz } from './coords'

test('site z-north converts to world z-south by negating z', () => {
  expect(siteToWorldXz([12.5, 40])).toEqual([12.5, -40])
  expect(worldToSiteXz([12.5, -40])).toEqual([12.5, 40])
})

test('xz round-trip through the bridge sign flip is identity', () => {
  const samples: [number, number][] = [
    [0, 0],
    [1, -2],
    [-3.25, 8.5],
    [100, 0.001],
  ]
  for (const pt of samples) {
    const back = roundTripSiteXz(pt)
    expect(back[0]).toBeCloseTo(pt[0], 10)
    expect(back[1]).toBeCloseTo(pt[1], 10)
  }
})
