import { afterEach, expect, test } from "bun:test"

import { copilotHeaders } from "../src/lib/api-config"
import { state } from "../src/lib/state"

afterEach(() => {
  state.cliProfile = false
})

test("default identity is VS Code Copilot Chat", () => {
  const headers = copilotHeaders(state)
  expect(headers["copilot-integration-id"]).toBe("vscode-chat")
  expect(headers["openai-intent"]).toBe("conversation-panel")
})

test("--cli-profile sends the Copilot CLI identity only", () => {
  state.cliProfile = true
  const headers = copilotHeaders(state, true)
  expect(headers["copilot-integration-id"]).toBe("copilot-developer-cli")
  expect(headers["x-github-api-version"]).toBe("2026-08-01")
  expect(headers["user-agent"]).toStartWith("copilot/1.0.105 ")
  expect(headers["copilot-vision-request"]).toBe("true")
  expect(headers["openai-intent"]).toBeUndefined()
  expect(headers["editor-plugin-version"]).toBeUndefined()
  expect(copilotHeaders(state)["x-client-session-id"]).toBe(
    headers["x-client-session-id"],
  )
})
