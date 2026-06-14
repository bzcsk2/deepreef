import { z } from "zod"

export const LastConfigSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
})

/** 单个 role（worker / supervisor）的模型配置 */
export const RoleConfigEntrySchema = z.object({
  provider: z.string(),
  model: z.string(),
  baseUrl: z.string(),
})

/** per-role 模型配置文件结构：{ worker: {...}, supervisor: {...} } */
export const RoleConfigSchema = z.object({
  worker: RoleConfigEntrySchema.optional(),
  supervisor: RoleConfigEntrySchema.optional(),
})
