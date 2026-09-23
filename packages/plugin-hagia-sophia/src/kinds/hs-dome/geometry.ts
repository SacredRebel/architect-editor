import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  LOD,
  Mesh,
  MeshStandardMaterial,
  Vector2,
} from 'three'
import { sampleCatenaryMeridian } from '../../math/catenary'
import type { HsDomeMeridian, HsDomeNode } from './schema'

/** LOD distances (m): L0 full, L1 shell+drum, L2 low lathe. */
export const DOME_LOD_DISTANCES = [0, 80, 220] as const

export type DomeProfilePoint = { x: number; y: number }

/**
 * Dome meridian profile: rim (radius, 0) → crown (≈0, height).
 * height = riseRatio × diameter; hemisphere when riseRatio ≈ 0.5.
 * circular: r(t)=radius·cos(t·riseAngle), y(t)=radius·sin(t·riseAngle)·riseFactor
 * catenary: inverted hanging chain of revolution (same span=2·radius, rise=height)
 */
export function buildDomeProfile(
  radius: number,
  riseRatio: number,
  segments: number,
  meridian: HsDomeMeridian = 'circular',
): DomeProfilePoint[] {
  const height = Math.max(1e-6, riseRatio * 2 * radius)
  if (meridian === 'catenary') {
    return sampleCatenaryMeridian(radius, height, segments)
  }
  const segs = Math.max(2, segments)
  const riseAngle = Math.PI / 2
  // height = riseRatio * 2 * radius ⇒ riseFactor scales the unit hemisphere
  const riseFactor = Math.max(1e-6, 2 * riseRatio)
  const pts: DomeProfilePoint[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const x = radius * Math.cos(t * riseAngle)
    const y = radius * Math.sin(t * riseAngle) * riseFactor
    pts.push({ x, y })
  }
  return pts
}

/** Uniform window angle around the drum: i · 2π / count. */
export function windowAngle(i: number, count: number): number {
  if (count <= 0) return 0
  return (i * Math.PI * 2) / count
}

function padWindowIndex(i: number, count: number): string {
  const width = Math.max(2, String(Math.max(0, count - 1)).length)
  return String(i).padStart(width, '0')
}

function stoneMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#b8b2a6',
    roughness: 0.85,
    metalness: 0,
  })
}

function domeShellMaterial(): MeshStandardMaterial {
  const m = stoneMaterial()
  m.side = DoubleSide
  return m
}

function windowMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.85,
    metalness: 0,
  })
}

const FULL_TURN = Math.PI * 2

export function isFullDomeSector(sectorAngle: number): boolean {
  return sectorAngle >= FULL_TURN - 1e-9
}

/**
 * Window azimuth. Full sector: same as windowAngle() (start + i·2π/count).
 * Partial sector: inset (i+0.5)/count so recesses stay off the cut faces.
 */
export function sectorWindowAngle(
  i: number,
  count: number,
  sectorStart: number,
  sectorAngle: number,
): number {
  if (count <= 0) return sectorStart
  if (isFullDomeSector(sectorAngle)) return sectorStart + windowAngle(i, count)
  return sectorStart + ((i + 0.5) * sectorAngle) / count
}

function buildDomeShell(
  radius: number,
  riseRatio: number,
  segments: number,
  material: MeshStandardMaterial,
  sectorStart: number,
  sectorAngle: number,
  meridian: HsDomeMeridian = 'circular',
): Mesh {
  const profile = buildDomeProfile(radius, riseRatio, segments, meridian)
  const vecs = profile.map((p) => new Vector2(p.x, p.y))
  const radial = Math.max(12, segments * 2)
  const mesh = new Mesh(new LatheGeometry(vecs, radial, sectorStart, sectorAngle), material)
  mesh.name = meridian === 'catenary' ? 'hs-dome-shell-catenary' : 'hs-dome-shell'
  return mesh
}

