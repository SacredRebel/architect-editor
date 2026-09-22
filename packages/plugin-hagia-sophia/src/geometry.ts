import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Vector2,
} from 'three'
import { COLUMN_SPECS, LOD_DISTANCES } from './math/constants'
import type { HsColumnNode } from './schema'

function shaftRadiusAt(t: number, shaftRadius: number, entasis: number): number {
  // t ∈ [0,1] bottom→top; mild classical taper + entasis bulge
  return shaftRadius * (1 - 0.28 * t + entasis * Math.sin(Math.PI * t))
}

function buildShaftProfile(
  shaftHeight: number,
  shaftRadius: number,
  entasis: number,
  segments: number,
): Vector2[] {
  const pts: Vector2[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const y = t * shaftHeight
    const r = shaftRadiusAt(t, shaftRadius, entasis)
    pts.push(new Vector2(r, y))
  }
  return pts
}

function buildCapitalProfile(
  shaftTopRadius: number,
  capitalHeight: number,
  segments: number,
): Vector2[] {
  const outer = shaftTopRadius * 1.9
  const pts: Vector2[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Concave bowl flare (ease-out)
    const flare = t * t
    const r = shaftTopRadius + (outer - shaftTopRadius) * flare
    pts.push(new Vector2(r, t * capitalHeight))
  }
  return pts
}

function buildDetailLevel(
  node: HsColumnNode,
  radialSegs: number,
  profileSegs: number,
  material: MeshStandardMaterial,
  simple: boolean,
): Group {
  const group = new Group()
  const { shaftHeight, capitalHeight, shaftRadius, entasis } = node
  const plinthH = 0.15
  const abacusH = 0.12
  const abacusHalf = shaftRadius * 2.2
  const plinthHalf = shaftRadius * 2

  // Plinth sits on y=0; shaft starts above plinth
  const plinth = new Mesh(new BoxGeometry(plinthHalf, plinthH, plinthHalf), material)
  plinth.name = 'hs-plinth'
  plinth.position.y = plinthH / 2
  group.add(plinth)

  const shaftY0 = plinthH
  if (simple) {
    const midR = shaftRadiusAt(0.5, shaftRadius, entasis)
    const shaft = new Mesh(
      new CylinderGeometry(midR * 0.85, midR, shaftHeight, radialSegs),
      material,
    )
    shaft.name = 'hs-shaft'
    shaft.position.y = shaftY0 + shaftHeight / 2
    group.add(shaft)
  } else {
    const profile = buildShaftProfile(shaftHeight, shaftRadius, entasis, profileSegs)
    const shaft = new Mesh(new LatheGeometry(profile, radialSegs), material)
    shaft.name = 'hs-shaft'
    shaft.position.y = shaftY0
    group.add(shaft)
  }

  const shaftTopR = shaftRadiusAt(1, shaftRadius, entasis)
  const capitalY0 = shaftY0 + shaftHeight
  if (simple) {
    const capital = new Mesh(
      new CylinderGeometry(shaftTopR * 1.9, shaftTopR, capitalHeight, radialSegs),
      material,
    )
    capital.name = 'hs-capital'
    capital.position.y = capitalY0 + capitalHeight / 2
    group.add(capital)
  } else {
    const capProfile = buildCapitalProfile(shaftTopR, capitalHeight, Math.max(6, profileSegs / 2))
    const capital = new Mesh(new LatheGeometry(capProfile, radialSegs), material)
    capital.name = 'hs-capital'
    capital.position.y = capitalY0
    group.add(capital)
  }

  const abacus = new Mesh(new BoxGeometry(abacusHalf, abacusH, abacusHalf), material)
  abacus.name = 'hs-abacus'
  abacus.position.y = capitalY0 + capitalHeight + abacusH / 2
  group.add(abacus)

  return group
}

/**
 * Pure column builder — local-space LOD only; never sets position/rotation
 * (renderer owns the transform).
 */
export function buildColumnGeometry(node: HsColumnNode): LOD {
  const color = COLUMN_SPECS[node.variant].color
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
  })

  const lod = new LOD()
  const l0 = buildDetailLevel(node, 32, 24, material, false)
  const l1 = buildDetailLevel(node, 16, 16, material, false)
  const l2 = buildDetailLevel(node, 8, 8, material, true)

  lod.addLevel(l0, LOD_DISTANCES[0])
  lod.addLevel(l1, LOD_DISTANCES[1])
  lod.addLevel(l2, LOD_DISTANCES[2])

  return lod
}
