import { z } from "zod"

/** Schema for validating plugins.json content */
export const PluginConfigSchema = z.array(
  z.union([
    z.string(),
    z.array(z.unknown()).min(2).max(2),
    z.object({ spec: z.string(), options: z.record(z.string(), z.unknown()).optional() }),
  ]),
)
