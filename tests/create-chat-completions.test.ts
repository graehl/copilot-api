import { test, expect, mock } from "bun:test"

import type { ChatCompletionsPayload } from "../src/services/copilot/create-chat-completions"

import { state } from "../src/lib/state"
import {
  createChatCompletions,
  endWithNonAssistantForGemini,
} from "../src/services/copilot/create-chat-completions"

// Mock state
state.copilotToken = "test-token"
state.vsCodeVersion = "1.0.0"
state.accountType = "individual"

// Helper to mock fetch
const fetchMock = mock(
  (_url: string, opts: { headers: Record<string, string> }) => {
    return {
      ok: true,
      json: () => ({ id: "123", object: "chat.completion", choices: [] }),
      headers: opts.headers,
    }
  },
)
// @ts-expect-error - Mock fetch doesn't implement all fetch properties
;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock

test("sets X-Initiator to agent if tool/assistant present", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "tool", content: "tool call" },
    ],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (
    fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("agent")
})

test("sets X-Initiator to user if only user present", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "user", content: "hello again" },
    ],
    model: "gpt-test",
  }
  await createChatCompletions(payload)
  expect(fetchMock).toHaveBeenCalled()
  const headers = (
    fetchMock.mock.calls[1][1] as { headers: Record<string, string> }
  ).headers
  expect(headers["X-Initiator"]).toBe("user")
})

test("appends a user turn after trailing assistant text for Gemini", async () => {
  const payload: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "Count to 5." },
      { role: "assistant", content: "1, 2," },
    ],
    model: "gemini-3.8-flash",
  }
  await createChatCompletions(payload)
  const sent = JSON.parse(
    (fetchMock.mock.calls.at(-1)?.[1] as unknown as { body: string }).body,
  ) as ChatCompletionsPayload
  expect(sent.messages.map((m) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
  ])
  expect(payload.messages).toHaveLength(2)
})

test("leaves trailing assistant alone for non-Gemini and tool calls", () => {
  const prefill: ChatCompletionsPayload = {
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hel" },
    ],
    model: "claude-sonnet-5.5",
  }
  expect(endWithNonAssistantForGemini(prefill)).toBe(prefill)
  const toolCall: ChatCompletionsPayload = {
    model: "gemini-4-argon",
    messages: [
      { role: "user", content: "time?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "now", arguments: "{}" },
          },
        ],
      },
    ],
  }
  expect(endWithNonAssistantForGemini(toolCall)).toBe(toolCall)
})
