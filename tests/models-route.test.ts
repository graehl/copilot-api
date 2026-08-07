import { afterEach, describe, expect, test } from "bun:test"

import type { ModelsResponse } from "~/services/copilot/get-models"

import { state } from "~/lib/state"
import { server } from "~/server"
import { applyContextTier } from "~/services/copilot/apply-context-tier"

const originalModels = state.models

afterEach(() => {
  state.models = originalModels
})

describe("models route", () => {
  test("preserves routing and projected capability metadata", async () => {
    const catalog = {
      object: "list",
      data: [
        {
          id: "gpt-5.6-terra",
          name: "GPT-5.6 Terra",
          object: "model",
          preview: false,
          vendor: "OpenAI",
          version: "5.6",
          model_picker_enabled: true,
          model_picker_category: "powerful",
          supported_endpoints: ["/responses", "ws:/responses"],
          billing: {
            token_prices: { long_context: { context_max: 922_000 } },
          },
          capabilities: {
            family: "gpt-5.6-terra",
            object: "model_capabilities",
            tokenizer: "o200k_base",
            type: "chat",
            limits: {
              max_context_window_tokens: 400_000,
              max_output_tokens: 128_000,
              max_prompt_tokens: 272_000,
            },
            supports: {
              reasoning_effort: [
                "none",
                "low",
                "medium",
                "high",
                "xhigh",
                "max",
              ],
              tool_calls: true,
            },
          },
          policy: {
            state: "enabled",
            terms: "",
          },
        },
      ],
    } satisfies ModelsResponse
    state.models = applyContextTier(catalog, "long_context").catalog

    const response = await server.request("/v1/models")

    expect(response.status).toBe(200)
    expect(response.headers.get("x-copilot-api")).toBe("1")
    const body = (await response.json()) as {
      data: Array<Record<string, unknown>>
    }
    expect(body.data[0]).toMatchObject({
      id: "gpt-5.6-terra",
      model_picker_enabled: true,
      model_picker_category: "powerful",
      supported_endpoints: ["/responses", "ws:/responses"],
      capabilities: {
        limits: {
          max_context_window_tokens: 1_050_000,
          max_output_tokens: 128_000,
          max_prompt_tokens: 922_000,
        },
        supports: {
          reasoning_effort: ["none", "low", "medium", "high", "xhigh", "max"],
        },
      },
      policy: {
        state: "enabled",
      },
    })
  })
})
