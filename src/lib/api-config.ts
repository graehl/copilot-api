import { randomUUID } from "node:crypto"

import type { State } from "./state"

export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
})

const COPILOT_VERSION = "0.26.7"
const EDITOR_PLUGIN_VERSION = `copilot-chat/${COPILOT_VERSION}`
const USER_AGENT = `GitHubCopilotChat/${COPILOT_VERSION}`

const API_VERSION = "2025-04-01"

export const copilotBaseUrl = (state: State) =>
  state.accountType === "individual" ?
    "https://api.githubcopilot.com"
  : `https://api.${state.accountType}.githubcopilot.com`
export const copilotHeaders = (state: State, vision: boolean = false) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${state.copilotToken}`,
    "content-type": standardHeaders()["content-type"],
    ...(state.cliProfile ? CLI_PROFILE_HEADERS : vscodeIdentityHeaders(state)),
    "x-request-id": randomUUID(),
  }

  if (vision) headers["copilot-vision-request"] = "true"

  return headers
}

const vscodeIdentityHeaders = (state: State) => ({
  "copilot-integration-id": "vscode-chat",
  "editor-version": `vscode/${state.vsCodeVersion}`,
  "editor-plugin-version": EDITOR_PLUGIN_VERSION,
  "user-agent": USER_AGENT,
  "openai-intent": "conversation-panel",
  "x-github-api-version": API_VERSION,
  "x-vscode-user-agent-library-version": "electron-fetch",
})
// Client identity sent by Copilot CLI 1.0.105, captured 2026-11-05 through a
// logging proxy. Opt-in (`--cli-profile`) so it can be tried and dropped if
// the impersonation proves unadvised. Per-prompt interaction/task ids are not
// reproduced; the session and machine ids last for this process.
const CLI_PROFILE_HEADERS = {
  "copilot-integration-id": "copilot-developer-cli",
  "copilot-harness-id": "copilot-sdk",
  "editor-version": "copilot/1.0.105",
  "user-agent":
    "copilot/1.0.105 (linux v24.22.1) term/unknown client/github/cli",
  "x-github-api-version": "2026-08-01",
  "x-client-machine-id": randomUUID(),
  "x-client-session-id": randomUUID(),
  "x-github-repository-host": "__no_repository__",
  "x-github-repository-nwo": "__no_repository__",
}

export const GITHUB_API_BASE_URL = "https://api.github.com"
export const githubHeaders = (state: State) => ({
  ...standardHeaders(),
  authorization: `token ${state.githubToken}`,
  "editor-version": `vscode/${state.vsCodeVersion}`,
  "editor-plugin-version": EDITOR_PLUGIN_VERSION,
  "user-agent": USER_AGENT,
  "x-github-api-version": API_VERSION,
  "x-vscode-user-agent-library-version": "electron-fetch",
})

export const GITHUB_BASE_URL = "https://github.com"
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"
export const GITHUB_APP_SCOPES = ["read:user"].join(" ")
