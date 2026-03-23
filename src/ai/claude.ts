import Anthropic from "@anthropic-ai/sdk";
import type { AIClient } from "./types.js";
import type { PromptConfig } from "../config.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

export class ClaudeClient implements AIClient {
  private client: Anthropic;
  private model: string;
  private promptConfig: PromptConfig;

  constructor(apiKey: string, model: string, promptConfig: PromptConfig) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.promptConfig = promptConfig;
  }

  async ask(
    question: string,
    screenshotBase64: string | null,
    projectContext: string
  ): Promise<string> {
    const contentParts: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

    if (screenshotBase64) {
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: screenshotBase64,
        },
      });
    }

    contentParts.push({
      type: "text",
      text: buildUserPrompt(this.promptConfig, question, screenshotBase64 !== null, projectContext),
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: buildSystemPrompt(this.promptConfig),
      messages: [{ role: "user", content: contentParts }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock ? textBlock.text : "Sorry, I could not generate a response.";
  }
}
