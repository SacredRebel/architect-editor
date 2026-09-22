import { describe, expect, test } from 'bun:test'
import { Box3, Mesh } from 'three'
import { DEFAULT_PIER_FOOTPRINT, PIER_HEIGHT } from '../../math/constants'
import {
  buildPierGeometry,
  footprintBounds,
  PIER_LOD_DISTANCES,
  shoelaceArea,
  simplifyFootprint,
} from './geometry'
import { HsPierNode } from './schema'

function defaultNode(overrides?: Partial<HsPierNode>): HsPierNode {
  return HsPierNode.parse({
    id: 'hs-pier_test',
    ...overrides,
  })
}

describe('DEFAULT_PIER_FOOTPRINT', () => {
  test('shoelace area is within 95–105 m²', () => {
    const area = shoelaceArea(DEFAULT_PIER_FOOTPRINT)
    expect(area).toBeGreaterThanOrEqual(95)
    expect(area).toBeLessThanOrEqual(105)
  })
})

describe('simplifyFootprint', () => {
  test('keeps at least 6 points and stays inside original bbox', () => {
    const simplified = simplifyFootprint(DEFAULT_PIER_FOOTPRINT)
    expect(simplified.length).toBeGreaterThanOrEqual(6)
    const orig = footprintBounds(DEFAULT_PIER_FOOTPRINT)
    for (const [x, z] of simplified) {
      expect(x).toBeGreaterThanOrEqual(orig.minX - 1e-9)
      expect(x).toBeLessThanOrEqual(orig.maxX + 1e-9)
      expect(z).toBeGreaterThanOrEqual(orig.minZ - 1e-9)
      expect(z).toBeLessThanOrEqual(orig.maxZ + 1e-9)
    }
  })
})

describe('buildPierGeometry', () => {
  test('LOD has 3 levels at PIER_LOD_DISTANCES', () => {
    const lod = buildPierGeometry(defaultNode())
    expect(lod.levels).toHaveLength(3)
    expect(lod.levels.map((l) => l.distance)).toEqual([...PIER_LOD_DISTANCES])
  })

  test('shaft extrude height matches node.height and impost thickness', () => {
    const height = PIER_HEIGHT
    const impostThickness = 1.0
    const node = defaultNode({ height, impostThickness })
    const lod = buildPierGeometry(node)
    const l0 = lod.levels[0]!.object
    const shaft = l0.getObjectByName('hs-pier-shaft') as Mesh | undefined
    const impost = l0.getObjectByName('hs-pier-impost') as Mesh | undefined
    expect(shaft).toBeDefined()
    expect(impost).toBeDefined()

    shaft!.updateWorldMatrix(true, true)
    const shaftWorld = new Box3().setFromObject(shaft!)
    expect(shaftWorld.max.y - shaftWorld.min.y).toBeCloseTo(height, 2)
    expect(shaftWorld.min.y).toBeCloseTo(0, 2)

    impost!.updateWorldMatrix(true, true)
    const impostWorld = new Box3().setFromObject(impost!)
    expect(impostWorld.max.y - impostWorld.min.y).toBeCloseTo(impostThickness, 2)
    expect(impostWorld.min.y).toBeCloseTo(height, 2)

    const bounds = footprintBounds(node.footprint)
    expect(impostWorld.max.x - impostWorld.min.x).toBeCloseTo(bounds.width + node.impostSize, 2)
    expect(impostWorld.max.z - impostWorld.min.z).toBeCloseTo(bounds.depth + node.impostSize, 2)
  })
})
