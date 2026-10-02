// The port note's equations for the roof segment (entry 6), written out as code. Nothing here
// calls the old editor: the reference cases hold these against it. The numbers in brackets
// are the note's equation numbers.
//
// Frame: the segment's own. x along the width, z along the depth (+z = front), y up; the
// origin is on the segment's base, at the middle of its footprint. Metres; the pitch in
// degrees, every other angle in radians.

export type RoofType = 'hip' | 'gable' | 'shed' | 'gambrel' | 'dutch' | 'mansard' | 'flat' | 'conical'
export type P3 = { x: number; y: number; z: number }
export type Face = P3[]

export type Seg = {
  roofType: RoofType
  width: number
  depth: number
  wallHeight: number
  pitch: number // degrees
  wallThickness: number
  deckThickness: number
  overhang: number
  shingleThickness: number
  gambrelLowerWidthRatio: number
  gambrelLowerHeightRatio: number
  mansardSteepWidthRatio: number
  mansardSteepHeightRatio: number
  dutchHipWidthRatio: number
  dutchHipHeightRatio: number
  dutchWaistLengthRatio: number
  dutchGabletRake: number
  dutchTopRakeThickness: number
  conicalStartAngle?: number // radians
  conicalSweepAngle?: number // radians, signed
  conicalFullCircle?: boolean
  position: readonly number[] // in the roof's frame
  rotation: number // radians about y
}

const TAU = Math.PI * 2
const v = (x: number, y: number, z: number): P3 => ({ x, y, z })

// The fields of a stored segment, with the defaults of the parameter table where one is absent.
export function plain(node: Partial<Seg>): Seg {
  return {
    roofType: node.roofType ?? 'gable',
    width: node.width ?? 8,
    depth: node.depth ?? 6,
    wallHeight: node.wallHeight ?? 0.5,
    pitch: node.pitch ?? 40,
    wallThickness: node.wallThickness ?? 0.1,
    deckThickness: node.deckThickness ?? 0.1,
    overhang: node.overhang ?? 0.3,
    shingleThickness: node.shingleThickness ?? 0.05,
    gambrelLowerWidthRatio: node.gambrelLowerWidthRatio ?? 0.5,
    gambrelLowerHeightRatio: node.gambrelLowerHeightRatio ?? 0.6,
    mansardSteepWidthRatio: node.mansardSteepWidthRatio ?? 0.15,
    mansardSteepHeightRatio: node.mansardSteepHeightRatio ?? 0.7,
    dutchHipWidthRatio: node.dutchHipWidthRatio ?? 0.25,
    dutchHipHeightRatio: node.dutchHipHeightRatio ?? 0.5,
    dutchWaistLengthRatio: node.dutchWaistLengthRatio ?? 0.98,
    dutchGabletRake: node.dutchGabletRake ?? 0.48,
    dutchTopRakeThickness: node.dutchTopRakeThickness ?? 0.21,
    conicalStartAngle: node.conicalStartAngle,
    conicalSweepAngle: node.conicalSweepAngle,
    conicalFullCircle: node.conicalFullCircle,
    position: node.position ?? [0, 0, 0],
    rotation: node.rotation ?? 0,
  }
}

// ------------------------------------------------------------------ (1) the segment in its roof
// A point (x, y, z) of the segment, in the roof's frame, then in the frame the roof stands in.
export function placed(point: P3, position: readonly number[], rotation: number): P3 {
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  return v(position[0]! + point.x * c + point.z * s, position[1]! + point.y, position[2]! - point.x * s + point.z * c)
}

// ------------------------------------------------------------------ (2) the slope table
export type Slope = { run: number; rise: number; tan: number; cos: number; sin: number; peak: number }

function slopeRun(s: Seg): { run: number; share: number } {
  const w = s.width > 0 ? s.width : 8
  const d = s.depth > 0 ? s.depth : 6
  const m = Math.min(w, d)
  switch (s.roofType) {
    case 'conical':
      return { run: w / 2, share: 1 }
    case 'shed':
      return { run: d, share: 1 }
    case 'gable':
      return { run: d / 2, share: 1 }
    case 'gambrel':
      return { run: (d / 2) * s.gambrelLowerWidthRatio, share: s.gambrelLowerHeightRatio }
    case 'mansard':
      return { run: m * s.mansardSteepWidthRatio, share: s.mansardSteepHeightRatio }
    case 'dutch':
      return { run: m * s.dutchHipWidthRatio, share: s.dutchHipHeightRatio }
    default:
      return { run: m / 2, share: 1 } // hip, flat
  }
}

export function slopeOf(s: Seg): Slope {
  const { run, share } = slopeRun(s)
  if (s.roofType === 'flat' || !(s.pitch > 0)) return { run, rise: 0, tan: 0, cos: 1, sin: 0, peak: 0 }
  const a = (s.pitch * Math.PI) / 180
  const tan = Math.tan(a)
  const rise = run * tan
  return { run, rise, tan, cos: Math.cos(a), sin: Math.sin(a), peak: rise / share }
}

// the pitch (degrees) that gives a wanted peak rise: the table read backwards
export function pitchFor(s: Seg, peak: number): number {
  if (s.roofType === 'flat' || peak <= 0) return 0
  const { run, share } = slopeRun(s)
  if (run <= 0) return 0
  return (Math.atan2(peak * share, run) * 180) / Math.PI
}

// ------------------------------------------------------------------ (3) one closed volume: the face list
export type Module = {
  type: RoofType
  W: number // the box: width
  D: number // the box: depth
  E: number // eave height
  R: number // rise above the eave
  B: number // base height
  iF?: number // the base rectangle drawn in from the eave rectangle: front, back, left, right
  iB?: number
  iL?: number
  iR?: number
  dutchI?: number
  w: number // the segment's own width and depth (the kinks are set out from these)
  d: number
  tan: number
  gambrelLowerWidthRatio: number
  mansardSteepWidthRatio: number
  dutchHipWidthRatio: number
  dutchHipHeightRatio: number
  dutchWaistLengthRatio: number
  dutchGabletRake: number
  dutchTopRakeThickness: number
  a0?: number // conical: start angle and signed sweep
  sweep?: number
}

export type Dutch = {
  axis: 'width' | 'depth'
  inset: number
  mid: number
  peak: number
  reach: number
  ix: number
  iz: number
  ox: number
  oz: number
}

// (3) dutch: the waist of a volume, or null when no roof face is made
export function dutchOf(m: Pick<Module, 'W' | 'D' | 'E' | 'R' | 'dutchI' | 'w' | 'd' | 'dutchHipWidthRatio' | 'dutchHipHeightRatio' | 'dutchWaistLengthRatio' | 'dutchGabletRake'>): Dutch | null {
  const limit = Math.max(0, Math.min(m.W, m.D) / 2 - 0.005)
  const inset = Math.min(Math.max(0, m.dutchI ?? Math.min(m.w, m.d) * m.dutchHipWidthRatio), limit)
  const peak = m.E + Math.max(0.001, m.R)
  const mid = m.E + m.R * m.dutchHipHeightRatio
  if (!(inset > 0.001) || !(peak > mid + 0.001)) return null
  const rake = Math.max(0, m.dutchGabletRake)
  if (m.W >= m.D) {
    const ix = Math.max(0, (m.W / 2 - inset) * m.dutchWaistLengthRatio)
    const iz = Math.max(0, m.D / 2 - inset)
    if (!(ix > 0.001 && iz > 0.001)) return null
    const reach = Math.min(rake, Math.max(0, m.W / 2 - ix) * 0.98)
    return { axis: 'width', inset, mid, peak, reach, ix, iz, ox: ix + reach, oz: iz }
  }
  const ix = Math.max(0, m.W / 2 - inset)
  const iz = Math.max(0, (m.D / 2 - inset) * m.dutchWaistLengthRatio)
  if (!(ix > 0.001 && iz > 0.001)) return null
  const reach = Math.min(rake, Math.max(0, m.D / 2 - iz) * 0.98)
  return { axis: 'depth', inset, mid, peak, reach, ix, iz, ox: ix, oz: iz + reach }
}

// (3) conical: how much of the circle is covered, and with how many sides
export function coverageOf(s: Pick<Seg, 'conicalStartAngle' | 'conicalSweepAngle' | 'conicalFullCircle'>) {
  const stored = s.conicalSweepAngle
  const whole = stored === undefined || Math.abs(stored) >= TAU - 1e-4
  if (s.conicalFullCircle ?? whole) return { full: true, start: 0, sweep: -TAU }
  return { full: false, start: s.conicalStartAngle ?? 0, sweep: stored !== undefined && Math.abs(stored) < TAU - 1e-4 ? stored : -Math.PI }
}

export function conicalSides(sweep: number): { sweep: number; full: boolean; sides: number } {
  const used = Math.max(-TAU, Math.min(TAU, Math.abs(sweep) < 1e-4 ? 1e-4 : sweep))
  const full = Math.abs(used) >= TAU - 1e-4
  return { sweep: used, full, sides: full ? 48 : Math.max(1, Math.ceil((48 * Math.abs(used)) / TAU)) }
}

// a conical segment's outline in plan (x, z): its eave points, with the centre first for a part
export function planOutline(s: Seg): [number, number][] {
  const cover = coverageOf(s)
  const { sweep, full, sides } = conicalSides(cover.sweep)
  const arc = Array.from({ length: sides + 1 }, (_, k): [number, number] => {
    const a = cover.start + (k / sides) * sweep
    return [Math.cos(a) * (s.width / 2), Math.sin(a) * (s.width / 2)]
  })
  return full ? arc.slice(0, -1) : [[0, 0], ...arc]
}

