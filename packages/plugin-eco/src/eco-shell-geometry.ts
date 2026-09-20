import * as THREE from 'three'
import { effectiveRidgeHeights, type EcoShell } from './eco-shell-store'
import { ECO_CURVE_WALK_TOLERANCE_M } from './eco-curve-tolerance'

function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  return dx * dx + dz * dz
}

function closestOnPolyline(
  px: number,
  pz: number,
  poly: [number, number][],
): { x: number; z: number; t: number; seg: number; d: number } {
  let best = { x: poly[0]![0], z: poly[0]![1], t: 0, seg: 0, d: Infinity }
  let walked = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i]![0]
    const az = poly[i]![1]
    const bx = poly[i + 1]![0]
    const bz = poly[i + 1]![1]
    const abx = bx - ax
    const abz = bz - az
    const len2 = abx * abx + abz * abz
    const len = Math.sqrt(len2) || 1
    let u = ((px - ax) * abx + (pz - az) * abz) / len2
    u = Math.max(0, Math.min(1, u))
    const qx = ax + abx * u
    const qz = az + abz * u
    const d = Math.sqrt(dist2(px, pz, qx, qz))
    if (d < best.d) {
      best = { x: qx, z: qz, t: walked + u * len, seg: i, d }
    }
    walked += len
  }
  return best
}

function ridgeHeightAt(shell: EcoShell, tAlong: number): number {
  const poly = shell.ridge
  const hs = effectiveRidgeHeights(shell)
  if (poly.length === 0) return shell.eaveHeight
  let walked = 0
  const lengths: number[] = []
  for (let i = 0; i < poly.length - 1; i++) {
    const len = Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1])
    lengths.push(len)
    walked += len
  }
  const total = walked || 1
  let target = Math.max(0, Math.min(total, tAlong))
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!
    if (target <= len || i === lengths.length - 1) {
      const u = len < 1e-9 ? 0 : target / len
      const h0 = hs[i] ?? shell.eaveHeight
      const h1 = hs[i + 1] ?? h0
      return h0 + (h1 - h0) * u
    }
    target -= len
  }
  return hs[hs.length - 1] ?? shell.eaveHeight
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

/** Height at plan point: eave at outline, ridge height near spine, smooth curl. */
export function shellHeightAt(shell: EcoShell, x: number, z: number): number {
  const hit = closestOnPolyline(x, z, shell.ridge)
  const ridgeH = ridgeHeightAt(shell, hit.t)
  // Lateral blend: 0 at ridge, 1 at far outline
  let maxLat = 0.01
  for (const [ox, oz] of shell.outline) {
    const d = Math.sqrt(dist2(ox, oz, hit.x, hit.z))
    if (d > maxLat) maxLat = d
  }
  const lat = hit.d / maxLat
  const w = smoothstep(0, 1, lat) // 0 at ridge → 1 at eave
  // Curl: bias mid-span upward slightly vs linear
  const curl = Math.sin((1 - w) * Math.PI) * 0.15 * (ridgeH - shell.eaveHeight)
  return ridgeH * (1 - w) + shell.eaveHeight * w + curl * (1 - w)
}

/**
 * Build a two-sided shell mesh (top + bottom) plus optional ribs.
 * All parts share `material` and `userData.ecoMaterialId` so export can merge by material.
 */
