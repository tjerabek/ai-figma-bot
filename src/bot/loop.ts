import { FigmaClient } from "../figma/client.js";
import { fetchPendingComments } from "../figma/comments.js";
import { handleComment } from "./handler.js";
import type { AIClient } from "../ai/index.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Start the main polling loop.
 *
 * Uses a single AbortController for clean shutdown — SIGINT/SIGTERM abort the
 * controller, which cancels the current sleep and exits the loop gracefully.
 */
export async function startPolling(
  config: Config,
  ai: AIClient
): Promise<void> {
  const figma = new FigmaClient(config.figmaToken, config.maxApiRetries);
  const abortController = new AbortController();

  const shutdown = () => {
    logger.info("Shutting down...");
    abortController.abort();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info(
    `Polling Figma file ${config.figmaFileKey} every ${config.pollingIntervalMs / 1000}s`
  );
  logger.info(`Trigger prefix: "${config.triggerPrefix}"`);
  logger.info(`AI provider: ${config.aiProvider} (${config.aiModel})`);

  while (!abortController.signal.aborted) {
    try {
      const comments = await fetchPendingComments(
        figma,
        config.figmaFileKey,
        config.triggerPrefix
      );

      for (const comment of comments) {
        if (abortController.signal.aborted) break;
        await handleComment(comment, figma, ai, config);
      }
    } catch (err) {
      logger.error("Polling cycle error", err);
    }

    if (!abortController.signal.aborted) {
      await sleep(config.pollingIntervalMs, abortController.signal);
    }
  }

  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);

  logger.info("Bot stopped");
}

/** Sleep for `ms` milliseconds, cancellable via AbortSignal. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