export function moduleFaces(m: Module, boxOnly = false): Face[] {
  const iF = m.iF ?? 0
  const iB = m.iB ?? 0
  const iL = m.iL ?? 0
  const iR = m.iR ?? 0
  const { W, D, E, R, B } = m
  const H = E + Math.max(0.001, R)

  if (m.type === 'conical' && !boxOnly) {
    const a0 = Number.isFinite(m.a0) ? m.a0! : 0
    const { sweep, full, sides } = conicalSides(Number.isFinite(m.sweep) ? m.sweep! : -TAU)
    const eaveRadius = Math.max(0.005, W / 2)
    const baseRadius = Math.max(0.005, eaveRadius - (iF + iB + iL + iR) / 4)
    const count = full ? sides : sides + 1
    const ring = (radius: number, y: number) =>
      Array.from({ length: count }, (_, k) => {
        const a = a0 + (k / sides) * sweep
        return v(Math.cos(a) * radius, y, Math.sin(a) * radius)
      })
    const low = ring(baseRadius, B)
    const eave = ring(eaveRadius, E)
    const lowCentre = v(0, B, 0)
    const peak = v(0, H, 0)
    const faces: Face[] = [full ? [...low].reverse() : [lowCentre, ...[...low].reverse()]]
    const next = (k: number) => (full ? (k + 1) % sides : k + 1)
    for (let k = 0; k < sides; k += 1) faces.push([low[k]!, low[next(k)]!, eave[next(k)]!, eave[k]!])
    if (R === 0) faces.push(full ? [...eave].reverse() : [v(0, E, 0), ...[...eave].reverse()])
    else for (let k = 0; k < sides; k += 1) faces.push([eave[k]!, eave[next(k)]!, peak])
    if (!full) faces.push([lowCentre, low[0]!, eave[0]!, peak], [lowCentre, peak, eave[count - 1]!, low[count - 1]!])
    return sweep > 0 ? faces.map((face) => [...face].reverse()) : faces
  }

  const b1 = v(-W / 2 + iL, B, D / 2 - iF)
  const b2 = v(W / 2 - iR, B, D / 2 - iF)
  const b3 = v(W / 2 - iR, B, -D / 2 + iB)
  const b4 = v(-W / 2 + iL, B, -D / 2 + iB)
  const e1 = v(-W / 2, E, D / 2)
  const e2 = v(W / 2, E, D / 2)
  const e3 = v(W / 2, E, -D / 2)
  const e4 = v(-W / 2, E, -D / 2)
  // the box under the eaves: front, right, back, left, then the base
  const faces: Face[] = [
    [b1, b2, e2, e1],
    [b2, b3, e3, e2],
    [b3, b4, e4, e3],
    [b4, b1, e1, e4],
    [b4, b3, b2, b1],
  ]
  if (boxOnly) return faces

  // a hip over the rectangle (tw x td) whose corners are c1..c4 (front-left, front-right, back-right, back-left)
  const hip = (tw: number, td: number, c1: P3, c2: P3, c3: P3, c4: P3) => {
    if (Math.abs(tw - td) < 0.01) {
      const r = v(0, H, 0)
      faces.push([c4, c1, r], [c1, c2, r], [c2, c3, r], [c3, c4, r])
    } else if (tw >= td) {
      const r1 = v(-tw / 2 + td / 2, H, 0)
      const r2 = v(tw / 2 - td / 2, H, 0)
      faces.push([c4, c1, r1], [c2, c3, r2], [c1, c2, r2, r1], [c3, c4, r1, r2])
    } else {
      const r1 = v(0, H, td / 2 - tw / 2)
      const r2 = v(0, H, -td / 2 + tw / 2)
      faces.push([c1, c2, r1], [c3, c4, r2], [c2, c3, r2, r1], [c4, c1, r1, r2])
    }
  }

  if (m.type === 'flat' || R === 0) {
    faces.push([e1, e2, e3, e4])
  } else if (m.type === 'gable') {
    const r1 = v(-W / 2, H, 0)
    const r2 = v(W / 2, H, 0)
    faces.push([e4, e1, r1], [e2, e3, r2], [e1, e2, r2, r1], [e3, e4, r1, r2])
  } else if (m.type === 'hip') {
    hip(W, D, e1, e2, e3, e4)
  } else if (m.type === 'shed') {
    const t1 = v(-W / 2, H, -D / 2)
    const t2 = v(W / 2, H, -D / 2)
    faces.push([e1, e2, t2, t1], [e2, e3, t2], [e3, e4, t1, t2], [e4, e1, t1])
  } else if (m.type === 'gambrel') {
    const kz = (m.d / 2) * m.gambrelLowerWidthRatio
    const kh = E + (D / 2 - kz) * m.tan
    const m1 = v(-W / 2, kh, kz)
    const m2 = v(W / 2, kh, kz)
    const m3 = v(W / 2, kh, -kz)
    const m4 = v(-W / 2, kh, -kz)
    const r1 = v(-W / 2, H, 0)
    const r2 = v(W / 2, H, 0)
    faces.push([e4, e1, m1, r1, m4], [e2, e3, m3, r2, m2], [e1, e2, m2, m1], [m1, m2, r2, r1], [e3, e4, m4, m3], [m3, m4, r1, r2])
  } else if (m.type === 'mansard') {
    const i = Math.min(m.w, m.d) * m.mansardSteepWidthRatio
    const kh = E + i * m.tan
    const m1 = v(-W / 2 + i, kh, D / 2 - i)
    const m2 = v(W / 2 - i, kh, D / 2 - i)
    const m3 = v(W / 2 - i, kh, -D / 2 + i)
    const m4 = v(-W / 2 + i, kh, -D / 2 + i)
    faces.push([e1, e2, m2, m1], [e2, e3, m3, m2], [e3, e4, m4, m3], [e4, e1, m1, m4])
    hip(W - 2 * i, D - 2 * i, m1, m2, m3, m4)
  } else if (m.type === 'dutch') {
    const dutch = dutchOf(m)
    if (!dutch) return faces // as coded: the box is left without a top
    const { mid, ix, iz, ox, oz } = dutch
    const m1 = v(-ix, mid, iz)
    const m2 = v(ix, mid, iz)
    const m3 = v(ix, mid, -iz)
    const m4 = v(-ix, mid, -iz)
    // an end slope's upper corner: halfway up the gablet's rake edge, the rake board's thickness
    // lower, then brought onto the end slope's own plane
    const lowered = (from: P3, to: P3) => v((from.x + to.x) / 2, (from.y + to.y) / 2 - Math.max(0, m.dutchTopRakeThickness), (from.z + to.z) / 2)
    const share = (y: number) => (Math.abs(mid - E) > 1e-9 ? (y - E) / (mid - E) : 0)
    if (dutch.axis === 'width') {
      const o1 = v(-ox, mid, iz)
      const o2 = v(ox, mid, iz)
      const o3 = v(ox, mid, -iz)
      const o4 = v(-ox, mid, -iz)
      const r1 = v(-ix, H, 0)
      const r2 = v(ix, H, 0)
      const q1 = v(-ix, E + R, 0)
      const q2 = v(ix, E + R, 0)
      const onEnd = (p: P3, side: number) => v(side * (W / 2 + (ox - W / 2) * share(p.y)), p.y, p.z)
      const top2 = onEnd(lowered(m2, q2), 1)
      const top3 = onEnd(lowered(m3, q2), 1)
      const top1 = onEnd(lowered(m1, q1), -1)
      const top4 = onEnd(lowered(m4, q1), -1)
      faces.push([e1, e2, o2, m2, m1, o1], [e3, e4, o4, m4, m3, o3])
      faces.push([e2, e3, o3, top3, top2, o2], [e4, e1, o1, top1, top4, o4])
      faces.push([m1, m2, r2, r1], [m3, m4, r1, r2], [m4, m1, r1], [m2, m3, r2])
    } else {
      const o1 = v(-ix, mid, oz)
      const o2 = v(ix, mid, oz)
      const o3 = v(ix, mid, -oz)
      const o4 = v(-ix, mid, -oz)
      const r1 = v(0, H, iz)
      const r2 = v(0, H, -iz)
      const q1 = v(0, E + R, iz)
      const q2 = v(0, E + R, -iz)
      const onEnd = (p: P3, side: number) => v(p.x, p.y, side * (D / 2 + (oz - D / 2) * share(p.y)))
      const top2 = onEnd(lowered(m2, q1), 1)
      const top1 = onEnd(lowered(m1, q1), 1)
      const top4 = onEnd(lowered(m4, q2), -1)
      const top3 = onEnd(lowered(m3, q2), -1)
      faces.push([e2, e3, o3, m3, m2, o2], [e4, e1, o1, m1, m4, o4])
      faces.push([e1, e2, o2, top2, top1, o1], [e3, e4, o4, top4, top3, o3])
      faces.push([m2, m3, r2, r1], [m4, m1, r1, r2], [m1, m2, r1], [m3, m4, r2])
    }
  }
  return faces
}

// the segment's own surface: the volume of its own size, nothing added
export function nominalModule(s: Seg): Module {
  const slope = slopeOf(s)
  const cover = coverageOf(s)
  return {
    type: s.roofType,
    W: s.width,
    D: s.depth,
    E: s.wallHeight,
    R: slope.peak,
    B: 0,
    dutchI: Math.min(s.width, s.depth) * s.dutchHipWidthRatio,
    w: s.width,
    d: s.depth,
    tan: slope.tan,
    gambrelLowerWidthRatio: s.gambrelLowerWidthRatio,
    mansardSteepWidthRatio: s.mansardSteepWidthRatio,
    dutchHipWidthRatio: s.dutchHipWidthRatio,
    dutchHipHeightRatio: s.dutchHipHeightRatio,
    dutchWaistLengthRatio: s.dutchWaistLengthRatio,
    dutchGabletRake: s.dutchGabletRake,
    dutchTopRakeThickness: s.dutchTopRakeThickness,
    a0: cover.start,
    sweep: cover.sweep,
  }
}

// where the top of the surface is: the two ends of the ridge, or the one peak (none: flat)
export function ridgeOf(s: Seg): P3[] {
  const A = slopeOf(s).peak
  if (s.roofType === 'flat' || A === 0) return []
  const H = s.wallHeight + Math.max(0.001, A)
  const w = s.width
  const d = s.depth
  const over = (tw: number, td: number): P3[] => {
    if (Math.abs(tw - td) < 0.01) return [v(0, H, 0)]
    if (tw >= td) return [v(-tw / 2 + td / 2, H, 0), v(tw / 2 - td / 2, H, 0)]
    return [v(0, H, td / 2 - tw / 2), v(0, H, -td / 2 + tw / 2)]
  }
  switch (s.roofType) {
    case 'gable':
    case 'gambrel':
      return [v(-w / 2, H, 0), v(w / 2, H, 0)]
    case 'shed':
      return [v(-w / 2, H, -d / 2), v(w / 2, H, -d / 2)]
    case 'hip':
      return over(w, d)
    case 'mansard': {
      const i = Math.min(w, d) * s.mansardSteepWidthRatio
      return over(w - 2 * i, d - 2 * i)
    }
    case 'dutch': {
      const dutch = dutchOf(nominalModule(s))
      if (!dutch) return []
      return dutch.axis === 'width' ? [v(-dutch.ix, H, 0), v(dutch.ix, H, 0)] : [v(0, H, dutch.iz), v(0, H, -dutch.iz)]
    }
    default:
      return [v(0, H, 0)] // conical
  }
}

