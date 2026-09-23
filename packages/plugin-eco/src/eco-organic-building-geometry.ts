/**
 * H15 — build Three.js meshes for organic buildings and smooth walls.
 */

import * as THREE from 'three'
import {
  organicShellHeight,
  solarSpots,
  type OrganicPlan,
} from './eco-organic-plan'
import {
  frameAtArcLength,
  offsetPolyline,
  sampleSmoothWall,
  smoothWallSolidRuns,
  type EcoSmoothWall,
} from './eco-smooth-wall'

function meshFrom(
  name: string,
  positions: number[],
  indices: number[],
  material: THREE.Material,
  ecoMaterialId?: string,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = name
  if (ecoMaterialId) mesh.userData.ecoMaterialId = ecoMaterialId
  return mesh
}

function triangulateRing(ring: [number, number][], y: number): { positions: number[]; indices: number[] } {
  const pts = ring.slice()
  if (pts.length > 1) {
    const a = pts[0]!
    const b = pts[pts.length - 1]!
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) pts.pop()
  }
  const positions: number[] = []
  const indices: number[] = []
  if (pts.length < 3) return { positions, indices }
  let cx = 0
  let cz = 0
  for (const p of pts) {
    cx += p[0]
    cz += p[1]
  }
  cx /= pts.length
  cz /= pts.length
  positions.push(cx, y, cz)
  for (const p of pts) positions.push(p[0], y, p[1])
  for (let i = 0; i < pts.length; i++) {
    const a = i + 1
    const b = (i + 1) % pts.length + 1
    indices.push(0, a, b)
  }
  return { positions, indices }
}

export function buildSmoothWallObject3D(
  wall: EcoSmoothWall,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-smooth-wall:${wall.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({ color: 0xb8a890, roughness: 0.85, side: THREE.DoubleSide })
  const runs = smoothWallSolidRuns(wall)
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!
    const steps = Math.max(2, Math.ceil((run.endM - run.startM) / 0.3))
    for (let i = 0; i < steps; i++) {
      const aM = run.startM + ((run.endM - run.startM) * i) / steps
      const bM = run.startM + ((run.endM - run.startM) * (i + 1)) / steps
      const fa = frameAtArcLength(wall, aM)
      const fb = frameAtArcLength(wall, bM)
      const dx = fb.point[0] - fa.point[0]
      const dz = fb.point[1] - fa.point[1]
      const len = Math.hypot(dx, dz)
      if (len < 1e-4) continue
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.thickness, wall.height, len),
        mat,
      )
      mesh.position.set(
        (fa.point[0] + fb.point[0]) / 2,
        wall.height / 2,
        (fa.point[1] + fb.point[1]) / 2,
      )
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(dx / len, 0, dz / len),
      )
      mesh.name = `eco-smooth-wall:${wall.id}:${r}:${i}`
      if (ecoMaterialId) mesh.userData.ecoMaterialId = ecoMaterialId
      group.add(mesh)
    }
  }
  // Opening frames follow tangent
  for (const o of wall.openings) {
    const f = frameAtArcLength(wall, o.alongM)
    const frameH = o.headM - o.sillM
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, frameH, o.width + 0.08),
      mat,
    )
    frame.position.set(f.point[0], o.sillM + frameH / 2, f.point[1])
    frame.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(f.tangent[0], 0, f.tangent[1]),
    )
    frame.name = `eco-opening-frame:${o.id}`
    if (ecoMaterialId) frame.userData.ecoMaterialId = ecoMaterialId
    group.add(frame)
  }
  return group
}

export function buildOrganicBuildingObject3D(
  plan: OrganicPlan,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-organic:${plan.id}`
  const mat =
    material ??
    new THREE.MeshStandardMaterial({ color: 0xc4b49a, roughness: 0.8, side: THREE.DoubleSide })
  const roofMat =
    material ??
    new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.7, side: THREE.DoubleSide })

  // Floor
  const floor = triangulateRing(plan.floorRing, 0.05)
  group.add(meshFrom(`eco-organic-floor:${plan.id}`, floor.positions, floor.indices, mat, ecoMaterialId))

  // Walls
  group.add(buildSmoothWallObject3D(plan.wall, mat, ecoMaterialId))

  // Shell roof loft from pole
  const wallRing = plan.wallControls
  const pole = plan.pole
  const eaves = plan.spec.height
  const rise = plan.spec.rise
  const nu = 16
  const nv = 24
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= nu; i++) {
    const rho = i / nu
    for (let j = 0; j <= nv; j++) {
      const ang = (j / nv) * Math.PI * 2
      // Find wall radius at this angle
      let wallR = 8
      const ux = Math.cos(ang)
      const uz = Math.sin(ang)
      const closed = [...wallRing, wallRing[0]!]
      for (let k = 0; k < closed.length - 1; k++) {
        const ax = closed[k]![0]
        const az = closed[k]![1]
        const bx = closed[k + 1]![0]
        const bz = closed[k + 1]![1]
        const ex = bx - ax
        const ez = bz - az
        const denom = ux * ez - uz * ex
        if (Math.abs(denom) < 1e-9) continue
        const fx = ax - pole[0]
        const fz = az - pole[1]
        const t = (fx * ez - fz * ex) / denom
        const u = (fx * uz - fz * ux) / denom
        if (t > 0.05 && u >= 0 && u <= 1) wallR = Math.min(wallR === 8 ? t : wallR, t)
      }
      // Include overhang past wall
      const rMax = wallR + plan.spec.overhang
      const r = rho * rMax
      const x = pole[0] + ux * r
      const z = pole[1] + uz * r
      const y = organicShellHeight(pole, wallRing, x, z, eaves, rise)
      positions.push(x, y, z)
    }
  }
  const cols = nv + 1
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * cols + j
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1)
    }
  }
  group.add(meshFrom(`eco-organic-roof:${plan.id}`, positions, indices, roofMat, ecoMaterialId))

  // Solar panels
  const spots = solarSpots(pole, wallRing, eaves, rise, plan.spec.facing, plan.spec.solar)
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a4a,
    metalness: 0.4,
    roughness: 0.35,
  })
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]!
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.0), panelMat)
    panel.position.set(s.x, s.y + 0.05, s.z)
    panel.rotation.x = -((s.tilt_deg * Math.PI) / 180)
    panel.name = `eco-solar:${plan.id}:${i}`
    group.add(panel)
  }

  // Extras for round-trip
  group.userData.organic = {
    ...plan.spec,
    perimeter: plan.perimeter,
  }
  group.userData.assembly = plan.wall.assembly
  group.userData.roofAssembly = {
    roof_structure: plan.spec.structure,
    insulation: plan.spec.insulation,
  }

  void offsetPolyline
  void sampleSmoothWall
  return group
}

/** Surface area of a relaxed minimal patch (for live readout). */
export function minimalPatchAreaM2(positions: number[], indices: number[]): number {
  let area = 0
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3
    const ib = indices[i + 1]! * 3
    const ic = indices[i + 2]! * 3
    const ax = positions[ia]!
    const ay = positions[ia + 1]!
    const az = positions[ia + 2]!
    const bx = positions[ib]!
    const by = positions[ib + 1]!
    const bz = positions[ib + 2]!
    const cx = positions[ic]!
    const cy = positions[ic + 1]!
    const cz = positions[ic + 2]!
    const abx = bx - ax
    const aby = by - ay
    const abz = bz - az
    const acx = cx - ax
    const acy = cy - ay
    const acz = cz - az
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    area += 0.5 * Math.hypot(nx, ny, nz)
  }
  return area
}
