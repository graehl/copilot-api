import type { ModelsResponse } from "~/services/copilot/get-models"

import type { ContextTier } from "./context-tier"

export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  contextTier: ContextTier
  models?: ModelsResponse
  vsCodeVersion?: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean
  // Send Copilot CLI 1.0.105 client-identity headers instead of VS Code's
  cliProfile: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
}

export const state: State = {
  accountType: "individual",
  contextTier: "default",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  cliProfile: false,
}
