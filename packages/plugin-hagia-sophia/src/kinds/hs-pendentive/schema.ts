import { BaseNode, nodeType, objectId } from '@pascal-app/core'
import { z } from 'zod'

export const HsPendentiveQuadrantSchema = z.enum(['ne', 'nw', 'se', 'sw'])

export const HsPendentiveNode = BaseNode.extend({
  id: objectId('hs-pendentive'),
  type: nodeType('hagia-sophia:pendentive'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  sphereRadius: z.number().positive().default(15.55),
  quadrant: HsPendentiveQuadrantSchema.default('ne'),
  /**
   * Side of the square bay under a true pendentive (m). When set, the pendentive is the corner of
   * the sphere of radius side/√2 centred at the springing line — the sphere whose sections are
   * the four round arches — and `sphereRadius` is ignored. Unset keeps the spherical octant.
   */
  squareSide: z.number().positive().optional(),
})

export type HsPendentiveNode = z.infer<typeof HsPendentiveNode>
export type HsPendentiveQuadrant = z.infer<typeof HsPendentiveQuadrantSchema>
