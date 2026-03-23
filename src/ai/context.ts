import { readFileSync } from "fs";
import { resolve } from "path";
import { globSync } from "node:fs";
import { logger } from "../utils/logger.js";

/** In-memory cache — context files don't change between polls. */
let cachedContext: string | null = null;

/**
 * Load and concatenate all context files matching the given glob patterns.
 * Results are cached after the first call; subsequent calls return instantly.
 *
 * Uses Node's built-in globSync (Node 22+). If a pattern fails to expand,
 * it logs a warning and skips — no fragile fallback.
 */
export function loadContextFiles(patterns: string[]): string {
  if (cachedContext !== null) return cachedContext;

  const sections: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      try {
        const files = globSync(pattern, { cwd: process.cwd() });
        for (const file of files) {
          sections.push(readContextFile(String(file)));
        }
      } catch (err) {
        logger.warn(`Failed to glob pattern "${pattern}"`, err);
      }
    } else {
      sections.push(readContextFile(pattern));
    }
  }

  cachedContext = sections.filter(Boolean).join("\n\n---\n\n");
  logger.info(`Loaded ${sections.filter(Boolean).length} context file(s) (${cachedContext.length} chars)`);
  return cachedContext;
}

/** Read a single file and return its contents, or empty string on failure. */
function readContextFile(filePath: string): string {
  try {
    const absPath = resolve(process.cwd(), filePath);
    return readFileSync(absPath, "utf-8");
  } catch {
    logger.warn(`Could not read context file: ${filePath}`);
    return "";
  }
}
