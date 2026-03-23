import type { AIClient } from "./types.js";
import { ClaudeClient } from "./claude.js";
import { OpenAIClient } from "./openai.js";
import type { Config } from "../config.js";

export { loadContextFiles } from "./context.js";
export type { AIClient } from "./types.js";

/**
 * Factory: create the appropriate AI client based on the configured provider.
 * Config validation guarantees the required API key is present.
 */
export function createAIClient(config: Config): AIClient {
  switch (config.aiProvider) {
    case "claude":
      return new ClaudeClient(config.anthropicApiKey!, config.aiModel, config.prompt);

    case "openai":
      return new OpenAIClient(config.openaiApiKey!, config.aiModel, config.prompt);

    default:
      throw new Error(`Unknown AI provider: ${config.aiProvider}`);
  }
}
