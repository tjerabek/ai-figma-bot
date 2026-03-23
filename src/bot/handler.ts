import { FigmaClient } from "../figma/client.js";
import { captureScreenshot } from "../figma/screenshots.js";
import { type AIClient, loadContextFiles } from "../ai/index.js";
import type { StateManager } from "../state/answered.js";
import type { PendingComment } from "../figma/types.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Process a single pending comment end-to-end:
 *   1. Check retry budget
 *   2. Capture screenshot of the commented region
 *   3. Load project context files
 *   4. Ask the AI model
 *   5. Post the reply back to Figma
 *   6. Mark as answered in state
 *
 * On failure, increments the retry counter. After maxCommentRetries, gives up.
 */
export async function handleComment(
  comment: PendingComment,
  figma: FigmaClient,
  ai: AIClient,
  config: Config,
  state: StateManager
): Promise<void> {
  const retries = state.getRetryCount(comment.id);
  if (retries >= config.maxCommentRetries) {
    logger.warn(`Comment ${comment.id} exceeded max retries (${config.maxCommentRetries}), marking as answered`);
    state.markAnswered(comment.id);
    return;
  }

  logger.info(
    `Processing comment ${comment.id} from ${comment.author}: "${comment.question}"`
  );

  try {
    // 1. Capture screenshot
    const screenshot = await captureScreenshot(
      figma,
      config.figmaFileKey,
      comment.client_meta,
      config.screenshotScale
    );

    if (screenshot) {
      logger.info("Screenshot captured successfully");
    } else {
      logger.warn("Proceeding without screenshot");
    }

    // 2. Load project context (cached after first call)
    const context = loadContextFiles(config.contextFiles);

    // 3. Ask AI
    const answer = await ai.ask(comment.question, screenshot, context);
    logger.info(`AI response (${answer.length} chars)`);

    // 4. Re-check state before posting (guards against duplicate replies
    //    if processing was slow and another cycle already handled this comment)
    if (state.isAnswered(comment.id)) {
      logger.info(`Comment ${comment.id} was answered while processing, skipping reply`);
      return;
    }

    // 5. Mark as answered BEFORE posting to Figma, so concurrent cycles
    //    won't pick it up. If the POST fails, the catch block will
    //    reset state via incrementRetry.
    state.markAnswered(comment.id);

    // 6. Reply in Figma
    const replyBody = config.replyTemplate
      .replace("{{prefix}}", config.triggerPrefix)
      .replace("{{answer}}", answer);

    await figma.post(`/v1/files/${config.figmaFileKey}/comments`, {
      message: replyBody,
      comment_id: comment.id,
    });

    logger.info(`Replied to comment ${comment.id}`);
  } catch (err) {
    // Reset answered state so the comment can be retried next cycle
    state.incrementRetry(comment.id);
    logger.error(`Failed to handle comment ${comment.id} (retry ${state.getRetryCount(comment.id)}/${config.maxCommentRetries})`, err);
  }
}
