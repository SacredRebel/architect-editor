/**
 * Orthographic drawing layout + canvas raster (plan / section / elevation).
 * Scale is true paper scale: 1:100 means 1 m model → 1 cm paper.
 */

export type OrthoBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
}

export type DrawingKind = 'plan' | 'section' | 'elevation-n' | 'elevation-s' | 'elevation-e' | 'elevation-w'

export type DrawingLayout = {
  kind: DrawingKind
  scale: number
  dpi: number
  /** Model extent mapped to the long paper axis (metres). */
  longSideWorldM: number
  longSidePaperCm: number
  shortSideWorldM: number
  shortSidePaperCm: number
  widthPx: number
  heightPx: number
  /** metres → pixels along X of the image */
  mToPx: number
  marginPx: number
}

const MM_PER_IN = 25.4

/** Paper centimetres for a world length at scale 1:N. */
export function worldMToPaperCm(worldM: number, scale: number): number {
  return (worldM / scale) * 100
}

export function paperCmToPx(paperCm: number, dpi: number): number {
  return (paperCm / 2.54) * dpi
}

export function pxToleranceForMm(dpi: number, mm = 1): number {
  return (mm / MM_PER_IN) * dpi
}

export function boundsFromNodes(nodes: Record<string, Record<string, unknown> | undefined>): OrthoBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let minY = 0
  let maxY = 3
  for (const n of Object.values(nodes)) {
    if (!n) continue
    if (n.type === 'wall' && Array.isArray(n.start) && Array.isArray(n.end)) {
      const s = n.start as [number, number]
      const e = n.end as [number, number]
      minX = Math.min(minX, s[0], e[0])
      maxX = Math.max(maxX, s[0], e[0])
      minZ = Math.min(minZ, s[1], e[1])
      maxZ = Math.max(maxZ, s[1], e[1])
      const h = typeof n.height === 'number' ? n.height : 2.7
      maxY = Math.max(maxY, h)
    }
    if (n.type === 'slab' && Array.isArray(n.polygon)) {
      for (const p of n.polygon as [number, number][]) {
        minX = Math.min(minX, p[0])
        maxX = Math.max(maxX, p[0])
        minZ = Math.min(minZ, p[1])
        maxZ = Math.max(maxZ, p[1])
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 3 }
  }
  return { minX, maxX, minZ, maxZ, minY, maxY }
}

export function layoutOrthoDrawing(options: {
  kind: DrawingKind
  bounds: OrthoBounds
  scale: number
  dpi: number
  marginCm?: number
}): DrawingLayout {
  const { kind, bounds, scale, dpi } = options
  const marginCm = options.marginCm ?? 1.5
  const marginPx = paperCmToPx(marginCm, dpi)

  let worldW: number
  let worldH: number
  if (kind === 'plan') {
    worldW = bounds.maxX - bounds.minX
    worldH = bounds.maxZ - bounds.minZ
  } else if (kind === 'section' || kind === 'elevation-n' || kind === 'elevation-s') {
    worldW = bounds.maxX - bounds.minX
    worldH = bounds.maxY - bounds.minY
  } else {
    // elevation E/W — looking along X, show Z × Y
    worldW = bounds.maxZ - bounds.minZ
    worldH = bounds.maxY - bounds.minY
  }

  const longSideWorldM = Math.max(worldW, worldH)
  const shortSideWorldM = Math.min(worldW, worldH)
  const longSidePaperCm = worldMToPaperCm(longSideWorldM, scale)
  const shortSidePaperCm = worldMToPaperCm(shortSideWorldM, scale)
  const contentW = paperCmToPx(worldMToPaperCm(worldW, scale), dpi)
  const contentH = paperCmToPx(worldMToPaperCm(worldH, scale), dpi)
  const mToPx = paperCmToPx(worldMToPaperCm(1, scale), dpi)

  return {
    kind,
    scale,
    dpi,
    longSideWorldM,
    longSidePaperCm,
    shortSideWorldM,
    shortSidePaperCm,
    widthPx: Math.max(1, Math.round(contentW + marginPx * 2)),
    heightPx: Math.max(1, Math.round(contentH + marginPx * 2)),
    mToPx,
    marginPx: Math.round(marginPx),
  }
}

export type PlanStroke = {
  x0: number
  z0: number
  x1: number
  z1: number
  poche?: boolean
}

