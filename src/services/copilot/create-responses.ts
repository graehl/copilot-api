import consola from "consola"
import { events } from "fetch-event-stream"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"

export interface ResponsesPayload {
  model: string
  input: Array<ResponseInputItem>
  instructions?: string | null
  max_output_tokens?: number
  tools?: Array<ResponseTool> | null
  tool_choice?: ResponseToolChoice
  metadata?: Record<string, string> | null
  stream?: boolean
  store: false
  parallel_tool_calls?: boolean
  reasoning?: {
    effort: string
    summary: "auto"
  }
  include?: Array<
    "reasoning.encrypted_content" | "web_search_call.action.sources"
  >
}

export type ResponseToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; name: string }

export interface ResponseFunctionTool {
  type: "function"
  name: string
  description?: string
  parameters: Record<string, unknown>
  strict: false
}

export interface ResponseWebSearchTool {
  type: "web_search"
  filters?: {
    allowed_domains?: Array<string>
  }
  user_location?: {
    type: "approximate"
    city?: string
    region?: string
    country?: string
    timezone?: string
  }
}

export type ResponseTool = ResponseFunctionTool | ResponseWebSearchTool

export interface ResponseInputMessage {
  type: "message"
  role: "user" | "assistant" | "system"
  content: string | Array<ResponseInputContent>
}

export interface ResponseFunctionCall {
  type: "function_call"
  call_id: string
  name: string
  arguments: string
  status: "completed"
}

export interface ResponseFunctionCallOutput {
  type: "function_call_output"
  call_id: string
  output: string | Array<ResponseInputContent>
  status: "completed" | "incomplete"
}

export interface ResponseReasoningInput {
  type: "reasoning"
  id: string
  encrypted_content: string
  summary: Array<{ type: "summary_text"; text: string }>
}

export type ResponseInputItem =
  | ResponseInputMessage
  | ResponseFunctionCall
  | ResponseFunctionCallOutput
  | ResponseReasoningInput

export type ResponseInputContent =
  | { type: "input_text" | "output_text"; text: string }
  | {
      type: "input_image"
      image_url: string
      detail: "auto"
    }

export interface ResponsesResult {
  id: string
  object: "response"
  model: string
  output: Array<ResponseOutputItem>
  output_text?: string
  status: "completed" | "failed" | "incomplete" | "in_progress"
  usage?: ResponseUsage | null
  error?: {
    message?: string
  } | null
  incomplete_details?: {
    reason?: string
  } | null
}

export type ResponseOutputItem =
  | ResponseOutputMessage
  | ResponseOutputReasoning
  | ResponseOutputFunctionCall
  | ResponseOutputWebSearchCall
  | Record<string, unknown>

export interface ResponseOutputMessage {
  id: string
  type: "message"
  role: "assistant"
  status: string
  content?: Array<ResponseOutputContent>
}

export interface ResponseOutputReasoning {
  id: string
  type: "reasoning"
  encrypted_content?: string
  summary?: Array<{ type: string; text?: string }>
}

export interface ResponseOutputFunctionCall {
  id: string
  type: "function_call"
  call_id?: string
  name: string
  arguments: string
  status?: string
}

export interface ResponseOutputWebSearchCall {
  id: string
  type: "web_search_call"
  status?: string
  action?: {
    type?: string
    query?: string
    queries?: Array<string>
    sources?: Array<{
      type?: string
      url?: string
      title?: string
    }>
  }
}

export type ResponseOutputContent =
  | {
      type: "output_text"
      text: string
      annotations?: Array<Record<string, unknown>>
    }
  | { type: "refusal"; refusal: string }
  | Record<string, unknown>

export interface ResponseUsage {
  input_tokens: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: {
    cached_tokens?: number
    cache_write_tokens?: number
  }
  output_tokens_details?: {
    reasoning_tokens?: number
  }
}

export type ResponsesStream = ReturnType<typeof events>
export type CreateResponsesReturn = ResponsesResult | ResponsesStream

export async function createResponses(
  payload: ResponsesPayload,
  initiator: "agent" | "user",
): Promise<CreateResponsesReturn> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const response = await fetch(`${copilotBaseUrl(state)}/responses`, {
    method: "POST",
    headers: {
      ...copilotHeaders(state, hasVisionInput(payload)),
      "X-Initiator": initiator,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    consola.error("Failed to create Responses request", response)
    throw new HTTPError("Failed to create Responses request", response)
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as ResponsesResult
}

// Pass-through for OpenAI Responses clients: the body is forwarded unchanged
// and the upstream response (JSON or SSE) is returned as-is, so fields this
// proxy has no types for still survive the round trip.
export async function forwardResponses(
  body: string,
  vision: boolean,
  initiator: "agent" | "user",
): Promise<Response> {
  if (!state.copilotToken) throw new Error("Copilot token not found")

  const response = await fetch(`${copilotBaseUrl(state)}/responses`, {
    method: "POST",
    headers: {
      ...copilotHeaders(state, vision),
      "X-Initiator": initiator,
    },
    body,
  })

  if (!response.ok) {
    throw new HTTPError("Failed to create Responses request", response)
  }

  return response
}

function hasVisionInput(payload: ResponsesPayload): boolean {
  return payload.input.some((item) => {
    let content: ResponseFunctionCallOutput["output"] | undefined
    if (item.type === "message") content = item.content
    if (item.type === "function_call_output") content = item.output
    return (
      Array.isArray(content)
      && content.some((block) => block.type === "input_image")
    )
  })
}
