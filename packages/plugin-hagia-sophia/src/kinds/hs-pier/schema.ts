import { BaseNode, nodeType, objectId } from '@pascal-app/core'
import { z } from 'zod'
import { DEFAULT_PIER_FOOTPRINT, PIER_HEIGHT } from '../../math/constants'

const defaultFootprint = DEFAULT_PIER_FOOTPRINT.map(
  ([x, z]) => [x, z] as [number, number],
)

export const HsPierNode = BaseNode.extend({
  id: objectId('hs-pier'),
  type: nodeType('hagia-sophia:pier'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  footprint: z.array(z.tuple([z.number(), z.number()])).min(3).default(defaultFootprint),
  height: z.number().positive().default(PIER_HEIGHT),
  impostSize: z.number().nonnegative().default(1.2),
  impostThickness: z.number().positive().default(1.0),
  batter: z.number().default(0),
})

export type HsPierNode = z.infer<typeof HsPierNode>