export function buildShellObject3D(
  shell: EcoShell,
  material?: THREE.MeshStandardMaterial,
  ecoMaterialId?: string,
): THREE.Group {
  const group = new THREE.Group()
  group.name = `eco-shell:${shell.id}`

  const outline = closeRing(shell.outline)
  const positions: number[] = []
  const indices: number[] = []

  // Adaptive strips along ridge — always include control vertices so parametric
  // ridgeHeights peaks are exact (not undersampled by uniform t).
  const ridgeLen = polylineLength(shell.ridge)
  const minSegs = Math.max(
    2,
    shell.ridge.length - 1,
    Math.ceil(ridgeLen / Math.max(ECO_CURVE_WALK_TOLERANCE_M * 20, 0.35)),
  )
  const tSet = new Set<number>([0, 1])
  {
    let walked = 0
    const total = ridgeLen || 1
    tSet.add(0)
    for (let i = 0; i < shell.ridge.length - 1; i++) {
      walked += Math.hypot(
        shell.ridge[i + 1]![0] - shell.ridge[i]![0],
        shell.ridge[i + 1]![1] - shell.ridge[i]![1],
      )
      tSet.add(walked / total)
    }
    for (let i = 0; i <= minSegs; i++) tSet.add(i / minSegs)
  }
  const ridgeTs = [...tSet].sort((a, b) => a - b)
  const across = Math.max(8, Math.ceil(10 * Math.sqrt(shell.rise > 0 ? shell.rise : 1)))
  const grid: { x: number; y: number; z: number }[][] = []

  for (const t of ridgeTs) {
    const ridgePt = pointAlongPolyline(shell.ridge, t)
    const row: { x: number; y: number; z: number }[] = []
    const tangent = ridgeTangent(shell.ridge, t)
    const perp = { x: -tangent.z, z: tangent.x }
    const leftEdge = rayToOutline(ridgePt.x, ridgePt.z, perp.x, perp.z, outline)
    const rightEdge = rayToOutline(ridgePt.x, ridgePt.z, -perp.x, -perp.z, outline)
    for (let j = across; j >= 0; j--) {
      const u = j / across
      const x = ridgePt.x + (leftEdge.x - ridgePt.x) * (1 - u)
      const z = ridgePt.z + (leftEdge.z - ridgePt.z) * (1 - u)
      row.push({ x, y: shellHeightAt(shell, x, z), z })
    }
    for (let j = 1; j <= across; j++) {
      const u = j / across
      const x = ridgePt.x + (rightEdge.x - ridgePt.x) * u
      const z = ridgePt.z + (rightEdge.z - ridgePt.z) * u
      row.push({ x, y: shellHeightAt(shell, x, z), z })
    }
    grid.push(row)
  }

  const cols = grid[0]?.length ?? 0
  const rows = grid.length
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = grid[r]![c]!
      positions.push(p.x, p.y, p.z)
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1)
    }
  }

  const topGeo = new THREE.BufferGeometry()
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  topGeo.setIndex(indices)
  topGeo.computeVertexNormals()

  const topMat =
    material ??
    new THREE.MeshStandardMaterial({
      color: 0x6b8f71,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.05,
    })
  const topMesh = new THREE.Mesh(topGeo, topMat)
  topMesh.name = `eco-shell-top:${shell.id}`
  if (ecoMaterialId) topMesh.userData.ecoMaterialId = ecoMaterialId
  group.add(topMesh)

  // Bottom = top lowered by thickness
  const botPositions = positions.slice()
  for (let i = 1; i < botPositions.length; i += 3) {
    botPositions[i]! -= shell.thickness
  }
  const botGeo = new THREE.BufferGeometry()
  botGeo.setAttribute('position', new THREE.Float32BufferAttribute(botPositions, 3))
  // reverse winding
  const botIndex = indices.slice().reverse()
  botGeo.setIndex(botIndex)
  botGeo.computeVertexNormals()
  const botMesh = new THREE.Mesh(botGeo, material ?? topMat.clone())
  botMesh.name = `eco-shell-bot:${shell.id}`
  if (ecoMaterialId) botMesh.userData.ecoMaterialId = ecoMaterialId
  group.add(botMesh)

  if (shell.ribSpacing > 0.2) {
    addRibs(group, shell, outline, material ?? topMat, ecoMaterialId)
  }

  return group
}