// the lines the fork draws and measures on a segment, in plan (x, z): ridges, hips, breaks
export type PlanLine = [[number, number], [number, number]]

export function lineworkOf(s: Seg): { ridges: PlanLine[]; hips: PlanLine[]; breaks: PlanLine[] } {
  const hw = s.width / 2
  const hd = s.depth / 2
  const ridges: PlanLine[] = []
  const hips: PlanLine[] = []
  const breaks: PlanLine[] = []
  const e1: [number, number] = [-hw, hd]
  const e2: [number, number] = [hw, hd]
  const e3: [number, number] = [hw, -hd]
  const e4: [number, number] = [-hw, -hd]
  const hipLines = () => {
    if (Math.abs(s.width - s.depth) < 0.01) {
      hips.push([e1, [0, 0]], [e2, [0, 0]], [e3, [0, 0]], [e4, [0, 0]])
    } else if (s.width >= s.depth) {
      const r1: [number, number] = [-hw + hd, 0]
      const r2: [number, number] = [hw - hd, 0]
      ridges.push([r1, r2])
      hips.push([e1, r1], [e4, r1], [e2, r2], [e3, r2])
    } else {
      const r1: [number, number] = [0, hd - hw]
      const r2: [number, number] = [0, -hd + hw]
      ridges.push([r1, r2])
      hips.push([e1, r1], [e2, r1], [e3, r2], [e4, r2])
    }
  }
  if (s.roofType === 'gable') ridges.push([[-hw, 0], [hw, 0]])
  else if (s.roofType === 'hip') hipLines()
  else if (s.roofType === 'gambrel') {
    const kz = hd * s.gambrelLowerWidthRatio
    ridges.push([[-hw, 0], [hw, 0]])
    breaks.push([[-hw, kz], [hw, kz]], [[-hw, -kz], [hw, -kz]])
  } else if (s.roofType === 'mansard') {
    const i = Math.min(s.width, s.depth) * s.mansardSteepWidthRatio
    if (hw - i > 0.02 && hd - i > 0.02) {
      const w1: [number, number] = [-hw + i, hd - i]
      const w2: [number, number] = [hw - i, hd - i]
      const w3: [number, number] = [hw - i, -hd + i]
      const w4: [number, number] = [-hw + i, -hd + i]
      breaks.push([w1, w2], [w2, w3], [w3, w4], [w4, w1])
      hips.push([e1, w1], [e2, w2], [e3, w3], [e4, w4])
    } else hipLines()
  } else if (s.roofType === 'dutch') {
    const inset = Math.min(s.width, s.depth) * s.dutchHipWidthRatio
    const widthAxis = s.width >= s.depth
    const X = widthAxis ? Math.max(0, (hw - inset) * s.dutchWaistLengthRatio) : Math.max(0, hw - inset)
    const Z = widthAxis ? Math.max(0, hd - inset) : Math.max(0, (hd - inset) * s.dutchWaistLengthRatio)
    if (!(X > 0.02 && Z > 0.02)) hipLines()
    else {
      const w1: [number, number] = [-X, Z]
      const w2: [number, number] = [X, Z]
      const w3: [number, number] = [X, -Z]
      const w4: [number, number] = [-X, -Z]
      hips.push([e1, w1], [e2, w2], [e3, w3], [e4, w4])
      breaks.push([w1, w2], [w2, w3], [w3, w4], [w4, w1])
      ridges.push(widthAxis ? [[-X, 0], [X, 0]] : [[0, Z], [0, -Z]])
    }
  }
  return { ridges, hips, breaks }
}

