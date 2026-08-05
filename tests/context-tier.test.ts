import { describe, expect, test } from "bun:test"

import type { Model, ModelsResponse } from "~/services/copilot/get-models"

import { parseContextTier } from "~/lib/context-tier"
import { applyContextTier } from "~/services/copilot/apply-context-tier"

describe("parseContextTier", () => {
  test.each(["default", "long_context"] as const)(
    "accepts %s",
    (contextTier) => {
      expect(parseContextTier(contextTier)).toBe(contextTier)
    },
  )

  test.each(["", "long-context", "LONG_CONTEXT"])(
    "rejects %p",
    (contextTier) => {
      expect(() => parseContextTier(contextTier)).toThrow(
        "Expected one of: default, long_context",
      )
    },
  )
})

function model(id: string): Model {
  return {
    id,
    name: id,
    object: "model",
    preview: false,
    vendor: "OpenAI",
    version: "1",
    model_picker_enabled: true,
    capabilities: {
      family: id,
      object: "model_capabilities",
      tokenizer: "o200k_base",
      type: "chat",
      limits: {
        max_context_window_tokens: 400_000,
        max_output_tokens: 128_000,
        max_prompt_tokens: 272_000,
      },
      supports: { tool_calls: true },
    },
  }
}

function catalog(...data: Array<Model>): ModelsResponse {
  return { object: "list", data }
}

describe("applyContextTier", () => {
  test("leaves the default catalog untouched", () => {
    const original = catalog(model("gpt-5.6-sol"))

    const projection = applyContextTier(original, "default")

    expect(projection).toEqual({
      catalog: original,
      appliedModelIds: [],
      skippedModelIds: [],
    })
    expect(projection.catalog).toBe(original)
  })

  test("derives eligible limits while preserving incomplete models", () => {
    const eligible = model("gpt-5.6-sol")
    eligible.billing = {
      token_prices: { long_context: { context_max: 922_000 } },
      unrelated: "billing-metadata",
    }
    const ineligible = model("gpt-4.1")
    const missingOutput = model("incomplete")
    missingOutput.billing = {
      token_prices: { long_context: { context_max: 500_000 } },
    }
    const missingOutputLimits = missingOutput.capabilities?.limits
    if (!missingOutputLimits) throw new Error("Invalid test model")
    delete missingOutputLimits.max_output_tokens
    const original = catalog(eligible, ineligible, missingOutput)
    const snapshot = structuredClone(original)

    const projection = applyContextTier(original, "long_context")

    expect(projection.appliedModelIds).toEqual(["gpt-5.6-sol"])
    expect(projection.skippedModelIds).toEqual(["gpt-4.1", "incomplete"])
    expect(projection.catalog.data[0]).toMatchObject({
      billing: { unrelated: "billing-metadata" },
      capabilities: {
        limits: {
          max_prompt_tokens: 922_000,
          max_output_tokens: 128_000,
          max_context_window_tokens: 1_050_000,
        },
        supports: { tool_calls: true },
      },
    })
    expect(projection.catalog.data[1]).toBe(ineligible)
    expect(projection.catalog.data[2]).toBe(missingOutput)
    expect(original).toEqual(snapshot)
  })

  test("skips catalog rows without capabilities or limits", () => {
    const missingCapabilities = model("missing-capabilities")
    missingCapabilities.billing = {
      token_prices: { long_context: { context_max: 500_000 } },
    }
    delete missingCapabilities.capabilities

    const missingLimits = model("missing-limits")
    missingLimits.billing = {
      token_prices: { long_context: { context_max: 500_000 } },
    }
    if (!missingLimits.capabilities) throw new Error("Invalid test model")
    delete missingLimits.capabilities.limits

    const original = catalog(missingCapabilities, missingLimits)
    const projection = applyContextTier(original, "long_context")

    expect(projection.appliedModelIds).toEqual([])
    expect(projection.skippedModelIds).toEqual([
      "missing-capabilities",
      "missing-limits",
    ])
    expect(projection.catalog).toBe(original)
    expect(projection.catalog.data[0]).toBe(missingCapabilities)
    expect(projection.catalog.data[1]).toBe(missingLimits)
  })

  test("is stable when applied repeatedly", () => {
    const eligible = model("gpt-5.6-terra")
    eligible.billing = {
      token_prices: { long_context: { context_max: 922_000 } },
    }
    const first = applyContextTier(catalog(eligible), "long_context")

    const second = applyContextTier(first.catalog, "long_context")

    expect(second.catalog).toBe(first.catalog)
    expect(second.appliedModelIds).toEqual(["gpt-5.6-terra"])
    expect(second.skippedModelIds).toEqual([])
  })
})
