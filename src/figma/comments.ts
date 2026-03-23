import { FigmaClient } from "./client.js";
import type { FigmaCommentsResponse, FigmaComment, PendingComment } from "./types.js";
import type { StateManager } from "../state/answered.js";
import { logger } from "../utils/logger.js";

/**
 * Fetch all unresolved comments that match the trigger prefix and haven't been answered yet.
 *
 * Filtering pipeline:
 *   1. Skip child comments (replies)
 *   2. Skip resolved threads
 *   3. Skip comments already tracked in local state
 *   4. Skip (and sync state for) comments that already have a bot reply in Figma
 *   5. Parse the trigger prefix — skip comments that don't match or have no question
 */
export async function fetchPendingComments(
  client: FigmaClient,
  fileKey: string,
  triggerPrefix: string,
  replyTemplate: string,
  state: StateManager
): Promise<PendingComment[]> {
  const res = await client.get<FigmaCommentsResponse>(
    `/v1/files/${fileKey}/comments`
  );

  logger.info(`Fetched ${res.comments.length} comments from Figma API`);

  // Derive the bot reply prefix from the actual reply template,
  // so we recognise our own replies even if the template is customised.
  const botReplyPrefix = replyTemplate
    .replace("{{prefix}}", triggerPrefix)
    .split("{{answer}}")[0]
    .trim()
    .toLowerCase();

  // Build a set of parent IDs that already have a bot reply
  const answeredByReply = new Set<string>();
  for (const comment of res.comments) {
    if (!comment.parent_id) continue;
    const msgLower = comment.message.trim().toLowerCase();
    if (msgLower.startsWith(botReplyPrefix)) {
      answeredByReply.add(comment.parent_id);
    }
  }

  const prefixLower = triggerPrefix.toLowerCase();
  const pending: PendingComment[] = [];

  for (const comment of res.comments) {
    if (comment.parent_id) continue;
    if (comment.resolved_at) continue;
    if (state.isAnswered(comment.id)) continue;

    // Sync local state if a bot reply already exists in Figma
    if (answeredByReply.has(comment.id)) {
      logger.info(`Comment ${comment.id} already has a bot reply — syncing state`);
      state.markAnswered(comment.id);
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