function buildDrum(
  drumRadius: number,
  drumHeight: number,
  radialSegs: number,
  material: MeshStandardMaterial,
  sectorStart: number,
  sectorAngle: number,
): Mesh {
  // Open-ended ring (no caps) sitting below dome base (y=0)
  const geom = new CylinderGeometry(
    drumRadius,
    drumRadius,
    drumHeight,
    radialSegs,
    1,
    true,
    sectorStart,
    sectorAngle,
  )
  const mesh = new Mesh(geom, material)
  mesh.name = 'hs-drum-ring'
  mesh.position.y = -drumHeight / 2
  return mesh
}

function buildWindows(node: HsDomeNode, dark: MeshStandardMaterial): Mesh[] {
  const { windowCount, windowWidth, windowHeight, drumRadius, drumHeight } = node
  if (windowCount <= 0 || drumHeight <= 0) return []
  const meshes: Mesh[] = []
  const y = -drumHeight * 0.45
  const recessDepth = Math.min(0.35, node.shellThickness * 0.4)
  const full = isFullDomeSector(node.sectorAngle)
  for (let i = 0; i < windowCount; i++) {
    const a = sectorWindowAngle(i, windowCount, node.sectorStart, node.sectorAngle)
    const mesh = new Mesh(new BoxGeometry(windowWidth, windowHeight, recessDepth), dark)
    mesh.name = `hs-window-recess-${padWindowIndex(i, windowCount)}`
    const r = drumRadius - recessDepth * 0.5
    if (full) {
      // Historical full-dome convention: θ=0 at +X (cos, sin).
      mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      mesh.rotation.y = -a + Math.PI / 2
    } else {
      // Partial sweep follows lathe phi (θ=0 at +Z: sin, cos).
      mesh.position.set(Math.sin(a) * r, y, Math.cos(a) * r)
      mesh.rotation.y = a
    }
    meshes.push(mesh)
  }
  return meshes
}

function buildOculus(radius: number, material: MeshStandardMaterial, crownY: number): Mesh {
  const mesh = new Mesh(new CircleGeometry(radius, 24), material)
  mesh.name = 'hs-oculus-disc'
  mesh.position.y = crownY
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

function buildDetailLevel(
  node: HsDomeNode,
  latheSegs: number,
  radialSegs: number,
  includeWindows: boolean,
): Group {
  const group = new Group()
  const stone = stoneMaterial()
  const shellMat = domeShellMaterial()
  const dark = windowMaterial()

  const sectorStart = node.sectorStart ?? 0
  const sectorAngle = node.sectorAngle ?? Math.PI * 2
  const shell = buildDomeShell(
    node.radius,
    node.riseRatio,
    latheSegs,
    shellMat,
    sectorStart,
    sectorAngle,
    node.meridian ?? 'circular',
  )
  group.add(shell)

  if (node.drumHeight > 0) {
    group.add(
      buildDrum(node.drumRadius, node.drumHeight, radialSegs, stone, sectorStart, sectorAngle),
    )
  }

  if (includeWindows) {
    for (const w of buildWindows(node, dark)) group.add(w)
  }

  if (node.oculusRadius > 0) {
    const crownY = Math.max(1e-6, node.riseRatio * 2 * node.radius)
    group.add(buildOculus(node.oculusRadius, dark, crownY))
  }

  return group
}

/**
 * Pure dome builder — local-space LOD only; never sets group position/rotation.
 * Dome base at y=0; drum hangs below; crown at +height.
 */
export function buildDomeGeometry(node: HsDomeNode): LOD {
  const lod = new LOD()
  // L0: full detail
  lod.addLevel(buildDetailLevel(node, 32, 48, true), DOME_LOD_DISTANCES[0])
  // L1: shell + drum only, 24-seg lathe
  lod.addLevel(buildDetailLevel(node, 24, 24, false), DOME_LOD_DISTANCES[1])
  // L2: single low-seg lathe (shell + simple drum)
  lod.addLevel(buildDetailLevel(node, 10, 12, false), DOME_LOD_DISTANCES[2])
  return lod
}
