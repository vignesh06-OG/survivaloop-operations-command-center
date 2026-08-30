import type { AiProvider, ChatMessage, TaskContext, AiResponse } from "./provider";
import { parseAiResponse } from "./provider";

/**
 * A robust wrapper for any AI provider implementation.
 * Ensures that if the upstream API fails, times out, or returns malformed
 * data, the application safely recovers.
 */
export class SafeAiProvider implements AiProvider {
  private inner: AiProvider;
  private fallbackProvider: AiProvider;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(
    inner: AiProvider,
    fallbackProvider: AiProvider,
    options?: { timeoutMs?: number; maxRetries?: number }
  ) {
    this.inner = inner;
    this.fallbackProvider = fallbackProvider;
    this.timeoutMs = options?.timeoutMs ?? 15000;
    this.maxRetries = options?.maxRetries ?? 1;
  }

  async chat(
    history: ChatMessage[],
    context: TaskContext,
    locale: string
  ): Promise<AiResponse> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      try {
        // Execute with timeout
        const rawResponse = await this.withTimeout(
          this.inner.chat(history, context, locale),
          this.timeoutMs
        );

        // Enforce strict output validation
        return parseAiResponse(rawResponse);
      } catch (err) {
        lastError = err;
        attempt++;
        // If it's a timeout or schema validation error, we retry.
        // We could selectively retry based on error type, but retrying once
        // is generally safe for transient API issues.
      }
    }

    console.error(
      `[SafeAiProvider] Provider failed after ${this.maxRetries} retries. Error:`,
      lastError
    );

    // Fall back to the safe mock provider to ensure the user is not blocked
    try {
      const fallbackResponse = await this.fallbackProvider.chat(
        history,
        context,
        locale
      );
      return parseAiResponse(fallbackResponse); // Ensure the mock also conforms
    } catch (fallbackErr) {
      console.error(
        "[SafeAiProvider] Fallback provider also failed!",
        fallbackErr
      );
      // Ultimate safe fallback if even the mock fails
      return {
        kind: "text",
        text: "System is currently unavailable. Please try again later.",
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
