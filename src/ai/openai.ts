import OpenAI from "openai";
import type { AIClient } from "./types.js";
import type { PromptConfig } from "../config.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

export class OpenAIClient implements AIClient {
  private client: OpenAI;
  private model: string;
  private promptConfig: PromptConfig;

  constructor(apiKey: string, model: string, promptConfig: PromptConfig) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.promptConfig = promptConfig;
  }

  async ask(
    question: string,
    screenshotBase64: string | null,
    projectContext: string
  ): Promise<string> {
    const contentParts: OpenAI.ChatCompletionContentPart[] = [];

    if (screenshotBase64) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${screenshotBase64}`,
        },
      });
    }

    contentParts.push({
      type: "text",
      text: buildUserPrompt(this.promptConfig, question, screenshotBase64 !== null, projectContext),
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: buildSystemPrompt(this.promptConfig) },
        { role: "user", content: contentParts },
      ],
    });

    return (
      response.choices[0]?.message?.content ??
      "Sorry, I could not generate a response."
    );
  }
}
