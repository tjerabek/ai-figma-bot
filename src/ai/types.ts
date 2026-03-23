export type AIProvider = "claude" | "openai";

export interface AIClient {
  ask(
    question: string,
    screenshotBase64: string | null,
    projectContext: string
  ): Promise<string>;
}
