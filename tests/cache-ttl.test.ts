import { describe, expect, test } from "bun:test"

import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

import {
  applyDefaultCacheTtl,
  resolveDefaultCacheTtl,
  usesExtendedCacheTtl,
} from "~/lib/cache-ttl"

function payloadWithBreakpoints(): AnthropicMessagesPayload {
  return {
    model: "claude-sonnet-5",
    max_tokens: 64,
    system: [
      {
        type: "text",
        text: "System prefix.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "Read",
        input_schema: { type: "object" },
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Turn one." },
          {
            type: "text",
            text: "Cached turn.",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
      { role: "assistant", content: "Plain string content." },
    ],
  }
}

describe("resolveDefaultCacheTtl", () => {
  test("defaults to the longest tier", () => {
    expect(resolveDefaultCacheTtl({})).toBe("1h")
    expect(resolveDefaultCacheTtl({ COPILOT_API_CACHE_TTL: "  " })).toBe("1h")
  })

  test("honors an explicit tier and the client-passthrough opt-out", () => {
    expect(resolveDefaultCacheTtl({ COPILOT_API_CACHE_TTL: "5m" })).toBe("5m")
    expect(resolveDefaultCacheTtl({ COPILOT_API_CACHE_TTL: "1h" })).toBe("1h")
    expect(
      resolveDefaultCacheTtl({ COPILOT_API_CACHE_TTL: "client" }),
    ).toBeNull()
  })

  test("rejects an unusable value instead of quietly defaulting", () => {
    expect(() =>
      resolveDefaultCacheTtl({ COPILOT_API_CACHE_TTL: "60m" }),
    ).toThrow(/COPILOT_API_CACHE_TTL/)
  })
})

describe("applyDefaultCacheTtl", () => {
  test("stamps the tier on every unqualified breakpoint", () => {
    const stamped = applyDefaultCacheTtl(payloadWithBreakpoints(), "1h")
    const system = stamped.system as Array<{ cache_control?: { ttl?: string } }>
    expect(system[0].cache_control?.ttl).toBe("1h")
    expect(
      (stamped.tools?.[0] as { cache_control?: { ttl?: string } }).cache_control
        ?.ttl,
    ).toBe("1h")
    const content = stamped.messages[0].content as Array<{
      cache_control?: { ttl?: string }
    }>
    expect(content[1].cache_control?.ttl).toBe("1h")
  })

  test("never invents a breakpoint on a block that had none", () => {
    const stamped = applyDefaultCacheTtl(payloadWithBreakpoints(), "1h")
    const content = stamped.messages[0].content as Array<{
      cache_control?: unknown
    }>
    expect(content[0].cache_control).toBeUndefined()
    expect(stamped.messages[1].content).toBe("Plain string content.")
  })

  test("leaves a tier the client already chose", () => {
    const payload: AnthropicMessagesPayload = {
      ...payloadWithBreakpoints(),
      system: [
        {
          type: "text",
          text: "System prefix.",
          cache_control: { type: "ephemeral", ttl: "5m" },
        },
      ],
    }
    const stamped = applyDefaultCacheTtl(payload, "1h")
    expect(
      (stamped.system as Array<{ cache_control?: { ttl?: string } }>)[0]
        .cache_control?.ttl,
    ).toBe("5m")
  })

  test("does not mutate the caller's payload", () => {
    const payload = payloadWithBreakpoints()
    applyDefaultCacheTtl(payload, "1h")
    const system = payload.system as Array<{ cache_control?: { ttl?: string } }>
    expect(system[0].cache_control?.ttl).toBeUndefined()
  })

  test("passes the payload through by identity when nothing needs stamping", () => {
    const payload: AnthropicMessagesPayload = {
      model: "claude-sonnet-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "No breakpoints here." }],
    }
    expect(applyDefaultCacheTtl(payload, "1h")).toBe(payload)
    expect(applyDefaultCacheTtl(payloadWithBreakpoints(), null)).toBeDefined()
  })
})

test("usesExtendedCacheTtl reports the tier actually being sent", () => {
  expect(usesExtendedCacheTtl(payloadWithBreakpoints())).toBe(false)
  expect(
    usesExtendedCacheTtl(applyDefaultCacheTtl(payloadWithBreakpoints(), "1h")),
  ).toBe(true)
  expect(
    usesExtendedCacheTtl(applyDefaultCacheTtl(payloadWithBreakpoints(), "5m")),
  ).toBe(false)
})
