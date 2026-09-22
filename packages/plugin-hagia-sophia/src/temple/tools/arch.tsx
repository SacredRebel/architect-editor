'use client'
import { hsArchDefinition } from '../../kinds/hs-arch/definition'
import { buildArchGeometry } from '../../kinds/hs-arch/geometry'
import { HsArchNode } from '../../kinds/hs-arch/schema'
import { makePlaceTool } from '../place-tool'
import { ARCH_PRESET } from '../presets'

export default makePlaceTool({
  schema: HsArchNode,
  defaults: hsArchDefinition.defaults as () => Record<string, unknown>,
  preset: ARCH_PRESET,
  build: buildArchGeometry as (n: never) => ReturnType<typeof buildArchGeometry>,
  name: 'Arch',
})
