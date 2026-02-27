/**
 * Anthropic API key rotation provider.
 *
 * Rotates Anthropic API keys via the admin API.
 */

import { RotationProvider } from "./base.js";
import type { RotationResult } from "./base.js";

export class AnthropicProvider extends RotationProvider {
  readonly name = "anthropic";

  async rotate(currentSecret: string): Promise<RotationResult> {
    const baseUrl = String(
      this.config.base_url ?? "https://api.anthropic.com"
    );
    const adminKey = String(this.config.admin_key ?? currentSecret);

    const headers: Record<string, string> = {
      "x-api-key": adminKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };

    try {
      const createBody: Record<string, unknown> = {};
      if (this.config.name) createBody.name = this.config.name;
      if (this.config.workspace_id)
        createBody.workspace_id = this.config.workspace_id;

      const resp = await fetch(`${baseUrl}/v1/api_keys`, {
        method: "POST",
        headers,
        body: JSON.stringify(createBody),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const text = await resp.text();
        return {
          success: false,
          newSecret: "",
          error: `Anthropic API error: ${resp.status} ${text.slice(0, 200)}`,
          metadata: {},
        };
      }

      const data = (await resp.json()) as Record<string, unknown>;
      const newKey = String(data.api_key ?? data.key ?? "");

      if (!newKey) {
        return {
          success: false,
          newSecret: "",
          error: "Anthropic API returned no key in response.",
          metadata: {},
        };
      }

      return {
        success: true,
        newSecret: newKey,
        error: "",
        metadata: { key_id: data.id ?? "" },
      };
    } catch (err) {
      return {
        success: false,
        newSecret: "",
        error: String(err),
        metadata: {},
      };
    }
  }

  async validate(secret: string): Promise<boolean> {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": secret,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return resp.status === 200;
    } catch {
      return false;
    }
  }
}
