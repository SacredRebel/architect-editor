/**
 * Pure constructions for the geometry kit (H16.1).
 * Each export returns plan figures as polylines / points in metres.
 */
import { mid, PHI, SQRT2, SQRT3, type Vec2, rot } from './math'

export type Figure2D = {
  polylines: Vec2[][]
  points?: Vec2[]
  circles?: { c: Vec2; r: number }[]
  meta?: Record<string, number>
}

function distSafe(a: Vec2, b: Vec2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** 1. Two-circle: equilateral + lens. Lens height/width = √3. */
export function twoCircle(radius: number, origin: Vec2 = [0, 0]): Figure2D {
  const a: Vec2 = origin
  const b: Vec2 = [origin[0] + radius, origin[1]]
  const h = (SQRT3 / 2) * radius
  const apex: Vec2 = [origin[0] + radius / 2, origin[1] + h]
  return {
    polylines: [
      [a, b, apex, a],
      [a, apex],
      [b, apex],
    ],
    points: [a, b, apex, mid(a, b)],
    circles: [
      { c: a, r: radius },
      { c: b, r: radius },
    ],
    meta: { lensHeightOverWidth: (SQRT3 * radius) / radius, equilateralSide: radius },
  }
}

/** 2. Cord triples → right angle. */
export function cordTriple(
  unit: number,
  triple: [number, number, number] = [3, 4, 5],
  origin: Vec2 = [0, 0],
): Figure2D {
  const [a, b] = triple
  const o = origin
  const p: Vec2 = [o[0] + a * unit, o[1]]
  const q: Vec2 = [o[0], o[1] + b * unit]
  return {
    polylines: [
      [o, p],
      [o, q],
      [p, q],
    ],
    points: [o, p, q],
    meta: { rightAngleDot: (p[0] - o[0]) * (q[0] - o[0]) + (p[1] - o[1]) * (q[1] - o[1]) },
  }
}

/** 3. North–south from two equal shadows of a gnomon. */
export function equalShadows(
  gnomonHeight: number,
  morningTip: Vec2,
  eveningTip: Vec2,
  gnomonBase: Vec2 = [0, 0],
): Figure2D {
  const m = mid(morningTip, eveningTip)
  const dir: Vec2 = [eveningTip[0] - morningTip[0], eveningTip[1] - morningTip[1]]
  const len = Math.hypot(dir[0], dir[1]) || 1
  const nx = -dir[1] / len
  const ny = dir[0] / len
  const north: Vec2 = [m[0] + nx * gnomonHeight * 2, m[1] + ny * gnomonHeight * 2]
  const south: Vec2 = [m[0] - nx * gnomonHeight * 2, m[1] - ny * gnomonHeight * 2]
  const bearing =
    ((Math.atan2(north[0] - south[0], north[1] - south[1]) * 180) / Math.PI + 360) % 360
  return {
    polylines: [
      [morningTip, eveningTip],
      [south, north],
      [gnomonBase, morningTip],
      [gnomonBase, eveningTip],
    ],
    points: [gnomonBase, morningTip, eveningTip, m],
    circles: [{ c: gnomonBase, r: distSafe(gnomonBase, morningTip) }],
    meta: { northBearingDeg: bearing },
  }
}

/** 4. Square module grid n×n. */
export function squareModuleGrid(module: number, n: number, origin: Vec2 = [0, 0]): Figure2D {
  const lines: Vec2[][] = []
  for (let i = 0; i <= n; i++) {
    lines.push([
      [origin[0], origin[1] + i * module],
      [origin[0] + n * module, origin[1] + i * module],
    ])
    lines.push([
      [origin[0] + i * module, origin[1]],
      [origin[0] + i * module, origin[1] + n * module],
    ])
  }
  return { polylines: lines, meta: { cells: n * n, module } }
}

/** 5. Ad quadratum — each inscribed diamond has half the previous square's area. */
export function adQuadratum(side: number, steps: number, origin: Vec2 = [0, 0]): Figure2D {
  const lines: Vec2[][] = []
  let cx = origin[0] + side / 2
  let cy = origin[1] + side / 2
  let half = side / 2
  const areas: number[] = []
  for (let i = 0; i < steps; i++) {
    const s = half * 2
    lines.push([
      [cx - half, cy - half],
      [cx + half, cy - half],
      [cx + half, cy + half],
      [cx - half, cy + half],
      [cx - half, cy - half],
    ])
    areas.push(s * s)
    half = half / SQRT2
  }
  const ratios = areas.slice(1).map((a, i) => a / areas[i]!)
  return {
    polylines: lines,
    meta: { stepAreaRatio: ratios[0] ?? 1, steps: areas.length },
  }
}

/** 6. Root rectangle √k. */
export function rootRectangle(shortSide: number, root: 2 | 3 | 5, origin: Vec2 = [0, 0]): Figure2D {
  const long = shortSide * Math.sqrt(root)
  return {
    polylines: [
      [
        origin,
        [origin[0] + long, origin[1]],
        [origin[0] + long, origin[1] + shortSide],
        [origin[0], origin[1] + shortSide],
        origin,
      ],
    ],
    meta: { ratio: long / shortSide, expected: Math.sqrt(root) },
  }
}

/** 7. Extreme and mean (φ). */
export function extremeMean(length: number, origin: Vec2 = [0, 0]): Figure2D {
  const major = length / PHI
  const minor = length - major
  return {
    polylines: [
      [origin, [origin[0] + length, origin[1]]],
      [origin, [origin[0] + major, origin[1]]],
    ],
    points: [origin, [origin[0] + major, origin[1]], [origin[0] + length, origin[1]]],
    meta: { phiApprox: length / major, majorOverMinor: major / minor },
  }
}

/** 8. Regular pentagon — diagonal/side = φ. */
export function regularPentagon(side: number, origin: Vec2 = [0, 0]): Figure2D {
  const R = side / (2 * Math.sin(Math.PI / 5))
  const verts: Vec2[] = []
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    verts.push([origin[0] + R * Math.cos(a), origin[1] + R * Math.sin(a)])
  }
  const diag = distSafe(verts[0]!, verts[2]!)
  return {
    polylines: [
      [...verts, verts[0]!],
      [verts[0]!, verts[2]!],
    ],
    points: verts,
    meta: { diagonalOverSide: diag / side },
  }
}