// ------------------------------------------------------------------ plain geometry on a face list
export function normalOf(face: Face): P3 {
  const a = face[0]!
  const b = face[1]!
  const c = face[2]!
  const n = v(
    (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
    (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
  )
  const length = Math.hypot(n.x, n.y, n.z)
  return length > 0 ? v(n.x / length, n.y / length, n.z / length) : n
}

export function faceArea(face: Face): number {
  let x = 0
  let y = 0
  let z = 0
  const a = face[0]!
  for (let i = 1; i + 1 < face.length; i += 1) {
    const b = face[i]!
    const c = face[i + 1]!
    x += (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
    y += (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
    z += (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }
  return Math.hypot(x, y, z) / 2
}

// what a closed list of faces encloses (faces wound with their normals outwards)
export function enclosed(faces: readonly Face[]): number {
  let six = 0
  for (const face of faces) {
    const a = face[0]!
    for (let i = 1; i + 1 < face.length; i += 1) {
      const b = face[i]!
      const c = face[i + 1]!
      six += a.x * (b.y * c.z - b.z * c.y) + a.y * (b.z * c.x - b.x * c.z) + a.z * (b.x * c.y - b.y * c.x)
    }
  }
  return six / 6
}

// a face list as the fork's mesh holds it: a fan of triangles from each face's first corner
export function fanTriangles(faces: readonly Face[]): number {
  return faces.reduce((sum, face) => sum + (face.length >= 3 ? face.length - 2 : 0), 0)
}

export const TOP_NORMAL = 0.02 // a face is roof surface when its unit normal's y is above this

// ------------------------------------------------------------------ (4) the height of the surface
// The segment's own surface, exactly, from the face lists of (3): one formula per type.
// null off the footprint, and where the dutch list has no face over the point.
export function surfaceY(s: Seg, x: number, z: number): number | null {
  const slope = slopeOf(s)
  const A = slope.peak
  const wh = s.wallHeight
  // off the footprint there is no surface (a cone's footprint is tested with its sides, below)
  if (s.roofType !== 'conical' && (Math.abs(x) > s.width / 2 + 1e-12 || Math.abs(z) > s.depth / 2 + 1e-12)) return null
  if (s.roofType !== 'conical' && (s.roofType === 'flat' || A === 0)) return wh
  const R = A === 0 ? 0 : Math.max(0.001, A)
  const w = s.width
  const d = s.depth
  const ax = Math.abs(x)
  const az = Math.abs(z)
  const fromEave = Math.min(w / 2 - ax, d / 2 - az) // how far in from the nearest eave line
  switch (s.roofType) {
    case 'gable':
      return wh + ((d / 2 - az) * R) / (d / 2)
    case 'shed':
      return wh + ((d / 2 - z) * R) / d
    case 'hip':
      return wh + (fromEave * R) / (Math.min(w, d) / 2)
    case 'gambrel': {
      const kz = (d / 2) * s.gambrelLowerWidthRatio
      const kh = wh + (d / 2 - kz) * slope.tan
      return az >= kz ? wh + (d / 2 - az) * slope.tan : kh + ((kz - az) * (wh + R - kh)) / kz
    }
    case 'mansard': {
      const i = Math.min(w, d) * s.mansardSteepWidthRatio
      const kh = wh + i * slope.tan
      return fromEave <= i ? wh + fromEave * slope.tan : kh + ((fromEave - i) * (wh + R - kh)) / (Math.min(w, d) / 2 - i)
    }
    case 'conical': {
      // 48 flat sides: the height falls with the distance along the side's own middle direction
      const cover = coverageOf(s)
      const { sweep, sides } = conicalSides(cover.sweep)
      const step = sweep / sides
      const angle = Math.atan2(z, x)
      // which side the point is over: counted from the start, in steps of the sweep
      let turned: number | null = null
      for (const lap of [-2, -1, 0, 1, 2]) {
        const t = (angle + lap * TAU - cover.start) / step
        if (t >= -1e-12 && t <= sides + 1e-12) turned = t
      }
      if (turned === null) return null
      const side = Math.min(sides - 1, Math.max(0, Math.floor(turned)))
      const middle = cover.start + (side + 0.5) * step
      const along = x * Math.cos(middle) + z * Math.sin(middle)
      const apothem = (w / 2) * Math.cos(Math.abs(step) / 2)
      if (along > apothem + 1e-12) return null
      return wh + R * (1 - along / apothem)
    }
    case 'dutch': {
      const dutch = dutchOf(nominalModule(s))
      if (!dutch) return null
      const { mid, ix, iz, ox, oz } = dutch
      const along = dutch.axis === 'width' ? ax : az // along the ridge
      const across = dutch.axis === 'width' ? az : ax
      const halfLong = dutch.axis === 'width' ? w / 2 : d / 2
      const halfShort = dutch.axis === 'width' ? d / 2 : w / 2
      const il = dutch.axis === 'width' ? ix : iz // inner waist, along the ridge
      const ol = dutch.axis === 'width' ? ox : oz // outer waist, along the ridge
      const ic = dutch.axis === 'width' ? iz : ix // waist, across the ridge
      if (along <= il && across <= ic) return mid + ((ic - across) * (wh + R - mid)) / ic // the gablet
      // the long slopes: from the eave to the waist line, between the two lines eave corner -> outer waist
      const sideLimit = halfLong - ((halfLong - ol) * (halfShort - across)) / (halfShort - ic)
      if (across >= ic && along <= sideLimit) return wh + ((halfShort - across) * (mid - wh)) / (halfShort - ic)
      // the end slopes: the plane through the end eave and the outer waist line, inside its six corners
      const y = wh + ((halfLong - along) * (mid - wh)) / (halfLong - ol)
      const top = (mid + wh + A) / 2 - Math.max(0, s.dutchTopRakeThickness)
      const endLimit = halfLong - ((halfLong - ol) * (halfShort - across)) / (halfShort - ic)
      if (across >= ic) return along >= endLimit ? y : null
      // between the outer waist corner (ol, ic) and the upper corner (at half the waist): a straight edge
      const upperAlong = halfLong + (ol - halfLong) * ((top - wh) / (mid - wh))
      const edge = across >= ic / 2 ? ol + ((upperAlong - ol) * (ic - across)) / (ic / 2) : upperAlong
      return along >= edge ? y : null
    }
    default:
      return wh
  }
}

// What the fork's own helper returns (getRoofSegmentSurfaceY): the same for gable, shed, a
// square hip; a cone's true surface for conical; a rougher rule for the others.
export function helperY(s: Seg, x: number, z: number): number {
  const A = slopeOf(s).peak
  const wh = s.wallHeight
  const peak = wh + A
  if (A === 0) return wh
  const w = s.width
  const d = s.depth
  const ax = Math.abs(x)
  const az = Math.abs(z)
  switch (s.roofType) {
    case 'shed':
      return peak - ((z + d / 2) / (d || 1)) * A
    case 'hip':
      return peak - Math.max(w > 0 ? ax / (w / 2) : 0, d > 0 ? az / (d / 2) : 0) * A
    case 'conical':
      return peak - Math.min(1, Math.hypot(x, z) / Math.max(0.0001, w / 2)) * A
    case 'dutch': {
      const inset = Math.min(w, d) * s.dutchHipWidthRatio
      const lower = A * s.dutchHipHeightRatio
      const rake = Math.max(0, s.dutchGabletRake)
      if (w >= d) {
        const X = Math.max(0, (w / 2 - inset) * s.dutchWaistLengthRatio)
        const Z = Math.max(0.0001, Math.max(0, d / 2 - inset))
        const upperX = X + Math.min(rake, Math.max(0, w / 2 - X) * 0.98)
        if (ax <= upperX && az <= Z) return peak - az * ((A * (1 - s.dutchHipHeightRatio)) / Z)
        const xp = Math.max(0, ax - X) / Math.max(0.0001, w / 2 - X)
        const zp = Math.max(0, az - Z) / Math.max(0.0001, d / 2 - Z)
        return wh + lower * (1 - Math.min(1, Math.max(xp, zp)))
      }
      const X = Math.max(0.0001, Math.max(0, w / 2 - inset))
      const Z = Math.max(0, (d / 2 - inset) * s.dutchWaistLengthRatio)
      const upperZ = Z + Math.min(rake, Math.max(0, d / 2 - Z) * 0.98)
      if (ax <= X && az <= upperZ) return peak - ax * ((A * (1 - s.dutchHipHeightRatio)) / X)
      const xp = Math.max(0, ax - X) / Math.max(0.0001, w / 2 - X)
      const zp = Math.max(0, az - Z) / Math.max(0.0001, d / 2 - Z)
      return wh + lower * (1 - Math.min(1, Math.max(xp, zp)))
    }
    default:
      // gable, gambrel, mansard: one straight slope from the middle line to the front and back eaves
      return peak - (d > 0 ? az / (d / 2) : 0) * A
  }
}

// ------------------------------------------------------------------ (5) the way the surface faces
// At a plan point, as the fork's helper for things seated on the roof gives it: the unit
// vector along (dx t, 1, dz t), t the tangent of the slope there and
// (dx, dz) the way it falls.
export function normalAt(s: Seg, x: number, z: number): P3 {
  const slope = slopeOf(s)
  const unit = (dx: number, dz: number, t: number) => {
    const length = Math.hypot(dx * t, 1, dz * t)
    return v((dx * t) / length, 1 / length, (dz * t) / length)
  }
  if (slope.peak === 0 || slope.tan === 0) return v(0, 1, 0)
  const T = slope.tan
  const A = slope.peak
  const hw = s.width / 2
  const hd = s.depth / 2
  const sx = x >= 0 ? 1 : -1
  const sz = z >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const az = Math.abs(z)
  switch (s.roofType) {
    case 'gable':
      return unit(0, sz, T)
    case 'gambrel': {
      const kz = hd * s.gambrelLowerWidthRatio
      if (az <= kz) return unit(0, sz, kz > 0 ? (A * (1 - s.gambrelLowerHeightRatio)) / kz : 0)
      return unit(0, sz, T)
    }
    case 'shed':
      return unit(0, 1, T)
    case 'conical': {
      const r = Math.hypot(x, z)
      return r <= 1e-6 ? v(0, 1, 0) : unit(x / r, z / r, T)
    }
    case 'hip': {
      const frontBack = (hd > 0 ? az / hd : 0) >= (hw > 0 ? ax / hw : 0)
      return frontBack ? unit(0, sz, T) : unit(sx, 0, T)
    }
    case 'mansard': {
      const inset = Math.min(s.width, s.depth) * s.mansardSteepWidthRatio
      const frontBack = (hd > 0 ? az / hd : 0) >= (hw > 0 ? ax / hw : 0)
      const steep = frontBack ? az > hd - inset : ax > hw - inset
      const run = Math.max(0, Math.min(hw, hd) - inset)
      const t = steep ? T : run > 0 ? (A * (1 - s.mansardSteepHeightRatio)) / run : 0
      return frontBack ? unit(0, sz, t) : unit(sx, 0, t)
    }
    case 'dutch': {
      const inset = Math.min(s.width, s.depth) * s.dutchHipWidthRatio
      const lower = A * s.dutchHipHeightRatio
      const upper = A * (1 - s.dutchHipHeightRatio)
      const widthAxis = s.width >= s.depth
      const X = widthAxis ? Math.max(0, (hw - inset) * s.dutchWaistLengthRatio) : Math.max(0, hw - inset)
      const Z = widthAxis ? Math.max(0, hd - inset) : Math.max(0, (hd - inset) * s.dutchWaistLengthRatio)
      if (ax <= X && az <= Z) return widthAxis ? unit(0, sz, Z > 0 ? upper / Z : 0) : unit(sx, 0, X > 0 ? upper / X : 0)
      const tx = ax > X ? lower / Math.max(0.0001, hw - X) : 0
      const tz = az > Z ? lower / Math.max(0.0001, hd - Z) : 0
      const length = Math.hypot(sx * tx, 1, sz * tz)
      return v((sx * tx) / length, 1 / length, (sz * tz) / length)
    }
    default:
      return v(0, 1, 0)
  }
}

// the turn about that normal that points a seated thing's own +z down the slope
export function downSlopeTurn(s: Seg, x: number, z: number): number {
  const n = normalAt(s, x, z)
  return n.x === 0 && n.z === 0 ? 0 : Math.atan2(n.x * n.y, n.z)
}

// (4) the top of the shingles: the highest roof face of the shingles' own volume over the point.
// The height of a face's plane over a plan point (the plane through its first three corners
// that do not stand in one vertical plane):
export function planeY(face: Face, x: number, z: number): number | null {
  for (let i = 0; i + 2 < face.length; i += 1) {
    const a = face[i]!
    const b = face[i + 1]!
    const c = face[i + 2]!
    const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
    const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
    const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (Math.abs(ny) <= 1e-6) continue
    return a.y - (nx * (x - a.x) + nz * (z - a.z)) / ny
  }
  return null
}

function inPlan(face: Face, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = face.length - 1; i < face.length; j = i, i += 1) {
    const a = face[i]!
    const b = face[j]!
    const lengthSq = (b.x - a.x) ** 2 + (b.z - a.z) ** 2
    if (lengthSq <= 1e-12) continue // two corners in one place: no edge
    const cross = (z - a.z) * (b.x - a.x) - (x - a.x) * (b.z - a.z)
    const dot = (x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)
    if (Math.abs(cross) <= 1e-6 && dot >= -1e-6 && dot <= lengthSq + 1e-6) return true
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

// the highest roof face of a list over a plan point; when none is over it, the nearest in plan
export function topOfFaces(faces: readonly Face[], x: number, z: number): number | null {
  const tops = faces.filter((face) => face.length >= 3 && rawNormalY(face) > TOP_NORMAL)
  let best: number | null = null
  for (const face of tops) {
    if (!inPlan(face, x, z)) continue
    const y = planeY(face, x, z)
    if (y !== null && (best === null || y > best)) best = y
  }
  if (best !== null) return best
  let nearest: Face | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const face of tops) {
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i]!
      const b = face[(i + 1) % face.length]!
      const lengthSq = (b.x - a.x) ** 2 + (b.z - a.z) ** 2
      const t = lengthSq <= 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / lengthSq))
      const here = Math.hypot(x - (a.x + (b.x - a.x) * t), z - (a.z + (b.z - a.z) * t))
      if (here < distance) {
        distance = here
        nearest = face
      }
    }
  }
  return nearest ? planeY(nearest, x, z) : null
}

function rawNormalY(face: Face): number {
  const a = face[0]!
  const b = face[1]!
  const c = face[2]!
  return (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
}

// ------------------------------------------------------------------ (6) the area of the surface
export function topArea(faces: readonly Face[]): number {
  return faces.filter((face) => face.length >= 3 && normalOf(face).y > TOP_NORMAL).reduce((sum, face) => sum + faceArea(face), 0)
}

// one formula per type, for the segment's own surface (null: dutch, summed over its faces)
export function surfaceArea(s: Seg): number | null {
  const slope = slopeOf(s)
  const A = slope.peak
  const w = s.width
  const d = s.depth
  if (s.roofType === 'flat' || A === 0) {
    if (s.roofType !== 'conical') return w * d
    const { sweep, sides } = conicalSides(coverageOf(s).sweep)
    return (sides * (w / 2) ** 2 * Math.sin(Math.abs(sweep) / sides)) / 2
  }
  const R = Math.max(0.001, A)
  const steep = Math.hypot(1, slope.tan) // 1 / cos(pitch)
  switch (s.roofType) {
    case 'gable':
      return 2 * w * Math.hypot(d / 2, R)
    case 'shed':
      return w * Math.hypot(d, R)
    case 'hip':
      return w * d * Math.hypot(1, R / (Math.min(w, d) / 2))
    case 'gambrel': {
      const kz = (d / 2) * s.gambrelLowerWidthRatio
      const kh = (d / 2 - kz) * slope.tan
      return 2 * w * ((d / 2 - kz) * steep + Math.hypot(kz, R - kh))
    }
    case 'mansard': {
      const i = Math.min(w, d) * s.mansardSteepWidthRatio
      const inner = (w - 2 * i) * (d - 2 * i)
      return (w * d - inner) * steep + inner * Math.hypot(1, (R - i * slope.tan) / (Math.min(w, d) / 2 - i))
    }
    case 'conical': {
      const { sweep, sides } = conicalSides(coverageOf(s).sweep)
      const half = Math.abs(sweep) / sides / 2
      const r = w / 2
      return sides * r * Math.sin(half) * Math.hypot(r * Math.cos(half), R)
    }
    default:
      return null
  }
}

// ------------------------------------------------------------------ (7) from the surface to a solid
// The six volumes the body is cut from. Each is the volume of (3) for a grown box.
export type Volume = { module: Module; shiftZ: number; scaleX: number; scaleZ: number }

function grown(s: Seg, reach: number, lift: number, base: number, cutter: boolean): Module {
  const slope = slopeOf(s)
  const drop = reach * slope.tan
  const A = slope.peak
  return {
    ...nominalModule(s),
    W: Math.max(0.01, s.width + 2 * reach),
    D: Math.max(0.01, s.depth + 2 * reach),
    E: Math.max(0.05, s.wallHeight - drop + lift),
    R: A > 0 ? A + (s.roofType === 'shed' ? 2 : 1) * drop : A,
    B: base,
    dutchI: Math.min(s.width, s.depth) * s.dutchHipWidthRatio + (cutter ? s.deckThickness : 0),
  }
}

// the base rectangle of a shingle volume, drawn in so that its sides stand square to the slope
export function shapeInsets(type: RoofType, E: number, B: number, W: number, D: number, tan: number) {
  const inset = Math.min((E - B) * tan, Math.min(W, D) / 2 - 0.005)
  if (type === 'hip' || type === 'mansard' || type === 'dutch' || type === 'conical') return { iF: inset, iB: inset, iL: inset, iR: inset }
  if (type === 'gable' || type === 'gambrel') return { iF: inset, iB: inset, iL: 0, iR: 0 }
  if (type === 'shed') return { iF: inset, iB: 0, iL: 0, iR: 0 }
  return { iF: 0, iB: 0, iL: 0, iR: 0 }
}

export const CUTTER_GROWTH = 0.002 // every cutting volume is this much wider and deeper than drawn

export function volumesOf(s: Seg) {
  const slope = slopeOf(s)
  const A = slope.peak
  const lift = A > 0 ? s.deckThickness / slope.cos : s.deckThickness // the deck, measured straight up
  const deckReach = s.wallThickness / 2 + s.overhang * slope.cos
  const cut = (module: Module, W: number, D: number): Volume => ({ module, shiftZ: 0, scaleX: 1 + CUTTER_GROWTH / W, scaleZ: 1 + CUTTER_GROWTH / D })
  const whole = (module: Module, shiftZ = 0): Volume => ({ module, shiftZ, scaleX: 1, scaleZ: 1 })

  const wall = grown(s, s.wallThickness / 2, 0, 0, false)
  const inner = grown(s, -s.wallThickness / 2, 0, -5, false)
  const deckTop = grown(s, deckReach, lift, 0, false)
  const deckBottom = grown(s, deckReach, 0, -5, true)

  // the shingles: under them the deck's top surface, over them that surface moved out
  // along its own normal by the shingle thickness
  const bW = Math.max(0.01, s.width + 2 * deckReach)
  const bD = Math.max(0.01, s.depth + 2 * deckReach)
  const drop = deckReach * slope.tan
  const bE = s.wallHeight - drop + lift
  const bR = A > 0 ? A + (s.roofType === 'shed' ? 2 : 1) * drop : A
  const out = s.shingleThickness * slope.sin
  const up = s.shingleThickness * slope.cos
  let tW = bW
  let tD = bD
  let shiftZ = 0
  if (s.roofType === 'hip' || s.roofType === 'mansard' || s.roofType === 'dutch' || s.roofType === 'conical') {
    tW += 2 * out
    tD += 2 * out
  } else if (s.roofType === 'gable' || s.roofType === 'gambrel') {
    tD += 2 * out
  } else if (s.roofType === 'shed') {
    tD += out
    shiftZ = out / 2
  }
  const tE = bE + up
  const tR = A > 0 ? bR + out * slope.tan : bR
  const deepest = slope.tan > 0.001 ? ((Math.min(bW, bD) / 2) * 0.95) / slope.tan : 2
  const topBase = bE - Math.min(1, deepest * 0.4)
  const bottomBase = bE - Math.min(2, deepest * 0.8)
  const dutchI = Math.min(s.width, s.depth) * s.dutchHipWidthRatio
  const shingleBottom: Module = { ...nominalModule(s), W: bW, D: bD, E: bE, R: bR, B: bottomBase, ...shapeInsets(s.roofType, bE, bottomBase, bW, bD, slope.tan), dutchI: dutchI + s.shingleThickness }
  const shingleTop: Module = { ...nominalModule(s), W: tW, D: tD, E: tE, R: tR, B: topBase, ...shapeInsets(s.roofType, tE, topBase, tW, tD, slope.tan), dutchI }

  return {
    lift,
    deckReach,
    wall: whole(wall),
    inner: cut(inner, Math.max(0.01, s.width - s.wallThickness), Math.max(0.01, s.depth - s.wallThickness)),
    deckTop: whole(deckTop),
    deckBottom: cut(deckBottom, Math.max(0.01, s.width + 2 * deckReach), Math.max(0.01, s.depth + 2 * deckReach)),
    shingleTop: whole(shingleTop, shiftZ),
    shingleBottom: cut(shingleBottom, bW, bD),
  }
}

export function volumeFaces(volume: Volume): Face[] {
  return moduleFaces(volume.module).map((face) => face.map((p) => v(p.x * volume.scaleX, p.y, (p.z + volume.shiftZ) * volume.scaleZ)))
}

export type Box = { min: [number, number, number]; max: [number, number, number] }

export function boxOf(faces: readonly Face[]): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const face of faces) {
    for (const p of face) {
      const c = [p.x, p.y, p.z]
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, c[axis]!)
        max[axis] = Math.max(max[axis]!, c[axis]!)
      }
    }
  }
  return { min, max }
}

