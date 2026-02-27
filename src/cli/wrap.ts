/**
 * pig wrap — scan config files for hardcoded secrets and replace with vault references.
 *
 * Supported formats: JSON, YAML, TOML, .env
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { Client } from "../client.js";

// Patterns that likely indicate a secret value
const SECRET_PATTERNS: [string, RegExp][] = [
  ["OpenAI API key", /^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/],
  ["Anthropic API key", /^sk-ant-[A-Za-z0-9_-]{20,}$/],
  ["GitHub token", /^gh[pousr]_[A-Za-z0-9_]{20,}$/],
  ["GitHub fine-grained token", /^github_pat_[A-Za-z0-9_]{20,}$/],
  ["Stripe API key", /^[sr]k_(?:live|test)_[A-Za-z0-9]{20,}$/],
  ["AWS access key", /^AKIA[0-9A-Z]{16}$/],
  ["Bearer/API token", /^(?:Bearer\s+)?[A-Za-z0-9_-]{40,}$/],
  [
    "Generic secret",
    /^(?:sk|pk|api|token|key|secret|password|auth)[_-][A-Za-z0-9_-]{16,}$/i,
  ],
];

// Key names that suggest the value is a secret
const SECRET_KEY_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|token|secret|password|credential|auth)/i,
  /(?:OPENAI|ANTHROPIC|GITHUB|STRIPE|AWS|DATABASE|DB|REDIS).*(?:KEY|TOKEN|SECRET|PASSWORD)/i,
];

// Values that are clearly NOT secrets
const NOT_SECRET_PATTERNS: RegExp[] = [
  /^(true|false|null|none|yes|no)$/i,
  /^\d+$/,
  /^https?:\/\//,
  /^\//,
  /^[a-z0-9_.-]+$/,
  /^vault:/,
  /^vault:\/\//,
];

interface SecretCandidate {
  path: string;
  value: string;
  reason: string;
}

function looksLikeSecret(key: string, value: string): [boolean, string] {
  if (typeof value !== "string" || value.length < 8) return [false, ""];

  // Check known secret value patterns FIRST
  for (const [name, pat] of SECRET_PATTERNS) {
    if (pat.test(value)) return [true, name];
  }

  // Skip things that are clearly not secrets
  for (const pat of NOT_SECRET_PATTERNS) {
    if (pat.test(value)) return [false, ""];
  }

  // Check if the key name suggests a secret
  for (const pat of SECRET_KEY_PATTERNS) {
    if (pat.test(key)) return [true, "key name matches secret pattern"];
  }

  return [false, ""];
}

function scanDict(
  data: Record<string, unknown>,
  prefix: string = ""
): SecretCandidate[] {
  const found: SecretCandidate[] = [];
  for (const [k, v] of Object.entries(data)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      found.push(...scanDict(v as Record<string, unknown>, p));
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const item = v[i];
        if (item && typeof item === "object" && !Array.isArray(item)) {
          found.push(...scanDict(item as Record<string, unknown>, `${p}[${i}]`));
        } else if (typeof item === "string") {
          const [isSecret, reason] = looksLikeSecret(p, item);
          if (isSecret) found.push({ path: `${p}[${i}]`, value: item, reason });
        }
      }
    } else if (typeof v === "string") {
      const [isSecret, reason] = looksLikeSecret(k, v);
      if (isSecret) found.push({ path: p, value: v, reason });
    }
  }
  return found;
}

function scanEnv(content: string): SecretCandidate[] {
  const found: SecretCandidate[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
      continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const [isSecret, reason] = looksLikeSecret(key, value);
    if (isSecret) found.push({ path: key, value, reason });
  }
  return found;
}

type FileFormat = "json" | "yaml" | "toml" | "env";

async function parseFile(
  filepath: string
): Promise<[FileFormat, Record<string, unknown> | null, string]> {
  const raw = fs.readFileSync(filepath, "utf-8");
  const name = path.basename(filepath).toLowerCase();
  const ext = path.extname(filepath).toLowerCase();

  if (
    ext === ".json" ||
    ["claude_desktop_config.json", "mcp.json", "settings.json"].includes(name)
  ) {
    return ["json", JSON.parse(raw), raw];
  }

  if (ext === ".env" || name.startsWith(".env")) {
    return ["env", null, raw];
  }

  if (ext === ".yaml" || ext === ".yml") {
    try {
      const yaml = await (Function('return import("yaml")')() as Promise<{ parse: (s: string) => unknown }>);
      return ["yaml", yaml.parse(raw) as Record<string, unknown>, raw];
    } catch {
      console.warn("Warning: yaml package not installed, treating as JSON.");
      return ["json", JSON.parse(raw), raw];
    }
  }

  if (ext === ".toml") {
    try {
      const toml = await (Function('return import("smol-toml")')() as Promise<{ parse: (s: string) => unknown }>);
      return ["toml", toml.parse(raw) as Record<string, unknown>, raw];
    } catch {
      console.warn("Warning: smol-toml package not installed, trying JSON.");
      return ["json", JSON.parse(raw), raw];
    }
  }

  // Default: try JSON
  try {
    return ["json", JSON.parse(raw), raw];
  } catch {
    process.stderr.write(`Error: cannot parse ${filepath} — unsupported format.\n`);
    process.exit(1);
  }
}

function setNested(
  data: Record<string, unknown>,
  dotPath: string,
  value: string
): void {
  const parts: (string | number)[] = [];
  for (const part of dotPath.split(".")) {
    const m = part.match(/^(.+)\[(\d+)\]$/);
    if (m) {
      parts.push(m[1], parseInt(m[2], 10));
    } else {
      parts.push(part);
    }
  }

  let obj: unknown = data;
  for (const p of parts.slice(0, -1)) {
    obj = (obj as Record<string | number, unknown>)[p];
  }

  const last = parts[parts.length - 1];
  (obj as Record<string | number, unknown>)[last] = value;
}

function generateSecretName(filepath: string, keyPath: string): string {
  const stem = path
    .basename(filepath, path.extname(filepath))
    .replace(/_/g, "-")
    .replace(/\./g, "-")
    .toLowerCase();
  const clean = keyPath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${stem}/${clean}`;
}

function maskValue(value: string): string {
  return value.length > 12
    ? value.slice(0, 4) + "..." + value.slice(-4)
    : "****";
}

function promptUser(candidates: SecretCandidate[]): Promise<SecretCandidate[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const confirmed: SecretCandidate[] = [];
    let idx = 0;

    function next() {
      if (idx >= candidates.length) {
        rl.close();
        resolve(confirmed);
        return;
      }
      const c = candidates[idx];
      const masked = maskValue(c.value);
      rl.question(
        `  ${c.path} = ${masked} (${c.reason}) — wrap as secret? [Y/n] `,
        (answer) => {
          if (["", "y", "yes"].includes(answer.trim().toLowerCase())) {
            confirmed.push(c);
          }
          idx++;
          next();
        }
      );
    }

    next();
  });
}

interface WrapArgs {
  file: string;
  configSlug: string;
  environment: string;
  autoConfirm: boolean;
  apiKey: string;
  baseUrl: string;
}

export async function cmdWrap(args: WrapArgs): Promise<void> {
  const filepath = args.file;
  if (!fs.existsSync(filepath)) {
    process.stderr.write(`Error: file not found: ${filepath}\n`);
    process.exit(1);
  }

  const client = new Client({
    apiKey: args.apiKey || undefined,
    baseUrl: args.baseUrl || undefined,
  });

  const [fmt, data, rawContent] = await parseFile(filepath);
  let raw = rawContent;

  // Scan for secrets
  const candidates = fmt === "env" ? scanEnv(raw) : scanDict(data!);

  if (candidates.length === 0) {
    console.log(`No secrets detected in ${filepath}.`);
    return;
  }

  console.log(
    `\nFound ${candidates.length} potential secret(s) in ${filepath}:\n`
  );

  // Confirm with user
  let confirmed: SecretCandidate[];
  if (args.autoConfirm) {
    confirmed = candidates;
    for (const c of confirmed) {
      console.log(`  ${c.path} = ${maskValue(c.value)} (${c.reason})`);
    }
  } else {
    confirmed = await promptUser(candidates);
  }

  if (confirmed.length === 0) {
    console.log("No secrets selected.");
    return;
  }

  const mapping: Record<
    string,
    { path: string; config_slug: string; key: string; environment: string }
  > = {};

  console.log(`\nEncrypting and uploading ${confirmed.length} secret(s)...\n`);

  for (const c of confirmed) {
    const secretName = generateSecretName(filepath, c.path);
    const vaultRef = `vault://configpig/${secretName}`;
    const secretKey = c.path
      .replace(/\./g, "_")
      .replace(/\[/g, "_")
      .replace(/\]/g, "");

    // Encrypt and upload via the client
    const resp = await client.setSecretPlaintext(
      args.configSlug,
      secretKey,
      c.value,
      { environment: args.environment }
    );

    if (resp.ok) {
      console.log(`  Stored: ${secretKey}`);
    } else {
      if ((resp.error ?? "").toLowerCase().includes("already exists")) {
        // Try update
        const { encryptSecret, fingerprint } = await import(
          "../crypto/vault.js"
        );
        const { loadMasterKey } = await import("../crypto/vault.js");
        const mk = loadMasterKey();
        const ct = encryptSecret(mk, c.value);
        const fp = await fingerprint(ct);
        // Use raw request for PUT
        const putResp = await fetch(
          `${args.baseUrl || "https://configpig.com"}/api/v1/secrets/${args.configSlug}/keys/${secretKey}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${args.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              environment: args.environment,
              ciphertext: ct,
              fingerprint: fp,
            }),
          }
        );
        if (putResp.ok) {
          console.log(`  Updated: ${secretKey}`);
        } else {
          process.stderr.write(`  Error updating ${secretKey}\n`);
          continue;
        }
      } else {
        process.stderr.write(
          `  Warning: failed to store ${secretKey}: ${resp.error}\n`
        );
        continue;
      }
    }

    mapping[vaultRef] = {
      path: c.path,
      config_slug: args.configSlug,
      key: secretKey,
      environment: args.environment,
    };

    // Replace value in content
    if (fmt === "env") {
      const lines = raw.split("\n");
      const newLines: string[] = [];
      for (const line of lines) {
        const stripped = line.trim();
        if (stripped && stripped.includes("=") && !stripped.startsWith("#")) {
          const eqIdx = stripped.indexOf("=");
          const k = stripped.slice(0, eqIdx).trim();
          if (k === c.path) {
            newLines.push(`${k}=${vaultRef}`);
            continue;
          }
        }
        newLines.push(line);
      }
      raw = newLines.join("\n");
      if (!raw.endsWith("\n")) raw += "\n";
    } else {
      setNested(data!, c.path, vaultRef);
    }
  }

  if (Object.keys(mapping).length === 0) return;

  // Serialize back
  let newContent: string;
  if (fmt === "json") {
    newContent = JSON.stringify(data, null, 2) + "\n";
  } else if (fmt === "yaml") {
    try {
      const yaml = await (Function('return import("yaml")')() as Promise<{ stringify: (d: unknown) => string }>);
      newContent = yaml.stringify(data);
    } catch {
      newContent = JSON.stringify(data, null, 2) + "\n";
    }
  } else if (fmt === "toml") {
    try {
      const toml = await (Function('return import("smol-toml")')() as Promise<{ stringify: (d: Record<string, unknown>) => string }>);
      newContent = toml.stringify(data!);
    } catch {
      console.warn("Warning: smol-toml not installed, outputting as JSON.");
      newContent = JSON.stringify(data, null, 2) + "\n";
    }
  } else {
    newContent = raw;
  }

  // Write output
  const ext = path.extname(filepath);
  const outPath = filepath.replace(ext, `.wrapped${ext}`);
  fs.writeFileSync(outPath, newContent, "utf-8");
  console.log(`\nWrapped config written to: ${outPath}`);

  // Write mapping file
  const mappingPath = path.join(path.dirname(filepath), ".configpig.json");
  let existingMapping: Record<string, unknown> = {};
  try {
    existingMapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  } catch {
    // No existing mapping
  }
  Object.assign(existingMapping, mapping);
  fs.writeFileSync(
    mappingPath,
    JSON.stringify(existingMapping, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Mapping file written to: ${mappingPath}`);
  console.log(`\n${Object.keys(mapping).length} secret(s) wrapped successfully.`);
}
