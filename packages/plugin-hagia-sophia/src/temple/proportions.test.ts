import { describe, expect, test } from 'bun:test'
import { HsArchNode } from '../kinds/hs-arch/schema'
import { HsDomeNode } from '../kinds/hs-dome/schema'
import { buildTruePendentiveGeometry } from '../kinds/hs-pendentive/geometry'
import { HsPendentiveNode } from '../kinds/hs-pendentive/schema'
import { HsPierNode } from '../kinds/hs-pier/schema'
import { buildArchOuterPoints } from '../kinds/hs-arch/geometry'
import {
  archFor,
  composeDomedBay,
  FT,
  measureDomedBay,
  PHI,
  QUADRANT_SIGNS,
  truePendentiveGrid,
} from './proportions'

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

describe('arch forms', () => {
  test('roman is a semicircle, gothic is equilateral, golden has rise : half-span = φ', () => {
    expect(archFor('roman', 6)).toEqual({ profileType: 'round', rise: 3 })
    const g = archFor('gothic', 6)
    expect(g.profileType).toBe('pointed')
    expect(g.rise).toBeCloseTo(3 * Math.sqrt(3), 12)
    expect(archFor('golden', 6).rise / 3).toBeCloseTo(PHI, 12)
  })

  test('the gothic arch drawn by ActArtech’s two-centre profile has each arc centred on the other springing', () => {
    const span = 6
    const { rise } = archFor('gothic', span)
    const pts = buildArchOuterPoints('pointed', span, rise, 48)
    // every point on the left arc is `span` from the right springing
    const left = pts.slice(0, 25)
    for (const p of left) expect(Math.hypot(p.x - span / 2, p.y)).toBeCloseTo(span, 9)
  })
})

describe('the domed bay', () => {
  const S = 20 * FT
  const parts = composeDomedBay({ span: S, bayId: 'b1' })

  test('is thirteen parts: four piers, four arches, four pendentives and a dome, all tagged with the bay', () => {
    const count = (t: string) => parts.filter((p) => p.type === t).length
    expect(parts.length).toBe(13)
    expect(count('hagia-sophia:pier')).toBe(4)
    expect(count('hagia-sophia:arch')).toBe(4)
    expect(count('hagia-sophia:pendentive')).toBe(4)
    expect(count('hagia-sophia:dome')).toBe(1)
    expect(parts.every((p) => p.metadata.templeBay === 'b1')).toBe(true)
  })

  test('every part is a valid node of its kind', () => {
    for (const p of parts) {
      const schema = {
        'hagia-sophia:pier': HsPierNode,
        'hagia-sophia:arch': HsArchNode,
        'hagia-sophia:pendentive': HsPendentiveNode,
        'hagia-sophia:dome': HsDomeNode,
      }[p.type]!
      expect(() => schema.parse(p)).not.toThrow()
    }
  })

  test('the arches’ soffits are the sphere’s semicircles: radius span/2, springing where the piers stop', () => {
    const m = measureDomedBay({ span: S })
    for (const a of parts.filter((p) => p.type === 'hagia-sophia:arch')) {
      const span = a.span as number
      const rise = a.rise as number
      const t = a.thickness as number
      expect(near(span / 2, rise)).toBe(true) // outer curve is a semicircle
      expect(near(span / 2 - t, S / 2)).toBe(true) // soffit radius is S/2
      expect(near(a.position[1], m.springing)).toBe(true)
    }
    const pier = parts.find((p) => p.type === 'hagia-sophia:pier')!
    expect(near((pier.height as number) + (pier.impostThickness as number), m.springing)).toBe(true)
  })

  test('the dome stands on the ring the pendentives make, span/2 above the springing', () => {
    const m = measureDomedBay({ span: S })
    const dome = parts.find((p) => p.type === 'hagia-sophia:dome')!
    expect(near(dome.position[1], m.springing + S / 2)).toBe(true)
    expect(near(dome.radius as number, S / 2)).toBe(true)
    expect(near(m.crown, m.springing + S / 2 + 0.5 * S)).toBe(true)
  })

  test('the same bay at the Hagia Sophia’s 31.2 m springs at 23.14 m with a ring of 40 windows', () => {
    const hs = composeDomedBay({ span: 31.2, drum: true })
    const arch = hs.find((p) => p.type === 'hagia-sophia:arch')!
    expect(arch.position[1]).toBeCloseTo(23.14, 9)
    expect(hs.find((p) => p.type === 'hagia-sophia:dome')!.windowCount).toBe(40)
  })

  test('scales: every length is a fraction of the span', () => {
    const a = measureDomedBay({ span: 5 })
    const b = measureDomedBay({ span: 10 })
    for (const k of ['springing', 'ring', 'crown', 'pier', 'outside', 'sphere'] as const) {
      expect(b[k]).toBeCloseTo(2 * a[k], 9)
    }
  })

  test('turned to a bearing of 90°, the north arch lands on the east side and every part turns with it', () => {
    const turned = composeDomedBay({ span: S, bearingDeg: 90, center: [100, -50] })
    const north = turned.find((p) => p.name === 'Arch N')!
    // north (−z) turned 90° clockwise is east (+x)
    expect(north.position[0]).toBeGreaterThan(100)
    expect(north.position[2]).toBeCloseTo(-50, 9)
    for (const p of turned) expect(p.rotation[1] - (p.name.startsWith('Arch E') || p.name.startsWith('Arch W') ? Math.PI / 2 : 0)).toBeCloseTo(-Math.PI / 2, 12)
  })

  test('a custom springing height is honoured', () => {
    const m = measureDomedBay({ span: S, springing: 10 * FT })
    expect(m.springing).toBeCloseTo(10 * FT, 12)
  })
})