// ------------------------------------------------------------------ (8) one volume less another
// A volume is taken as convex parts: under each of its roof faces, the column from the base up
// to that face, kept inside the volume's other faces (its sides, its base, a gable end). One
// convex part less another is cut into convex pieces: for each face plane of the second in
// turn, what of the rest lies outside that plane is a piece; what lies inside goes on.
export type Plane = { n: P3; c: number } // inside: n . p <= c

function planeOf(face: Face): Plane {
  // the face's normal summed over all its edges, so that corners in one line do no harm
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i < face.length; i += 1) {
    const a = face[i]!
    const b = face[(i + 1) % face.length]!
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  }
  const length = Math.hypot(x, y, z) || 1
  const n = v(x / length, y / length, z / length)
  return { n, c: n.x * face[0]!.x + n.y * face[0]!.y + n.z * face[0]!.z }
}

const EDGE = 1e-9

function clip(faces: readonly Face[], plane: Plane): Face[] {
  const side = (p: P3) => plane.n.x * p.x + plane.n.y * p.y + plane.n.z * p.z - plane.c
  let anyOut = false
  let anyIn = false
  for (const face of faces) {
    for (const p of face) {
      const s = side(p)
      if (s > EDGE) anyOut = true
      else if (s < -EDGE) anyIn = true
    }
  }
  if (!anyOut) return faces.map((face) => [...face])
  if (!anyIn) return []
  const kept: Face[] = []
  const rim: P3[] = []
  for (const face of faces) {
    const out: P3[] = []
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i]!
      const b = face[(i + 1) % face.length]!
      const sa = side(a)
      const sb = side(b)
      if (sa <= EDGE) out.push(a)
      if ((sa < -EDGE && sb > EDGE) || (sa > EDGE && sb < -EDGE)) {
        const t = sa / (sa - sb)
        out.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t))
      }
    }
    if (out.length >= 3) kept.push(out)
    for (const p of out) if (Math.abs(side(p)) <= 1e-7) rim.push(p)
  }
  // the cut face: the rim's points in order round their middle
  const unique: P3[] = []
  for (const p of rim) if (!unique.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-7)) unique.push(p)
  if (unique.length >= 3) {
    const middle = v(
      unique.reduce((sum, p) => sum + p.x, 0) / unique.length,
      unique.reduce((sum, p) => sum + p.y, 0) / unique.length,
      unique.reduce((sum, p) => sum + p.z, 0) / unique.length,
    )
    const n = plane.n
    const seed = Math.abs(n.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0)
    const ux = v(seed.y * n.z - seed.z * n.y, seed.z * n.x - seed.x * n.z, seed.x * n.y - seed.y * n.x)
    const ul = Math.hypot(ux.x, ux.y, ux.z)
    const u = v(ux.x / ul, ux.y / ul, ux.z / ul)
    const w = v(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x)
    const angle = (p: P3) => {
      const dx = p.x - middle.x
      const dy = p.y - middle.y
      const dz = p.z - middle.z
      return Math.atan2(dx * w.x + dy * w.y + dz * w.z, dx * u.x + dy * u.y + dz * u.z)
    }
    kept.push([...unique].sort((p, q) => angle(p) - angle(q)))
  }
  return kept
}

// the convex parts of a closed volume given by its faces
export function columnsOf(faces: readonly Face[]): Face[][] {
  const planes = faces.map((face) => planeOf(face))
  const floor = Math.min(...faces.flat().map((p) => p.y)) - 1
  const parts: Face[][] = []
  faces.forEach((face, i) => {
    if (!(planes[i]!.n.y > 1e-6)) return
    const under = face.map((p) => v(p.x, floor, p.z))
    let part: Face[] = [[...face], [...under].reverse()]
    for (let k = 0; k < face.length; k += 1) {
      const next = (k + 1) % face.length
      part.push([face[next]!, face[k]!, under[k]!, under[next]!])
    }
    planes.forEach((plane, j) => {
      if (part.length > 0 && !(plane.n.y > 1e-6) && j !== i) part = clip(part, plane)
    })
    if (part.length > 0 && enclosed(part) > 1e-12) parts.push(part)
  })
  return parts
}

