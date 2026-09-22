'use client'
import { hsPierDefinition } from '../../kinds/hs-pier/definition'
import { buildPierGeometry } from '../../kinds/hs-pier/geometry'
import { HsPierNode } from '../../kinds/hs-pier/schema'
import { makePlaceTool } from '../place-tool'
import { PIER_PRESET } from '../presets'

export default makePlaceTool({
  schema: HsPierNode,
  defaults: hsPierDefinition.defaults as () => Record<string, unknown>,
  preset: PIER_PRESET,
  build: buildPierGeometry as (n: never) => ReturnType<typeof buildPierGeometry>,
  name: 'Pier',
})
