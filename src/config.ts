import { readFileSync } from "fs";
import { resolve } from "path";
import { logger } from "./utils/logger.js";
import type { AIProvider } from "./ai/types.js";

/** Configurable system and user prompt templates. */
export interface PromptConfig {
  /** The system message sent to the AI model. */
  system: string;
  /**
   * User message template. Supports placeholders:
   * - {{screenshot_note}}  — "in the attached screenshot" or "(no screenshot available)"
   * - {{question}}         — the user's comment text
   * - {{project_context}}  — concatenated project context files
   */
  userTemplate: string;
}

/** Reply format template. Supports {{answer}} placeholder. */
export interface Config {
  figmaToken: string;
  figmaFileKey: string;
  aiProvider: AIProvider;
  aiModel: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  contextFiles: string[];
  pollingIntervalMs: number;
  triggerPrefix: string;
  screenshotScale: number;
  prompt: PromptConfig;
  /** Reply template posted to Figma. Supports {{prefix}} and {{answer}}. */
  replyTemplate: string;
  /** Max retries for Figma API rate-limit (429) responses. */
  maxApiRetries: number;
}

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
  "You are a design assistant responding to comments on a Figma design file. Give concise, actionable feedback. Reference visual elements when you can see them in the screenshot.";

const DEFAULT_USER_TEMPLATE =
  'The user left this comment on the design shown {{screenshot_note}}:\n\n"{{question}}"\n\n{{project_context}}\n\nRespond concisely and helpfully. Reference specific elements visible in the screenshot when relevant.';

const DEFAULT_REPLY_TEMPLATE = "{{prefix}} thinks {{answer}}";

// ── .env loader ───────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      process.env[key] = value;
    }
  } catch {
    logger.warn("No .env file found, using environment variables");
  }
}

// ── Config file validation ────────────────────────────────────────────

const VALID_PROVIDERS: AIProvider[] = ["claude", "openai"];
const VALID_SCALES = [1, 2, 3, 4];

/**
 * Validate and parse the raw JSON from config.json.
 * Throws descriptive errors for each invalid field.
 */
function validateConfigFile(raw: unknown): {
  context_files: string[];
  polling_interval_ms: number;
  trigger_prefix: string;
  ai_provider: AIProvider;
  ai_model: string;
  screenshot_scale: number;
  reply_template?: string;
  max_api_retries?: number;
  prompt?: { system?: string; user_template?: string };
} {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("config.json must be a JSON object");
  }

  const obj = raw as Record<string, unknown>;

  // ai_provider
  if (!VALID_PROVIDERS.includes(obj.ai_provider as AIProvider)) {
    throw new Error(
      `config.json: "ai_provider" must be one of ${VALID_PROVIDERS.join(", ")} (got "${obj.ai_provider}")`
    );
  }

  // ai_model
  if (typeof obj.ai_model !== "string" || !obj.ai_model.trim()) {
    throw new Error('config.json: "ai_model" must be a non-empty string');
  }

  // trigger_prefix
  if (typeof obj.trigger_prefix !== "string" || !obj.trigger_prefix.trim()) {
    throw new Error('config.json: "trigger_prefix" must be a non-empty string');
  }

  // polling_interval_ms
  if (typeof obj.polling_interval_ms !== "number" || obj.polling_interval_ms < 5000) {
    throw new Error(
      'config.json: "polling_interval_ms" must be a number >= 5000 (to avoid API abuse)'
    );
  }

  // screenshot_scale
  if (!VALID_SCALES.includes(obj.screenshot_scale as number)) {
    throw new Error(
      `config.json: "screenshot_scale" must be one of ${VALID_SCALES.join(", ")} (got ${obj.screenshot_scale})`
    );
  }

  // context_files
  if (!Array.isArray(obj.context_files) || !obj.context_files.every((f) => typeof f === "string")) {
    throw new Error('config.json: "context_files" must be an array of strings');
  }

  // max_api_retries (optional)
  if (obj.max_api_retries !== undefined) {
    if (typeof obj.max_api_retries !== "number" || obj.max_api_retries < 0) {
      throw new Error('config.json: "max_api_retries" must be a non-negative number');
    }
  }

  // reply_template (optional)
  if (obj.reply_template !== undefined) {
    if (typeof obj.reply_template !== "string" || !obj.reply_template.includes("{{answer}}")) {
      throw new Error(
        'config.json: "reply_template" must be a string containing {{answer}} placeholder'
      );
    }
  }

  // prompt (optional)
  if (obj.prompt !== undefined) {
    if (typeof obj.prompt !== "object" || obj.prompt === null) {
      throw new Error('config.json: "prompt" must be an object');
    }
    const p = obj.prompt as Record<string, unknown>;
    if (p.system !== undefined && (typeof p.system !== "string" || !p.system.trim())) {
      throw new Error('config.json: "prompt.system" must be a non-empty string');
    }
    if (p.user_template !== undefined) {
      if (typeof p.user_template !== "string" || !p.user_template.includes("{{question}}")) {
        throw new Error(
          'config.json: "prompt.user_template" must be a string containing {{question}} placeholder'
        );
      }
    }
  }

  return obj as ReturnType<typeof validateConfigFile>;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load and validate all configuration from .env and config.json.
 * Throws with clear messages on any missing or invalid value.
 */
export function loadConfig(): Config {
  loadEnv();

  const configPath = resolve(process.cwd(), "config.json");
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const file = validateConfigFile(raw);

  // Env vars
  const figmaToken = process.env.FIGMA_TOKEN;
  const figmaFileKey = process.env.FIGMA_FILE_KEY;

  if (!figmaToken) throw new Error("FIGMA_TOKEN is required in .env");
  if (!figmaFileKey) throw new Error("FIGMA_FILE_KEY is required in .env");

  if (file.ai_provider === "claude" && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required in .env when ai_provider is 'claude'");
  }
  if (file.ai_provider === "openai" && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required in .env when ai_provider is 'openai'");
  }

  return {
    figmaToken,
    figmaFileKey,
    aiProvider: file.ai_provider,
    aiModel: file.ai_model,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    contextFiles: file.context_files,
    pollingIntervalMs: file.polling_interval_ms,
    triggerPrefix: file.trigger_prefix,
    screenshotScale: file.screenshot_scale,
    maxApiRetries: file.max_api_retries ?? 3,
    replyTemplate: file.reply_template ?? DEFAULT_REPLY_TEMPLATE,
    prompt: {
      system: file.prompt?.system ?? DEFAULT_SYSTEM_PROMPT,
      userTemplate: file.prompt?.user_template ?? DEFAULT_USER_TEMPLATE,
    },
  };
}
