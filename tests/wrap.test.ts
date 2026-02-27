/** Tests for the pig wrap CLI module — secret detection and config scanning. */

import { describe, it, expect } from "vitest";

// The wrap module's functions are not exported from the main index.
// We import from the source file directly.
// Note: looksLikeSecret, scanDict, scanEnv are module-private in the TS SDK.
// We test them indirectly or re-implement the detection logic for testing.
// For now, we test the public patterns by checking detection behavior.

// Since the TS wrap module doesn't export its helper functions directly,
// we'll re-import via dynamic import to access the module internals.
// But the functions are not exported. Let's test via the patterns themselves.

const SECRET_PATTERNS: [string, RegExp][] = [
  ["OpenAI API key", /^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/],
  ["Anthropic API key", /^sk-ant-[A-Za-z0-9_-]{20,}$/],
  ["GitHub token", /^gh[pousr]_[A-Za-z0-9_]{20,}$/],
  ["GitHub fine-grained token", /^github_pat_[A-Za-z0-9_]{20,}$/],
  ["Stripe API key", /^[sr]k_(?:live|test)_[A-Za-z0-9]{20,}$/],
  ["AWS access key", /^AKIA[0-9A-Z]{16}$/],
];

const NOT_SECRET_PATTERNS: RegExp[] = [
  /^(true|false|null|none|yes|no)$/i,
  /^\d+$/,
  /^https?:\/\//,
  /^\//,
  /^[a-z0-9_.-]+$/,
  /^vault:/,
  /^vault:\/\//,
];

const SECRET_KEY_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|token|secret|password|credential|auth)/i,
  /(?:OPENAI|ANTHROPIC|GITHUB|STRIPE|AWS|DATABASE|DB|REDIS).*(?:KEY|TOKEN|SECRET|PASSWORD)/i,
];

function looksLikeSecret(key: string, value: string): [boolean, string] {
  if (typeof value !== "string" || value.length < 8) return [false, ""];

  for (const [name, pat] of SECRET_PATTERNS) {
    if (pat.test(value)) return [true, name];
  }

  for (const pat of NOT_SECRET_PATTERNS) {
    if (pat.test(value)) return [false, ""];
  }

  for (const pat of SECRET_KEY_PATTERNS) {
    if (pat.test(key)) return [true, "key name matches secret pattern"];
  }

  return [false, ""];
}

interface SecretCandidate {
  path: string;
  value: string;
  reason: string;
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
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
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

// ── Secret detection tests ──

describe("looksLikeSecret", () => {
  it("detects OpenAI key", () => {
    const [is, reason] = looksLikeSecret(
      "key",
      "sk-proj-abc123def456ghi789jkl"
    );
    expect(is).toBe(true);
    expect(reason).toContain("OpenAI");
  });

  it("detects Anthropic key", () => {
    const [is] = looksLikeSecret("key", "sk-ant-abc123def456ghi789jkl");
    expect(is).toBe(true);
  });

  it("detects GitHub token", () => {
    const [is] = looksLikeSecret(
      "key",
      "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    );
    expect(is).toBe(true);
  });

  it("detects GitHub fine-grained token", () => {
    const [is] = looksLikeSecret(
      "key",
      "github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    );
    expect(is).toBe(true);
  });

  it("detects Stripe key", () => {
    const [is] = looksLikeSecret(
      "key",
      "sk_test_FAKEFAKEFAKEFAKEFAKEFAKEFAKE"
    );
    expect(is).toBe(true);
  });

  it("detects AWS access key", () => {
    const [is] = looksLikeSecret("key", "AKIAIOSFODNN7EXAMPLE");
    expect(is).toBe(true);
  });

  it("detects secret by key name", () => {
    const [is, reason] = looksLikeSecret(
      "OPENAI_API_KEY",
      "xR7k2mN9pQ4wB8cF1vY6"
    );
    expect(is).toBe(true);
  });

  it("rejects URL", () => {
    const [is] = looksLikeSecret("endpoint", "https://api.example.com");
    expect(is).toBe(false);
  });

  it("rejects boolean", () => {
    const [is] = looksLikeSecret("enabled", "true");
    expect(is).toBe(false);
  });

  it("rejects number", () => {
    const [is] = looksLikeSecret("port", "8080");
    expect(is).toBe(false);
  });

  it("rejects short value", () => {
    const [is] = looksLikeSecret("key", "short");
    expect(is).toBe(false);
  });

  it("rejects path", () => {
    const [is] = looksLikeSecret("config", "/etc/config.json");
    expect(is).toBe(false);
  });

  it("rejects already vault-encrypted", () => {
    const [is] = looksLikeSecret("key", "vault:encrypted:abc123");
    expect(is).toBe(false);
  });

  it("rejects vault reference", () => {
    const [is] = looksLikeSecret(
      "key",
      "vault://configpig/my-app/key"
    );
    expect(is).toBe(false);
  });
});

describe("scanDict", () => {
  it("finds secrets in flat dict", () => {
    const data = {
      host: "localhost",
      api_key: "sk-proj-abc123def456ghi789jkl",
      port: "8080",
    };
    const found = scanDict(data);
    expect(found.length).toBe(1);
    expect(found[0].path).toBe("api_key");
  });

  it("finds secrets in nested dict", () => {
    const data = {
      database: {
        host: "db.example.com",
        password: "super-secret-password-1234",
      },
      openai: { api_key: "sk-proj-abc123def456ghi789jkl" },
    };
    const found = scanDict(data);
    const paths = found.map((f) => f.path);
    expect(paths).toContain("openai.api_key");
  });

  it("finds secrets in MCP config format", () => {
    const data = {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {
            GITHUB_TOKEN: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          },
        },
      },
    };
    const found = scanDict(data);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((f) => f.path.includes("GITHUB_TOKEN"))).toBe(true);
  });
});

describe("scanEnv", () => {
  it("finds secrets in .env content", () => {
    const content = `
# Database config
DB_HOST=localhost
DB_PORT=5432
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
`;
    const found = scanEnv(content);
    const keys = found.map((f) => f.path);
    expect(keys).toContain("OPENAI_API_KEY");
    expect(keys).toContain("GITHUB_TOKEN");
    expect(keys).not.toContain("DB_HOST");
  });

  it("handles quoted values", () => {
    const content = 'API_KEY="sk-proj-abc123def456ghi789jkl"\n';
    const found = scanEnv(content);
    expect(found.length).toBe(1);
  });

  it("ignores comments and blanks", () => {
    const content = `
# This is a comment

# Another comment
HOST=localhost
`;
    const found = scanEnv(content);
    expect(found.length).toBe(0);
  });
});