// a volume in parts, less another in parts
export function lessAll(first: readonly Face[][], second: readonly Face[][]): Face[][] {
  let pieces: Face[][] = first.map((piece) => piece.map((face) => [...face]))
  for (const cutter of second) {
    const box = boxOf(cutter)
    pieces = pieces.flatMap((piece) => (apart(boxOf(piece), box) ? [piece] : less(piece, cutter)))
  }
  return pieces
}

export function less(first: readonly Face[], second: readonly Face[]): Face[][] {
  const pieces: Face[][] = []
  let rest: Face[] = first.map((face) => [...face])
  for (const face of second) {
    if (rest.length === 0) break
    const plane = planeOf(face)
    const outside = clip(rest, { n: v(-plane.n.x, -plane.n.y, -plane.n.z), c: -plane.c })
    if (outside.length > 0 && enclosed(outside) > 1e-10) pieces.push(outside)
    rest = clip(rest, plane)
  }
  return pieces
}

export function piecesVolume(pieces: readonly Face[][]): number {
  return pieces.reduce((sum, piece) => sum + enclosed(piece), 0)
}

export function piecesBox(pieces: readonly Face[][]): Box {
  return boxOf(pieces.flat())
}

// the heights at which a plumb line through a plan point crosses a solid given as convex pieces
// (where one piece ends at the height another begins, the line stays inside: no crossing there)
export function crossed(pieces: readonly Face[][], x: number, z: number): number[] {
  const spans: [number, number][] = []
  for (const piece of pieces) {
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (const face of piece) {
      if (face.length < 3 || !inPlan(face, x, z)) continue
      const y = planeY(face, x, z)
      if (y === null) continue
      low = Math.min(low, y)
      high = Math.max(high, y)
    }
    if (high > low + 1e-9) spans.push([low, high])
  }
  spans.sort((p, q) => p[0] - q[0])
  const found: number[] = []
  for (const [low, high] of spans) {
    const last = found.length - 1
    if (last >= 0 && low <= found[last]! + 5e-6) found[last] = Math.max(found[last]!, high)
    else found.push(low, high)
  }
  return found
}

// (8) the body: the deck, the shingles and the hollow wall, each a volume less its cutter
export function bodyOf(s: Seg, withWall = true) {
  const volumes = volumesOf(s)
  const parts = (volume: Volume) => columnsOf(volumeFaces(volume))
  const deck = lessAll(parts(volumes.deckTop), parts(volumes.deckBottom))
  const shingles = lessAll(parts(volumes.shingleTop), parts(volumes.shingleBottom))
  const shell = withWall ? lessAll(parts(volumes.wall), parts(volumes.inner)) : []
  return { volumes, deck, shingles, shell }
}

// what two convex pieces share
export function shared(first: readonly Face[], second: readonly Face[]): Face[] {
  let rest: Face[] = first.map((face) => [...face])
  for (const face of second) {
    if (rest.length === 0) break
    rest = clip(rest, planeOf(face))
  }
  return rest
}

function apart(a: Box, b: Box): boolean {
  for (let axis = 0; axis < 3; axis += 1) if (a.max[axis]! < b.min[axis]! - 1e-9 || b.max[axis]! < a.min[axis]! - 1e-9) return true
  return false
}

// what several solids enclose together, each given as convex pieces that do not overlap one
// another: the pieces, less what two solids share, plus what three share
export function together(solids: readonly Face[][][]): number {
  let total = 0
  const boxes = solids.map((pieces) => pieces.map((piece) => boxOf(piece)))
  for (const pieces of solids) total += piecesVolume(pieces)
  for (let a = 0; a < solids.length; a += 1) {
    for (let b = a + 1; b < solids.length; b += 1) {
      solids[a]!.forEach((first, i) => {
        solids[b]!.forEach((second, j) => {
          if (apart(boxes[a]![i]!, boxes[b]![j]!)) return
          const both = shared(first, second)
          if (both.length === 0) return
          const volume = enclosed(both)
          if (!(volume > 1e-12)) return
          total -= volume
          for (let c = b + 1; c < solids.length; c += 1) {
            solids[c]!.forEach((third, k) => {
              if (apart(boxOf(both), boxes[c]![k]!)) return
              const all = shared(both, third)
              if (all.length > 0) total += Math.max(0, enclosed(all))
            })
          }
        })
      })
    }
  }
  return total
}

// ------------------------------------------------------------------ (9) the dutch rake boards
// Four boards lying in the gablet's two slopes, reaching `reach` past its end walls. Each is
// given by its upper face (four corners) and stands its thickness deep, straight down.
export function rakeBoards(s: Seg): { top: Face; thickness: number }[] {
  if (s.roofType !== 'dutch') return []
  const cover = volumesOf(s).shingleTop.module
  const thickness = s.dutchTopRakeThickness
  if (!(s.dutchGabletRake > 0.001) || !(thickness > 0.0001) || !((cover.dutchI ?? 0) > 0.001) || !(cover.R > 0.001)) return []
  const dutch = dutchOf({ ...cover, w: cover.W, d: cover.D })
  if (!dutch || !(dutch.reach > 0.001)) return []
  const boards: { top: Face; thickness: number }[] = []
  const board = (apex: P3, base: P3, outward: P3) => {
    const move = (p: P3, k: number) => v(p.x + outward.x * k, p.y + outward.y * k, p.z + outward.z * k)
    let top = [apex, base, move(base, dutch.reach), move(apex, dutch.reach)]
    let n = normalOf(top)
    if (n.y < 0) {
      top = [...top].reverse()
      n = v(-n.x, -n.y, -n.z)
    }
    boards.push({ top: top.map((p) => v(p.x + n.x * 0.0002, p.y + n.y * 0.0002, p.z + n.z * 0.0002)), thickness })
  }
  const { ix, iz, mid, peak } = dutch
  if (dutch.axis === 'width') {
    for (const side of [-1, 1]) for (const face of [1, -1]) board(v(side * ix, peak, 0), v(side * ix, mid, face * iz), v(side, 0, 0))
  } else {
    for (const side of [1, -1]) for (const face of [-1, 1]) board(v(0, peak, side * iz), v(face * ix, mid, side * iz), v(0, 0, side))
  }
  return boards
}

export function rakeBoardsBox(boards: readonly { top: Face; thickness: number }[]): Box {
  return boxOf(boards.flatMap((board) => [board.top, board.top.map((p) => v(p.x, p.y - board.thickness, p.z))]))
}

// ------------------------------------------------------------------ (10) the walls under the roof
export type WallSide = 'front' | 'back' | 'right' | 'left'

export function wallFrame(s: Seg) {
  const slope = slopeOf(s)
  const drop = (s.wallThickness / 2) * slope.tan
  const wV = Math.max(0.01, s.width + s.wallThickness)
  const dV = Math.max(0.01, s.depth + s.wallThickness)
  const eave = Math.max(0.05, s.wallHeight - drop)
  const rise = slope.peak > 0 ? slope.peak + (s.roofType === 'shed' ? 2 : 1) * drop : slope.peak
  return { wV, dV, eave, top: eave + Math.max(0.001, rise), tan: slope.tan, pitched: slope.peak > 0 }
}

// a wall face as an outline (u along the face, v up from the segment's base)
export function wallProfile(s: Seg, side: WallSide): [number, number][] {
  const { wV, dV, eave, top, tan, pitched } = wallFrame(s)
  const end = side === 'right' || side === 'left'
  const L = end ? dV : wV
  const rect = (h: number): [number, number][] => [
    [0, 0],
    [L, 0],
    [L, h],
    [0, h],
  ]
  if (!pitched) return rect(eave)
  if (s.roofType === 'gable') {
    return end
      ? [
          [0, 0],
          [L, 0],
          [L, eave],
          [L / 2, top],
          [0, eave],
        ]
      : rect(eave)
  }
  if (s.roofType === 'gambrel') {
    if (!end) return rect(eave)
    const kz = Math.min((s.depth / 2) * s.gambrelLowerWidthRatio, L / 2)
    const kh = eave + (L / 2 - kz) * tan
    return [
      [0, 0],
      [L, 0],
      [L, eave],
      [L / 2 + kz, kh],
      [L / 2, top],
      [L / 2 - kz, kh],
      [0, eave],
    ]
  }
  if (s.roofType === 'shed') {
    if (side === 'front') return rect(eave)
    if (side === 'back') return rect(top)
    return side === 'right'
      ? [
          [0, 0],
          [L, 0],
          [L, top],
          [0, eave],
        ]
      : [
          [0, 0],
          [L, 0],
          [L, eave],
          [0, top],
        ]
  }
  if (s.roofType === 'dutch') {
    const inset = Math.min(s.width, s.depth) * s.dutchHipWidthRatio
    const widthAxis = s.width >= s.depth
    if (widthAxis !== end) return rect(eave)
    // how far the gablet's foot stands in from the face's two ends
    const shoulder = widthAxis ? Math.max(0, s.depth / 2 - Math.max(0, s.depth / 2 - inset)) : Math.max(0, s.width / 2 - Math.max(0, s.width / 2 - inset))
    if (!(shoulder > 0.001) || !(Math.min(L, L - shoulder) - shoulder > 0.02)) return rect(eave)
    return [
      [0, 0],
      [L, 0],
      [L, eave],
      [Math.min(L, L - shoulder), eave],
      [L / 2, top],
      [shoulder, eave],
      [0, eave],
    ]
  }
  return rect(eave)
}

const WALL_YAW: Record<WallSide, number> = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }

// a point of a wall face (u, v, and n out from the wall's middle plane) in the segment's frame
export function wallPoint(s: Seg, side: WallSide, u: number, vUp: number, n: number): P3 {
  const { wV, dV } = wallFrame(s)
  const origin =
    side === 'front' ? v(-wV / 2, 0, s.depth / 2) : side === 'back' ? v(wV / 2, 0, -s.depth / 2) : side === 'right' ? v(s.width / 2, 0, dV / 2) : v(-s.width / 2, 0, -dV / 2)
  const c = Math.cos(WALL_YAW[side])
  const sn = Math.sin(WALL_YAW[side])
  return v(origin.x + u * c + n * sn, origin.y + vUp, origin.z - u * sn + n * c)
}

