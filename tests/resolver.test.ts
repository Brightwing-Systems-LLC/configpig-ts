/** Tests for the vault:// reference resolver. */

import { describe, it, expect, vi } from "vitest";
import { resolveReferences, resolveConfigContent } from "../src/resolver.js";
import { randomBytes } from "../src/crypto/primitives.js";
import { AES_KEY_SIZE } from "../src/crypto/primitives.js";
import { encryptSecret } from "../src/crypto/vault.js";
import { Client } from "../src/client.js";

function mockClient(
  masterKey: Uint8Array
): Client {
  const client = {
    getSecret: vi.fn(
      async (
        configSlug: string,
        secretKey: string,
        _opts?: { environment?: string }
      ) => {
        if (configSlug === "my-app" && secretKey === "openai_api_key") {
          return {
            ok: true,
            data: {
              ciphertext: encryptSecret(masterKey, "sk-proj-decrypted-123"),
            },
          };
        }
        if (configSlug === "my-app" && secretKey === "github_token") {
          return {
            ok: true,
            data: {
              ciphertext: encryptSecret(masterKey, "ghp_resolved_token"),
            },
          };
        }
        return { ok: false, error: "Not found" };
      }
    ),
  } as unknown as Client;
  return client;
}

describe("resolveReferences", () => {
  it("resolves vault references", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = mockClient(masterKey);
    const content = JSON.stringify({
      api_key: "vault://configpig/my-app/openai_api_key",
      host: "localhost",
    });

    const result = await resolveReferences(content, {
      client,
      masterKey,
    });
    expect(result).toContain("sk-proj-decrypted-123");
    expect(result).not.toContain("vault://configpig/");
    expect(result).toContain("localhost");
  });

  it("resolves multiple references", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = mockClient(masterKey);
    const content = JSON.stringify({
      openai: "vault://configpig/my-app/openai_api_key",
      github: "vault://configpig/my-app/github_token",
    });

    const result = await resolveReferences(content, {
      client,
      masterKey,
    });
    expect(result).toContain("sk-proj-decrypted-123");
    expect(result).toContain("ghp_resolved_token");
  });

  it("returns content unchanged if no references", async () => {
    const content = '{"host": "localhost", "port": 8080}';
    const result = await resolveReferences(content);
    expect(result).toBe(content);
  });

  it("preserves unresolvable references", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = mockClient(masterKey);
    const content = '{"key": "vault://configpig/nonexistent/missing_key"}';

    const result = await resolveReferences(content, { client });
    expect(result).toContain("vault://configpig/nonexistent/missing_key");
  });

  it("handles env file format", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = mockClient(masterKey);
    const content =
      "HOST=localhost\nAPI_KEY=vault://configpig/my-app/openai_api_key\n";

    const result = await resolveReferences(content, {
      client,
      masterKey,
    });
    expect(result).toContain("sk-proj-decrypted-123");
    expect(result).toContain("HOST=localhost");
  });
});

describe("resolveConfigContent", () => {
  it("is an alias for resolveReferences", async () => {
    const content = '{"host": "localhost"}';
    const result = await resolveConfigContent(content);
    expect(result).toBe(content);
  });
});
