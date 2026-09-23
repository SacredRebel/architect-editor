import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '@pascal-app/core'

const Point3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])

export const BodyGroupNode = BaseNode.extend({
  id: objectId('body-group'),
  type: nodeType('body-group'),
  position: Point3.default([0, 0, 0]),
  rotation: Point3.default([0, 0, 0]),
  scale: Point3.default([1, 1, 1]),
  children: z.array(objectId('body')).default([]),
}).describe('Persistent transform container for sibling Body nodes')

export type BodyGroupNode = z.infer<typeof BodyGroupNode>
