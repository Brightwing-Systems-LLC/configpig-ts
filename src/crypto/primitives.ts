/**
 * Low-level cryptographic primitives.
 *
 * All functions wrap well-audited libraries with zero custom cryptography.
 * - AES-256-GCM via node:crypto (OpenSSL backend)
 * - Argon2id via hash-wasm (WASM, no native compilation)
 * - BLAKE2b via hash-wasm
 */

import {
  randomBytes as nodeRandomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { argon2id, blake2b } from "hash-wasm";

// AES-256-GCM constants
export const AES_KEY_SIZE = 32; // 256 bits
export const AES_NONCE_SIZE = 12; // 96 bits (GCM standard)
const AES_TAG_SIZE = 16; // 128-bit auth tag

// Argon2id parameters (OWASP recommended)
export const ARGON2_TIME_COST = 3;
export const ARGON2_MEMORY_COST = 65536; // 64 MiB
export const ARGON2_PARALLELISM = 4;
export const ARGON2_HASH_LEN = 32; // 256-bit derived key
export const ARGON2_SALT_LEN = 16; // 128-bit salt

/** Generate n cryptographically secure random bytes. */
export function randomBytes(n: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(n));
}

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * Returns { nonce, ciphertextWithTag } where nonce is 12 bytes and
 * ciphertextWithTag includes the 16-byte GCM authentication tag appended.
 */
export function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array
): { nonce: Uint8Array; ciphertextWithTag: Uint8Array } {
  if (key.length !== AES_KEY_SIZE) {
    throw new Error(`Key must be ${AES_KEY_SIZE} bytes, got ${key.length}`);
  }

  const nonce = randomBytes(AES_NONCE_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = cipher.update(plaintext);
  const final = cipher.final();
  const tag = cipher.getAuthTag();

  // Combine encrypted + final + tag into one buffer
  const ciphertextWithTag = new Uint8Array(
    encrypted.length + final.length + tag.length
  );
  ciphertextWithTag.set(encrypted, 0);
  ciphertextWithTag.set(final, encrypted.length);
  ciphertextWithTag.set(tag, encrypted.length + final.length);

  return { nonce, ciphertextWithTag };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 *
 * ciphertextWithTag has the 16-byte GCM auth tag appended at the end.
 */
export function aesGcmDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertextWithTag: Uint8Array
): Uint8Array {
  if (key.length !== AES_KEY_SIZE) {
    throw new Error(`Key must be ${AES_KEY_SIZE} bytes, got ${key.length}`);
  }

  // Split tag (last 16 bytes) from ciphertext
  const ciphertext = ciphertextWithTag.slice(0, -AES_TAG_SIZE);
  const tag = ciphertextWithTag.slice(-AES_TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(ciphertext);
  const final = decipher.final();

  const result = new Uint8Array(decrypted.length + final.length);
  result.set(decrypted, 0);
  result.set(final, decrypted.length);
  return result;
}

/**
 * Derive a 256-bit key from a passphrase using Argon2id.
 *
 * Returns [derivedKey, salt] — both as Uint8Array.
 */
export async function argon2idDerive(
  passphrase: string,
  salt?: Uint8Array
): Promise<[Uint8Array, Uint8Array]> {
  if (salt === undefined) {
    salt = randomBytes(ARGON2_SALT_LEN);
  }
  if (salt.length !== ARGON2_SALT_LEN) {
    throw new Error(
      `Salt must be ${ARGON2_SALT_LEN} bytes, got ${salt.length}`
    );
  }

  const hashHex = await argon2id({
    password: passphrase,
    salt,
    iterations: ARGON2_TIME_COST,
    memorySize: ARGON2_MEMORY_COST,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LEN,
    outputType: "hex",
  });

  // Convert hex to Uint8Array
  const derived = new Uint8Array(ARGON2_HASH_LEN);
  for (let i = 0; i < ARGON2_HASH_LEN; i++) {
    derived[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }

  return [derived, salt];
}

/**
 * Compute a BLAKE2b hash.
 *
 * Returns raw bytes as Uint8Array (default 32 bytes).
 */
export async function blake2bHash(
  data: Uint8Array,
  digestSize: number = 32
): Promise<Uint8Array> {
  const hashHex = await blake2b(data, digestSize * 8);

  const result = new Uint8Array(digestSize);
  for (let i = 0; i < digestSize; i++) {
    result[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}
