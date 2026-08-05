import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

export const getModels = async () => {
  const response = await fetch(`${copilotBaseUrl(state)}/models`, {
    headers: copilotHeaders(state),
  })

  if (!response.ok) throw new HTTPError("Failed to get models", response)

  return (await response.json()) as ModelsResponse
}

export interface ModelsResponse {
  data: Array<Model>
  object: string
}

export interface ModelLimits {
  max_context_window_tokens?: number
  max_output_tokens?: number
  max_prompt_tokens?: number
  max_inputs?: number
  [limit: string]: unknown
}

interface ModelSupports {
  tool_calls?: boolean
  parallel_tool_calls?: boolean
  dimensions?: boolean
  reasoning_effort?: Array<string>
  [capability: string]: unknown
}

interface ModelCapabilities {
  family: string
  limits?: ModelLimits
  object: string
  supports: ModelSupports
  tokenizer: string
  type: string
  [capability: string]: unknown
}

interface ModelBillingContextTier {
  context_max?: number
  [property: string]: unknown
}

interface ModelBillingTokenPrices {
  default?: ModelBillingContextTier
  long_context?: ModelBillingContextTier
  [tier: string]: ModelBillingContextTier | undefined
}

interface ModelBilling {
  token_prices?: ModelBillingTokenPrices
  [property: string]: unknown
}

export interface Model {
  billing?: ModelBilling
  capabilities?: ModelCapabilities
  id: string
  model_picker_enabled: boolean
  model_picker_category?: string
  name: string
  object: string
  preview: boolean
  supported_endpoints?: Array<string>
  vendor: string
  version: string
  policy?: {
    state: string
    terms: string
  }
  [property: string]: unknown
}
