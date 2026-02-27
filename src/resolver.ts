/**
 * Vault reference resolver — resolves vault://configpig/{name} references.
 *
 * At MCP server startup, the resolver scans config content for vault://
 * references, fetches the encrypted secret from ConfigPig, and replaces
 * the reference with the ciphertext (TypeScript crypto module is Phase 4,
 * so full decryption is deferred — the ciphertext is returned for now).
 */

import { Client } from "./client.js";
import type { ClientConfig } from "./client.js";

const VAULT_REF_PATTERN = /vault:\/\/configpig\/([a-zA-Z0-9._/-]+)/g;

/** Try to load master key from env; return undefined on failure. */
function loadMasterKeyOptional(envVar?: string): Uint8Array | undefined {
  try {
    const raw = process.env[envVar ?? "CONFIGPIG_MASTER_KEY"];
    if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) return undefined;
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return key;
  } catch {
    return undefined;
  }
}

interface ResolveOptions {
  /** A Client instance. If not provided, one is created from env vars. */
  client?: Client;
  /** Client config to use if creating a new client. */
  clientConfig?: ClientConfig;
  /** Environment scope for secret lookups. */
  environment?: string;
  /** Raw 32-byte master key for client-side decryption. */
  masterKey?: Uint8Array;
  /** Environment variable name containing hex-encoded master key. */
  masterKeyEnv?: string;
}

/**
 * Parse a vault reference path into [configSlug, secretKey].
 * Format: "{configSlug}/{secretKey}"
 */
function parseRef(refPath: string): [string, string] {
  const idx = refPath.indexOf("/");
  if (idx < 1 || idx === refPath.length - 1) {
    return ["", ""];
  }
  const configSlug = refPath.slice(0, idx);
  const secretKey = refPath.slice(idx + 1).replace(/\//g, "_");
  return [configSlug, secretKey];
}

/**
 * Resolve all vault://configpig/{name} references in a string.
 *
 * Fetches each referenced secret from ConfigPig and replaces the
 * vault:// reference with the secret's ciphertext. Full client-side
 * decryption requires the TypeScript crypto module (Phase 4).
 *
 * @param content - Config content that may contain vault:// references.
 * @param options - Resolution options.
 * @returns Content with vault:// references replaced with ciphertext.
 */
export async function resolveReferences(
  content: string,
  options?: ResolveOptions
): Promise<string> {
  if (!content.includes("vault://configpig/")) {
    return content;
  }

  const client =
    options?.client ?? new Client(options?.clientConfig ?? {});
  const environment = options?.environment ?? "default";

  // Collect all unique references
  const refs = new Map<string, string>(); // fullMatch → resolved value
  const matches = content.matchAll(
    /vault:\/\/configpig\/([a-zA-Z0-9._/-]+)/g
  );

  for (const match of matches) {
    const fullMatch = match[0];
    if (refs.has(fullMatch)) continue;

    const refPath = match[1];
    const [configSlug, secretKey] = parseRef(refPath);

    if (!configSlug || !secretKey) {
      console.warn(`configpig: invalid vault reference: ${fullMatch}`);
      refs.set(fullMatch, fullMatch);
      continue;
    }

    const resp = await client.getSecret(configSlug, secretKey, {
      environment,
    });

    if (resp.ok && resp.data?.ciphertext) {
      let resolved = resp.data.ciphertext;
      // Decrypt if master key is available
      const mk = options?.masterKey ?? loadMasterKeyOptional(options?.masterKeyEnv);
      if (mk && resolved.startsWith("vault:encrypted:")) {
        try {
          const { decryptSecret } = await import("./crypto/vault.js");
          resolved = decryptSecret(mk, resolved);
        } catch {
          // Fall back to ciphertext if decryption fails
        }
      }
      refs.set(fullMatch, resolved);
    } else {
      console.warn(
        `configpig: failed to resolve ${fullMatch}: ${resp.error}`
      );
      refs.set(fullMatch, fullMatch);
    }
  }

  // Replace all references
  let result = content;
  for (const [ref, resolved] of refs) {
    result = result.split(ref).join(resolved);
  }

  return result;
}

/**
 * Read a config file (as a string) and resolve all vault:// references.
 */
export async function resolveConfigContent(
  content: string,
  options?: ResolveOptions
): Promise<string> {
  return resolveReferences(content, options);
}
