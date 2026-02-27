/** Tests for the ConfigPig crypto module. */

import { describe, it, expect, afterEach } from "vitest";
import {
  AES_KEY_SIZE,
  AES_NONCE_SIZE,
  ARGON2_HASH_LEN,
  ARGON2_SALT_LEN,
  aesGcmDecrypt,
  aesGcmEncrypt,
  argon2idDerive,
  blake2bHash,
  randomBytes,
} from "../src/crypto/primitives.js";
import {
  ENVELOPE_VERSION,
  envelopeDecrypt,
  envelopeEncrypt,
} from "../src/crypto/envelope.js";
import {
  VAULT_PREFIX,
  decryptSecret,
  deriveMasterKey,
  encryptSecret,
  fingerprint,
  isVaultEncrypted,
  loadMasterKey,
} from "../src/crypto/vault.js";

// ── Primitives tests ──

describe("randomBytes", () => {
  it("returns correct length", () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
  });

  it("returns unique values", () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(Buffer.from(a).toString("hex")).not.toBe(
      Buffer.from(b).toString("hex")
    );
  });
});

describe("aesGcmEncrypt / aesGcmDecrypt", () => {
  it("roundtrip encrypt-decrypt", () => {
    const key = randomBytes(AES_KEY_SIZE);
    const plaintext = new TextEncoder().encode("hello, world!");
    const { nonce, ciphertextWithTag } = aesGcmEncrypt(key, plaintext);
    expect(nonce.length).toBe(AES_NONCE_SIZE);
    const result = aesGcmDecrypt(key, nonce, ciphertextWithTag);
    expect(new TextDecoder().decode(result)).toBe("hello, world!");
  });

  it("wrong key fails", () => {
    const key1 = randomBytes(AES_KEY_SIZE);
    const key2 = randomBytes(AES_KEY_SIZE);
    const { nonce, ciphertextWithTag } = aesGcmEncrypt(
      key1,
      new TextEncoder().encode("secret")
    );
    expect(() => aesGcmDecrypt(key2, nonce, ciphertextWithTag)).toThrow();
  });

  it("tampered ciphertext fails", () => {
    const key = randomBytes(AES_KEY_SIZE);
    const { nonce, ciphertextWithTag } = aesGcmEncrypt(
      key,
      new TextEncoder().encode("secret")
    );
    const tampered = new Uint8Array(ciphertextWithTag);
    tampered[0] ^= 0xff;
    expect(() => aesGcmDecrypt(key, nonce, tampered)).toThrow();
  });

  it("rejects invalid key size", () => {
    expect(() =>
      aesGcmEncrypt(new Uint8Array(5), new Uint8Array(4))
    ).toThrow(/Key must be/);
  });

  it("handles empty plaintext", () => {
    const key = randomBytes(AES_KEY_SIZE);
    const { nonce, ciphertextWithTag } = aesGcmEncrypt(key, new Uint8Array(0));
    const result = aesGcmDecrypt(key, nonce, ciphertextWithTag);
    expect(result.length).toBe(0);
  });

  it("handles large plaintext", () => {
    const key = randomBytes(AES_KEY_SIZE);
    const plaintext = randomBytes(10_000);
    const { nonce, ciphertextWithTag } = aesGcmEncrypt(key, plaintext);
    const result = aesGcmDecrypt(key, nonce, ciphertextWithTag);
    expect(Buffer.from(result).toString("hex")).toBe(
      Buffer.from(plaintext).toString("hex")
    );
  });
});

describe("argon2idDerive", () => {
  it("derives key with auto salt", async () => {
    const [derived, salt] = await argon2idDerive("my-passphrase");
    expect(derived.length).toBe(ARGON2_HASH_LEN);
    expect(salt.length).toBe(ARGON2_SALT_LEN);
  });

  it("deterministic with same salt", async () => {
    const salt = randomBytes(ARGON2_SALT_LEN);
    const [d1] = await argon2idDerive("password", salt);
    const [d2] = await argon2idDerive("password", salt);
    expect(Buffer.from(d1).toString("hex")).toBe(
      Buffer.from(d2).toString("hex")
    );
  });

  it("different passphrases produce different keys", async () => {
    const salt = randomBytes(ARGON2_SALT_LEN);
    const [d1] = await argon2idDerive("password-a", salt);
    const [d2] = await argon2idDerive("password-b", salt);
    expect(Buffer.from(d1).toString("hex")).not.toBe(
      Buffer.from(d2).toString("hex")
    );
  });

  it("different salts produce different keys", async () => {
    const [d1, s1] = await argon2idDerive("same-pass");
    const [d2, s2] = await argon2idDerive("same-pass");
    expect(Buffer.from(s1).toString("hex")).not.toBe(
      Buffer.from(s2).toString("hex")
    );
    expect(Buffer.from(d1).toString("hex")).not.toBe(
      Buffer.from(d2).toString("hex")
    );
  });

  it("rejects invalid salt size", async () => {
    await expect(argon2idDerive("pass", new Uint8Array(3))).rejects.toThrow(
      /Salt must be/
    );
  });
});

