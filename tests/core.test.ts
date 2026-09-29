import { describe, expect, it } from "vitest";
import { GenerateMediaInputSchema, ReferenceUrlSchema } from "../src/schemas/generation.js";
import { parseEnv } from "../src/config/env.js";
import { redactSecrets } from "../src/util/redact.js";
import { buildBookCoverPrompt, buildColorByNumbersPrompts } from "../src/publishing/briefs.js";

describe("generation input validation", () => {
  it("rejects an image duration", () => {
    const parsed = GenerateMediaInputSchema.safeParse({ prompt: "a teal studio", mediaType: "image", durationSeconds: 4 });
    expect(parsed.success).toBe(false);
  });
  it("accepts only HTTPS reference URLs", () => {
    expect(ReferenceUrlSchema.safeParse("https://example.com/reference.jpg").success).toBe(true);
    expect(ReferenceUrlSchema.safeParse("http://example.com/reference.jpg").success).toBe(false);
  });
});

describe("publishing briefs", () => {
  it("builds a branded 2:3-ready cover brief", () => {
    const prompt = buildBookCoverPrompt({ title: "Lizards of the Living Desert", subject: "colouring book about geckos, chameleons and desert lizards", brandName: "Kaleidara", paletteMode: "natural", providerId: "higgsfield", resolution: "2160p" });
    expect(prompt).toContain("Lizards of the Living Desert");
    expect(prompt).toContain("Kaleidara");
    expect(prompt).toContain("2:3 KDP cover layout");
  });

  it("creates materially different colour-by-numbers prompts", () => {
    const prompts = buildColorByNumbersPrompts({ subject: "lizards", quantity: 4, paletteMode: "natural", paletteSize: 8, providerId: "higgsfield", resolution: "1440p" });
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    expect(prompts.every((prompt) => prompt.includes("exactly 8 numbered colour regions"))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes("anatomically and ecologically plausible palette"))).toBe(true);
  });
});

describe("configuration and secret handling", () => {
  it("boots safely without provider credentials", () => {
    const config = parseEnv({ NODE_ENV: "test" });
    expect(config.HF_API_KEY_ID).toBeUndefined();
    expect(config.HF_API_KEY_SECRET).toBeUndefined();
  });
  it("rejects half-configured provider credentials", () => {
    expect(() => parseEnv({ HF_API_KEY_ID: "id-only" })).toThrow(/must be set together/);
  });
  it("redacts sensitive values from logs", () => {
    const value = redactSecrets("HF_API_KEY_SECRET=super-secret Bearer abc12345", ["super-secret"]);
    expect(value).not.toContain("super-secret");
    expect(value).not.toContain("abc12345");
    expect(value).toContain("[redacted]");
  });
});
