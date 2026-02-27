/** Tests for the rotation module — providers, registry, and base. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RotationProvider } from "../src/rotation/base.js";
import type { RotationResult } from "../src/rotation/base.js";
import {
  getProvider,
  listProviders,
  registerProvider,
} from "../src/rotation/registry.js";

// ── Base provider tests ──

describe("RotationResult", () => {
  it("success result", () => {
    const r: RotationResult = {
      success: true,
      newSecret: "sk-new-123",
      error: "",
      metadata: {},
    };
    expect(r.success).toBe(true);
    expect(r.newSecret).toBe("sk-new-123");
  });

  it("failure result", () => {
    const r: RotationResult = {
      success: false,
      newSecret: "",
      error: "API returned 500",
      metadata: {},
    };
    expect(r.success).toBe(false);
    expect(r.error).toContain("500");
  });
});

describe("RotationProvider base", () => {
  it("custom provider works", async () => {
    class TestProvider extends RotationProvider {
      readonly name = "test";
      async rotate(currentSecret: string): Promise<RotationResult> {
        return {
          success: true,
          newSecret: "new-" + currentSecret,
          error: "",
          metadata: {},
        };
      }
    }

    const p = new TestProvider();
    const result = await p.rotate("old-key");
    expect(result.success).toBe(true);
    expect(result.newSecret).toBe("new-old-key");
  });

  it("default validate returns true", async () => {
    class MinimalProvider extends RotationProvider {
      readonly name = "minimal";
      async rotate(): Promise<RotationResult> {
        return { success: true, newSecret: "new", error: "", metadata: {} };
      }
    }

    const p = new MinimalProvider();
    expect(await p.validate("any-secret")).toBe(true);
  });
});

// ── Registry tests ──

describe("registry", () => {
  // Wait for auto-register to complete
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it("built-in providers are registered", () => {
    const providers = listProviders();
    expect(providers).toContain("openai");
    expect(providers).toContain("github");
    expect(providers).toContain("anthropic");
  });

  it("getProvider returns correct provider", () => {
    const p = getProvider("openai");
    expect(p.name).toBe("openai");
  });

  it("getProvider passes config", () => {
    const p = getProvider("openai", {
      base_url: "https://custom.openai.com",
    });
    // Config is stored on the provider instance
    expect(p.name).toBe("openai");
  });

  it("unknown provider throws", () => {
    expect(() => getProvider("nonexistent")).toThrow(
      /Unknown rotation provider/
    );
  });

  it("register custom provider", () => {
    class CustomProvider extends RotationProvider {
      readonly name = "custom-test";
      async rotate(): Promise<RotationResult> {
        return {
          success: true,
          newSecret: "custom-new",
          error: "",
          metadata: {},
        };
      }
    }
    registerProvider("custom-test", (cfg) => new CustomProvider(cfg));
    const p = getProvider("custom-test");
    expect(p.name).toBe("custom-test");
  });
});

// ── OpenAI provider tests ──

describe("OpenAI provider", () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it("rotate success", async () => {
    const p = getProvider("openai");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ key: "sk-new-key-123", id: "key-id" }),
        text: async () => "",
      })
    );

    const result = await p.rotate("sk-old-key");
    expect(result.success).toBe(true);
    expect(result.newSecret).toBe("sk-new-key-123");

    vi.unstubAllGlobals();
  });

  it("rotate failure", async () => {
    const p = getProvider("openai");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      })
    );

    const result = await p.rotate("sk-old-key");
    expect(result.success).toBe(false);
    expect(result.error).toContain("403");

    vi.unstubAllGlobals();
  });
});

// ── GitHub provider tests ──

describe("GitHub provider", () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it("rotate requires client_id", async () => {
    const p = getProvider("github");
    const result = await p.rotate("ghp_old_token");
    expect(result.success).toBe(false);
    expect(result.error).toContain("client_id");
  });

  it("rotate success with client_id", async () => {
    const p = getProvider("github", { client_id: "Iv1.abc123" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: "ghp_new_token_xyz", id: 12345 }),
        text: async () => "",
      })
    );

    const result = await p.rotate("ghp_old_token");
    expect(result.success).toBe(true);
    expect(result.newSecret).toBe("ghp_new_token_xyz");

    vi.unstubAllGlobals();
  });
});

// ── Anthropic provider tests ──

describe("Anthropic provider", () => {
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it("rotate success", async () => {
    const p = getProvider("anthropic");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ api_key: "sk-ant-new-key-456", id: "key-id" }),
        text: async () => "",
      })
    );

    const result = await p.rotate("sk-ant-old-key");
    expect(result.success).toBe(true);
    expect(result.newSecret).toBe("sk-ant-new-key-456");

    vi.unstubAllGlobals();
  });
});
