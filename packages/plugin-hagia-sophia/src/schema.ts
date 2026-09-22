import { BaseNode, generateId, nodeType } from '@pascal-app/core'
import { z } from 'zod'

export const HsColumnVariantSchema = z.enum([
  'nave_verde',
  'porphyry_exedra',
  'aisle_verde',
  'aisle_pillar',
  'gallery_verde',
])

/** Ground columns use `hs-column_*`; gallery storey uses `hs-gallery_*`. */
const HsColumnIdSchema = z
  .string()
  .refine((id) => id.startsWith('hs-column_') || id.startsWith('hs-gallery_'), {
    message: 'id must start with hs-column_ or hs-gallery_',
  })
  .default(() => generateId('hs-column'))

export const HsColumnNode = BaseNode.extend({
  id: HsColumnIdSchema,
  type: nodeType('hagia-sophia:column'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  variant: HsColumnVariantSchema.default('nave_verde'),
  shaftHeight: z.number().positive().default(8.53),
  capitalHeight: z.number().positive().default(1.83),
  shaftRadius: z.number().positive().default(0.45),
  /** vertical flute count around the shaft; 0 = smooth (Phase 1 default) */
  flutes: z.number().int().min(0).max(32).default(0),
  /** entasis bulge as fraction of shaft height */
  entasis: z.number().min(0).max(0.05).default(0.03),
})

export type HsColumnNode = z.infer<typeof HsColumnNode>