// the other way: a point of the segment as (u, v) of a wall face and its distance out from the
// wall's outer plane
export function onWall(s: Seg, side: WallSide, p: P3): { u: number; v: number; out: number } {
  const { wV, dV } = wallFrame(s)
  if (side === 'front') return { u: p.x + wV / 2, v: p.y, out: p.z - dV / 2 }
  if (side === 'back') return { u: wV / 2 - p.x, v: p.y, out: -p.z - dV / 2 }
  if (side === 'right') return { u: dV / 2 - p.z, v: p.y, out: p.x - wV / 2 }
  return { u: p.z + dV / 2, v: p.y, out: -p.x - wV / 2 }
}

type Limit = { nu: number; nv: number; c: number } // inside: nu u + nv v >= c

function limitsOf(profile: readonly [number, number][]): Limit[] {
  const limits: Limit[] = []
  for (let i = 0; i < profile.length; i += 1) {
    const a = profile[i]!
    const b = profile[(i + 1) % profile.length]!
    const du = b[0] - a[0]
    const dv = b[1] - a[1]
    const length = Math.hypot(du, dv)
    if (length < 1e-9) continue
    limits.push({ nu: -dv / length, nv: du / length, c: (-dv / length) * a[0] + (du / length) * a[1] })
  }
  return limits
}

// where the middle of a rectangle (width x height) may stand so that it lies inside the outline
export function fitRect(profile: readonly [number, number][], u: number, vUp: number, width: number, height: number, keepV = false): { u: number; v: number } | null {
  const limits = limitsOf(profile).map((l) => ({ ...l, c: l.c + (Math.abs(l.nu) * width) / 2 + (Math.abs(l.nv) * height) / 2 }))
  if (limits.length < 3) return null
  if (keepV) {
    let lo = Number.NEGATIVE_INFINITY
    let hi = Number.POSITIVE_INFINITY
    for (const l of limits) {
      const rhs = l.c - l.nv * vUp
      if (Math.abs(l.nu) < 1e-9) {
        if (rhs > 1e-4) return null
        continue
      }
      if (l.nu > 0) lo = Math.max(lo, rhs / l.nu)
      else hi = Math.min(hi, rhs / l.nu)
    }
    if (lo > hi + 1e-4) return null
    return { u: Math.min(Math.max(u, lo), hi), v: vUp }
  }
  let pu = u
  let pv = vUp
  for (let turn = 0; turn < 32; turn += 1) {
    let worst: Limit | null = null
    let by = 1e-4
    for (const l of limits) {
      const short = l.c - (l.nu * pu + l.nv * pv)
      if (short > by) {
        by = short
        worst = l
      }
    }
    if (!worst) return { u: pu, v: pv }
    pu += worst.nu * by
    pv += worst.nv * by
  }
  return limits.some((l) => l.nu * pu + l.nv * pv < l.c - 1e-3) ? null : { u: pu, v: pv }
}

// how wide a rectangle may grow from a fixed upright edge, and how high from a fixed level edge
export function widestFrom(profile: readonly [number, number][], edgeU: number, grow: number, middleV: number, height: number): number {
  let most = Number.POSITIVE_INFINITY
  for (const l of limitsOf(profile)) {
    const k = (l.nu * grow - Math.abs(l.nu)) / 2
    if (k >= -1e-9) continue
    most = Math.min(most, Math.max(0, (l.nu * edgeU + l.nv * middleV - l.c - (Math.abs(l.nv) * height) / 2) / -k))
  }
  return most
}

export function highestFrom(profile: readonly [number, number][], middleU: number, width: number, edgeV: number, grow: number): number {
  let most = Number.POSITIVE_INFINITY
  for (const l of limitsOf(profile)) {
    const k = (l.nv * grow - Math.abs(l.nv)) / 2
    if (k >= -1e-9) continue
    most = Math.min(most, Math.max(0, (l.nu * middleU + l.nv * edgeV - l.c - (Math.abs(l.nu) * width) / 2) / -k))
  }
  return most
}

// ------------------------------------------------------------------ (11) trims
export type Trim = Record<
  | 'left' | 'right' | 'front' | 'back'
  | 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight'
  | 'frontLeftX' | 'frontLeftZ' | 'frontRightX' | 'frontRightZ'
  | 'backLeftX' | 'backLeftZ' | 'backRightX' | 'backRightZ',
  number
>

const MIN_LEFT = 0.1 // what a trim must leave of a span

export function trimOf(width: number, depth: number, t: Partial<Trim> = {}): Trim {
  const some = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0)
  const pair = (a: number, b: number, most: number): [number, number] => (a + b <= most || a + b <= 0 ? [a, b] : [(a * most) / (a + b), (b * most) / (a + b)])
  const axis = (a: number | undefined, b: number | undefined, span: number) => {
    const most = Math.max(0, some(span) - MIN_LEFT)
    return pair(Math.min(some(a), most), Math.min(some(b), most), most)
  }
  const [left, right] = axis(t.left, t.right, width)
  const [back, front] = axis(t.back, t.front, depth)
  const mostX = Math.max(0, Math.max(0, some(width) - left - right) - MIN_LEFT)
  const mostZ = Math.max(0, Math.max(0, some(depth) - front - back) - MIN_LEFT)
  const corner = (both: number | undefined, x: number | undefined, z: number | undefined): [number, number] =>
    some(x) > 0 || some(z) > 0 ? [Math.min(some(x), mostX), Math.min(some(z), mostZ)] : [Math.min(some(both), mostX), Math.min(some(both), mostZ)]
  let [frontLeftX, frontLeftZ] = corner(t.frontLeft, t.frontLeftX, t.frontLeftZ)
  let [frontRightX, frontRightZ] = corner(t.frontRight, t.frontRightX, t.frontRightZ)
  let [backLeftX, backLeftZ] = corner(t.backLeft, t.backLeftX, t.backLeftZ)
  let [backRightX, backRightZ] = corner(t.backRight, t.backRightX, t.backRightZ)
  for (let turn = 0; turn < 3; turn += 1) {
    ;[frontLeftX, frontRightX] = pair(frontLeftX, frontRightX, mostX)
    ;[backLeftX, backRightX] = pair(backLeftX, backRightX, mostX)
    ;[frontLeftZ, backLeftZ] = pair(frontLeftZ, backLeftZ, mostZ)
    ;[frontRightZ, backRightZ] = pair(frontRightZ, backRightZ, mostZ)
  }
  return {
    left, right, front, back,
    frontLeft: Math.min(frontLeftX, frontLeftZ),
    frontRight: Math.min(frontRightX, frontRightZ),
    backLeft: Math.min(backLeftX, backLeftZ),
    backRight: Math.min(backRightX, backRightZ),
    frontLeftX, frontLeftZ, frontRightX, frontRightZ, backLeftX, backLeftZ, backRightX, backRightZ,
  }
}

// the plan box of what is seen from above: the shingles' edge, or a trim line where one is cut
export function topBounds(s: Seg, t: Partial<Trim> = {}) {
  const slope = slopeOf(s)
  const width = s.width > 0 ? s.width : 8
  const depth = s.depth > 0 ? s.depth : 6
  const trim = trimOf(width, depth, t)
  const reach = Math.max(0, s.wallThickness) / 2 + Math.max(0, s.overhang) * slope.cos
  const out = Math.max(0, s.shingleThickness) * slope.sin
  let xReach = reach
  let front = reach
  let back = reach
  if (s.roofType === 'hip' || s.roofType === 'conical' || s.roofType === 'mansard' || s.roofType === 'dutch') {
    xReach += out
    front += out
    back += out
  } else if (s.roofType === 'gable' || s.roofType === 'gambrel') {
    front += out
    back += out
  } else if (s.roofType === 'shed' && slope.peak > 0) {
    front += out
  }
  let minX = trim.left > 0 ? -width / 2 + trim.left : -width / 2 - xReach
  let maxX = trim.right > 0 ? width / 2 - trim.right : width / 2 + xReach
  let minZ = trim.back > 0 ? -depth / 2 + trim.back : -depth / 2 - back
  let maxZ = trim.front > 0 ? depth / 2 - trim.front : depth / 2 + front
  const has = (x: number, z: number) => x > 0 && z > 0
  if (has(trim.frontLeftX, trim.frontLeftZ) && maxZ - trim.frontLeftZ < 0) minX = Math.max(minX, minX + (trim.frontLeftX * (trim.frontLeftZ - maxZ)) / trim.frontLeftZ)
  if (has(trim.backLeftX, trim.backLeftZ) && minZ + trim.backLeftZ > 0) minX = Math.max(minX, minX + (trim.backLeftX * (trim.backLeftZ + minZ)) / trim.backLeftZ)
  if (has(trim.frontRightX, trim.frontRightZ) && maxZ - trim.frontRightZ < 0) maxX = Math.min(maxX, maxX - (trim.frontRightX * (trim.frontRightZ - maxZ)) / trim.frontRightZ)
  if (has(trim.backRightX, trim.backRightZ) && minZ + trim.backRightZ > 0) maxX = Math.min(maxX, maxX - (trim.backRightX * (trim.backRightZ + minZ)) / trim.backRightZ)
  if (has(trim.frontLeftX, trim.frontLeftZ) && minX + trim.frontLeftX > 0) maxZ = Math.min(maxZ, maxZ - (trim.frontLeftZ * (trim.frontLeftX + minX)) / trim.frontLeftX)
  if (has(trim.frontRightX, trim.frontRightZ) && maxX - trim.frontRightX < 0) maxZ = Math.min(maxZ, maxZ - (trim.frontRightZ * (trim.frontRightX - maxX)) / trim.frontRightX)
  if (has(trim.backLeftX, trim.backLeftZ) && minX + trim.backLeftX > 0) minZ = Math.max(minZ, minZ + (trim.backLeftZ * (trim.backLeftX + minX)) / trim.backLeftX)
  if (has(trim.backRightX, trim.backRightZ) && maxX - trim.backRightX < 0) minZ = Math.max(minZ, minZ + (trim.backRightZ * (trim.backRightX - maxX)) / trim.backRightX)
  return { minX, maxX, minZ, maxZ, width: Math.max(0.01, maxX - minX), depth: Math.max(0.01, maxZ - minZ) }
}

// what a trim leaves of the body: on the kept side of each plane (a side trim's plane stands
// 0.002 inside the trim line; a corner's 0.002 inside the line between its two points, each of
// which is itself set 0.002 further in)
export const TRIM_OVERLAP = 0.002

