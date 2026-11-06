import type { Context } from "hono"

import consola from "consola"

import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { forwardResponses } from "~/services/copilot/create-responses"

interface ResponsesRequestShape {
  model?: unknown
  input?: unknown
}

export async function handleResponses(c: Context) {
  await checkRateLimit(state)

  const body = await c.req.text()
  const payload = JSON.parse(body) as ResponsesRequestShape
  if (typeof payload.model !== "string") {
    return c.json(
      {
        error: {
          message: "Responses request requires a string model",
          type: "invalid_request_error",
        },
      },
      400,
    )
  }

  const endpoints = state.models?.data.find(
    (model) => model.id === payload.model,
  )?.supported_endpoints
  if (endpoints && !endpoints.includes("/responses")) {
    return c.json(
      {
        error: {
          message: `Model "${payload.model}" does not support the Copilot Responses endpoint (supports: ${endpoints.join(", ")})`,
          type: "invalid_request_error",
        },
      },
      400,
    )
  }

  if (state.manualApprove) await awaitApproval()

  const initiator =
    parseInitiator(c.req.header("x-initiator")) ?? inferInitiator(payload.input)
  consola.debug(`Responses pass-through: ${payload.model} (${initiator})`)

  const upstream = await forwardResponses(
    body,
    hasInputImage(payload.input),
    initiator,
  )

  // fetch has already decoded the body, so the upstream encoding and length
  // no longer describe what we send.
  const headers = new Headers(upstream.headers)
  headers.delete("content-encoding")
  headers.delete("content-length")
  return new Response(upstream.body, { status: upstream.status, headers })
}

function parseInitiator(value: string | undefined): "agent" | "user" | null {
  return value === "agent" || value === "user" ? value : null
}

// A turn is user-initiated when the newest input item is a user message;
// tool outputs and assistant items mean the agent loop is continuing.
export function inferInitiator(input: unknown): "agent" | "user" {
  if (typeof input === "string") return "user"
  if (!Array.isArray(input) || input.length === 0) return "user"
  const last: unknown = input.at(-1)
  if (typeof last !== "object" || last === null) return "agent"
  const item = last as { type?: unknown; role?: unknown }
  const isMessage = item.type === undefined || item.type === "message"
  return isMessage && item.role === "user" ? "user" : "agent"
}

// Images arrive in message `content` or in a function_call_output's `output`.
export function hasInputImage(input: unknown): boolean {
  if (!Array.isArray(input)) return false
  return input.some((item: unknown) => {
    if (typeof item !== "object" || item === null) return false
    const { content, output } = item as { content?: unknown; output?: unknown }
    return [content, output].some(
      (parts) =>
        Array.isArray(parts)
        && parts.some(
          (block: unknown) =>
            typeof block === "object"
            && block !== null
            && (block as { type?: unknown }).type === "input_image",
        ),
    )
  })
}
