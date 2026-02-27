/** ConfigPig API client. */

import { requestWithRetry } from "./http.js";
import { loadMasterKey } from "./crypto/vault.js";
import type {
  APIResponse,
  Config,
  ConfigLabel,
  ConfigSummary,
  ConfigVersion,
  CreateConfigOptions,
  CreateExportOptions,
  CreateLabelOptions,
  DeleteSecretOptions,
  Export,
  FetchOptions,
  FetchResult,
  GetSecretOptions,
  HealthCheck,
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

export interface ClientConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Raw 32-byte master key for client-side encryption/decryption. */
  masterKey?: Uint8Array;
  /** Environment variable name containing hex-encoded master key. */
  masterKeyEnv?: string;
}

export class Client {
  private apiKey: string;
  private baseUrl: string;
  private _masterKey?: Uint8Array;
  private _masterKeyEnv?: string;

  constructor(config: ClientConfig = {}) {
    this.apiKey =
      config.apiKey ?? process.env.CONFIGPIG_API_KEY ?? "";
    this.baseUrl = (
      config.baseUrl ??
      process.env.CONFIGPIG_URL ??
      "https://configpig.com"
    ).replace(/\/+$/, "");
    this._masterKey = config.masterKey;
    this._masterKeyEnv = config.masterKeyEnv;
  }

  /** Lazily load master key from field or environment. */
  private getMasterKey(): Uint8Array {
    if (this._masterKey) return this._masterKey;
    this._masterKey = loadMasterKey(this._masterKeyEnv);
    return this._masterKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  private async request(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    }
  ): Promise<{ statusCode: number; data: unknown }> {
    return requestWithRetry({
      method,
      url: this.url(path),
      headers: this.headers(),
      body: options?.body,
      params: options?.params,
    });
  }

  private static extractError(
    statusCode: number,
    data: unknown
  ): string {
    if (data && typeof data === "object" && "detail" in data) {
      return String((data as Record<string, unknown>).detail);
    }
    return `HTTP ${statusCode}`;
  }

  // ── Configs ──