/** 9. Fibonacci squares. */
export function fibonacciSquares(count: number, unit = 1, origin: Vec2 = [0, 0]): Figure2D {
  const fib = [1, 1]
  while (fib.length < count) fib.push(fib[fib.length - 1]! + fib[fib.length - 2]!)
  const lines: Vec2[][] = []
  let x = origin[0]
  let y = origin[1]
  let dir = 0
  for (let i = 0; i < count; i++) {
    const s = fib[i]! * unit
    const sq: Vec2[] = [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
      [x, y],
    ]
    lines.push(sq.map((p) => rot(p, dir * 90, [x, y])))
    if (dir % 4 === 0) x += s
    else if (dir % 4 === 1) y += s
    else if (dir % 4 === 2) x -= s
    else y -= s
    dir++
  }
  return { polylines: lines, meta: { last: fib[count - 1]! } }
}

/** 10. Logarithmic spiral (default pitch ≠ golden). */
export function logSpiral(pitch: number, turns = 3, origin: Vec2 = [0, 0], samples = 120): Figure2D {
  const pts: Vec2[] = []
  const b = Math.log(pitch) / (Math.PI / 2)
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * turns * Math.PI * 2
    const r = Math.exp(b * t)
    pts.push([origin[0] + r * Math.cos(t), origin[1] + r * Math.sin(t)])
  }
  return { polylines: [pts], meta: { pitch } }
}

/** 11. Archimedean spiral. */
export function archimedeanSpiral(
  spacing: number,
  turns: number,
  origin: Vec2 = [0, 0],
  samples = 120,
): Figure2D {
  const pts: Vec2[] = []
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * turns * Math.PI * 2
    const r = (spacing * t) / (2 * Math.PI)
    pts.push([origin[0] + r * Math.cos(t), origin[1] + r * Math.sin(t)])
  }
  return { polylines: [pts], meta: { spacing, turns } }
}

/** 12. Regular n-gon. */
export function regularPolygon(sides: number, radius: number, origin: Vec2 = [0, 0]): Figure2D {
  const n = Math.max(3, Math.min(13, Math.round(sides)))
  const verts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    verts.push([origin[0] + radius * Math.cos(a), origin[1] + radius * Math.sin(a)])
  }
  return {
    polylines: [[...verts, verts[0]!]],
    points: verts,
    meta: { sides: n, edge: distSafe(verts[0]!, verts[1]!) },
  }
}

/** 14. Hexagonal circle lattice, ring by ring. */
export function hexCircleLattice(radius: number, rings: number, origin: Vec2 = [0, 0]): Figure2D {
  const centres: Vec2[] = [origin]
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < 6; k++) {
      const baseAng = (k * Math.PI) / 3
      for (let j = 0; j < ring; j++) {
        const x =
          origin[0] +
          ring * 2 * radius * Math.cos(baseAng) +
          j * 2 * radius * Math.cos(baseAng + Math.PI / 3)
        const y =
          origin[1] +
          ring * 2 * radius * Math.sin(baseAng) +
          j * 2 * radius * Math.sin(baseAng + Math.PI / 3)
        centres.push([x, y])
      }
    }
  }
  const key = (p: Vec2) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const uniq = new Map<string, Vec2>()
  for (const c of centres) uniq.set(key(c), c)
  const pts = [...uniq.values()]
  return {
    polylines: [],
    points: pts,
    circles: pts.map((c) => ({ c, r: radius })),
    meta: { count: pts.length, rings },
  }
}

