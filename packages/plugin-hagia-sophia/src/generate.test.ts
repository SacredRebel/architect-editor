import { describe, expect, test } from 'bun:test'
import {
  generateArcadeArches,
  generateDomeAxis,
  generateGalleries,
  generateGreatArches,
  generateGroundFloor,
  generateSemiDomes,
  generateVaults,
} from './generate'
import { HsArchNode } from './kinds/hs-arch/schema'
import { HsDomeNode } from './kinds/hs-dome/schema'
import { HsPendentiveNode } from './kinds/hs-pendentive/schema'
import { HsPierNode } from './kinds/hs-pier/schema'
import {
  ARCADE_ARCH_CONSTANTS,
  DOME_AXIS_CONSTANTS,
  GALLERY_CONSTANTS,
  GALLERY_FLOOR_H,
  GREAT_ARCH_CONSTANTS,
  NAVE_LENGTH_M,
  NAVE_SPAN_M,
  SEMI_DOME_CONSTANTS,
} from './math/constants'
import { HsColumnNode } from './schema'

describe('generateGroundFloor', () => {
  test('default call yields 40 specs', () => {
    expect(generateGroundFloor()).toHaveLength(40)
  })

  test('every spec validates via HsColumnNode.parse', () => {
    for (const spec of generateGroundFloor()) {
      expect(() => HsColumnNode.parse(spec)).not.toThrow()
    }
  })

  test('ids are unique and deterministic across calls', () => {
    const a = generateGroundFloor()
    const b = generateGroundFloor()
    const idsA = a.map((n) => n.id)
    const idsB = b.map((n) => n.id)
    expect(new Set(idsA).size).toBe(idsA.length)
    expect(idsA).toEqual(idsB)
  })

  test('bftScale 0.5 halves shaftHeight', () => {
    const full = generateGroundFloor()
    const half = generateGroundFloor({ bftScale: 0.5 })
    expect(half).toHaveLength(full.length)
    for (let i = 0; i < full.length; i++) {
      expect(half[i]!.shaftHeight).toBeCloseTo(full[i]!.shaftHeight * 0.5, 12)
    }
  })

  test('includeVariants {aisle_pillar:false} yields 32', () => {
    const nodes = generateGroundFloor({ includeVariants: { aisle_pillar: false } })
    expect(nodes).toHaveLength(32)
    expect(nodes.every((n) => n.variant !== 'aisle_pillar')).toBe(true)
  })
})

describe('generateDomeAxis', () => {
  test('default call yields 9 specs (4 piers + 4 pendentives + 1 dome)', () => {
    expect(generateDomeAxis()).toHaveLength(9)
  })

  test('ids are unique and deterministic across calls', () => {
    const a = generateDomeAxis()
    const b = generateDomeAxis()
    const idsA = a.map((n) => n.id)
    const idsB = b.map((n) => n.id)
    expect(new Set(idsA).size).toBe(idsA.length)
    expect(idsA).toEqual(idsB)
    expect(idsA).toEqual([...idsA].sort())
  })

  test('piers sit at ±pierSquare/2 on x and z as hagia-sophia:pier', () => {
    const half = DOME_AXIS_CONSTANTS.PIER_SQUARE / 2
    const piers = generateDomeAxis().filter((n) => n.type === 'hagia-sophia:pier')
    expect(piers).toHaveLength(4)
    expect(piers.map((n) => n.id).sort()).toEqual([
      'hs-pier_ne',
      'hs-pier_nw',
      'hs-pier_se',
      'hs-pier_sw',
    ])
    const positions = piers.map((n) => n.position as [number, number, number])
    const expected = [
      [half, 0, half],
      [-half, 0, half],
      [half, 0, -half],
      [-half, 0, -half],
    ]
    for (const exp of expected) {
      expect(positions.some((p) => p[0] === exp[0] && p[1] === exp[1] && p[2] === exp[2])).toBe(
        true,
      )
    }
    for (const pier of piers) {
      expect(Math.abs((pier.position as number[])[0]!)).toBeCloseTo(15.6, 10)
      expect(Math.abs((pier.position as number[])[2]!)).toBeCloseTo(15.6, 10)
      expect(() => HsPierNode.parse(pier)).not.toThrow()
    }
  })

  test('pendentives cover all four quadrants', () => {
    const pends = generateDomeAxis().filter((n) => n.type === 'hagia-sophia:pendentive')
    expect(pends).toHaveLength(4)
    const quadrants = new Set(pends.map((n) => n.quadrant as string))
    expect(quadrants).toEqual(new Set(['ne', 'nw', 'se', 'sw']))
    for (const p of pends) {
      expect(p.position).toEqual([0, DOME_AXIS_CONSTANTS.SPRINGING_H, 0])
      expect(p.sphereRadius).toBe(DOME_AXIS_CONSTANTS.DOME_RADIUS)
      expect(() => HsPendentiveNode.parse(p)).not.toThrow()
    }
  })

  test('main dome has radius 15.55 and windowCount 40', () => {
    const dome = generateDomeAxis().find((n) => n.type === 'hagia-sophia:dome')
    expect(dome).toBeDefined()
    expect(dome!.id).toBe('hs-dome_main')
    expect(dome!.radius).toBe(15.55)
    expect(dome!.windowCount).toBe(40)
    expect(dome!.position).toEqual([
      0,
      DOME_AXIS_CONSTANTS.SPRINGING_H + DOME_AXIS_CONSTANTS.PENDENTIVE_RISE,
      0,
    ])
    expect(() => HsDomeNode.parse(dome)).not.toThrow()
  })
})

