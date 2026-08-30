import type { AiProvider } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { SafeAiProvider } from "./safeProvider";

// Note: Future production providers (e.g., OpenAiProvider) will be imported here.

/**
 * Returns a production-ready, safely-wrapped AI provider based on
 * the current environment configuration.
 *
 * It ensures that whatever underlying provider is selected, it is
 * wrapped in a SafeAiProvider that handles timeouts, retries, and
 * fallback to the mock provider in case of catastrophic failure.
 */
export function getProvider(): AiProvider {
  const providerType = process.env.AI_PROVIDER || "mock";
  const mockProvider = new MockAiProvider();

  let innerProvider: AiProvider;

  switch (providerType.toLowerCase()) {
    case "openai":
    case "anthropic":
      // In the future, instantiate the real API provider here.
      // For now, we only have the mock.
      innerProvider = mockProvider;
      console.warn(`[getProvider] Real provider '${providerType}' not yet implemented. Falling back to mock.`);
      break;
    case "mock":
    default:
      innerProvider = mockProvider;
      break;
  }

  // Wrap the chosen provider in our safety layer.
  // In a real scenario, the innerProvider would be the external API,
  // and the mockProvider acts as the ultimate fallback.
  return new SafeAiProvider(innerProvider, mockProvider, {
    timeoutMs: 15000,
    maxRetries: 1,
  });
}
