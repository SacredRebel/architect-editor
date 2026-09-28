/**
 * Where the Draco decoder, the Basis (KTX2) transcoder and web-ifc's wasm are
 * fetched from. Defaults are what the viewer has always used (the public CDNs;
 * web-ifc's own resolution); an app that serves them itself (the eco editor
 * under the world's /builder, A4) calls `configureDecoderPaths` once at
 * startup, before any model loads.
 */
let dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/'
let basisTranscoderPath = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/basis/'
let webIfcWasmPath: string | undefined
const basisListeners = new Set<(path: string) => void>()

export function configureDecoderPaths(paths: {
  draco?: string
  basis?: string
  webIfc?: string
}): void {
  if (paths.draco) dracoDecoderPath = paths.draco
  if (paths.webIfc) webIfcWasmPath = paths.webIfc
  if (paths.basis) {
    basisTranscoderPath = paths.basis
    for (const listener of basisListeners) listener(basisTranscoderPath)
  }
}

export function getDracoDecoderPath(): string {
  return dracoDecoderPath
}

/** The directory `web-ifc.wasm` is served from, if the app set one. */
export function getWebIfcWasmPath(): string | undefined {
  return webIfcWasmPath
}

/** Calls `listener` now and whenever the Basis transcoder path changes. */
export function onBasisTranscoderPath(listener: (path: string) => void): void {
  basisListeners.add(listener)
  listener(basisTranscoderPath)
}
