import { FigmaClient } from "./client.js";
import type { FigmaCommentsResponse, FigmaComment, PendingComment } from "./types.js";
import { logger } from "../utils/logger.js";

/** Emoji shortcodes used by the bot as reaction markers. */
export const PROGRESS_EMOJI = ":eyes:";
export const DONE_EMOJI = ":robot_face:";

/**
 * Fetch all unresolved comments that match the trigger prefix and need answering.
 *
 * Dedup is based solely on Figma reactions:
 *   - 🤖 (:robot_face:) → already answered, skip
 *   - 👀 (:eyes:)       → currently being processed, skip
 */
export async function fetchPendingComments(
  client: FigmaClient,
  fileKey: string,
  triggerPrefix: string
): Promise<PendingComment[]> {
  const res = await client.get<FigmaCommentsResponse>(
    `/v1/files/${fileKey}/comments`
  );

  // Debug: log all comments so we can see the raw data
  for (const c of res.comments) {
    const reactions = (c.reactions ?? []).map((r) => r.emoji).join(", ");
    logger.debug(
      `  comment ${c.id} | parent="${c.parent_id}" | resolved=${!!c.resolved_at} | reactions=[${reactions}] | msg="${c.message.slice(0, 60)}"`
    );
  }

  logger.info(`Fetched ${res.comments.length} comments from Figma API`);

  // Build set of comment IDs that already have replies (any child comment)
  const hasReply = new Set<string>();
  for (const comment of res.comments) {
    if (comment.parent_id) {
      hasReply.add(comment.parent_id);
    }
  }
  logger.debug(`Comments with replies: [${[...hasReply].join(", ")}]`);

  const prefixLower = triggerPrefix.toLowerCase();
  const pending: PendingComment[] = [];

  for (const comment of res.comments) {
    // Skip child comments (replies)
    if (comment.parent_id) continue;
    if (comment.resolved_at) continue;

    // Reaction-based dedup
    const reactions = comment.reactions ?? [];
    if (reactions.some((r) => r.emoji === DONE_EMOJI)) {
      logger.debug(`  skip ${comment.id}: has 🤖 done reaction`);
      continue;
    }
    if (reactions.some((r) => r.emoji === PROGRESS_EMOJI)) {
      logger.debug(`  skip ${comment.id}: has 👀 progress reaction`);
      continue;
    }

    // Skip comments that already have any reply in the thread
    if (hasReply.has(comment.id)) {
      logger.debug(`  skip ${comment.id}: already has reply`);
      continue;
    }

    const parsed = parseQuestion(comment, prefixLower, triggerPrefix);
    if (!parsed) continue;

    pending.push(parsed);
  }

  logger.info(`Found ${pending.length} pending "${triggerPrefix}" comment(s)`);
  return pending;
}

/** Extract the question from a comment, stripping the trigger prefix. */
function parseQuestion(
  comment: FigmaComment,
  prefixLower: string,
  triggerPrefix: string
): PendingComment | null {
  const message = comment.message.trim();
  if (!message.toLowerCase().startsWith(prefixLower)) return null;

  const question = message.slice(prefixLower.length).trim();
  if (!question) {
    logger.warn(
      `Comment ${comment.id} has "${triggerPrefix}" prefix but no question, skipping`
    );
    return null;
  }

  return {
    id: comment.id,
    question,
    author: comment.user.handle,
    created_at: comment.created_at,
    client_meta: comment.client_meta,
    raw: comment,
  };
}
