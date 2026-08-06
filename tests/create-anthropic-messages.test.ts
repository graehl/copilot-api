import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import type {
  AnthropicClientTool,
  AnthropicMessagesPayload,
  AnthropicTextBlock,
} from "~/routes/messages/anthropic-types"

import { state } from "~/lib/state"
import { selectCopilotMessagesEndpoint } from "~/routes/messages/endpoint-selection"
import { createAnthropicMessages } from "~/services/copilot/create-anthropic-messages"

const originalFetch = globalThis.fetch

beforeEach(() => {
  state.copilotToken = "test-token"
  state.vsCodeVersion = "1.0.0"
  state.accountType = "individual"
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("Copilot Messages endpoint selection", () => {
  test("prefers the native Anthropic endpoint", () => {
    expect(
      selectCopilotMessagesEndpoint(["/chat/completions", "/v1/messages"]),
    ).toBe("/v1/messages")
  })

  test("uses Chat Completions for legacy model catalogs", () => {
    expect(selectCopilotMessagesEndpoint(undefined)).toBe("/chat/completions")
    expect(selectCopilotMessagesEndpoint(["/chat/completions"])).toBe(
      "/chat/completions",
    )
  })

  test("uses Responses for Responses-only models", () => {
    expect(selectCopilotMessagesEndpoint(["/responses", "ws:/responses"])).toBe(
      "/responses",
    )
  })

  test("rejects models without a supported text endpoint", () => {
    expect(selectCopilotMessagesEndpoint(["/embeddings"])).toBeNull()
  })
})

test("forwards Anthropic payloads unchanged to the native endpoint", async () => {
  const payload: AnthropicMessagesPayload = {
    model: "claude-sonnet-5",
    system: "Retain this system context.",
    messages: [
      { role: "user", content: "Complete the prefix." },
      { role: "assistant", content: "PREFIX:" },
    ],
    max_tokens: 64,
    stream: true,
    thinking: {
      type: "enabled",
      budget_tokens: 32,
    },
  }
  const upstreamResponse = new Response("native response", {
    headers: { "content-type": "text/event-stream" },
  })
  const fetchMock = mock(
    (_url: string | URL | Request, _options?: RequestInit) =>
      Promise.resolve(upstreamResponse),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch

  const response = await createAnthropicMessages(
    payload,
    {
      "anthropic-beta": "interleaved-thinking-2025-05-14",
      "anthropic-version": "2023-06-01",
    },
    "?beta=true",
  )

  expect(response).toBe(upstreamResponse)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe("https://api.githubcopilot.com/v1/messages?beta=true")
  expect(typeof options?.body).toBe("string")
  expect(JSON.parse(options?.body as string)).toEqual(payload)
  const headers = options?.headers as Record<string, string>
  expect(headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14")
  expect(headers["anthropic-version"]).toBe("2023-06-01")
  expect(headers["X-Initiator"]).toBe("agent")
})

// Upstream honors prompt-cache breakpoints on this endpoint, including the 1h
// tier, and a forked subagent reuses its parent's cached prefix. Dropping or
// normalizing `cache_control` therefore costs every caller a full re-prefill
// while still returning correct output, so nothing but a test catches it.
test("preserves cache_control breakpoints and the extended-TTL beta", async () => {
  const payload: AnthropicMessagesPayload = {
    model: "claude-sonnet-5",
    system: [
      {
        type: "text",
        text: "Cached system prefix.",
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Cached turn.",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
    tools: [
      {
        name: "Read",
        input_schema: { type: "object" },
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    max_tokens: 64,
  }
  const fetchMock = mock(() => Promise.resolve(new Response("ok")))
  globalThis.fetch = fetchMock as unknown as typeof fetch

  await createAnthropicMessages(payload, {
    "anthropic-beta": "extended-cache-ttl-2025-04-11",
  })

  const [, options] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ]
  const body = JSON.parse(options.body as string) as AnthropicMessagesPayload
  const [systemBlock] = body.system as Array<AnthropicTextBlock>
  expect(systemBlock.cache_control).toEqual({ type: "ephemeral", ttl: "1h" })
  expect(systemBlock.text).toBe("Cached system prefix.")
  // Unqualified on the way in; the longest tier is filled in by default.
  const [userBlock] = body.messages[0].content as Array<AnthropicTextBlock>
  expect(userBlock.cache_control).toEqual({ type: "ephemeral", ttl: "1h" })
  expect((body.tools?.[0] as AnthropicClientTool).cache_control?.ttl).toBe("1h")
  expect((options.headers as Record<string, string>)["anthropic-beta"]).toBe(
    "extended-cache-ttl-2025-04-11",
  )
})
