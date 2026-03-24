import { loadConfig } from "./config.js";
import { createAIClient } from "./ai/index.js";
import { startPolling } from "./bot/loop.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Figma Comment Bot...");

  const config = loadConfig();
  const ai = createAIClient(config);

  await startPolling(config, ai);
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
