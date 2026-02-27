/** Secret rotation — pluggable provider adapters and daemon. */

export { RotationProvider } from "./base.js";
export type { RotationResult } from "./base.js";
export { getProvider, registerProvider, listProviders } from "./registry.js";
export { OpenAIProvider } from "./openai.js";
export { AnthropicProvider } from "./anthropic.js";
export { GitHubProvider } from "./github.js";
