import { configureDecoderPaths } from '@pascal-app/viewer'
import { ecoPublicPath } from './eco-mode'

/**
 * A4 — the Draco decoder and the Basis (KTX2) transcoder load from this app's
 * own `<basePath>/decoders` (`public/decoders`, copied from the installed
 * `three` by `scripts/copy-decoders.mjs`), never from gstatic or jsDelivr;
 * web-ifc's wasm from `<basePath>/` (`public/web-ifc.wasm`, copied by
 * `scripts/copy-web-ifc-wasm.mjs`). Runs before any model loads.
 */
configureDecoderPaths({
  draco: ecoPublicPath('/decoders/draco/'),
  basis: ecoPublicPath('/decoders/basis/'),
  webIfc: ecoPublicPath('/'),
})
