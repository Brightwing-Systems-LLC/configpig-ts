/** ConfigPig — TypeScript SDK for managing configs via API. */

export { Client } from "./client.js";
export type { ClientConfig } from "./client.js";
export { configure, getConfig } from "./drop-in.js";
export { resolveReferences, resolveConfigContent } from "./resolver.js";
export type {
  APIResponse,
  Config,
  ConfigLabel,
  ConfigSummary,
  ConfigVersion,
  ConfigureOptions,
  CreateConfigOptions,
  CreateExportOptions,
  CreateLabelOptions,
  DeleteSecretOptions,
  Export,
  FetchOptions,
  FetchResult,
  GetConfigOptions,
  GetSecretOptions,
  HealthCheck,
  LabelInfo,
  ListSecretsOptions,
  SecretAuditEntry,
  SecretAuditLogOptions,
  SecretData,
  SecretListResult,
  SecretMetadata,
  SetSecretOptions,
  TeamLabel,
  UpdateConfigOptions,
} from "./types.js";

// ── Crypto ──

export {
  encryptSecret,
  decryptSecret,
  deriveMasterKey,
  loadMasterKey,
  fingerprint,
  isVaultEncrypted,
  VAULT_PREFIX,
  envelopeEncrypt,
  envelopeDecrypt,
  ENVELOPE_VERSION,
} from "./crypto/index.js";

// ── Rotation ──

export { RotationProvider } from "./rotation/base.js";
export type { RotationResult } from "./rotation/base.js";
export {
  getProvider,
  registerProvider,
  listProviders,
} from "./rotation/registry.js";