export function planStrokesFromNodes(
  nodes: Record<string, Record<string, unknown> | undefined>,
): PlanStroke[] {
  const strokes: PlanStroke[] = []
  for (const n of Object.values(nodes)) {
    if (!n) continue
    if (n.type === 'wall' && Array.isArray(n.start) && Array.isArray(n.end)) {
      const s = n.start as [number, number]
      const e = n.end as [number, number]
      strokes.push({ x0: s[0], z0: s[1], x1: e[0], z1: e[1], poche: true })
    }
    if (n.type === 'slab' && Array.isArray(n.polygon)) {
      const poly = n.polygon as [number, number][]
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!
        const b = poly[(i + 1) % poly.length]!
        strokes.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], poche: false })
      }
    }
  }
  return strokes
}

/**
 * Render a measured orthographic drawing to a Canvas 2D context.
 * White background, black linework, poché on wall cuts, scale bar + north on plans.
 */
export function paintOrthoDrawing(
  ctx: CanvasRenderingContext2D,
  options: {
    layout: DrawingLayout
    bounds: OrthoBounds
    strokes: PlanStroke[]
    levelName?: string
    sectionLine?: { x0: number; z0: number; x1: number; z1: number }
  },
): void {
  const { layout, bounds, strokes, levelName } = options
  const { widthPx, heightPx, marginPx, mToPx, kind, scale, dpi } = layout

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineWidth = Math.max(1, mToPx * 0.04)
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  const originX = marginPx
  const originY = heightPx - marginPx

  function mapPlan(x: number, z: number): [number, number] {
    return [originX + (x - bounds.minX) * mToPx, originY - (z - bounds.minZ) * mToPx]
  }

  function mapElevXZ(along: number, y: number): [number, number] {
    // along is X for N/S elev, Z for E/W
    const minAlong =
      kind === 'elevation-e' || kind === 'elevation-w' ? bounds.minZ : bounds.minX
    return [originX + (along - minAlong) * mToPx, originY - (y - bounds.minY) * mToPx]
  }

  if (kind === 'plan') {
    for (const s of strokes) {
      const [ax, ay] = mapPlan(s.x0, s.z0)
      const [bx, by] = mapPlan(s.x1, s.z1)
      if (s.poche) {
        ctx.lineWidth = Math.max(2, mToPx * 0.12)
      } else {
        ctx.lineWidth = Math.max(1, mToPx * 0.03)
      }
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
    }
    // North arrow
    const nx = widthPx - marginPx - 24
    const ny = marginPx + 36
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(nx, ny + 18)
    ctx.lineTo(nx, ny - 18)
    ctx.lineTo(nx - 6, ny - 6)
    ctx.moveTo(nx, ny - 18)
    ctx.lineTo(nx + 6, ny - 6)
    ctx.stroke()
    ctx.font = '12px sans-serif'
    ctx.fillText('N', nx - 4, ny - 22)
  } else {
    // Simple elevation/section: vertical wall extents as rectangles
    for (const s of strokes) {
      if (!s.poche) continue
      const along0 =
        kind === 'elevation-e' || kind === 'elevation-w'
          ? (s.z0 + s.z1) / 2
          : (s.x0 + s.x1) / 2
      const [ax, ay] = mapElevXZ(along0 - 0.1, bounds.minY)
      const [, by] = mapElevXZ(along0 + 0.1, bounds.maxY)
      ctx.fillStyle = '#000000'
      ctx.fillRect(ax, by, Math.max(2, mToPx * 0.2), ay - by)
    }
    ctx.fillStyle = '#000000'
  }

  // Scale bar (1 m or 5 m)
  const barM = layout.longSideWorldM >= 15 ? 5 : 1
  const barPx = barM * mToPx
  const bx0 = marginPx
  const by0 = heightPx - marginPx / 2
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(bx0, by0)
  ctx.lineTo(bx0 + barPx, by0)
  ctx.moveTo(bx0, by0 - 4)
  ctx.lineTo(bx0, by0 + 4)
  ctx.moveTo(bx0 + barPx, by0 - 4)
  ctx.lineTo(bx0 + barPx, by0 + 4)
  ctx.stroke()
  ctx.font = '11px sans-serif'
  ctx.fillText(`${barM} m`, bx0 + barPx / 2 - 8, by0 - 6)
  ctx.fillText(`1:${scale} · ${dpi} DPI`, bx0, marginPx / 2 + 4)
  if (levelName) ctx.fillText(levelName, bx0 + 120, marginPx / 2 + 4)

  if (options.sectionLine && kind === 'section') {
    const sl = options.sectionLine
    ctx.strokeStyle = '#666666'
    ctx.setLineDash([6, 4])
    const [ax, ay] = mapPlan(sl.x0, sl.z0)
    const [bx, by] = mapPlan(sl.x1, sl.z1)
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = '#000000'
  }
}

/** Download a canvas as PNG in the browser. */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  if (typeof document === 'undefined') return
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
