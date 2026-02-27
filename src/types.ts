/** Response types for the ConfigPig API. */

export interface APIResponse<T> {
  ok: boolean;
  statusCode: number;
  data?: T;
  error?: string;
}

// ── Config types ──

export interface LabelInfo {
  label_name: string;
  version_number: number;
  is_system: boolean;
  updated_at: string;
}

export interface Config {
  id: string;
  slug: string;
  name: string;
  description: string;
  format: string;
  tags: string[];
  version_count: number;
  labels: LabelInfo[];
  created_at: string;
  updated_at: string;
}

export interface ConfigSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  format: string;
  tags: string[];
  version_count: number;
  updated_at: string;
}

export interface ConfigVersion {
  id: string;
  version_number: number;
  content: string;
  change_note: string;
  created_by: string | null;
  created_at: string;
}

export interface FetchResult {
  content: string;
  format: string;
  version_number: number;
  label: string;
}

// ── Label types ──

export interface TeamLabel {
  id: string;
  name: string;
  is_protected: boolean;
  is_system: boolean;
  description: string;
  created_at: string;
}

export interface ConfigLabel {
  label_name: string;
  version_number: number;
  is_system: boolean;
  updated_at: string;
}

// ── Export types ──

export interface Export {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

// ── System types ──

export interface HealthCheck {
  status: string;
  version: string;
  timestamp: string;
}

// ── Request types ──

export interface CreateConfigOptions {
  name: string;
  slug: string;
  content: string;
  description?: string;
  format?: string;
  tags?: string[];
  changeNote?: string;
}

export interface UpdateConfigOptions {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface FetchOptions {
  label?: string;
  outputFormat?: string;
}

export interface CreateLabelOptions {
  name: string;
  isProtected?: boolean;
  description?: string;
}

export interface CreateExportOptions {
  name: string;
  description?: string;
}

// ── Secret types ──

export interface SecretMetadata {
  id: string;
  config_slug: string;
  key: string;
  environment: string;
  algorithm: string;
  kdf: string;
  fingerprint: string;
  created_at: string;
  last_accessed_at: string | null;
}

export interface SecretData {
  id: string;
  config_slug: string;
  key: string;
  environment: string;
  ciphertext: string;
  algorithm: string;
  kdf: string;
  fingerprint: string;
  created_at: string;
  last_accessed_at: string | null;
}

export interface SecretAuditEntry {
  id: number;
  secret_key: string;
  config_slug: string;
  environment: string;
  action: string;
  timestamp: string;
  performed_by_api_key: string | null;
  ip_address: string | null;
  old_fingerprint: string | null;
  new_fingerprint: string | null;
}

export interface SecretListResult {
  config_slug: string;
  secrets: SecretMetadata[];
}

export interface SetSecretOptions {
  configSlug: string;
  key: string;
  ciphertext: string;
  environment?: string;
  algorithm?: string;
  kdf?: string;
  fingerprint?: string;
}

export interface GetSecretOptions {
  environment?: string;
}

export interface ListSecretsOptions {
  environment?: string;
}

export interface DeleteSecretOptions {
  environment?: string;
}

export interface SecretAuditLogOptions {
  environment?: string;
  limit?: number;
}

// ── Drop-in function types ──

export interface GetConfigOptions {
  label?: string;
  outputFormat?: string;
  fallback?: string;
  ttl?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface ConfigureOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultLabel?: string;
  defaultTtl?: number;
  /** Hex-encoded 32-byte master key for client-side encryption/decryption. */
  masterKey?: string;
  /** Environment variable name containing the master key (default: CONFIGPIG_MASTER_KEY). */
  masterKeyEnv?: string;
  /** When true, automatically decrypt vault:encrypted: values in fetched configs. */
  decryptSecrets?: boolean;
}
