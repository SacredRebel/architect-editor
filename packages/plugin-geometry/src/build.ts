/**
 * Build a plan/solid figure for a catalog form id + size (metres).
 */
import type { FormId } from './catalog'
import {
  adQuadratum,
  archimedeanSolid,
  archimedeanSpiral,
  cordTriple,
  equalShadows,
  extremeMean,
  fibonacciSquares,
  type Figure2D,
  hangingChain,
  hexCircleLattice,
  logSpiral,
  minimalSurfaceGuide,
  regularPentagon,
  regularPolygon,
  regularSolid,
  rootRectangle,
  similarTriangleHeight,
  squareModuleGrid,
  tilingFill,
  transformFigure,
  twoCircle,
} from './forms'

export type BuildOpts = {
  size: number
  origin?: [number, number]
  bearingDeg?: number
  /** Extra form-specific knobs. */
  n?: number
  steps?: number
  root?: 2 | 3 | 5
  pitch?: number
  turns?: number
  sides?: number
  rings?: number
  rise?: number
  tiling?: Parameters<typeof tilingFill>[0]
  solid?: Parameters<typeof regularSolid>[0]
  archSolid?: Parameters<typeof archimedeanSolid>[0]
  roomW?: number
  roomD?: number
}

export type Built = {
  figure: Figure2D
  solid?: { vertices: [number, number, number][]; edges: [number, number][] }
  summary: string
}

export function buildForm(formId: FormId, opts: BuildOpts): Built {
  const origin = opts.origin ?? [0, 0]
  const bearing = opts.bearingDeg ?? 0
  const s = opts.size
  let raw: Figure2D
  let solid: Built['solid']
  let summary = ''

  switch (formId) {
    case 'two-circle':
      raw = twoCircle(s)
      summary = `lens h/w = ${raw.meta?.lensHeightOverWidth?.toFixed(6)}`
      break
    case 'cord-triples':
      raw = cordTriple(s)
      summary = `right-angle · = ${raw.meta?.rightAngleDot}`
      break
    case 'equal-shadows':
      raw = equalShadows(s, [-s * 1.2, 0], [s * 1.2, 0], [0, 0])
      summary = `north ≈ ${raw.meta?.northBearingDeg?.toFixed(2)}°`
      break
    case 'square-module-grid':
      raw = squareModuleGrid(s, opts.n ?? 8)
      summary = `${opts.n ?? 8}×${opts.n ?? 8} modules`
      break
    case 'turned-square':
      raw = adQuadratum(s, opts.steps ?? 4)
      summary = `area step = ${raw.meta?.stepAreaRatio}`
      break
    case 'root-rectangle':
      raw = rootRectangle(s, opts.root ?? 2)
      summary = `ratio = ${raw.meta?.ratio?.toFixed(6)}`
      break
    case 'extreme-mean':
      raw = extremeMean(s)
      summary = `φ ≈ ${raw.meta?.phiApprox?.toFixed(6)}`
      break
    case 'regular-pentagon':
      raw = regularPentagon(s)
      summary = `diag/side = ${raw.meta?.diagonalOverSide?.toFixed(6)}`
      break
    case 'fibonacci-squares':
      raw = fibonacciSquares(opts.n ?? 8, s)
      summary = `${opts.n ?? 8} squares`
      break
    case 'log-spiral':
      raw = logSpiral(opts.pitch ?? 1.2, opts.turns ?? 3)
      summary = `pitch ${opts.pitch ?? 1.2}`
      break
    case 'archimedean-spiral':
      raw = archimedeanSpiral(s, opts.turns ?? 3)
      summary = `spacing ${s}`
      break
    case 'regular-polygon':
      raw = regularPolygon(opts.sides ?? 6, s)
      summary = `${opts.sides ?? 6} sides`
      break
    case 'tilings':
      raw = tilingFill(opts.tiling ?? '4.4.4.4', s, 20)
      summary = `maxGap ${raw.meta?.maxGap?.toFixed(4)}`
      break
    case 'hex-circle-lattice':
      raw = hexCircleLattice(s, opts.rings ?? 2)
      summary = `${raw.meta?.count} centres`
      break
    case 'regular-solids': {
      const kind = opts.solid ?? 'cube'
      const sol = regularSolid(kind, s)
      solid = { vertices: sol.vertices, edges: sol.edges }
      raw = { polylines: [], meta: sol.meta }
      summary = `${kind}: edge≈${sol.meta.edgeMean.toFixed(4)}`
      break
    }
    case 'archimedean-solids': {
      const kind = opts.archSolid ?? 'cuboctahedron'
      const sol = archimedeanSolid(kind, s)
      solid = { vertices: sol.vertices, edges: sol.edges }
      raw = { polylines: [], meta: sol.meta }
      summary = `${kind}: verts ${sol.meta.vertexCount}`
      break
    }
    case 'room-proportions': {
      const w = opts.roomW ?? s
      const d = opts.roomD ?? s * 1.5
      raw = {
        polylines: [
          [
            [0, 0],
            [w, 0],
            [w, d],
            [0, d],
            [0, 0],
          ],
        ],
        meta: { w, d },
      }
      summary = `${w.toFixed(2)} × ${d.toFixed(2)} m`
      break
    }
    case 'hanging-chain':
      raw = hangingChain(s, opts.rise ?? s / 4)
      summary = `span ${s}, rise ${opts.rise ?? s / 4}`
      break
    case 'minimal-surface':
      raw = minimalSurfaceGuide([
        [0, 0],
        [s, 0],
        [s, s],
        [0, s],
      ])
      summary = 'closed curve guide (soap-film with H15.3)'
      break
    case 'similar-triangles': {
      const h = similarTriangleHeight({
        mode: 'shadow',
        gnomonHeight: 1.5,
        gnomonShadow: 1,
        objectBase: [0, 0],
        shadowTip: [s, 0],
      })
      raw = h
      summary = `height ≈ ${h.height.toFixed(3)} m`
      break
    }
    default:
      raw = { polylines: [] }
      summary = formId
  }

  return { figure: transformFigure(raw, origin, bearing), solid, summary }
}