describe('generateGalleries', () => {
  test('default call yields justified gallery subset count', () => {
    expect(generateGalleries()).toHaveLength(GALLERY_CONSTANTS.EMITTED_TOTAL)
  })

  test('every spec validates via HsColumnNode.parse', () => {
    for (const spec of generateGalleries()) {
      expect(() => HsColumnNode.parse(spec)).not.toThrow()
    }
  })

  test('ids are unique, hs-gallery_ prefixed, and deterministic', () => {
    const a = generateGalleries()
    const b = generateGalleries()
    const idsA = a.map((n) => n.id)
    const idsB = b.map((n) => n.id)
    expect(new Set(idsA).size).toBe(idsA.length)
    expect(idsA).toEqual(idsB)
    expect(idsA).toEqual([...idsA].sort())
    expect(idsA.every((id) => id.startsWith('hs-gallery_'))).toBe(true)
  })

  test('no id collisions with ground-floor columns', () => {
    const groundIds = new Set(generateGroundFloor().map((n) => n.id))
    for (const n of generateGalleries()) {
      expect(groundIds.has(n.id)).toBe(false)
    }
  })

  test('all columns sit at GALLERY_FLOOR_H', () => {
    for (const n of generateGalleries()) {
      expect(n.position[1]).toBe(GALLERY_FLOOR_H)
    }
  })

  test('arcade has 6 columns per side on nave arcade lines', () => {
    const arcadeX = NAVE_SPAN_M / 2
    const bay = NAVE_LENGTH_M / GALLERY_CONSTANTS.ARCADE_BAYS
    const galleries = generateGalleries()
    const arcade = galleries.filter(
      (n) => Math.abs(Math.abs(n.position[0]) - arcadeX) < 1e-9 && n.id.includes('arcade'),
    )
    expect(arcade).toHaveLength(12)
    const neg = arcade
      .filter((n) => n.position[0] < 0)
      .sort((a, b) => a.position[2] - b.position[2])
    const pos = arcade
      .filter((n) => n.position[0] > 0)
      .sort((a, b) => a.position[2] - b.position[2])
    expect(neg).toHaveLength(GALLERY_CONSTANTS.ARCADE_COLUMNS_PER_ROW)
    expect(pos).toHaveLength(GALLERY_CONSTANTS.ARCADE_COLUMNS_PER_ROW)
    for (let i = 1; i < neg.length; i++) {
      expect(Math.abs(neg[i]!.position[2] - neg[i - 1]!.position[2] - bay)).toBeLessThan(1e-9)
    }
  })

  test('variant is gallery_verde with shorter shaft than ground nave', () => {
    const galleries = generateGalleries()
    expect(galleries.every((n) => n.variant === 'gallery_verde')).toBe(true)
    expect(galleries[0]!.shaftHeight).toBeLessThan(8.53)
  })
})

