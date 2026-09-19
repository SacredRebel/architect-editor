// bridge-types.ts — copy verbatim; the world side compiles against the same shapes.
export type EcoMsg =
  | { t: 'eco:hello'; v: 'eco/1' } // host → editor
  | { t: 'eco:ready'; v: 'eco/1'; caps: string[] } // editor → host, after hello
  | { t: 'eco:load-site'; site: EcoSite } // host → editor
  | { t: 'eco:load-scene'; scene: unknown } // host → editor (Pascal scene JSON, opaque)
  | { t: 'eco:request-export'; what: 'scene' | 'glb' } // host → editor
  | { t: 'eco:scene'; scene: unknown } // editor → host
  | {
      t: 'eco:glb'
      glb: string
      walk: EcoWalk // editor → host; glb = base64 of .glb bytes
      originLL: [number, number]
    } //   [lng, lat] of the model origin
  | { t: 'eco:dirty'; dirty: boolean } // editor → host (unsaved changes)
  | { t: 'eco:close' } // editor → host (user pressed exit)
  | { t: 'eco:error'; message: string } // either way

export interface EcoSite {
  v: 'eco/1'
  /** local metric frame: metres east (x) / north (z+ south in editor is up to you, see note) of originLL */
  originLL: [number, number] // [lng, lat] — the world's model origin (the chimney)
  originElevM: number // ground elevation at origin, metres ASL
  /** heightfield grid, row-major, north row first; heights in metres ASL */
  terrain: {
    w: number
    h: number
    stepM: number
    originOffsetM: [number, number]
    heights: number[]
  }
  /** guide polylines in local metres [x east, z north], drawn but never solid */
  guides: {
    kind: 'boundary' | 'easement' | 'footprint' | 'massing-outline' | 'road'
    pts: [number, number][]
    name?: string
  }[]
  /** optional reference model (the current massing) as base64 GLB, shown as a toggleable ghost */
  refGlb?: string
  northDeg?: number // 0 = +z is true north (default)
}

export interface EcoWalk {
  // the world's walk contract (metres, model-local, x east, y up, z SOUTH)
  floors: { name: string; ring: [number, number][]; top: number }[] // ring pts are [x, z]
  solids: { name: string; ring: [number, number][]; base: number; top: number }[]
}
