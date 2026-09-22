'use client'
import { hsColumnDefinition } from '../../definition'
import { buildColumnGeometry } from '../../geometry'
import { HsColumnNode } from '../../schema'
import { makePlaceTool } from '../place-tool'
import { COLUMN_PRESET } from '../presets'

export default makePlaceTool({
  schema: HsColumnNode,
  defaults: hsColumnDefinition.defaults as () => Record<string, unknown>,
  preset: COLUMN_PRESET,
  build: buildColumnGeometry as (n: never) => ReturnType<typeof buildColumnGeometry>,
  name: 'Column',
})
