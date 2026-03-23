import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import { logger } from "../utils/logger.js";

/** Persisted state for a single comment. */
interface CommentState {
  answeredAt: string;
  retryCount: number;
}

/** In-memory representation of the full answered-state file. */
interface AnsweredState {
  [commentId: string]: CommentState;
}

/**
 * Manages the "answered comments" state with an in-memory cache.
 * Reads from disk once at construction; flushes atomically on every mutation
 * (write to temp file, then rename — atomic on most filesystems).
 */
export class StateManager {
  private state: AnsweredState;
  private readonly filePath: string;

  constructor(stateDir?: string) {
    this.filePath = resolve(stateDir ?? process.cwd(), ".state/answered.json");
    this.state = this.loadFromDisk();
  }

  /** Check whether a comment has already been answered. */
  isAnswered(commentId: string): boolean {
    return commentId in this.state && this.state[commentId].answeredAt !== "";
  }

  /** Mark a comment as answered with the current timestamp. */
  markAnswered(commentId: string): void {
    this.state[commentId] = {
      answeredAt: new Date().toISOString(),
      retryCount: 0,
    };
    this.flush();
  }

  /** Return how many times we've retried processing this comment. */
  getRetryCount(commentId: string): number {
    return this.state[commentId]?.retryCount ?? 0;
  }

  /** Increment the retry counter for a comment (creates an entry if needed). */
  incrementRetry(commentId: string): void {
    if (!this.state[commentId]) {
      this.state[commentId] = { answeredAt: "", retryCount: 1 };
    } else {
      this.state[commentId].retryCount++;
    }
    this.flush();
  }

  // ── Private ────────────────────────────────────────────────────────

  /** Read state from disk; returns empty object on any failure. */
  private loadFromDisk(): AnsweredState {
    try {
      const content = readFileSync(this.filePath, "utf-8");
      return JSON.parse(content) as AnsweredState;
    } catch {
      return {};
    }
  }

  /** Atomically write state to disk (write tmp → rename). */
  private flush(): void {
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    renameSync(tmpPath, this.filePath);
  }
}
