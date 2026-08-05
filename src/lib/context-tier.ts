export const CONTEXT_TIERS = ["default", "long_context"] as const

export type ContextTier = (typeof CONTEXT_TIERS)[number]

export function parseContextTier(value: string): ContextTier {
  if (value === "default" || value === "long_context") {
    return value
  }

  throw new TypeError(
    `Invalid context tier "${value}". Expected one of: ${CONTEXT_TIERS.join(", ")}`,
  )
}
