import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { state } from "~/lib/state"
import { inferInitiator } from "~/routes/responses/handler"
import { server } from "~/server"

const originalFetch = globalThis.fetch

beforeEach(() => {
  state.copilotToken = "test-token"
  state.vsCodeVersion = "1.0.0"
  state.accountType = "individual"
  state.models = {
    object: "list",
    data: [
      { id: "gpt-x", supported_endpoints: ["/responses"] },
      { id: "chat-only", supported_endpoints: ["/chat/completions"] },
    ],
  } as unknown as typeof state.models
})

afterEach(() => {
  globalThis.fetch = originalFetch
  state.models = undefined
})

describe("Responses pass-through", () => {
  test("forwards the body unchanged and streams the upstream reply", async () => {
    const body = JSON.stringify({
      model: "gpt-x",
      input: [
        {
          role: "user",
          content: [{ type: "input_image", image_url: "data:x" }],
        },
      ],
      future_field: { kept: true },
      stream: true,
    })
    let sent: { url: string; init: RequestInit } | undefined
    globalThis.fetch = ((url: string, init: RequestInit) => {
      sent = { url, init }
      return Promise.resolve(
        new Response("event: response.completed\ndata: {}\n\n", {
          headers: {
            "content-type": "text/event-stream",
            "content-encoding": "gzip",
          },
        }),
      )
    }) as unknown as typeof fetch

    const res = await server.request("/v1/responses", { method: "POST", body })

    expect(sent?.url).toBe("https://api.githubcopilot.com/responses")
    expect(sent?.init.body).toBe(body)
    const headers = sent?.init.headers as Record<string, string>
    expect(headers["X-Initiator"]).toBe("user")
    expect(headers["copilot-vision-request"]).toBe("true")
    expect(res.headers.get("content-encoding")).toBeNull()
    expect(await res.text()).toBe("event: response.completed\ndata: {}\n\n")
  })

  test("rejects a model whose catalog entry lacks /responses", async () => {
    globalThis.fetch = (() => {
      throw new Error("must not reach upstream")
    }) as unknown as typeof fetch
    const res = await server.request("/responses", {
      method: "POST",
      body: JSON.stringify({ model: "chat-only", input: "hi" }),
    })
    expect(res.status).toBe(400)
  })

  test("infers the initiator from the newest input item", () => {
    expect(inferInitiator("hi")).toBe("user")
    expect(
      inferInitiator([
        { role: "user", content: "a" },
        { type: "function_call", call_id: "c", name: "f", arguments: "{}" },
        { type: "function_call_output", call_id: "c", output: "x" },
      ]),
    ).toBe("agent")
    expect(
      inferInitiator([
        { role: "assistant", content: "a" },
        { type: "message", role: "user", content: "next" },
      ]),
    ).toBe("user")
  })
})