describe('the true pendentive', () => {
  const S = 6
  for (const q of ['ne', 'nw', 'se', 'sw'] as const) {
    test(`${q}: lies on the sphere of radius S/√2, inside its corner of the square, below the ring and outside it`, () => {
      const { sx, sz } = QUADRANT_SIGNS[q]
      for (const row of truePendentiveGrid(S, q, 24, 12)) {
        for (const [x, y, z] of row) {
          expect(Math.hypot(x!, y!, z!)).toBeCloseTo(S / Math.SQRT2, 9)
          expect(Math.sign(x!) === sx || Math.abs(x!) < 1e-9).toBe(true)
          expect(Math.sign(z!) === sz || Math.abs(z!) < 1e-9).toBe(true)
          expect(Math.abs(x!)).toBeLessThanOrEqual(S / 2 + 1e-9)
          expect(Math.abs(z!)).toBeLessThanOrEqual(S / 2 + 1e-9)
          expect(Math.hypot(x!, z!)).toBeGreaterThanOrEqual(S / 2 - 1e-9)
          expect(y!).toBeGreaterThanOrEqual(-1e-9)
          expect(y!).toBeLessThanOrEqual(S / 2 + 1e-9)
        }
      }
    })
  }

  test('comes down to a point at the corner, and meets the ring at the arches’ crowns', () => {
    const rows = truePendentiveGrid(S, 'ne', 24, 12)
    const corner = rows[12]![12]! // a = 45°, at the square
    expect(corner[1]).toBeCloseTo(0, 6)
    expect(Math.abs(corner[0]!)).toBeCloseTo(S / 2, 9)
    expect(rows[0]![0]![1]).toBeCloseTo(S / 2, 9)
    expect(rows[24]![0]![1]).toBeCloseTo(S / 2, 9)
  })

  test('builds a mesh with one vertex per grid point', () => {
    const g = buildTruePendentiveGeometry(S, 'sw', 8, 4)
    expect(g.getAttribute('position').count).toBe(9 * 5)
    expect(g.getIndex()!.count).toBe(8 * 4 * 6)
  })
})