function addRibs(
  group: THREE.Group,
  shell: EcoShell,
  outline: [number, number][],
  mat: THREE.Material,
  ecoMaterialId?: string,
) {
  const total = polylineLength(shell.ridge)
  const n = Math.max(1, Math.floor(total / shell.ribSpacing))
  for (let i = 1; i < n; i++) {
    const t = i / n
    const p = pointAlongPolyline(shell.ridge, t)
    const tangent = ridgeTangent(shell.ridge, t)
    const perp = { x: -tangent.z, z: tangent.x }
    const left = rayToOutline(p.x, p.z, perp.x, perp.z, outline)
    const right = rayToOutline(p.x, p.z, -perp.x, -perp.z, outline)
    // Gridshell rib: segment along the tessellated surface, not a chord under the bulge
    const segs = Math.max(
      4,
      Math.ceil(Math.hypot(right.x - left.x, right.z - left.z) / 0.4),
    )
    for (let s = 0; s < segs; s++) {
      const u0 = s / segs
      const u1 = (s + 1) / segs
      const x0 = left.x + (right.x - left.x) * u0
      const z0 = left.z + (right.z - left.z) * u0
      const x1 = left.x + (right.x - left.x) * u1
      const z1 = left.z + (right.z - left.z) * u1
      const y0 = shellHeightAt(shell, x0, z0) - 0.05
      const y1 = shellHeightAt(shell, x1, z1) - 0.05
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
      if (len < 1e-4) continue
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), mat)
      rib.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      rib.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3((x1 - x0) / len, (y1 - y0) / len, (z1 - z0) / len),
      )
      if (ecoMaterialId) rib.userData.ecoMaterialId = ecoMaterialId
      group.add(rib)
    }
  }
}

function closeRing(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) return pts
  return [...pts, a]
}

function polylineLength(poly: [number, number][]) {
  let L = 0
  for (let i = 0; i < poly.length - 1; i++) {
    L += Math.hypot(poly[i + 1]![0] - poly[i]![0], poly[i + 1]![1] - poly[i]![1])
  }
  return L
}

function pointAlongPolyline(poly: [number, number][], t01: number): { x: number; z: number } {
  const total = polylineLength(poly) || 1
  let target = Math.max(0, Math.min(1, t01)) * total
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i]![0]
    const az = poly[i]![1]
    const bx = poly[i + 1]![0]
    const bz = poly[i + 1]![1]
    const len = Math.hypot(bx - ax, bz - az)
    if (target <= len || i === poly.length - 2) {
      const u = len < 1e-9 ? 0 : target / len
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u }
    }
    target -= len
  }
  const last = poly[poly.length - 1]!
  return { x: last[0], z: last[1] }
}

function ridgeTangent(poly: [number, number][], t01: number): { x: number; z: number } {
  const total = polylineLength(poly) || 1
  let target = Math.max(0, Math.min(1, t01)) * total
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i]![0]
    const az = poly[i]![1]
    const bx = poly[i + 1]![0]
    const bz = poly[i + 1]![1]
    const len = Math.hypot(bx - ax, bz - az)
    if (target <= len || i === poly.length - 2) {
      const dx = bx - ax
      const dz = bz - az
      const L = Math.hypot(dx, dz) || 1
      return { x: dx / L, z: dz / L }
    }
    target -= len
  }
  return { x: 1, z: 0 }
}

function rayToOutline(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  outline: [number, number][],
): { x: number; z: number } {
  const len = Math.hypot(dx, dz) || 1
  const rx = dx / len
  const rz = dz / len
  let bestT = Infinity
  let hit: { x: number; z: number } | null = null
  for (let i = 0; i < outline.length - 1; i++) {
    const ax = outline[i]![0]
    const az = outline[i]![1]
    const bx = outline[i + 1]![0]
    const bz = outline[i + 1]![1]
    const inter = raySegmentIntersection(ox, oz, rx, rz, ax, az, bx, bz)
    if (inter && inter.t > 1e-4 && inter.t < bestT) {
      bestT = inter.t
      hit = { x: inter.x, z: inter.z }
    }
  }
  if (hit) return hit
  // Already on/near outline (ridge tip) — stay put
  return { x: ox, z: oz }
}

function raySegmentIntersection(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; t: number } | null {
  const ex = bx - ax
  const ez = bz - az
  const denom = dx * ez - dz * ex
  if (Math.abs(denom) < 1e-9) return null
  const fx = ax - ox
  const fz = az - oz
  const t = (fx * ez - fz * ex) / denom
  const u = (fx * dz - fz * dx) / denom
  if (t < 0 || u < 0 || u > 1) return null
  return { x: ox + dx * t, z: oz + dz * t, t }
}

/** Axis-aligned bbox of the shell surface (for acceptance tests). */
export function shellBoundingBox(shell: EcoShell): {
  min: [number, number, number]
  max: [number, number, number]
} {
  const obj = buildShellObject3D(shell)
  const box = new THREE.Box3().setFromObject(obj)
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  }
}
