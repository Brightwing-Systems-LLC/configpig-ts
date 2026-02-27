/** Drop-in getConfig() function for zero-ceremony config fetching. */

import { Client } from "./client.js";
import type { ConfigureOptions, GetConfigOptions } from "./types.js";

// ── Module-level state ──

let _client: Client | null = null;
let _clientConfig: [string, string] = ["", ""]; // [apiKey, baseUrl]
const _defaults: Partial<ConfigureOptions> = {};
const _cache = new Map<string, { text: string; expiry: number }>();
let _masterKey: Uint8Array | null = null;

export function configure(options: ConfigureOptions): void {
  if (options.apiKey !== undefined) _defaults.apiKey = options.apiKey;
  if (options.baseUrl !== undefined) _defaults.baseUrl = options.baseUrl;
  if (options.defaultLabel !== undefined)
    _defaults.defaultLabel = options.defaultLabel;
  if (options.defaultTtl !== undefined) _defaults.defaultTtl = options.defaultTtl;
  if (options.decryptSecrets !== undefined)
    _defaults.decryptSecrets = options.decryptSecrets;
  if (options.masterKeyEnv !== undefined)
    _defaults.masterKeyEnv = options.masterKeyEnv;

  // Load master key from hex string or env
  if (options.masterKey) {
    const hex = options.masterKey;
    _masterKey = new Uint8Array(hex.length / 2);
    for (let i = 0; i < _masterKey.length; i++) {
      _masterKey[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
  } else if (options.masterKeyEnv || options.decryptSecrets) {
    try {
      const envVar = options.masterKeyEnv ?? "CONFIGPIG_MASTER_KEY";
      const raw = process.env[envVar];
      if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
        _masterKey = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          _masterKey[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
        }
      }
    } catch {
      // Master key not available — decryption disabled
    }
  }

  // Rebuild singleton with new config
  const resolvedKey = _defaults.apiKey ?? "";
  const resolvedUrl = _defaults.baseUrl ?? "";
  const newConfig: [string, string] = [resolvedKey, resolvedUrl];
  if (
    newConfig[0] !== _clientConfig[0] ||
    newConfig[1] !== _clientConfig[1]
  ) {
    _client = new Client({
      apiKey: resolvedKey || undefined,
      baseUrl: resolvedUrl || undefined,
    });
    _clientConfig = newConfig;
    _cache.clear();
  }
}

function getClient(apiKey?: string, baseUrl?: string): Client {
  const resolvedKey = apiKey || _defaults.apiKey || "";
  const resolvedUrl = baseUrl || _defaults.baseUrl || "";
  const requested: [string, string] = [resolvedKey, resolvedUrl];

  if (
    _client !== null &&
    requested[0] === _clientConfig[0] &&
    requested[1] === _clientConfig[1]
  ) {
    return _client;
  }

  // First call or config matches defaults — create/update singleton
  if (!apiKey && !baseUrl) {
    if (_client === null) {
      _client = new Client({
        apiKey: resolvedKey || undefined,
        baseUrl: resolvedUrl || undefined,
      });
      _clientConfig = requested;
    }
    return _client;
  }

  // Per-call overrides differ from singleton — use a separate client
  return new Client({
    apiKey: resolvedKey || undefined,
    baseUrl: resolvedUrl || undefined,
  });
}

function cacheKey(
  slug: string,
  label: string,
  outputFormat?: string
): string {
  const fmtPart = outputFormat ?? "";
  return `${slug}:${label}:${fmtPart}`;
}

export async function getConfig(
  slug: string,
  options?: GetConfigOptions
): Promise<string | null> {
  const resolvedLabel =
    options?.label ||
    _defaults.defaultLabel ||
    process.env.CONFIGPIG_DEFAULT_LABEL ||
    "latest";

  const resolvedTtl =
    options?.ttl !== undefined ? options.ttl : (_defaults.defaultTtl ?? null);

  // Check cache
  if (resolvedTtl) {
    const key = cacheKey(slug, resolvedLabel, options?.outputFormat);
    const entry = _cache.get(key);
    if (entry !== undefined) {
      if (Date.now() < entry.expiry) {
        return entry.text;
      }
      _cache.delete(key);
    }
  }

  try {
    const client = getClient(options?.apiKey, options?.baseUrl);

    const resp = await client.fetch(slug, {
      label: resolvedLabel,
      outputFormat: options?.outputFormat,
    });

    if (resp.ok && resp.data) {
      let text = resp.data.content;

      // Transparently decrypt vault:encrypted: values if master key available
      if (_defaults.decryptSecrets && _masterKey && text.includes("vault:encrypted:")) {
        const { decryptSecret } = await import("./crypto/vault.js");
        const mk = _masterKey;
        text = text.replace(
          /vault:encrypted:[A-Za-z0-9+/=]+/g,
          (match) => {
            try {
              return decryptSecret(mk, match);
            } catch {
              return match;
            }
          }
        );
      }

      // Store in cache
      if (resolvedTtl) {
        const key = cacheKey(slug, resolvedLabel, options?.outputFormat);
        _cache.set(key, { text, expiry: Date.now() + resolvedTtl * 1000 });
      }

      return text;
    }

    console.warn(`configpig: fetch failed for '${slug}': ${resp.error}`);
    return options?.fallback ?? null;
  } catch (err) {
    console.warn(`configpig: unexpected error for '${slug}':`, err);
    return options?.fallback ?? null;
  }
}
