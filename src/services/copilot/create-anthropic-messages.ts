import type {
  AnthropicImageBlock,
  AnthropicMessagesPayload,
  AnthropicToolResultBlock,
} from "~/routes/messages/anthropic-types"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import {
  applyDefaultCacheTtl,
  EXTENDED_CACHE_TTL_BETA,
  resolveDefaultCacheTtl,
  usesExtendedCacheTtl,
} from "~/lib/cache-ttl"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

function hasImage(payload: AnthropicMessagesPayload): boolean {
  return payload.messages.some(
    (message) =>
      Array.isArray(message.content)
      && message.content.some(
        (block): block is AnthropicImageBlock => block.type === "image",
      ),
  )
}

function isAgentCall(payload: AnthropicMessagesPayload): boolean {
  return payload.messages.some(
    (message) =>
      message.role === "assistant"
      || (Array.isArray(message.content)
        && message.content.some(
          (block): block is AnthropicToolResultBlock =>
            block.type === "tool_result",
        )),
  )
}

function withExtendedTtlBeta(
  headers: Record<string, string>,
): Record<string, string> {
  // The client's own casing wins when it already sent the header, so the
  // forwarded request carries one anthropic-beta rather than two spellings.
  const existing = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "anthropic-beta",
  )
  const key = existing?.[0] ?? "anthropic-beta"
  const flags = existing?.[1]
  if (
    flags?.split(",").some((flag) => flag.trim() === EXTENDED_CACHE_TTL_BETA)
  ) {
    return headers
  }
  return {
    ...headers,
    [key]:
      flags ? `${flags},${EXTENDED_CACHE_TTL_BETA}` : EXTENDED_CACHE_TTL_BETA,
  }
}

export async function createAnthropicMessages(
  payload: AnthropicMessagesPayload,
  forwardedHeaders: Record<string, string>,
  query = "",
): Promise<Response> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  // Stamp the longest cache tier onto breakpoints the client left unqualified,
  // then declare the beta that tier is gated behind. Everything else about the
  // payload is forwarded byte-for-byte.
  const sent = applyDefaultCacheTtl(payload, resolveDefaultCacheTtl())
  const headers =
    usesExtendedCacheTtl(sent) ?
      withExtendedTtlBeta(forwardedHeaders)
    : forwardedHeaders

  const response = await fetch(`${copilotBaseUrl(state)}/v1/messages${query}`, {
    method: "POST",
    headers: {
      ...copilotHeaders(state, hasImage(sent)),
      ...headers,
      "X-Initiator": isAgentCall(sent) ? "agent" : "user",
    },
    body: JSON.stringify(sent),
  })

  if (!response.ok) {
    throw new HTTPError("Failed to create Anthropic message", response)
  }

  return response
}
