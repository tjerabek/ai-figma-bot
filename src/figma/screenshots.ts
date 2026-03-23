import { FigmaClient } from "./client.js";
import type {
  ClientMeta,
  Vector,
  FrameOffset,
  FrameOffsetRegion,
  FigmaImageResponse,
  FigmaFileResponse,
  FigmaNode,
} from "./types.js";
import { logger } from "../utils/logger.js";

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Capture a screenshot of the Figma region where a comment was placed.
 *
 * Pipeline:
 *   1. Resolve the node ID from the comment's client_meta (direct or coordinate lookup)
 *   2. Export the node as a PNG via Figma's image export API
 *   3. Download the image and convert to base64
 *
 * Returns null (with a warning) if any step fails — the bot can still answer without a screenshot.
 */
export async function captureScreenshot(
  client: FigmaClient,
  fileKey: string,
  clientMeta: ClientMeta,
  scale: number
): Promise<string | null> {
  try {
    const nodeId = await resolveNodeId(client, fileKey, clientMeta);
    if (!nodeId) {
      logger.warn("Could not resolve node ID from comment location");
      return null;
    }

    const imageUrl = await exportNodeImage(client, fileKey, nodeId, scale);
    if (!imageUrl) {
      logger.warn(`No image URL returned for node ${nodeId}`);
      return null;
    }

    return await downloadAsBase64(imageUrl);
  } catch (err) {
    logger.error("Screenshot capture failed", err);
    return null;
  }
}

// ── Node resolution ───────────────────────────────────────────────────

/** Type guard: meta contains a direct node_id reference. */
function hasNodeId(meta: ClientMeta): meta is FrameOffset | FrameOffsetRegion {
  return "node_id" in meta;
}

/** Type guard: meta is an absolute coordinate (Vector). */
function isVector(meta: ClientMeta): meta is Vector {
  return !hasNodeId(meta) && "x" in meta && "y" in meta;
}

/**
 * Resolve the Figma node ID for a comment.
 * - If the comment has a direct node_id (FrameOffset / FrameOffsetRegion), use it.
 * - If it only has absolute coordinates (Vector), fetch the file tree and find
 *   the smallest enclosing frame.
 */
async function resolveNodeId(
  client: FigmaClient,
  fileKey: string,
  meta: ClientMeta
): Promise<string | null> {
  if (hasNodeId(meta)) {
    return meta.node_id;
  }

  if (!isVector(meta)) return null;

  logger.info("Resolving node from absolute coordinates, fetching file tree...");
  const file = await client.get<FigmaFileResponse>(`/v1/files/${fileKey}?depth=2`);
  return findEnclosingNode(file.document, meta.x, meta.y);
}

/**
 * Walk the Figma node tree and find the smallest frame/group that
 * contains the given (x, y) point.
 *
 * Algorithm: depth-first traversal. For each node with an absoluteBoundingBox,
 * check if the point falls inside. Track the smallest area seen so far —
 * smaller area means a more specific (deeper, more local) frame.
 */
function findEnclosingNode(node: FigmaNode, x: number, y: number): string | null {
  let bestId: string | null = null;
  let bestArea = Infinity;

  function walk(n: FigmaNode): void {
    const box = n.absoluteBoundingBox;
    if (box && n.type !== "DOCUMENT" && n.type !== "CANVAS") {
      const inside =
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height;

      if (inside) {
        const area = box.width * box.height;
        if (area < bestArea) {
          bestId = n.id;
          bestArea = area;
        }
      }
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }

  walk(node);
  return bestId;
}

// ── Image export & download ───────────────────────────────────────────

async function exportNodeImage(
  client: FigmaClient,
  fileKey: string,
  nodeId: string,
  scale: number
): Promise<string | null> {
  const encodedId = encodeURIComponent(nodeId);
  const res = await client.get<FigmaImageResponse>(
    `/v1/images/${fileKey}?ids=${encodedId}&scale=${scale}&format=png`
  );

  if (res.err) {
    logger.error("Figma image export error", res.err);
    return null;
  }

  return res.images[nodeId] ?? null;
}

/** Download an image URL and return the contents as a base64-encoded string. */
async function downloadAsBase64(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("base64");
}
