/**
 * OpenAI API key rotation provider.
 *
 * Rotates API keys using the OpenAI admin API.
 */

import { RotationProvider } from "./base.js";
import type { RotationResult } from "./base.js";

export class OpenAIProvider extends RotationProvider {
  readonly name = "openai";

  async rotate(currentSecret: string): Promise<RotationResult> {
    const baseUrl = String(
      this.config.base_url ?? "https://api.openai.com/v1"
    );
    const adminKey = String(this.config.admin_key ?? currentSecret);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    };

    try {
      const createBody: Record<string, unknown> = {};
      if (this.config.name) createBody.name = this.config.name;
      if (this.config.project_id)
        createBody.project_id = this.config.project_id;

      const resp = await fetch(`${baseUrl}/organization/api_keys`, {
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
          error: `OpenAI API error: ${resp.status} ${text.slice(0, 200)}`,
          metadata: {},
        };
      }

      const data = (await resp.json()) as Record<string, unknown>;
      const newKey = String(data.key ?? data.api_key ?? "");

      if (!newKey) {
        return {
          success: false,
          newSecret: "",
          error: "OpenAI API returned no key in response.",
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
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10_000),
      });
      return resp.status === 200;
    } catch {
      return false;
    }
  }
}
