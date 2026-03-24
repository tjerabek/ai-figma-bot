import { FigmaClient } from "../figma/client.js";
import { captureScreenshot } from "../figma/screenshots.js";
import { PROGRESS_EMOJI, DONE_EMOJI } from "../figma/comments.js";
import { type AIClient, loadContextFiles } from "../ai/index.js";
import type { PendingComment } from "../figma/types.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";

function reactionsEndpoint(fileKey: string, commentId: string): string {
  return `/v1/files/${fileKey}/comments/${commentId}/reactions`;
}

/**
 * Process a single pending comment end-to-end:
 *   1. Add 👀 progress reaction (marks as "being processed")
 *   2. Capture screenshot of the commented region
 *   3. Load project context files
 *   4. Ask the AI model
 *   5. Post the reply back to Figma
 *   6. Swap 👀 for 🤖 done reaction
 */
export async function handleComment(
  comment: PendingComment,
  figma: FigmaClient,
  ai: AIClient,
  config: Config
): Promise<void> {
  logger.info(
    `Processing comment ${comment.id} from ${comment.author}: "${comment.question}"`
  );

  const endpoint = reactionsEndpoint(config.figmaFileKey, comment.id);

  try {
    // 1. Add progress reaction — this is the lock that prevents other cycles
    //    from picking up the same comment
    await figma.post(endpoint, { emoji: PROGRESS_EMOJI });

    // 2. Capture screenshot
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

    // 3. Load project context (cached after first call)
    const context = loadContextFiles(config.contextFiles);

    // 4. Ask AI
    const answer = await ai.ask(comment.question, screenshot, context);
    logger.info(`AI response (${answer.length} chars)`);

    // 5. Reply in Figma
    const replyBody = config.replyTemplate
      .replace("{{prefix}}", config.triggerPrefix)
      .replace("{{answer}}", answer);

    await figma.post(`/v1/files/${config.figmaFileKey}/comments`, {
      message: replyBody,
      comment_id: comment.id,
    });

    logger.info(`Replied to comment ${comment.id}`);

    // 6. Swap reactions: remove progress, add done
    await figma.delete(`${endpoint}?emoji=${encodeURIComponent(PROGRESS_EMOJI)}`).catch((e) =>
      logger.warn(`Could not remove progress reaction: ${e.message}`)
    );
    await figma.post(endpoint, { emoji: DONE_EMOJI }).catch((e) =>
      logger.warn(`Could not add done reaction: ${e.message}`)
    );
  } catch (err) {
    // Remove progress reaction on failure so it can be retried next cycle
    await figma.delete(`${endpoint}?emoji=${encodeURIComponent(PROGRESS_EMOJI)}`).catch(() => {});
    logger.error(`Failed to handle comment ${comment.id}`, err);
  }
}