  async listConfigs(options?: {
    tag?: string;
    search?: string;
  }): Promise<APIResponse<ConfigSummary[]>> {
    const params: Record<string, string> = {};
    if (options?.tag) params.tag = options.tag;
    if (options?.search) params.search = options.search;
    const { statusCode, data } = await this.request("GET", "/configs/", {
      params: Object.keys(params).length ? params : undefined,
    });
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as ConfigSummary[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async getConfig(slug: string): Promise<APIResponse<Config>> {
    const { statusCode, data } = await this.request("GET", `/configs/${slug}`);
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as Config };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async createConfig(
    options: CreateConfigOptions
  ): Promise<APIResponse<Config>> {
    const body: Record<string, unknown> = {
      name: options.name,
      slug: options.slug,
      content: options.content,
      description: options.description ?? "",
      format: options.format ?? "json",
      tags: options.tags ?? [],
      change_note: options.changeNote ?? "Initial version",
    };

    const { statusCode, data } = await this.request("POST", "/configs/", {
      body,
    });
    if (statusCode === 201 && data) {
      return { ok: true, statusCode, data: data as Config };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async updateConfig(
    slug: string,
    options: UpdateConfigOptions
  ): Promise<APIResponse<Config>> {
    const body: Record<string, unknown> = {};
    if (options.name !== undefined) body.name = options.name;
    if (options.description !== undefined) body.description = options.description;
    if (options.tags !== undefined) body.tags = options.tags;

    const { statusCode, data } = await this.request(
      "PUT",
      `/configs/${slug}`,
      { body }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as Config };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async deleteConfig(slug: string): Promise<APIResponse<null>> {
    const { statusCode, data } = await this.request(
      "DELETE",
      `/configs/${slug}`
    );
    if (statusCode === 204) {
      return { ok: true, statusCode, data: null };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Versions ──

  async listVersions(
    slug: string
  ): Promise<APIResponse<ConfigVersion[]>> {
    const { statusCode, data } = await this.request(
      "GET",
      `/configs/${slug}/versions`
    );
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as ConfigVersion[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async getVersion(
    slug: string,
    versionNumber: number
  ): Promise<APIResponse<ConfigVersion>> {
    const { statusCode, data } = await this.request(
      "GET",
      `/configs/${slug}/versions/${versionNumber}`
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as ConfigVersion };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async createVersion(
    slug: string,
    options: { content: string; changeNote?: string }
  ): Promise<APIResponse<ConfigVersion>> {
    const body = {
      content: options.content,
      change_note: options.changeNote ?? "",
    };
    const { statusCode, data } = await this.request(
      "POST",
      `/configs/${slug}/versions`,
      { body }
    );
    if (statusCode === 201 && data) {
      return { ok: true, statusCode, data: data as ConfigVersion };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Fetch ──

  async fetch(
    slug: string,
    options?: FetchOptions
  ): Promise<APIResponse<FetchResult>> {
    const params: Record<string, string> = {
      label: options?.label ?? "latest",
    };
    if (options?.outputFormat) {
      params.output_format = options.outputFormat;
    }
    const { statusCode, data } = await this.request(
      "GET",
      `/configs/${slug}/fetch`,
      { params }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as FetchResult };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Promote / Rollback ──

  async promote(
    slug: string,
    options: { version: number; label: string }
  ): Promise<APIResponse<Config>> {
    const body = { version: options.version, label: options.label };
    const { statusCode, data } = await this.request(
      "POST",
      `/configs/${slug}/promote`,
      { body }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as Config };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async rollback(
    slug: string,
    options: { label: string }
  ): Promise<APIResponse<Config>> {
    const body = { label: options.label };
    const { statusCode, data } = await this.request(
      "POST",
      `/configs/${slug}/rollback`,
      { body }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as Config };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Labels ──

  async listLabels(): Promise<APIResponse<TeamLabel[]>> {
    const { statusCode, data } = await this.request("GET", "/labels/");
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as TeamLabel[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async createLabel(
    options: CreateLabelOptions
  ): Promise<APIResponse<TeamLabel>> {
    const body = {
      name: options.name,
      is_protected: options.isProtected ?? false,
      description: options.description ?? "",
    };
    const { statusCode, data } = await this.request("POST", "/labels/", {
      body,
    });
    if (statusCode === 201 && data) {
      return { ok: true, statusCode, data: data as TeamLabel };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async deleteLabel(name: string): Promise<APIResponse<null>> {
    const { statusCode, data } = await this.request(
      "DELETE",
      `/labels/${name}`
    );
    if (statusCode === 204) {
      return { ok: true, statusCode, data: null };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async listConfigLabels(
    slug: string
  ): Promise<APIResponse<ConfigLabel[]>> {
    const { statusCode, data } = await this.request(
      "GET",
      `/labels/configs/${slug}`
    );
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as ConfigLabel[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async assignLabel(
    slug: string,
    options: { label: string; version: number }
  ): Promise<APIResponse<ConfigLabel>> {
    const body = { label: options.label, version: options.version };
    const { statusCode, data } = await this.request(
      "POST",
      `/labels/configs/${slug}`,
      { body }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as ConfigLabel };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Exports ──

  async listExports(): Promise<APIResponse<Export[]>> {
    const { statusCode, data } = await this.request("GET", "/exports/");
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as Export[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async createExport(
    options: CreateExportOptions
  ): Promise<APIResponse<Export>> {
    const body = {
      name: options.name,
      description: options.description ?? "",
    };
    const { statusCode, data } = await this.request("POST", "/exports/", {
      body,
    });
    if (statusCode === 201 && data) {
      return { ok: true, statusCode, data: data as Export };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async getExport(exportId: string): Promise<APIResponse<Export>> {
    const { statusCode, data } = await this.request(
      "GET",
      `/exports/${exportId}`
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as Export };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async deleteExport(exportId: string): Promise<APIResponse<null>> {
    const { statusCode, data } = await this.request(
      "DELETE",
      `/exports/${exportId}`
    );
    if (statusCode === 204) {
      return { ok: true, statusCode, data: null };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Secrets ──

  async setSecret(
    options: SetSecretOptions
  ): Promise<APIResponse<SecretMetadata>> {
    const body = {
      config_slug: options.configSlug,
      key: options.key,
      environment: options.environment ?? "default",
      ciphertext: options.ciphertext,
      algorithm: options.algorithm ?? "aes-256-gcm",
      kdf: options.kdf ?? "argon2id",
      fingerprint: options.fingerprint ?? "",
    };
    const { statusCode, data } = await this.request("POST", "/secrets/", {
      body,
    });
    if (statusCode === 201 && data) {
      return { ok: true, statusCode, data: data as SecretMetadata };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async getSecret(
    configSlug: string,
    key: string,
    options?: GetSecretOptions
  ): Promise<APIResponse<SecretData>> {
    const params: Record<string, string> = {};
    if (options?.environment) params.environment = options.environment;
    const { statusCode, data } = await this.request(
      "GET",
      `/secrets/${configSlug}/keys/${key}`,
      { params: Object.keys(params).length ? params : undefined }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as SecretData };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async listSecrets(
    configSlug: string,
    options?: ListSecretsOptions
  ): Promise<APIResponse<SecretListResult>> {
    const params: Record<string, string> = {};
    if (options?.environment) params.environment = options.environment;
    const { statusCode, data } = await this.request(
      "GET",
      `/secrets/${configSlug}/`,
      { params: Object.keys(params).length ? params : undefined }
    );
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as SecretListResult };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async deleteSecret(
    configSlug: string,
    key: string,
    options?: DeleteSecretOptions
  ): Promise<APIResponse<null>> {
    const params: Record<string, string> = {};
    if (options?.environment) params.environment = options.environment;
    const { statusCode, data } = await this.request(
      "DELETE",
      `/secrets/${configSlug}/keys/${key}`,
      { params: Object.keys(params).length ? params : undefined }
    );
    if (statusCode === 204) {
      return { ok: true, statusCode, data: null };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  async secretAuditLog(
    configSlug: string,
    options?: SecretAuditLogOptions
  ): Promise<APIResponse<SecretAuditEntry[]>> {
    const params: Record<string, string> = {};
    if (options?.environment) params.environment = options.environment;
    if (options?.limit !== undefined) params.limit = String(options.limit);
    const { statusCode, data } = await this.request(
      "GET",
      `/secrets/${configSlug}/audit-log`,
      { params: Object.keys(params).length ? params : undefined }
    );
    if (statusCode === 200 && Array.isArray(data)) {
      return { ok: true, statusCode, data: data as SecretAuditEntry[] };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }

  // ── Plaintext Secret Helpers ──

  /**
   * Encrypt a plaintext secret client-side and store it.
   * Requires a master key (via constructor or environment).
   */
  async setSecretPlaintext(
    configSlug: string,
    key: string,
    plaintext: string,
    options?: { environment?: string }
  ): Promise<APIResponse<SecretMetadata>> {
    const mk = this.getMasterKey();
    const { encryptSecret, fingerprint } = await import("./crypto/vault.js");
    const ciphertext = encryptSecret(mk, plaintext);
    const fp = await fingerprint(ciphertext);
    return this.setSecret({
      configSlug,
      key,
      ciphertext,
      environment: options?.environment,
      algorithm: "aes-256-gcm",
      kdf: "argon2id",
      fingerprint: fp,
    });
  }

  /**
   * Fetch a secret and decrypt it client-side.
   * Requires a master key (via constructor or environment).
   */
  async getSecretDecrypted(
    configSlug: string,
    key: string,
    options?: GetSecretOptions
  ): Promise<APIResponse<string>> {
    const resp = await this.getSecret(configSlug, key, options);
    if (!resp.ok || !resp.data) {
      return { ok: false, statusCode: resp.statusCode, error: resp.error };
    }
    const mk = this.getMasterKey();
    const { decryptSecret } = await import("./crypto/vault.js");
    const plaintext = decryptSecret(mk, resp.data.ciphertext);
    return { ok: true, statusCode: resp.statusCode, data: plaintext };
  }

  // ── System ──

  async healthCheck(): Promise<APIResponse<HealthCheck>> {
    const { statusCode, data } = await this.request("GET", "/health");
    if (statusCode === 200 && data) {
      return { ok: true, statusCode, data: data as HealthCheck };
    }
    return {
      ok: false,
      statusCode,
      error: Client.extractError(statusCode, data),
    };
  }
}
