/** Tests for the ConfigPig client secrets methods. */

import { describe, it, expect, vi, afterEach } from "vitest";
import { randomBytes, AES_KEY_SIZE } from "../src/crypto/primitives.js";
import { encryptSecret, VAULT_PREFIX } from "../src/crypto/vault.js";
import { Client } from "../src/client.js";

function createClient(masterKey: Uint8Array): Client {
  return new Client({
    apiKey: "sk-api01-test.test",
    baseUrl: "https://test.configpig.com",
    masterKey,
  });
}

function mockFetch(statusCode: number, data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      json: async () => data,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Client.setSecretPlaintext", () => {
  it("encrypts and posts secret", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = createClient(masterKey);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "uuid-1",
        config_slug: "my-app",
        key: "api_key",
        environment: "default",
        algorithm: "aes-256-gcm",
        kdf: "argon2id",
        fingerprint: "abc123",
        created_at: "2026-02-27T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resp = await client.setSecretPlaintext(
      "my-app",
      "api_key",
      "sk-proj-secret123"
    );
    expect(resp.ok).toBe(true);

    // Verify the HTTP call was made with ciphertext, not plaintext
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.ciphertext.startsWith(VAULT_PREFIX)).toBe(true);
    expect(body.ciphertext).not.toContain("sk-proj-secret123");
    expect(body.algorithm).toBe("aes-256-gcm");
    expect(body.kdf).toBe("argon2id");
  });
});

describe("Client.getSecretDecrypted", () => {
  it("fetches and decrypts secret", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = createClient(masterKey);
    const ciphertext = encryptSecret(masterKey, "sk-proj-secret123");

    mockFetch(200, {
      id: "uuid-1",
      config_slug: "my-app",
      key: "api_key",
      environment: "default",
      ciphertext,
      algorithm: "aes-256-gcm",
      kdf: "argon2id",
      fingerprint: "fp",
      created_at: "2026-02-27T00:00:00Z",
      last_accessed_at: null,
    });

    const resp = await client.getSecretDecrypted("my-app", "api_key");
    expect(resp.ok).toBe(true);
    expect(resp.data).toBe("sk-proj-secret123");
  });
});

describe("Client.listSecrets", () => {
  it("lists secret metadata", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = createClient(masterKey);

    mockFetch(200, {
      config_slug: "my-app",
      secrets: [
        {
          key: "api_key",
          environment: "default",
          fingerprint: "fp1",
          created_at: "2026-02-27T00:00:00Z",
          last_accessed_at: null,
        },
        {
          key: "db_pass",
          environment: "production",
          fingerprint: "fp2",
          created_at: "2026-02-27T00:00:00Z",
          last_accessed_at: "2026-02-27T01:00:00Z",
        },
      ],
    });

    const resp = await client.listSecrets("my-app");
    expect(resp.ok).toBe(true);
    expect(resp.data?.secrets.length).toBe(2);
    expect(resp.data?.secrets[0].key).toBe("api_key");
  });
});

describe("Client.deleteSecret", () => {
  it("deletes a secret", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = createClient(masterKey);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body");
        },
      })
    );

    const resp = await client.deleteSecret("my-app", "api_key");
    expect(resp.ok).toBe(true);
  });
});

describe("Client.secretAuditLog", () => {
  it("returns audit entries", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const client = createClient(masterKey);

    mockFetch(200, [
      {
        secret_key: "api_key",
        config_slug: "my-app",
        environment: "default",
        action: "created",
        timestamp: "2026-02-27T00:00:00Z",
      },
      {
        secret_key: "api_key",
        config_slug: "my-app",
        environment: "default",
        action: "accessed",
        timestamp: "2026-02-27T01:00:00Z",
      },
    ]);

    const resp = await client.secretAuditLog("my-app");
    expect(resp.ok).toBe(true);
    expect(resp.data?.length).toBe(2);
    expect(resp.data?.[0].action).toBe("created");
  });
});
