'use client'
import { hsDomeDefinition } from '../../kinds/hs-dome/definition'
import { buildDomeGeometry } from '../../kinds/hs-dome/geometry'
import { HsDomeNode } from '../../kinds/hs-dome/schema'
import { makePlaceTool } from '../place-tool'
import { DOME_PRESET } from '../presets'

export default makePlaceTool({
  schema: HsDomeNode,
  defaults: hsDomeDefinition.defaults as () => Record<string, unknown>,
  preset: DOME_PRESET,
  build: buildDomeGeometry as (n: never) => ReturnType<typeof buildDomeGeometry>,
  name: 'Dome',
})
