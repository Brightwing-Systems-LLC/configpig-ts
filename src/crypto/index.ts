/** Crypto module — zero-knowledge envelope encryption for ConfigPig secrets. */

export {
  AES_KEY_SIZE,
  AES_NONCE_SIZE,
  ARGON2_TIME_COST,
  ARGON2_MEMORY_COST,
  ARGON2_PARALLELISM,
  ARGON2_HASH_LEN,
  ARGON2_SALT_LEN,
  randomBytes,
  aesGcmEncrypt,
  aesGcmDecrypt,
  argon2idDerive,
  blake2bHash,
} from "./primitives.js";

export { ENVELOPE_VERSION, envelopeEncrypt, envelopeDecrypt } from "./envelope.js";

export {
  VAULT_PREFIX,
  deriveMasterKey,
  loadMasterKey,
  encryptSecret,
  decryptSecret,
  fingerprint,
  isVaultEncrypted,
} from "./vault.js";
