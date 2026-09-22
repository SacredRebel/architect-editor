import type { Plugin } from '@pascal-app/core'

export const geometryPlugin: Plugin = {
  id: 'pascal:geometry',
  apiVersion: 1,
}

export { geometryHostPanel } from './host-panel'
export { FORMS, formById } from './catalog'
export type { FormDef, FormId } from './catalog'
export * from './forms'
export { BANNED_UI_LABELS, PHI, SQRT2, SQRT3, parseLengthInput } from './math'
