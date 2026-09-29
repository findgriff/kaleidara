import { describe, expect, it } from "vitest";
import { GenerateMediaInputSchema, ReferenceUrlSchema } from "../src/schemas/generation.js";
import { parseEnv } from "../src/config/env.js";
import { redactSecrets } from "../src/util/redact.js";
import { buildBookCoverPrompt, buildColorByNumbersPrompts, CreateBookCoverInputSchema } from "../src/publishing/briefs.js";
import { buildTitlePackage, coverCopyBlock, validateKdpMetadata, validateKeywords, KDP_COMBINED_LIMIT } from "../src/publishing/kdp.js";

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
  it("builds a branded 2:3 cover brief carrying the exact cover text", () => {
    const prompt = buildBookCoverPrompt({ title: "Lizards of the Living Desert", subject: "colouring book about geckos, chameleons and desert lizards", brandName: "Kaleidara", paletteMode: "natural", providerId: "higgsfield", resolution: "2160p" });
    expect(prompt).toContain("LIZARDS OF THE LIVING DESERT");
    expect(prompt).toContain("KALEIDARA");
    expect(prompt).toContain("2:3 portrait KDP cover");
    expect(prompt).toContain("spelled correctly");
  });

  it("creates materially different colour-by-numbers prompts", () => {
    const prompts = buildColorByNumbersPrompts({ subject: "lizards", quantity: 4, paletteMode: "natural", paletteSize: 8, providerId: "higgsfield", resolution: "1440p" });
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    expect(prompts.every((prompt) => prompt.includes("exactly 8 numbered colour regions"))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes("anatomically and ecologically plausible palette"))).toBe(true);
  });
});

describe("KDP metadata engine", () => {
  it("accepts both real competitor title pairs measured earlier", () => {
    const losing = validateKdpMetadata({ title: "Mandalas: An Adult Coloring Book with 100 Beautiful Mandalas in Various Styles for Stress Relief and Relaxation, Mandala to color" });
    expect(losing.valid).toBe(true);
    expect(losing.combinedChars).toBe(129);

    // "Midnight Mandalas" = 17 + subtitle 102 = 119 characters of KDP fields.
    const winning = validateKdpMetadata({ title: "Midnight Mandalas", subtitle: "Coloring Book for Women, Teens, Adults with Stunning Mandala Patterns for Relaxation and Stress Relief" });
    expect(winning.valid).toBe(true);
    expect(winning.combinedChars).toBe(119);
    expect(winning.headroom).toBe(KDP_COMBINED_LIMIT - 119);
  });

  it("rejects a title and subtitle at or over the 200-character limit", () => {
    const result = validateKdpMetadata({ title: "Kaleidara Advanced Mandalas", subtitle: "x".repeat(180) });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "combined-too-long")).toBe(true);
  });

  it("rejects a title word used more than twice but ignores grammar words", () => {
    const repeated = validateKdpMetadata({ title: "Mandala Mandala Mandala Designs" });
    expect(repeated.valid).toBe(false);
    expect(repeated.issues.some((issue) => issue.code === "title-word-repeated")).toBe(true);

    const grammar = validateKdpMetadata({ title: "Mandala and Mandala and Mandala" });
    expect(grammar.issues.some((issue) => issue.code === "title-word-repeated" && issue.message.includes('"and"'))).toBe(false);
  });

  it("rejects prohibited sales-rank and promotional wording", () => {
    expect(validateKdpMetadata({ title: "Kaleidara Mandalas Bestseller" }).valid).toBe(false);
    expect(validateKdpMetadata({ title: "Kaleidara Mandalas", subtitle: "Free coloring pages" }).valid).toBe(false);
  });

  it("rejects placeholder titles", () => {
    expect(validateKdpMetadata({ title: "untitled" }).valid).toBe(false);
  });

  it("builds a compliant package and reports any dropped subtitle segment", () => {
    const pkg = buildTitlePackage({ theme: "mandala", designCount: 100, hook: "Still Water", positioning: "brand-hook" });
    expect(pkg.validation.valid).toBe(true);
    expect(pkg.validation.combinedChars).toBeLessThan(KDP_COMBINED_LIMIT);
    expect(pkg.title).toContain("Kaleidara");
    expect(pkg.title).toContain("Still Water");
    expect(pkg.backendKeywords.length).toBeLessThanOrEqual(7);
    expect(Array.isArray(pkg.droppedSegments)).toBe(true);
  });

  it("always stays inside the limit even when every segment is enabled", () => {
    const pkg = buildTitlePackage({ theme: "mandala", designCount: 500, audience: "women-teens", difficulty: "simple-to-intricate", singleSided: true, giftAngle: true, trimSize: "8.5 x 11", maxHeadroom: 0 });
    expect(pkg.validation.valid).toBe(true);
    expect(pkg.validation.combinedChars).toBeLessThan(KDP_COMBINED_LIMIT);
  });

  it("keeps every backend keyword under the 50-character slot limit", () => {
    const pkg = buildTitlePackage({ theme: "mandala", designCount: 100, hook: "Still Water" });
    expect(pkg.backendKeywords.length).toBeGreaterThan(0);
    for (const keyword of pkg.backendKeywords) expect(keyword.length).toBeLessThanOrEqual(50);
    expect(validateKeywords(pkg.backendKeywords, pkg).every((issue) => issue.severity !== "error")).toBe(true);
  });

  it("stops the cover artwork drifting from the KDP metadata", () => {
    const pkg = buildTitlePackage({ theme: "mandala", designCount: 100, hook: "Still Water", positioning: "brand-hook" });
    const prompt = buildBookCoverPrompt({ title: pkg.title, subtitle: pkg.subtitle, brandName: pkg.brandName, subject: "hand-drawn mandala patterns", providerId: "higgsfield", resolution: "2160p", paletteMode: "natural" });
    for (const line of coverCopyBlock(pkg).split("\n")) {
      expect(prompt).toContain(line);
    }
    expect(prompt).toContain("2:3 portrait KDP cover");
  });

  it("refuses to build a cover brief from invalid KDP metadata", () => {
    // Each field is individually inside its own limit; only the combined
    // 200-character rule is breached, so this exercises the metadata check.
    const parsed = CreateBookCoverInputSchema.safeParse({
      title: "Kaleidara Mandalas Advanced Collection Of Intricate Original Hand Drawn Designs For Experienced Adult Colourists",
      subject: "intricate mandala patterns",
      subtitle: "One Hundred Single Sided Pages For Women Teens And Adults With No Bleed Through And Stress Relief",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message).join(" | ");
      expect(messages).toContain("combined-too-long");
    }
  });

  it("accepts a cover brief whose metadata complies", () => {
    const parsed = CreateBookCoverInputSchema.safeParse({
      title: "Kaleidara Still Water Mandalas",
      subject: "hand-drawn mandala patterns",
      subtitle: "100 Original Designs | Single-Sided 8.5 x 11 Pages",
      series: "Kaleidara Coloring Books",
    });
    expect(parsed.success).toBe(true);
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
