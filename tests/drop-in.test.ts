/** Tests for the drop-in getConfig() transparent decryption. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes, AES_KEY_SIZE } from "../src/crypto/primitives.js";
import { encryptSecret, VAULT_PREFIX } from "../src/crypto/vault.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(content: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content,
        format: "json",
        version_number: 1,
        label: "latest",
      }),
    })
  );
}

describe("transparent decryption", () => {
  it("decrypts vault values in config", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    process.env.CONFIGPIG_MASTER_KEY = Buffer.from(masterKey).toString("hex");

    const encryptedKey = encryptSecret(masterKey, "sk-proj-abc123");
    const configContent = JSON.stringify({
      api_key: encryptedKey,
      host: "localhost",
    });

    mockFetch(configContent);

    const dropIn = await import("../src/drop-in.js");
    dropIn.configure({
      apiKey: "test-key",
      decryptSecrets: true,
    });
    const result = await dropIn.getConfig("my-app");

    expect(result).not.toBeNull();
    expect(result).toContain("sk-proj-abc123");
    expect(result).not.toContain(VAULT_PREFIX);
  });

  it("leaves non-vault values untouched", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    process.env.CONFIGPIG_MASTER_KEY = Buffer.from(masterKey).toString("hex");

    const configContent = '{"host": "db.example.com", "port": 5432}';
    mockFetch(configContent);

    const dropIn = await import("../src/drop-in.js");
    dropIn.configure({
      apiKey: "test-key",
      decryptSecrets: true,
    });
    const result = await dropIn.getConfig("my-app");

    expect(result).toBe(configContent);
  });

  it("no decryption without master key", async () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    delete process.env.CONFIGPIG_MASTER_KEY;

    const encryptedKey = encryptSecret(masterKey, "sk-proj-abc123");
    const configContent = JSON.stringify({ api_key: encryptedKey });

    mockFetch(configContent);

    const dropIn = await import("../src/drop-in.js");
    dropIn.configure({ apiKey: "test-key" });
    const result = await dropIn.getConfig("my-app");

    expect(result).not.toBeNull();
    // Without master key and decryptSecrets not set, vault values stay
    expect(result).toContain(VAULT_PREFIX);
  });
});
