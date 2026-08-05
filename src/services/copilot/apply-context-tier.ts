import type { ContextTier } from "~/lib/context-tier"
import type { Model, ModelsResponse } from "~/services/copilot/get-models"

export interface ContextTierProjection {
  catalog: ModelsResponse
  appliedModelIds: Array<string>
  skippedModelIds: Array<string>
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ?
      value
    : undefined
}

function applyLongContext(model: Model): Model | undefined {
  const capabilities = model.capabilities
  const limits = capabilities?.limits
  const promptWindow = positiveFiniteNumber(
    model.billing?.token_prices?.long_context?.context_max,
  )
  const outputWindow = positiveFiniteNumber(limits?.max_output_tokens)
  if (
    capabilities === undefined
    || limits === undefined
    || promptWindow === undefined
    || outputWindow === undefined
  ) {
    return undefined
  }

  const contextWindow = promptWindow + outputWindow
  if (!Number.isFinite(contextWindow)) return undefined

  if (
    limits.max_prompt_tokens === promptWindow
    && limits.max_context_window_tokens === contextWindow
  ) {
    return model
  }

  return {
    ...model,
    capabilities: {
      ...capabilities,
      limits: {
        ...limits,
        max_prompt_tokens: promptWindow,
        max_context_window_tokens: contextWindow,
      },
    },
  }
}

export function applyContextTier(
  catalog: ModelsResponse,
  contextTier: ContextTier,
): ContextTierProjection {
  if (contextTier === "default") {
    return { catalog, appliedModelIds: [], skippedModelIds: [] }
  }

  const appliedModelIds: Array<string> = []
  const skippedModelIds: Array<string> = []
  const data = catalog.data.map((model) => {
    const projected = applyLongContext(model)
    if (!projected) {
      skippedModelIds.push(model.id)
      return model
    }

    appliedModelIds.push(model.id)
    return projected
  })

  const changed = data.some((model, index) => model !== catalog.data[index])
  return {
    catalog: changed ? { ...catalog, data } : catalog,
    appliedModelIds,
    skippedModelIds,
  }
}
