/**
 * Envelope encryption scheme.
 *
 * Each secret gets its own random Data Encryption Key (DEK).
 * The DEK encrypts the plaintext. The master key encrypts the DEK.
 * This limits the blast radius of any single key compromise and
 * allows efficient master key rotation (re-wrap DEKs, don't re-encrypt data).
 *
 * Binary blob format (v1):
 *     version     (1 byte)  — always 0x01
 *     nonce_dek   (12 bytes) — AES-GCM nonce for DEK encryption
 *     wrapped_dek (48 bytes) — encrypted DEK (32) + GCM tag (16)
 *     nonce_data  (12 bytes) — AES-GCM nonce for data encryption
 *     ciphertext  (variable) — encrypted data + GCM tag (16)
 *
 * Total overhead: 73 bytes + 16-byte GCM tag on data.
 */

import {
  AES_KEY_SIZE,
  AES_NONCE_SIZE,
  aesGcmDecrypt,
  aesGcmEncrypt,
  randomBytes,
} from "./primitives.js";

export const ENVELOPE_VERSION = 0x01;

// Offsets in the binary blob
const VERSION_LEN = 1;
const NONCE_LEN = AES_NONCE_SIZE; // 12
const WRAPPED_DEK_LEN = AES_KEY_SIZE + 16; // 32 + 16 GCM tag = 48
const HEADER_LEN = VERSION_LEN + NONCE_LEN + WRAPPED_DEK_LEN + NONCE_LEN; // 73

/**
 * Encrypt data using envelope encryption.
 *
 * @param masterKey 32-byte master key (derived from passphrase via Argon2id).
 * @param plaintext Data to encrypt.
 * @returns Binary blob containing version, wrapped DEK, and encrypted data.
 */
export function envelopeEncrypt(
  masterKey: Uint8Array,
  plaintext: Uint8Array
): Uint8Array {
  // Generate a random per-secret DEK
  const dek = randomBytes(AES_KEY_SIZE);

  // Encrypt plaintext with DEK
  const { nonce: nonceData, ciphertextWithTag: encryptedData } = aesGcmEncrypt(
    dek,
    plaintext
  );

  // Wrap (encrypt) DEK with master key
  const { nonce: nonceDek, ciphertextWithTag: wrappedDek } = aesGcmEncrypt(
    masterKey,
    dek
  );

  // Assemble blob: version + nonce_dek + wrapped_dek + nonce_data + encrypted_data
  const blob = new Uint8Array(
    VERSION_LEN +
      nonceDek.length +
      wrappedDek.length +
      nonceData.length +
      encryptedData.length
  );

  let offset = 0;
  blob[offset] = ENVELOPE_VERSION;
  offset += VERSION_LEN;
  blob.set(nonceDek, offset);
  offset += nonceDek.length;
  blob.set(wrappedDek, offset);
  offset += wrappedDek.length;
  blob.set(nonceData, offset);
  offset += nonceData.length;
  blob.set(encryptedData, offset);

  return blob;
}

/**
 * Decrypt an envelope-encrypted blob.
 *
 * @param masterKey 32-byte master key.
 * @param blob Binary blob produced by envelopeEncrypt().
 * @returns Decrypted plaintext bytes.
 */
export function envelopeDecrypt(
  masterKey: Uint8Array,
  blob: Uint8Array
): Uint8Array {
  if (blob.length < HEADER_LEN + 1) {
    throw new Error(
      `Blob too short: ${blob.length} bytes (minimum ${HEADER_LEN + 1})`
    );
  }

  const version = blob[0];
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${version}`);
  }

  let offset = VERSION_LEN;
  const nonceDek = blob.slice(offset, offset + NONCE_LEN);
  offset += NONCE_LEN;
  const wrappedDek = blob.slice(offset, offset + WRAPPED_DEK_LEN);
  offset += WRAPPED_DEK_LEN;
  const nonceData = blob.slice(offset, offset + NONCE_LEN);
  offset += NONCE_LEN;
  const encryptedData = blob.slice(offset);

  // Unwrap DEK
  const dek = aesGcmDecrypt(masterKey, nonceDek, wrappedDek);

  // Decrypt data
  return aesGcmDecrypt(dek, nonceData, encryptedData);
}