describe("blake2bHash", () => {
  it("is deterministic", async () => {
    const data = new TextEncoder().encode("hello");
    const a = await blake2bHash(data);
    const b = await blake2bHash(data);
    expect(Buffer.from(a).toString("hex")).toBe(
      Buffer.from(b).toString("hex")
    );
  });

  it("different inputs produce different hashes", async () => {
    const a = await blake2bHash(new TextEncoder().encode("a"));
    const b = await blake2bHash(new TextEncoder().encode("b"));
    expect(Buffer.from(a).toString("hex")).not.toBe(
      Buffer.from(b).toString("hex")
    );
  });

  it("default digest is 32 bytes", async () => {
    const h = await blake2bHash(new TextEncoder().encode("data"));
    expect(h.length).toBe(32);
  });

  it("supports custom digest size", async () => {
    const h = await blake2bHash(new TextEncoder().encode("data"), 16);
    expect(h.length).toBe(16);
  });
});

// ── Envelope encryption tests ──

describe("envelopeEncrypt / envelopeDecrypt", () => {
  it("roundtrip", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const plaintext = new TextEncoder().encode("my secret API key sk-proj-abc123");
    const blob = envelopeEncrypt(masterKey, plaintext);
    const result = envelopeDecrypt(masterKey, blob);
    expect(new TextDecoder().decode(result)).toBe(
      "my secret API key sk-proj-abc123"
    );
  });

  it("version byte is correct", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const blob = envelopeEncrypt(
      masterKey,
      new TextEncoder().encode("data")
    );
    expect(blob[0]).toBe(ENVELOPE_VERSION);
  });

  it("wrong master key fails", () => {
    const mk1 = randomBytes(AES_KEY_SIZE);
    const mk2 = randomBytes(AES_KEY_SIZE);
    const blob = envelopeEncrypt(mk1, new TextEncoder().encode("secret"));
    expect(() => envelopeDecrypt(mk2, blob)).toThrow();
  });

  it("tampered blob fails", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const blob = envelopeEncrypt(
      masterKey,
      new TextEncoder().encode("secret")
    );
    const tampered = new Uint8Array(blob);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => envelopeDecrypt(masterKey, tampered)).toThrow();
  });

  it("rejects blob too short", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const shortBlob = new Uint8Array([0x01, ...new Uint8Array(10)]);
    expect(() => envelopeDecrypt(masterKey, shortBlob)).toThrow(/too short/);
  });

  it("rejects unsupported version", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const blob = envelopeEncrypt(
      masterKey,
      new TextEncoder().encode("data")
    );
    const tampered = new Uint8Array(blob);
    tampered[0] = 0xff;
    expect(() => envelopeDecrypt(masterKey, tampered)).toThrow(
      /Unsupported envelope version/
    );
  });

  it("each encryption is unique (different DEKs/nonces)", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const blob1 = envelopeEncrypt(
      masterKey,
      new TextEncoder().encode("same")
    );
    const blob2 = envelopeEncrypt(
      masterKey,
      new TextEncoder().encode("same")
    );
    expect(Buffer.from(blob1).toString("hex")).not.toBe(
      Buffer.from(blob2).toString("hex")
    );
  });

  it("handles empty plaintext", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const blob = envelopeEncrypt(masterKey, new Uint8Array(0));
    const result = envelopeDecrypt(masterKey, blob);
    expect(result.length).toBe(0);
  });

  it("handles large plaintext", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const plaintext = randomBytes(100_000);
    const blob = envelopeEncrypt(masterKey, plaintext);
    const result = envelopeDecrypt(masterKey, blob);
    expect(Buffer.from(result).toString("hex")).toBe(
      Buffer.from(plaintext).toString("hex")
    );
  });
});

// ── Vault high-level tests ──

