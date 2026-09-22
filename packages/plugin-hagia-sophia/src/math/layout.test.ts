import { describe, expect, test } from 'bun:test'
import { CENTRAL_SQUARE_SIDE_M, GALLERY_CONSTANTS, NAVE_LENGTH_M, NAVE_SPAN_M } from './constants'
import {
  GALLERY_LAYOUT_TOTAL,
  LAYOUT_TOTAL_COLUMNS,
  solveGalleryLayout,
  solveGreatArches,
  solveGroundFloorLayout,
  solveNaveArcadeBays,
} from './layout'

describe('solveGroundFloorLayout', () => {
  test('yields exactly 40 columns', () => {
    expect(solveGroundFloorLayout()).toHaveLength(LAYOUT_TOTAL_COLUMNS)
  })

  test('per-variant counts match documentary schedule', () => {
    const cols = solveGroundFloorLayout()
    const count = (v: string) => cols.filter((c) => c.variant === v).length
    expect(count('nave_verde')).toBe(8)
    expect(count('porphyry_exedra')).toBe(8)
    expect(count('aisle_verde')).toBe(16)
    expect(count('aisle_pillar')).toBe(8)
  })

  test('arcade rows are mirrored about X=0 at matching Z', () => {
    const arcade = solveGroundFloorLayout().filter((c) => c.variant === 'nave_verde')
    const neg = arcade.filter((c) => c.x < 0).sort((a, b) => a.z - b.z)
    const pos = arcade.filter((c) => c.x > 0).sort((a, b) => a.z - b.z)
    expect(neg).toHaveLength(4)
    expect(pos).toHaveLength(4)
    for (let i = 0; i < 4; i++) {
      expect(neg[i]!.x).toBeCloseTo(-pos[i]!.x, 12)
      expect(neg[i]!.z).toBeCloseTo(pos[i]!.z, 12)
    }
  })

  test('arcade spacing is exactly NAVE_LENGTH/5', () => {
    const bay = NAVE_LENGTH_M / 5
    const arcade = solveGroundFloorLayout()
      .filter((c) => c.variant === 'nave_verde' && c.x < 0)
      .sort((a, b) => a.z - b.z)
    for (let i = 1; i < arcade.length; i++) {
      expect(Math.abs(arcade[i]!.z - arcade[i - 1]!.z - bay)).toBeLessThan(1e-9)
    }
  })

  test('two calls are deep-equal (deterministic)', () => {
    expect(solveGroundFloorLayout()).toEqual(solveGroundFloorLayout())
  })

  test('all keys are unique', () => {
    const keys = solveGroundFloorLayout().map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('all z within ±NAVE_LENGTH/2', () => {
    const half = NAVE_LENGTH_M / 2
    for (const c of solveGroundFloorLayout()) {
      expect(c.z).toBeGreaterThanOrEqual(-half - 1e-12)
      expect(c.z).toBeLessThanOrEqual(half + 1e-12)
    }
  })
})

describe('solveGalleryLayout', () => {
  test('yields justified gallery subset count', () => {
    expect(solveGalleryLayout()).toHaveLength(GALLERY_LAYOUT_TOTAL)
    expect(GALLERY_LAYOUT_TOTAL).toBe(GALLERY_CONSTANTS.EMITTED_TOTAL)
  })

  test('arcade is 6 per side at ±NAVE_SPAN/2 with bay = NAVE_LENGTH/6', () => {
    const bay = NAVE_LENGTH_M / GALLERY_CONSTANTS.ARCADE_BAYS
    const arcadeX = NAVE_SPAN_M / 2
    const arcade = solveGalleryLayout().filter((c) => c.key.startsWith('gallery_arcade_'))
    expect(arcade).toHaveLength(12)
    const neg = arcade.filter((c) => c.x < 0).sort((a, b) => a.z - b.z)
    const pos = arcade.filter((c) => c.x > 0).sort((a, b) => a.z - b.z)
    expect(neg).toHaveLength(6)
    expect(pos).toHaveLength(6)
    for (const c of arcade) {
      expect(Math.abs(c.x)).toBeCloseTo(arcadeX, 12)
    }
    for (let i = 1; i < neg.length; i++) {
      expect(Math.abs(neg[i]!.z - neg[i - 1]!.z - bay)).toBeLessThan(1e-9)
    }
  })

  test('all keys unique and deterministic', () => {
    const a = solveGalleryLayout()
    const b = solveGalleryLayout()
    expect(a).toEqual(b)
    expect(new Set(a.map((c) => c.key)).size).toBe(a.length)
  })

  test('keys do not collide with ground layout keys', () => {
    const groundKeys = new Set(solveGroundFloorLayout().map((c) => c.key))
    for (const c of solveGalleryLayout()) {
      expect(groundKeys.has(c.key)).toBe(false)
    }
  })
})

describe('solveNaveArcadeBays', () => {
  test('yields 10 bays (5 per arcade)', () => {
    expect(solveNaveArcadeBays()).toHaveLength(10)
  })

  test('each bay span equals NAVE_LENGTH/5 and sits on an arcade line', () => {
    const bay = NAVE_LENGTH_M / 5
    const arcadeX = NAVE_SPAN_M / 2
    for (const a of solveNaveArcadeBays()) {
      expect(a.span).toBeCloseTo(bay, 12)
      expect(Math.abs(a.x)).toBeCloseTo(arcadeX, 12)
      expect(a.rotationY).toBeCloseTo(Math.PI / 2, 12)
    }
  })

  test('sides are mirrored about X=0 at matching Z', () => {
    const all = solveNaveArcadeBays()
    const neg = all.filter((a) => a.x < 0).sort((a, b) => a.z - b.z)
    const pos = all.filter((a) => a.x > 0).sort((a, b) => a.z - b.z)
    expect(neg).toHaveLength(5)
    expect(pos).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(neg[i]!.x).toBeCloseTo(-pos[i]!.x, 12)
      expect(neg[i]!.z).toBeCloseTo(pos[i]!.z, 12)
    }
  })
})

describe('solveGreatArches', () => {
  test('four edges of the pier square', () => {
    const arches = solveGreatArches()
    expect(arches).toHaveLength(4)
    expect(arches.map((a) => a.key)).toEqual(['great_e', 'great_n', 'great_s', 'great_w'])
    const half = CENTRAL_SQUARE_SIDE_M / 2
    const byKey = Object.fromEntries(arches.map((a) => [a.key, a]))
    expect(byKey.great_n!.z).toBeCloseTo(half, 12)
    expect(byKey.great_s!.z).toBeCloseTo(-half, 12)
    expect(byKey.great_e!.x).toBeCloseTo(half, 12)
    expect(byKey.great_w!.x).toBeCloseTo(-half, 12)
    expect(arches.every((a) => a.span === CENTRAL_SQUARE_SIDE_M)).toBe(true)
  })
})
