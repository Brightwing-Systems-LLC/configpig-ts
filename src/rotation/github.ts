/**
 * GitHub personal access token rotation provider.
 *
 * Rotates GitHub fine-grained personal access tokens via the GitHub API.
 * Classic tokens (ghp_) cannot be rotated via API — only fine-grained
 * (github_pat_) tokens support this.
 */

import { RotationProvider } from "./base.js";
import type { RotationResult } from "./base.js";

export class GitHubProvider extends RotationProvider {
  readonly name = "github";

  async rotate(currentSecret: string): Promise<RotationResult> {
    const baseUrl = String(
      this.config.base_url ?? "https://api.github.com"
    );
    const clientId = String(this.config.client_id ?? "");

    if (!clientId) {
      return {
        success: false,
        newSecret: "",
        error:
          "GitHub token rotation requires 'client_id' in provider config.",
        metadata: {},
      };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${currentSecret}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    try {
      const resp = await fetch(
        `${baseUrl}/applications/${clientId}/token`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ access_token: currentSecret }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!resp.ok) {
        const text = await resp.text();
        return {
          success: false,
          newSecret: "",
          error: `GitHub API error: ${resp.status} ${text.slice(0, 200)}`,
          metadata: {},
        };
      }

      const data = (await resp.json()) as Record<string, unknown>;
      const newToken = String(data.token ?? "");

      if (!newToken) {
        return {
          success: false,
          newSecret: "",
          error: "GitHub API returned no token in response.",
          metadata: {},
        };
      }

      return {
        success: true,
        newSecret: newToken,
        error: "",
        metadata: { token_id: String(data.id ?? "") },
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
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(10_000),
      });
      return resp.status === 200;
    } catch {
      return false;
    }
  }
}