describe("vault", () => {
  it("encrypt-decrypt roundtrip", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    const secret = "sk-proj-abc123def456";
    const encrypted = encryptSecret(masterKey, secret);
    expect(encrypted.startsWith(VAULT_PREFIX)).toBe(true);
    const decrypted = decryptSecret(masterKey, encrypted);
    expect(decrypted).toBe(secret);
  });

  it("decrypt without prefix fails", () => {
    const masterKey = randomBytes(AES_KEY_SIZE);
    expect(() => decryptSecret(masterKey, "not-a-vault-value")).toThrow(
      /must start with/
    );
  });

  it("fingerprint is deterministic", async () => {
    const ct = "vault:encrypted:abc123";
    const fp1 = await fingerprint(ct);
    const fp2 = await fingerprint(ct);
    expect(fp1).toBe(fp2);
  });

  it("fingerprint differs for different ciphertext", async () => {
    const fp1 = await fingerprint("vault:encrypted:aaa");
    const fp2 = await fingerprint("vault:encrypted:bbb");
    expect(fp1).not.toBe(fp2);
  });

  it("fingerprint is 64-char hex", async () => {
    const fp = await fingerprint("vault:encrypted:test");
    expect(fp.length).toBe(64);
    expect(() => parseInt(fp, 16)).not.toThrow();
  });

  it("isVaultEncrypted detects vault values", () => {
    expect(isVaultEncrypted("vault:encrypted:abc123")).toBe(true);
    expect(isVaultEncrypted("not-encrypted")).toBe(false);
    expect(isVaultEncrypted("")).toBe(false);
  });

  it("deriveMasterKey returns key and salt", async () => {
    const [mk, salt] = await deriveMasterKey("my-passphrase");
    expect(mk.length).toBe(32);
    expect(salt.length).toBe(16);
  });
});

describe("loadMasterKey", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads from env", () => {
    const key = randomBytes(32);
    process.env.CONFIGPIG_MASTER_KEY = Buffer.from(key).toString("hex");
    const loaded = loadMasterKey();
    expect(Buffer.from(loaded).toString("hex")).toBe(
      Buffer.from(key).toString("hex")
    );
  });

  it("missing env throws", () => {
    delete process.env.CONFIGPIG_MASTER_KEY;
    expect(() => loadMasterKey()).toThrow(/Master key not found/);
  });

  it("invalid hex throws", () => {
    process.env.CONFIGPIG_MASTER_KEY = "not-hex";
    expect(() => loadMasterKey()).toThrow(/hex-encoded/);
  });

  it("wrong length throws", () => {
    process.env.CONFIGPIG_MASTER_KEY = "aabb";
    expect(() => loadMasterKey()).toThrow(/32 bytes/);
  });

  it("custom env var", () => {
    const key = randomBytes(32);
    process.env.MY_KEY = Buffer.from(key).toString("hex");
    const loaded = loadMasterKey("MY_KEY");
    expect(Buffer.from(loaded).toString("hex")).toBe(
      Buffer.from(key).toString("hex")
    );
  });
});

// ── Integration: full encrypt-decrypt flow ──

describe("full flow: passphrase to secret roundtrip", () => {
  it("derives key, encrypts, re-derives, decrypts", async () => {
    const passphrase = "my-secure-passphrase-2026!";
    const [masterKey, salt] = await deriveMasterKey(passphrase);

    const secrets: Record<string, string> = {
      openai_key: "sk-proj-abc123def456ghi789",
      github_token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      db_password: "p@ssw0rd!#$%^&*()",
      empty: "",
      unicode: "p\u00e4ssw\u00f6rd with \u00fc\u00f1\u00ef\u00e7\u00f8\u00f0\u00e9",
    };

    const encrypted: Record<string, string> = {};
    for (const [name, value] of Object.entries(secrets)) {
      encrypted[name] = encryptSecret(masterKey, value);
      expect(encrypted[name].startsWith(VAULT_PREFIX)).toBe(true);
      if (value) {
        expect(encrypted[name]).not.toContain(value);
      }
    }

    // Re-derive the same master key from passphrase + salt
    const [masterKey2] = await deriveMasterKey(passphrase, salt);
    expect(Buffer.from(masterKey2).toString("hex")).toBe(
      Buffer.from(masterKey).toString("hex")
    );

    for (const [name, value] of Object.entries(secrets)) {
      const decrypted = decryptSecret(masterKey2, encrypted[name]);
      expect(decrypted).toBe(value);
    }
  });
});
