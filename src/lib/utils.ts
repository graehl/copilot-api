import consola from "consola"

import { applyContextTier } from "~/services/copilot/apply-context-tier"
import { getModels } from "~/services/copilot/get-models"
import { getVSCodeVersion } from "~/services/get-vscode-version"

import { state } from "./state"

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const isNullish = (value: unknown): value is null | undefined =>
  value === null || value === undefined

export async function cacheModels(): Promise<void> {
  const models = await getModels()
  const projection = applyContextTier(models, state.contextTier)

  if (
    state.contextTier === "long_context"
    && projection.appliedModelIds.length === 0
  ) {
    throw new Error(
      "The live catalog advertises no model with both long-context metadata and an output limit",
    )
  }

  state.models = projection.catalog
  if (state.contextTier === "long_context") {
    consola.info(
      `Applied long_context limits to: ${projection.appliedModelIds.join(", ")}`,
    )
    if (projection.skippedModelIds.length > 0) {
      consola.debug(
        `Models without usable long_context limits: ${projection.skippedModelIds.join(", ")}`,
      )
    }
  }
}

export const cacheVSCodeVersion = async () => {
  const response = await getVSCodeVersion()
  state.vsCodeVersion = response

  consola.info(`Using VSCode version: ${response}`)
}
