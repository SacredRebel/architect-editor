/**
 * Where the Draco decoder and the Basis (KTX2) transcoder are fetched from.
 * Defaults are the public CDNs the viewer has always used; an app that serves
 * them itself (the eco editor under the world's /builder, A4) calls
 * `configureDecoderPaths` once at startup, before any model loads.
 */
let dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/'
let basisTranscoderPath = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/'
const basisListeners = new Set<(path: string) => void>()

export function configureDecoderPaths(paths: { draco?: string; basis?: string }): void {
  if (paths.draco) dracoDecoderPath = paths.draco
  if (paths.basis) {
    basisTranscoderPath = paths.basis
    for (const listener of basisListeners) listener(basisTranscoderPath)
  }
}

export function getDracoDecoderPath(): string {
  return dracoDecoderPath
}

/** Calls `listener` now and whenever the Basis transcoder path changes. */
export function onBasisTranscoderPath(listener: (path: string) => void): void {
  basisListeners.add(listener)
  listener(basisTranscoderPath)
}
