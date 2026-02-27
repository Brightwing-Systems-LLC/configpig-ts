/** Provider registry — discover and instantiate rotation providers. */

import type { RotationProvider } from "./base.js";

type ProviderFactory = (
  config?: Record<string, unknown>
) => RotationProvider;

const _registry = new Map<string, ProviderFactory>();

/** Register a rotation provider factory under a name. */
export function registerProvider(
  name: string,
  factory: ProviderFactory
): void {
  _registry.set(name, factory);
}

/**
 * Instantiate a registered provider by name.
 *
 * @throws Error if the provider is not registered.
 */
export function getProvider(
  name: string,
  config?: Record<string, unknown>
): RotationProvider {
  const factory = _registry.get(name);
  if (!factory) {
    const available = listProviders().join(", ");
    throw new Error(
      `Unknown rotation provider: '${name}'. Available: ${available}.`
    );
  }
  return factory(config);
}

/** Return names of all registered providers. */
export function listProviders(): string[] {
  return [..._registry.keys()].sort();
}

// Auto-register built-in providers on import
async function autoRegister() {
  const { OpenAIProvider } = await import("./openai.js");
  const { GitHubProvider } = await import("./github.js");
  const { AnthropicProvider } = await import("./anthropic.js");

  registerProvider("openai", (cfg) => new OpenAIProvider(cfg));
  registerProvider("github", (cfg) => new GitHubProvider(cfg));
  registerProvider("anthropic", (cfg) => new AnthropicProvider(cfg));
}

autoRegister();
