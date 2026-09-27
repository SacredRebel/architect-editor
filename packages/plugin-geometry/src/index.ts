import type { Plugin } from '@pascal-app/core'

export const geometryPlugin: Plugin = {
  id: 'pascal:geometry',
  apiVersion: 1,
}

export { buildForm } from './build'
export type { FormDef, FormId } from './catalog'
export { FORMS, formById } from './catalog'
export * from './forms'
export { geometryFloorplanOverlay, geometryHostPanel, geometryPresentation } from './host-panel'
export { BANNED_UI_LABELS, PHI, parseLengthInput, SQRT2, SQRT3 } from './math'
export { ensureGeometryPlanSnapInstalled } from './snap'
export {
  addPlacedFigure,
  clearPlacedFigures,
  getGeometryState,
  subscribeGeometry,
} from './store'
