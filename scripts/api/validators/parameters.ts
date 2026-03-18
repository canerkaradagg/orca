/**
 * ORCA – Parameters API request schemas (Zod)
 */

import { z } from 'zod'

const parameterItemSchema = z.object({
  parameterKey: z.string().optional(),
  key: z.string().optional(),
  parameterValue: z.string().optional(),
  value: z.string().optional(),
}).refine(
  (o) => (o.parameterKey ?? o.key ?? '').toString().trim().length > 0,
  { message: 'parameterKey veya key gerekli.' }
)

export const putParametersSchema = z.object({
  parameters: z.array(parameterItemSchema).optional(),
  parameterKey: z.string().optional(),
  parameterValue: z.string().optional(),
  updatedBy: z.string().optional(),
}).refine(
  (o) => {
    if (Array.isArray(o.parameters) && o.parameters.length > 0) return true
    if (o.parameterKey != null || o.parameterValue != null) return true
    return false
  },
  { message: 'parameters dizisi veya parameterKey/parameterValue gerekli.' }
)