/** 18. Hanging-chain 2D guide. */
export function hangingChain(span: number, rise: number, origin: Vec2 = [0, 0], samples = 48): Figure2D {
  const a = (span * span) / (8 * Math.max(1e-6, rise))
  const pts: Vec2[] = []
  for (let i = 0; i <= samples; i++) {
    const x = -span / 2 + (span * i) / samples
    const yDrop = a * Math.cosh(x / a) - a * Math.cosh(span / (2 * a))
    const scaleY = rise / Math.max(1e-9, a * Math.cosh(span / (2 * a)) - a)
    const y = -yDrop * scaleY
    pts.push([origin[0] + x + span / 2, origin[1] + y])
  }
  return { polylines: [pts], meta: { span, rise, a } }
}

function dist3(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

/** 15. Regular solids — unit edge, vertices on a sphere. */
export function regularSolid(
  kind: 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron',
  edge: number,
): { vertices: [number, number, number][]; edges: [number, number][]; meta: Record<string, number> } {
  const v: [number, number, number][] = []
  const e: [number, number][] = []
  if (kind === 'tetrahedron') {
    // Regular tetrahedron with edge length `edge`
    const s = edge / Math.sqrt(8) // half-extent of cube that embeds the tetra
    v.push([s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s])
    e.push([0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3])
  } else if (kind === 'cube') {
    const h = edge / 2
    for (const x of [-h, h])
      for (const y of [-h, h])
        for (const z of [-h, h]) v.push([x, y, z])
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        if (Math.abs(dist3(v[i]!, v[j]!) - edge) < 1e-9) e.push([i, j])
      }
  } else if (kind === 'octahedron') {
    const h = edge / Math.SQRT2
    v.push([h, 0, 0], [-h, 0, 0], [0, h, 0], [0, -h, 0], [0, 0, h], [0, 0, -h])
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        if (Math.abs(dist3(v[i]!, v[j]!) - edge) < 1e-6) e.push([i, j])
      }
  } else if (kind === 'icosahedron') {
    const pts: [number, number, number][] = []
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        pts.push([0, s, t * PHI])
        pts.push([s, t * PHI, 0])
        pts.push([t * PHI, 0, s])
      }
    const e0 = dist3(pts[0]!, pts[2]!)
    const sc = edge / e0
    for (const p of pts) v.push([p[0] * sc, p[1] * sc, p[2] * sc])
    for (let i = 0; i < v.length; i++)
      for (let j = i + 1; j < v.length; j++) {
        if (Math.abs(dist3(v[i]!, v[j]!) - edge) < 1e-5) e.push([i, j])
      }
  } else {
    const pts: [number, number, number][] = []
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) pts.push([x, y, z])
    for (const s of [-1, 1])
      for (const t of [-1, 1]) {
        pts.push([0, s / PHI, t * PHI])
        pts.push([s / PHI, t * PHI, 0])
        pts.push([t * PHI, 0, s / PHI])
      }
    const dists = pts.flatMap((p, i) =>
      pts.slice(i + 1).map((q) => dist3(p, q)).filter((d) => d > 0.1),
    )
    const e0 = Math.min(...dists)
    const sc = edge / e0
    for (const p of pts) v.push([p[0] * sc, p[1] * sc, p[2] * sc])
    for (let i = 0; i < v.length; i++)
      for (let j = i + 1; j < v.length; j++) {
        if (Math.abs(dist3(v[i]!, v[j]!) - edge) < 1e-4) e.push([i, j])
      }
  }
  const radii = v.map((p) => Math.hypot(p[0], p[1], p[2]))
  const edgeLens = e.map(([i, j]) => dist3(v[i]!, v[j]!))
  return {
    vertices: v,
    edges: e,
    meta: {
      edgeMean: edgeLens.reduce((a, b) => a + b, 0) / Math.max(1, edgeLens.length),
      radiusSpread: Math.max(...radii) - Math.min(...radii),
    },
  }
}

/** Snap a wall endpoint to the nearest lattice point (hex circle centres). */
export function snapToLattice(point: Vec2, lattice: Vec2[], tolM = 0.001): Vec2 {
  let best = point
  let bestD = Infinity
  for (const c of lattice) {
    const d = distSafe(point, c)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return bestD <= Math.max(tolM, 1e-9) || bestD < Infinity ? best : point
}
