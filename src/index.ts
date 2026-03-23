import { loadConfig } from "./config.js";
import { createAIClient } from "./ai/index.js";
import { StateManager } from "./state/answered.js";
import { startPolling } from "./bot/loop.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Figma Comment Bot...");

  const config = loadConfig();
  const ai = createAIClient(config);
  const state = new StateManager();

  await startPolling(config, ai, state);
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
