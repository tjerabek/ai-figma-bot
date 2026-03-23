import type { PromptConfig } from "../config.js";

export function buildSystemPrompt(config: PromptConfig): string {
  return config.system;
}

export function buildUserPrompt(
  config: PromptConfig,
  question: string,
  hasScreenshot: boolean,
  projectContext: string
): string {
  const screenshotNote = hasScreenshot
    ? "in the attached screenshot"
    : "(no screenshot available)";

  const contextBlock = projectContext
    ? `Project context:\n${projectContext}`
    : "";

  return config.userTemplate
    .replace("{{screenshot_note}}", screenshotNote)
    .replace("{{question}}", question)
    .replace("{{project_context}}", contextBlock);
}
