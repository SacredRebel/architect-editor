import { BaseNode, nodeType, objectId } from '@pascal-app/core'
import { z } from 'zod'

export const HsDomeNode = BaseNode.extend({
  id: objectId('hs-dome'),
  type: nodeType('hagia-sophia:dome'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  radius: z.number().positive().default(15.55),
  /** Fraction of diameter → dome height (≈0.5 = hemisphere). */
  riseRatio: z.number().min(0).max(1).default(0.55),
  /** Visual rim band thickness (not a boolean shell). */
  shellThickness: z.number().positive().default(0.8),
  /** 0 = no drum ring (semi-domes springing off an arch). */
  drumHeight: z.number().min(0).default(5.5),
  drumRadius: z
    .number()
    .positive()
    .default(15.55 * 0.92),
  windowCount: z.number().int().min(0).max(128).default(40),
  windowWidth: z.number().positive().default(0.9),
  windowHeight: z.number().positive().default(2.4),
  /** 0 = closed crown. */
  oculusRadius: z.number().min(0).default(0),
  /**
   * Lathe/cylinder sweep start (radians). Three.js lathe: phi=0 is +Z.
   * Full dome: 0. Semi-dome local +Z half: -π/2.
   */
  sectorStart: z.number().default(0),
  /** Sweep length (radians). Default 2π = full revolution. */
  sectorAngle: z
    .number()
    .gt(0)
    .max(Math.PI * 2)
    .default(Math.PI * 2),
})

export type HsDomeNode = z.infer<typeof HsDomeNode>
