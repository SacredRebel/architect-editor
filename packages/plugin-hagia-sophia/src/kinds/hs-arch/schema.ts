import { BaseNode, nodeType, objectId } from '@pascal-app/core'
import { z } from 'zod'

export const HsArchProfileTypeSchema = z.enum(['round', 'segmental', 'pointed', 'catenary'])

export const HsArchNode = BaseNode.extend({
  id: objectId('hs-arch'),
  type: nodeType('hagia-sophia:arch'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  span: z.number().positive().default(7.62),
  rise: z.number().positive().default(3.81),
  depth: z.number().positive().default(1.2),
  profileType: HsArchProfileTypeSchema.default('round'),
  thickness: z.number().positive().default(0.6),
  /** Draw Poleni's line of thrust (inverted hanging chain) inside the ring. */
  showThrust: z.boolean().default(true),
})

export type HsArchNode = z.infer<typeof HsArchNode>
export type HsArchProfileType = z.infer<typeof HsArchProfileTypeSchema>
