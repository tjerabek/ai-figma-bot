import { logger } from "../utils/logger.js";

const BASE_URL = "https://api.figma.com";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * HTTP client for the Figma REST API.
 * Handles authentication, rate-limit retries with Retry-After, and request timeouts.
 */
export class FigmaClient {
  private token: string;
  private maxRetries: number;

  constructor(token: string, maxRetries = 3) {
    this.token = token;
    this.maxRetries = maxRetries;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>("GET", endpoint);
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    let retries = 0;

    while (true) {
      const res = await fetch(url, {
        method,
        headers: {
          "X-Figma-Token": this.token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 429) {
        if (retries >= this.maxRetries) {
          throw new Error(`Figma rate limit exceeded after ${this.maxRetries} retries`);
        }
        const retryAfter = parseInt(res.headers.get("Retry-After") || "30", 10);
        logger.warn(`Figma rate limited, retrying in ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        retries++;
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Figma API ${method} ${endpoint} failed (${res.status}): ${text}`);
      }

      return (await res.json()) as T;
    }
  }
}