export function trimPlanes(s: Seg, t: Partial<Trim>): Plane[] {
  const trim = trimOf(s.width, s.depth, t)
  const planes: Plane[] = []
  const leftX = -s.width / 2 + trim.left
  const rightX = s.width / 2 - trim.right
  const frontZ = s.depth / 2 - trim.front
  const backZ = -s.depth / 2 + trim.back
  if (trim.left > 0) planes.push({ n: v(-1, 0, 0), c: -(leftX + TRIM_OVERLAP) })
  if (trim.right > 0) planes.push({ n: v(1, 0, 0), c: rightX - TRIM_OVERLAP })
  if (trim.front > 0) planes.push({ n: v(0, 0, 1), c: frontZ - TRIM_OVERLAP })
  if (trim.back > 0) planes.push({ n: v(0, 0, -1), c: -(backZ + TRIM_OVERLAP) })
  const far = s.wallThickness + s.overhang + s.deckThickness + s.shingleThickness + 2
  const corner = (a: [number, number], b: [number, number], outside: [number, number]) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    let nx = -(b[1] - a[1]) / length
    let nz = (b[0] - a[0]) / length
    const mx = (a[0] + b[0]) / 2
    const mz = (a[1] + b[1]) / 2
    if (nx * (outside[0] - mx) + nz * (outside[1] - mz) < 0) {
      nx = -nx
      nz = -nz
    }
    planes.push({ n: v(nx, 0, nz), c: nx * mx + nz * mz - TRIM_OVERLAP })
  }
  const e = TRIM_OVERLAP
  if (trim.frontLeftX > 0 && trim.frontLeftZ > 0) corner([leftX + trim.frontLeftX + e, frontZ], [leftX, frontZ - trim.frontLeftZ - e], [-s.width / 2 - far, s.depth / 2 + far])
  if (trim.frontRightX > 0 && trim.frontRightZ > 0) corner([rightX, frontZ - trim.frontRightZ - e], [rightX - trim.frontRightX - e, frontZ], [s.width / 2 + far, s.depth / 2 + far])
  if (trim.backLeftX > 0 && trim.backLeftZ > 0) corner([leftX, backZ + trim.backLeftZ + e], [leftX + trim.backLeftX + e, backZ], [-s.width / 2 - far, -s.depth / 2 - far])
  if (trim.backRightX > 0 && trim.backRightZ > 0) corner([rightX - trim.backRightX - e, backZ], [rightX, backZ + trim.backRightZ + e], [s.width / 2 + far, -s.depth / 2 - far])
  return planes
}

export function kept(pieces: readonly Face[][], planes: readonly Plane[]): Face[][] {
  const out: Face[][] = []
  for (const piece of pieces) {
    let rest: Face[] = piece.map((face) => [...face])
    for (const plane of planes) {
      if (rest.length === 0) break
      rest = clip(rest, plane)
    }
    if (rest.length > 0 && enclosed(rest) > 1e-10) out.push(rest)
  }
  return out
}

// ------------------------------------------------------------------ (12) bodies built without cutting
// part of a cone: a deck and its shingles between three cones, and a ring wall
export function coneSector(s: Seg) {
  const slope = slopeOf(s)
  const cover = coverageOf(s)
  const sides = Math.max(1, Math.ceil((48 * Math.abs(cover.sweep)) / TAU))
  const radius = s.width / 2 + s.wallThickness / 2 + s.overhang * Math.max(0, slope.cos)
  const drop = (radius - s.width / 2) * slope.tan
  const deckUp = s.deckThickness / Math.max(0.1, slope.cos)
  const out = s.shingleThickness * slope.sin
  const up = s.shingleThickness * slope.cos
  const under = { radius, eave: s.wallHeight - drop, peak: s.wallHeight + slope.peak }
  const deckTop = { radius, eave: under.eave + deckUp, peak: under.peak + deckUp }
  const top = { radius: radius + out, eave: deckTop.eave + up, peak: deckTop.peak + up + out * slope.tan }
  const ring = (layer: { radius: number; eave: number }) =>
    Array.from({ length: sides + 1 }, (_, k) => {
      const a = cover.start + (k / sides) * cover.sweep
      return v(Math.cos(a) * layer.radius, layer.eave, Math.sin(a) * layer.radius)
    })
  const a = ring(under)
  const b = ring(deckTop)
  const c = ring(top)
  const pa = v(0, under.peak, 0)
  const pb = v(0, deckTop.peak, 0)
  const pc = v(0, top.peak, 0)
  // the closed solid of deck and shingles together. The under faces look down and the top faces
  // up whichever way the sweep runs; the rim and the two ends are listed in the ring's own order
  // (outwards for a negative sweep), and are turned here so that the solid is whole.
  const outward = (face: Face, upwards: boolean) => (normalOf(face).y >= 0 === upwards ? face : [...face].reverse())
  const faces: Face[] = []
  for (let k = 0; k < sides; k += 1) {
    faces.push(outward([a[k]!, a[k + 1]!, pa], false), outward([c[k]!, c[k + 1]!, pc], true))
  }
  const listed: Face[] = []
  for (let k = 0; k < sides; k += 1) listed.push([a[k]!, a[k + 1]!, b[k + 1]!, b[k]!], [b[k]!, b[k + 1]!, c[k + 1]!, c[k]!])
  listed.push([pa, a[0]!, b[0]!, pb], [pa, pb, b[sides]!, a[sides]!], [pb, b[0]!, c[0]!, pc], [pb, pc, c[sides]!, b[sides]!])
  const rim = cover.sweep > 0 ? listed.map((face) => [...face].reverse()) : listed
  const wall = s.wallHeight > 0.001
  return {
    sides,
    under,
    deckTop,
    top,
    sweep: cover.sweep,
    start: cover.start,
    faces: [...faces, ...rim],
    asListed: [...faces, ...listed],
    // deck: under faces, rim, two ends; shingles: top faces, rim, two ends; wall: both faces
    // of its inner and outer skin and of its two ends
    triangles: sides + 2 * sides + 4 + sides + 2 * sides + 4 + (wall ? 8 * sides + 8 : 0),
    wallRadii: wall ? [Math.max(0.005, s.width / 2 - s.wallThickness / 2), s.width / 2 + s.wallThickness / 2] : null,
  }
}

// a shed drawn straight from plan outlines: a slab under the helper's slope, this thick straight up
export function shedSlabThickness(s: Seg): number {
  const slope = slopeOf(s)
  return s.deckThickness / Math.max(0.1, slope.cos) + s.shingleThickness * slope.cos
}

export function planArea(points: readonly (readonly [number, number])[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(twice) / 2
}

// a shed bent round a centre: a plan point of the flat segment on its ring
export function bent(arc: { centerX: number; centerZ: number; radius: number }, x: number, z: number): [number, number] {
  const turn = (x - arc.centerX) / ((Math.sign(arc.centerZ) || 1) * arc.radius)
  const out = z - arc.centerZ
  return [arc.centerX - out * Math.sin(turn), arc.centerZ + out * Math.cos(turn)]
}

export function bandFacets(width: number): number {
  return Math.max(4, Math.min(32, Math.ceil(width / 0.4)))
}

// ------------------------------------------------------------------ (14) the seat of a skylight
// The viewer's second, separate builder of the outer surface (used to seat skylights): a
// module grown a little differently from the shingles' own, and none at all for a cone.
export function seatOf(s: Seg, x: number, z: number): { y: number; normal: P3 } {
  const slope = slopeOf(s)
  const A = slope.peak
  if (s.roofType === 'flat' || A === 0) return { y: s.wallHeight + s.deckThickness + s.shingleThickness, normal: v(0, 1, 0) }
  const reach = s.wallThickness / 2 + s.overhang * slope.cos
  const drop = reach * slope.tan
  const out = s.shingleThickness * slope.sin
  const up = s.shingleThickness * slope.cos
  const fourSided = s.roofType === 'hip' || s.roofType === 'mansard' || s.roofType === 'dutch' || s.roofType === 'conical'
  const E = s.wallHeight - drop + s.deckThickness / slope.cos + up
  const R = A + (s.roofType === 'shed' ? 2 : 1) * drop + up
  const inset = Math.max(0.01, Math.min(s.width, s.depth) * 0.25)
  const insets =
    fourSided ? { iF: inset, iB: inset, iL: inset, iR: inset } : s.roofType === 'shed' ? { iF: inset } : { iL: inset, iR: inset }
  const module: Module = {
    ...nominalModule(s),
    W: Math.max(0.01, s.width + 2 * reach) + 2 * out,
    D: Math.max(0.01, s.depth + 2 * reach) + 2 * out,
    E,
    R,
    B: 0,
    ...insets,
    dutchI: Math.min(s.width, s.depth) * s.dutchHipWidthRatio,
  }
  const shiftZ = fourSided ? 0 : out
  const faces = moduleFaces(module, s.roofType === 'conical')
  // straight down from above: the first face met, whichever way it looks
  let best: { y: number; normal: P3 } | null = null
  for (const face of faces) {
    const n = normalOf(face)
    if (Math.abs(n.y) < 1e-9 || !inPlan(face, x, z - shiftZ)) continue
    const y = planeY(face, x, z - shiftZ)
    if (y === null || (best && y <= best.y)) continue
    best = { y, normal: n.y < 0 ? v(-n.x, -n.y, -n.z) : n }
  }
  return best ?? { y: s.wallHeight, normal: v(0, 1, 0) }
}

// ------------------------------------------------------------------ (13) two segments over one place
export type Owner = { roofId: string; segmentId: string; onRoofId?: string; onSegmentId?: string; width: number; depth: number }

// does `other` own the place where it and `mine` overlap (then mine is cut by other's inside)
export function owns(other: Owner, mine: Owner): boolean {
  if (other.onRoofId === mine.roofId || other.onSegmentId === mine.segmentId) return false
  if (mine.onRoofId === other.roofId || mine.onSegmentId === other.segmentId) return true
  const a = other.width * other.depth
  const b = mine.width * mine.depth
  if (a > b + 1e-6) return true
  if (Math.abs(a - b) > 1e-6) return false
  const order = other.roofId.localeCompare(mine.roofId) || other.segmentId.localeCompare(mine.segmentId)
  return order < 0
}
