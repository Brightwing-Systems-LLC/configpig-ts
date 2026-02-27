/**
 * High-level vault operations for ConfigPig secrets.
 *
 * This module provides the public API for encrypting and decrypting secrets.
 * It combines Argon2id key derivation with envelope encryption.
 */

import { envelopeDecrypt, envelopeEncrypt } from "./envelope.js";
import { argon2idDerive, blake2bHash } from "./primitives.js";

export const VAULT_PREFIX = "vault:encrypted:";

/**
 * Derive a master key from a passphrase using Argon2id.
 *
 * @returns [masterKey, salt] — 32-byte key and 16-byte salt.
 */
export async function deriveMasterKey(
  passphrase: string,
  salt?: Uint8Array
): Promise<[Uint8Array, Uint8Array]> {
  return argon2idDerive(passphrase, salt);
}

/**
 * Load the master key from an environment variable.
 *
 * The env var stores the key as a hex-encoded string (64 hex chars = 32 bytes).
 */
export function loadMasterKey(
  envVar: string = "CONFIGPIG_MASTER_KEY"
): Uint8Array {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(
      `Master key not found. Set ${envVar} or run 'pig init' to generate one.`
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(
      `${envVar} must be a hex-encoded 32-byte key (64 hex characters).`
    );
  }

  const key = new Uint8Array(raw.length / 2);
  for (let i = 0; i < key.length; i++) {
    key[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }

  if (key.length !== 32) {
    throw new Error(
      `${envVar} must be exactly 32 bytes (64 hex chars), got ${key.length} bytes.`
    );
  }

  return key;
}

/**
 * Encrypt a secret value, returning a vault-prefixed base64 string.
 *
 * @returns String in the form "vault:encrypted:<base64blob>".
 */
export function encryptSecret(masterKey: Uint8Array, plaintext: string): string {
  const blob = envelopeEncrypt(masterKey, new TextEncoder().encode(plaintext));
  const encoded = Buffer.from(blob).toString("base64");
  return `${VAULT_PREFIX}${encoded}`;
}

/**
 * Decrypt a vault-encrypted secret value.
 *
 * @returns Decrypted plaintext string.
 */
export function decryptSecret(
  masterKey: Uint8Array,
  ciphertext: string
): string {
  if (!ciphertext.startsWith(VAULT_PREFIX)) {
    throw new Error(`Ciphertext must start with '${VAULT_PREFIX}'`);
  }
  const encoded = ciphertext.slice(VAULT_PREFIX.length);
  const blob = new Uint8Array(Buffer.from(encoded, "base64"));
  return new TextDecoder().decode(envelopeDecrypt(masterKey, blob));
}

/**
 * Compute a BLAKE2b fingerprint of a ciphertext string.
 *
 * Used for rotation tracking — allows comparing whether a secret
 * has changed without accessing the plaintext.
 *
 * @returns Hex-encoded 32-byte BLAKE2b hash.
 */
export async function fingerprint(ciphertext: string): Promise<string> {
  const hash = await blake2bHash(new TextEncoder().encode(ciphertext));
  return Buffer.from(hash).toString("hex");
}

/** Check if a string is a vault-encrypted value. */
export function isVaultEncrypted(value: string): boolean {
  return value.startsWith(VAULT_PREFIX);
}
