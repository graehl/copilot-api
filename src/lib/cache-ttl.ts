import type {
  AnthropicCacheControl,
  AnthropicMessage,
  AnthropicMessagesPayload,
} from "~/routes/messages/anthropic-types"

export const EXTENDED_CACHE_TTL_BETA = "extended-cache-ttl-2025-04-11"

export type CacheTtl = "5m" | "1h"

const CACHE_TTL_ENV = "COPILOT_API_CACHE_TTL"
const LONGEST_TTL: CacheTtl = "1h"

/**
 * Which TTL to stamp on breakpoints the client left unqualified, or null to
 * pass the client's own choice through untouched.
 *
 * The default is the longest tier upstream offers. On a metered Anthropic
 * account that would be a real trade -- a 1h cache write costs about 2x base
 * input against 1.25x for 5m -- but Copilot bills premium interactions, not
 * tokens, so a longer-lived prefix is close to free upside here. It matters
 * most for the gaps this proxy exists to serve: a session resumed after a
 * break, or a forked subagent that starts minutes after its parent's last
 * turn, both of which miss a 5-minute window and pay a full re-prefill.
 */
export function resolveDefaultCacheTtl(
  env: NodeJS.ProcessEnv = process.env,
): CacheTtl | null {
  const raw = env[CACHE_TTL_ENV]?.trim()
  if (!raw) return LONGEST_TTL
  if (raw === "client") return null
  if (raw === "5m" || raw === "1h") return raw
  throw new Error(
    `${CACHE_TTL_ENV} must be "1h", "5m", or "client" (keep the client's own breakpoints); got "${raw}"`,
  )
}

// Blocks are read structurally: several members of these content and tool
// unions (thinking blocks, server-side tools) carry no cache_control at all.
function ttlOf(block: unknown): CacheTtl | undefined {
  return (block as { cache_control?: AnthropicCacheControl }).cache_control?.ttl
}

function stamped<T>(block: T, ttl: CacheTtl): T {
  const candidate = block as { cache_control?: AnthropicCacheControl }
  const control = candidate.cache_control
  if (!control || control.ttl !== undefined) return block
  return { ...block, cache_control: { ...control, ttl } }
}

function stampAll<T>(blocks: Array<T>, ttl: CacheTtl): Array<T> {
  return blocks.map((block) => stamped(block, ttl))
}

/**
 * Fill in a TTL on every breakpoint the client left unqualified.
 *
 * Existing breakpoints only -- this never *adds* one. Anthropic caps a request
 * at four breakpoints and their placement encodes what the client considers a
 * stable prefix; inventing more would change caching semantics, not just their
 * lifetime. Returns the payload unchanged (by identity) when there is nothing
 * to stamp, so the common no-cache_control request is not needlessly cloned.
 */
export function applyDefaultCacheTtl(
  payload: AnthropicMessagesPayload,
  ttl: CacheTtl | null,
): AnthropicMessagesPayload {
  if (ttl === null) return payload

  const system =
    Array.isArray(payload.system) ?
      stampAll(payload.system, ttl)
    : payload.system
  const tools = payload.tools ? stampAll(payload.tools, ttl) : payload.tools
  // Branch on role so each side narrows to one content-block union; a single
  // shared branch would widen to an array of both and fail to type.
  const messages = payload.messages.map((message): AnthropicMessage => {
    if (!Array.isArray(message.content)) return message
    if (message.role === "user") {
      return { ...message, content: stampAll(message.content, ttl) }
    }
    if (message.role === "system") {
      return { ...message, content: stampAll(message.content, ttl) }
    }
    return { ...message, content: stampAll(message.content, ttl) }
  })

  const changed =
    system !== payload.system
    || tools !== payload.tools
    || messages.some((message, index) => message !== payload.messages[index])
  if (!changed) return payload

  return { ...payload, system, tools, messages }
}

/** True once any breakpoint in the payload asks for a tier beyond 5 minutes. */
export function usesExtendedCacheTtl(
  payload: AnthropicMessagesPayload,
): boolean {
  const blocks: Array<unknown> = []
  if (Array.isArray(payload.system)) blocks.push(...payload.system)
  if (payload.tools) blocks.push(...payload.tools)
  for (const message of payload.messages) {
    if (Array.isArray(message.content)) blocks.push(...message.content)
  }
  return blocks.some((block) => ttlOf(block) === "1h")
}