describe('generateArcadeArches', () => {
  test('default call yields 10 round arches at colonnade springing', () => {
    const arches = generateArcadeArches()
    expect(arches).toHaveLength(10)
    for (const n of arches) {
      expect(() => HsArchNode.parse(n)).not.toThrow()
      expect(n.profileType).toBe('round')
      expect(n.position[1]).toBe(ARCADE_ARCH_CONSTANTS.SPRINGING_H)
      expect(n.rise).toBeCloseTo(n.span / 2, 12)
      expect(n.id.startsWith('hs-arch_nave_')).toBe(true)
    }
  })

  test('ids are unique and identical across two calls', () => {
    const a = generateArcadeArches().map((n) => n.id)
    const b = generateArcadeArches().map((n) => n.id)
    expect(new Set(a).size).toBe(10)
    expect(a).toEqual(b)
  })
})

describe('generateGreatArches', () => {
  test('four pier-square arches at springing 23.14 m', () => {
    const arches = generateGreatArches()
    expect(arches).toHaveLength(4)
    expect(arches.map((n) => n.id).sort()).toEqual([
      'hs-arch_great_e',
      'hs-arch_great_n',
      'hs-arch_great_s',
      'hs-arch_great_w',
    ])
    for (const n of arches) {
      expect(() => HsArchNode.parse(n)).not.toThrow()
      expect(n.span).toBe(GREAT_ARCH_CONSTANTS.SPAN)
      expect(n.rise).toBe(GREAT_ARCH_CONSTANTS.RISE)
      expect(n.position[1]).toBe(GREAT_ARCH_CONSTANTS.SPRINGING_H)
    }
  })
})

describe('generateSemiDomes', () => {
  test('apse and west half-domes on the pier-square E/W edges', () => {
    const half = DOME_AXIS_CONSTANTS.PIER_SQUARE / 2
    const domes = generateSemiDomes()
    expect(domes).toHaveLength(2)
    expect(domes.map((n) => n.id)).toEqual(['hs-dome_semi_apse', 'hs-dome_semi_west'])
    for (const n of domes) {
      expect(() => HsDomeNode.parse(n)).not.toThrow()
      expect(n.sectorAngle).toBe(Math.PI)
      expect(n.sectorAngle).toBe(SEMI_DOME_CONSTANTS.SECTOR_ANGLE)
      expect(n.radius).toBe(SEMI_DOME_CONSTANTS.RADIUS)
      expect(n.position[1]).toBe(SEMI_DOME_CONSTANTS.SPRINGING_H)
    }
    expect(domes[0]!.position[2]).toBeCloseTo(half, 12)
    expect(domes[1]!.position[2]).toBeCloseTo(-half, 12)
    expect(domes[1]!.rotation[1]).toBeCloseTo(Math.PI, 12)
  })
})

describe('generateVaults', () => {
  test('16 nodes: 10 arcade + 4 great + 2 semi-domes, unique ids', () => {
    const vaults = generateVaults()
    expect(vaults).toHaveLength(16)
    const ids = vaults.map((n) => n.id)
    expect(new Set(ids).size).toBe(16)
    expect(vaults.filter((n) => n.id.startsWith('hs-arch_nave_'))).toHaveLength(10)
    expect(vaults.filter((n) => n.id.startsWith('hs-arch_great_'))).toHaveLength(4)
    expect(vaults.filter((n) => n.id.startsWith('hs-dome_semi_'))).toHaveLength(2)
    expect(vaults.filter((n) => n.type === 'hagia-sophia:arch')).toHaveLength(14)
    expect(vaults.filter((n) => n.type === 'hagia-sophia:dome')).toHaveLength(2)
    const a = generateVaults().map((n) => n.id)
    expect(a).toEqual(ids)
  })
})
