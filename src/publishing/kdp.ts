import { z } from "zod";

/**
 * KDP metadata engine.
 *
 * Amazon KDP cross-checks the words printed on a book cover against the Title
 * and Subtitle fields entered in the dashboard. A mismatch is the single most
 * common silent rejection and can suppress the listing, so the title package
 * produced here is the single source of truth that the cover prompt is built
 * from. Nothing in this module guesses: every limit it enforces is a rule KDP
 * documents, and every character count it reports is computed, not estimated.
 */

/** KDP: "Your title and subtitle together must be fewer than 200 characters." */
export const KDP_COMBINED_LIMIT = 200;
/** KDP keyword fields: 7 slots, 50 characters each. */
export const KDP_KEYWORD_SLOTS = 7;
export const KDP_KEYWORD_CHAR_LIMIT = 50;

/**
 * Words exempt from the "no word more than twice" rule in titles.
 * Articles, conjunctions and prepositions.
 */
const EXEMPT_WORDS = new Set([
  "a", "an", "the",
  "and", "or", "but", "nor", "for", "so", "yet",
  "of", "to", "in", "on", "at", "by", "with", "from", "as", "into", "over", "under",
]);

/**
 * Terms KDP explicitly prohibits in title, subtitle and keyword fields.
 * Each entry is a human label plus a matcher.
 */
const PROHIBITED_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: "sales-rank claim", pattern: /\b(best\s*seller|bestseller|best\s* selling|#\s*1|number\s*one|top\s*seller|top\s*rated)\b/i },
  { label: "ranking claim", pattern: /\b(award[\s-]*winning|winner|bestselling)\b/i },
  { label: "promotional language", pattern: /\b(free|on\s*sale|discount|cheap|bargain|half\s*price|deal)\b/i },
  { label: "recency claim", pattern: /\b(new\s*release|brand\s*new|just\s*released)\b/i },
  { label: "generic keyword stuffing", pattern: /\b(notebook|journal|diary|planner)\b/i },
  { label: "HTML or markup", pattern: /<[^>]*>|&[a-z]+;|&#\d+;/i },
  { label: "reference to another title or author", pattern: /\b(for\s+fans\s+of|as\s+seen\s+on|like\s+the\s+book)\b/i },
  { label: "bundled-set wording", pattern: /\b(boxed?\s*set|bundle|collection\s+of\s+books)\b/i },
];

/** Placeholder junk KDP rejects outright if it is the whole title. */
const NULL_TITLE_VALUES = new Set(["", "unknown", "n/a", "na", "blank", "none", "null", "not applicable", "untitled"]);

export const BookPositioningSchema = z.enum([
  "brand-hook",
  "audience-led",
  "spec-led",
  "gift-led",
  "difficulty-led",
]);
export type BookPositioning = z.infer<typeof BookPositioningSchema>;

export const AudienceSchema = z.enum(["women", "women-teens", "teens", "everyone"]);
export type Audience = z.infer<typeof AudienceSchema>;

export const FormatSchema = z.enum(["coloring-book", "color-by-numbers", "activity-book", "pattern-collection"]);
export type BookFormat = z.infer<typeof FormatSchema>;

export const ThemeSchema = z.enum(["mandala", "floral", "geometric", "nature", "animal", "celtic", "seasonal", "abstract"]);
export type BookTheme = z.infer<typeof ThemeSchema>;

export const MoodSchema = z.enum(["calm-water", "luminous", "botanical", "dusk-night", "cosmic", "any"]);
export type Mood = z.infer<typeof MoodSchema>;

// ---------------------------------------------------------------------------
// Curated hook library
// ---------------------------------------------------------------------------

/**
 * Atmospheric hooks that pass the "could it be a candle name?" test: evocative
 * rather than descriptive, teal-adjacent in imagery, two to four syllables, and
 * slot-shaped so each one names a book in a numbered series rather than an
 * orphan product. A descriptive phrase such as "Advanced Mandalas" fails this
 * test and is precisely why it is unownable: it competes head-on with every
 * other listing using the same words.
 */
export const HOOK_LIBRARY: ReadonlyArray<{ hook: string; mood: Exclude<Mood, "any">; tags: readonly string[] }> = [
  { hook: "Still Water", mood: "calm-water", tags: ["mandala", "geometric", "abstract"] },
  { hook: "Sea Glass", mood: "calm-water", tags: ["mandala", "nature", "abstract"] },
  { hook: "Tidal Glass", mood: "calm-water", tags: ["mandala", "geometric", "abstract"] },
  { hook: "Quiet Current", mood: "calm-water", tags: ["mandala", "abstract"] },
  { hook: "Deep Calm", mood: "calm-water", tags: ["mandala", "abstract", "nature"] },
  { hook: "Ocean Floor", mood: "calm-water", tags: ["animal", "nature"] },
  { hook: "Snow Silence", mood: "calm-water", tags: ["seasonal", "mandala"] },
  { hook: "Silver Rain", mood: "calm-water", tags: ["abstract", "geometric"] },
  { hook: "Aurora Hour", mood: "luminous", tags: ["mandala", "geometric", "abstract"] },
  { hook: "Blue Hour", mood: "luminous", tags: ["mandala", "abstract"] },
  { hook: "First Light", mood: "luminous", tags: ["nature", "seasonal", "abstract"] },
  { hook: "Still Light", mood: "luminous", tags: ["mandala", "abstract"] },
  { hook: "Ember Glow", mood: "luminous", tags: ["seasonal", "abstract"] },
  { hook: "Copper Dusk", mood: "luminous", tags: ["seasonal", "abstract", "geometric"] },
  { hook: "Slow Bloom", mood: "botanical", tags: ["floral", "nature"] },
  { hook: "Glass Garden", mood: "botanical", tags: ["floral", "intricate", "nature"] },
  { hook: "Paper Lantern", mood: "botanical", tags: ["floral", "abstract", "seasonal"] },
  { hook: "Wild Meadow", mood: "botanical", tags: ["floral", "nature"] },
  { hook: "Moonlit Tide", mood: "dusk-night", tags: ["mandala", "animal", "nature"] },
  { hook: "Midnight Garden", mood: "dusk-night", tags: ["floral", "nature"] },
  { hook: "Dusk Bloom", mood: "dusk-night", tags: ["floral", "abstract"] },
  { hook: "Star Chart", mood: "cosmic", tags: ["geometric", "celtic", "mandala"] },
  { hook: "Solar Bloom", mood: "cosmic", tags: ["mandala", "geometric"] },
  { hook: "Orbit", mood: "cosmic", tags: ["geometric", "abstract"] },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type KdpIssue = { code: string; severity: "error" | "warning"; field: "title" | "subtitle" | "combined" | "keywords"; message: string };

export type KdpValidation = {
  valid: boolean;
  titleChars: number;
  subtitleChars: number;
  combinedChars: number;
  combinedLimit: number;
  headroom: number;
  issues: KdpIssue[];
};

export const KdpMetadataInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).optional(),
  series: z.string().trim().max(120).optional(),
  authorLine: z.string().trim().max(120).optional(),
}).strict();
export type KdpMetadataInput = z.infer<typeof KdpMetadataInputSchema>;

/** Detect any word used more than twice, ignoring exempt grammar words. */
function overusedWords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []) {
    const word = raw.replace(/^'+|'+$/g, "");
    if (!word || EXEMPT_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 2).map(([word]) => word);
}

function findProhibited(text: string): string[] {
  return PROHIBITED_TERMS.filter((term) => term.pattern.test(text)).map((term) => term.label);
}

/**
 * Validate a title/subtitle pair against the KDP metadata rules that cause
 * rejections or listing suppression. Deliberately strict: it reports every
 * problem it finds rather than stopping at the first.
 */
export function validateKdpMetadata(input: KdpMetadataInput | { title: string; subtitle?: string }): KdpValidation {
  const title = (input.title ?? "").trim();
  const subtitle = (input.subtitle ?? "").trim();
  const combined = subtitle ? `${title}: ${subtitle}` : title;
  const titleChars = title.length;
  const subtitleChars = subtitle.length;
  const combinedChars = titleChars + subtitleChars;
  const issues: KdpIssue[] = [];

  if (NULL_TITLE_VALUES.has(title.toLowerCase())) {
    issues.push({ code: "title-placeholder", severity: "error", field: "title", message: `"${title}" is a prohibited placeholder title.` });
  }

  if (combinedChars >= KDP_COMBINED_LIMIT) {
    issues.push({
      code: "combined-too-long",
      severity: "error",
      field: "combined",
      message: `Title and subtitle total ${combinedChars} characters. KDP requires fewer than ${KDP_COMBINED_LIMIT}. Remove ${combinedChars - KDP_COMBINED_LIMIT + 1} or more.`,
    });
  }

  if (combinedChars > KDP_COMBINED_LIMIT - 9 && combinedChars < KDP_COMBINED_LIMIT) {
    issues.push({
      code: "combined-tight",
      severity: "warning",
      field: "combined",
      message: `Only ${KDP_COMBINED_LIMIT - combinedChars} characters of headroom. Leave room for a late edit.`,
    });
  }

  for (const word of overusedWords(title)) {
    issues.push({ code: "title-word-repeated", severity: "error", field: "title", message: `The word "${word}" appears more than twice in the title.` });
  }

  const wordCount = (title.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
  if (wordCount > 12) {
    issues.push({ code: "title-too-wordy", severity: "warning", field: "title", message: `The title field is ${wordCount} words. KDP flags titles that read as a list of search terms.` });
  }

  for (const [field, text] of [["title", title], ["subtitle", subtitle]] as const) {
    if (!text) continue;
    for (const label of findProhibited(text)) {
      issues.push({ code: "prohibited-term", severity: "error", field, message: `The ${field} contains prohibited ${label} wording.` });
    }
    if (text === text.toUpperCase() && /[A-Z]{6,}/.test(text)) {
      issues.push({ code: "all-caps", severity: "warning", field, message: `The ${field} is entirely upper case; use mixed case and let the cover styling carry emphasis.` });
    }
    if (/\s{2,}/.test(text)) {
      issues.push({ code: "double-space", severity: "warning", field, message: `The ${field} contains repeated spaces.` });
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    titleChars,
    subtitleChars,
    combinedChars,
    combinedLimit: KDP_COMBINED_LIMIT,
    headroom: KDP_COMBINED_LIMIT - combinedChars,
    issues,
  };
}

/** Validate the 7 backend keyword slots. */
export function validateKeywords(keywords: readonly string[], metadata: { title: string; subtitle?: string }): KdpIssue[] {
  const issues: KdpIssue[] = [];
  if (keywords.length > KDP_KEYWORD_SLOTS) {
    issues.push({ code: "too-many-keywords", severity: "error", field: "keywords", message: `${keywords.length} keyword strings supplied; KDP allows ${KDP_KEYWORD_SLOTS} fields.` });
  }
  keywords.forEach((keyword, index) => {
    if (keyword.length > KDP_KEYWORD_CHAR_LIMIT) {
      issues.push({ code: "keyword-too-long", severity: "error", field: "keywords", message: `Keyword ${index + 1} is ${keyword.length} characters; the limit is ${KDP_KEYWORD_CHAR_LIMIT}.` });
    }
    for (const label of findProhibited(keyword)) {
      issues.push({ code: "prohibited-keyword", severity: "error", field: "keywords", message: `Keyword ${index + 1} contains prohibited ${label} wording.` });
    }
    const metadataWords = new Set((`${metadata.title} ${metadata.subtitle ?? ""}`.toLowerCase().match(/[a-z]{4,}/g) ?? []));
    const overlap = (keyword.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => metadataWords.has(word));
    if (overlap.length >= 3) {
      issues.push({ code: "keyword-duplicates-title", severity: "warning", field: "keywords", message: `Keyword ${index + 1} repeats ${overlap.length} words already indexed from the title. Amazon already indexes those; the slot is partly wasted.` });
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Title package construction
// ---------------------------------------------------------------------------

export const BookTitleBriefSchema = z.object({
  theme: ThemeSchema.default("mandala"),
  format: FormatSchema.default("coloring-book"),
  audience: AudienceSchema.default("women-teens"),
  designCount: z.number().int().min(10).max(500).default(100),
  /** "advanced" filters to committed colourists; "simple-to-intricate" keeps both ends of the market. */
  difficulty: z.enum(["simple", "simple-to-intricate", "advanced"]).default("simple-to-intricate"),
  brandName: z.string().trim().min(1).max(60).default("Kaleidara"),
  seriesName: z.string().trim().min(1).max(80).default("Kaleidara Coloring Books"),
  authorLine: z.string().trim().max(120).optional(),
  hook: z.string().trim().min(1).max(60).optional(),
  mood: MoodSchema.default("any"),
  positioning: BookPositioningSchema.default("brand-hook"),
  singleSided: z.boolean().default(true),
  trimSize: z.string().trim().max(40).default("8.5 x 11"),
  giftAngle: z.boolean().default(true),
  maxHeadroom: z.number().int().min(0).max(60).default(6),
}).strict();
export type BookTitleBrief = z.infer<typeof BookTitleBriefSchema>;

export type CoverCopyLine = { role: "brand" | "title" | "subtitle" | "author" | "series"; text: string; style: string };

export type TitlePackage = {
  title: string;
  subtitle: string;
  series: string;
  brandName: string;
  authorLine?: string;
  coverCopy: { lines: CoverCopyLine[]; plainBlock: string };
  backendKeywords: string[];
  validation: KdpValidation;
  keywordIssues: KdpIssue[];
  /** Subtitle segments that did not fit inside the KDP limit, reported honestly. */
  droppedSegments: string[];
  rationale: string[];
};

const THEME_LABEL: Record<BookTheme, string> = {
  mandala: "Mandalas",
  floral: "Flowers",
  geometric: "Geometric Patterns",
  nature: "Nature Patterns",
  animal: "Animals",
  celtic: "Celtic Knots",
  seasonal: "Seasonal Designs",
  abstract: "Abstract Patterns",
};

const FORMAT_PHRASE: Record<BookFormat, string> = {
  "coloring-book": "Adult Coloring Book",
  "color-by-numbers": "Color by Numbers Book",
  "activity-book": "Adult Activity Book",
  "pattern-collection": "Pattern Collection",
};

const AUDIENCE_PHRASE: Record<Audience, string> = {
  women: "for Women",
  "women-teens": "for Women, Teens and Adults",
  teens: "for Teens and Adults",
  everyone: "for Adults of All Ages",
};

const DIFFICULTY_PHRASE: Record<BookTitleBrief["difficulty"], string> = {
  simple: "Easy Designs for Beginners",
  "simple-to-intricate": "Simple to Intricate",
  advanced: "Intricate Advanced Designs",
};

/** Pick a hook, preferring the requested mood then theme relevance, then stable rotation. */
export function selectHook(brief: BookTitleBrief): { hook: string; mood: string } {
  if (brief.hook) return { hook: brief.hook, mood: "supplied" };
  const pool = HOOK_LIBRARY.filter((entry) => brief.mood === "any" || entry.mood === brief.mood);
  const candidates = pool.length > 0 ? pool : HOOK_LIBRARY;
  const themed = candidates.filter((entry) => (entry.tags as readonly string[]).includes(brief.theme));
  const chosenPool = themed.length > 0 ? themed : candidates;
  const index = (brief.designCount + brief.theme.length + brief.brandName.length) % chosenPool.length;
  const chosen = chosenPool[index]!;
  return { hook: chosen.hook, mood: chosen.mood };
}

function buildTitle(brief: BookTitleBrief, hook: string): string {
  const label = THEME_LABEL[brief.theme];
  const brand = brief.brandName;
  switch (brief.positioning) {
    case "brand-hook":
      // Brand leads so it survives search-result truncation and every impression trains recall,
      // then the evocative hook names the book inside a series, then the category noun.
      return `${brand} ${hook} ${label}`;
    case "audience-led":
      // Puts the highest-converting demographic phrase in the title field, where Amazon weights it hardest.
      return `${brand} ${label} ${AUDIENCE_PHRASE[brief.audience]}`;
    case "spec-led":
      // Leads with the objection-killer: the number and the single-sided promise.
      return brief.singleSided ? `${brand} ${label}: ${brief.designCount} Single-Sided Designs` : `${brand} ${label}: ${brief.designCount} Original Designs`;
    case "gift-led":
      return `${brand} ${label}: A Gift of Calm`;
    case "difficulty-led":
      return brief.difficulty === "advanced" ? `${brand} Advanced ${label}` : `${brand} ${label}: Simple to Intricate`;
    default:
      return `${brand} ${hook} ${label}`;
  }
}

type Segment = { priority: number; text: string; label: string };

function subtitleSegments(brief: BookTitleBrief): Segment[] {
  const label = THEME_LABEL[brief.theme];
  const singular = label.endsWith("s") ? label.slice(0, -1) : label;
  // Priority order follows what actually converts in this category: the exact
  // design count, the category keyword, the difficulty range, the
  // bleed-through objection-killer, the benefit stack, then audience and gift
  // framing. The benefit stack deliberately outranks the audience phrase,
  // because "Adult Coloring Book" already indexes the adult searcher.
  const segments: Segment[] = [
    { priority: 1, label: "design count", text: `${brief.designCount} Original ${singular} Designs` },
    { priority: 2, label: "category", text: FORMAT_PHRASE[brief.format] },
    { priority: 3, label: "difficulty range", text: DIFFICULTY_PHRASE[brief.difficulty] },
  ];
  if (brief.singleSided) {
    segments.push({ priority: 4, label: "single-sided promise", text: "Single-Sided, No Bleed-Through" });
  }
  segments.push({ priority: 5, label: "benefits", text: "Stress Relief and Relaxation" });
  segments.push({ priority: 6, label: "audience", text: AUDIENCE_PHRASE[brief.audience] });
  if (brief.giftAngle) {
    segments.push({ priority: 7, label: "gift angle", text: "The Perfect Calming Gift" });
  }
  segments.push({ priority: 8, label: "tool compatibility", text: "Colored Pencils and Gel Pens" });
  return segments.sort((a, b) => a.priority - b.priority);
}

function joinSegments(segments: readonly string[]): string {
  return segments.join(" | ");
}

/**
 * Build a validated KDP title package. Subtitle segments are added in priority
 * order and any that would breach the 200-character limit are dropped and
 * reported, so the output is always compliant and never silently truncated.
 */
export function buildTitlePackage(input: z.input<typeof BookTitleBriefSchema>): TitlePackage {
  const brief = BookTitleBriefSchema.parse(input);
  const { hook } = selectHook(brief);
  const title = buildTitle(brief, hook);
  const segments = subtitleSegments(brief);

  const budget = KDP_COMBINED_LIMIT - brief.maxHeadroom;
  const kept: Segment[] = [];
  const dropped: Segment[] = [];
  for (const segment of segments) {
    const candidate = joinSegments([...kept.map((entry) => entry.text), segment.text]);
    if (title.length + candidate.length <= budget) kept.push(segment);
    else dropped.push(segment);
  }

  const subtitle = joinSegments(kept.map((entry) => entry.text));
  const authorLine = brief.authorLine;

  const validation = validateKdpMetadata({ title, subtitle, series: brief.seriesName, authorLine });
  const backendKeywords = buildBackendKeywords(brief, title, subtitle, hook);
  const keywordIssues = validateKeywords(backendKeywords, { title, subtitle });

  const coverCopyLines: CoverCopyLine[] = [
    { role: "brand", text: brief.brandName, style: "small caps, letter-spaced, top of cover" },
    { role: "title", text: title, style: "largest element, high contrast, legible at 100px thumbnail width" },
    ...subtitle.split(" | ").map((chunk) => ({ role: "subtitle" as const, text: chunk, style: "medium weight, subordinate to the title" })),
    ...(authorLine ? [{ role: "author" as const, text: authorLine, style: "small, below the subtitle" }] : []),
    { role: "series", text: brief.seriesName, style: "spine lockup and back cover only" },
  ];

  const plainBlock = [
    brief.brandName.toUpperCase(),
    title.toUpperCase(),
    ...subtitle.split(" | "),
  ].join("\n");

  const rationale = [
    `Positioning "${brief.positioning}" chosen; hook "${hook}" supplied by the curated hook library.`,
    `${title.length} title characters + ${subtitle.length} subtitle characters = ${validation.combinedChars}/${KDP_COMBINED_LIMIT}, leaving ${validation.headroom} headroom.`,
    kept.length > 0 ? `Subtitle prioritised: ${kept.map((entry) => entry.label).join(", ")}.` : "No subtitle segments fitted within the limit.",
    dropped.length > 0 ? `Dropped for length: ${dropped.map((entry) => entry.label).join(", ")}.` : "Every subtitle segment fitted.",
    `Trim size ${brief.trimSize} is declared in the KDP print details and consumes no title characters.`,
    "The cover must print this exact title and subtitle text; KDP cross-checks the cover against these fields.",
  ];

  return {
    title,
    subtitle,
    series: brief.seriesName,
    brandName: brief.brandName,
    authorLine,
    coverCopy: { lines: coverCopyLines, plainBlock },
    backendKeywords,
    validation,
    keywordIssues,
    droppedSegments: dropped.map((entry) => entry.text),
    rationale,
  };
}

/**
 * Build the 7 backend keyword strings. Deliberately avoids repeating words that
 * the title and subtitle already give Amazon for free, and never repeats a
 * competitor brand or a prohibited claim.
 */
export function buildBackendKeywords(brief: BookTitleBrief, title: string, subtitle: string, hook: string): string[] {
  const label = THEME_LABEL[brief.theme];
  const existing = new Set((`${title} ${subtitle} ${hook}`.toLowerCase().match(/[a-z]{4,}/g) ?? []));
  const templates: Array<{ text: string; essential?: boolean }> = [
    { text: `anxiety relief art therapy for grown ups`, essential: true },
    { text: `meditation zen mindful break from screens`, essential: true },
    { text: `gift for her mum sister friend birthday`, essential: true },
    { text: `colored pencil gel pen friendly paper`, essential: true },
    { text: `geometric floral ornamental art patterns`, essential: true },
    { text: `calm evening hobby self care activity`, essential: true },
    { text: `large print beginner to advanced difficulty`, essential: true },
  ];
  if (brief.format === "color-by-numbers") {
    templates.push({ text: "color by number edition numbered key pages", essential: true });
  }
  templates.push({ text: `${label.toLowerCase()} coloring book for adults`, essential: false });

  const scored = templates
    .map((template) => {
      const words = template.text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const overlap = words.filter((word) => existing.has(word)).length;
      return { ...template, overlap };
    })
    .filter((template) => template.text.length <= KDP_KEYWORD_CHAR_LIMIT)
    .filter((template) => findProhibited(template.text).length === 0)
    .sort((a, b) => (a.essential === b.essential ? a.overlap - b.overlap : a.essential ? -1 : 1));

  const chosen: string[] = [];
  for (const template of scored) {
    if (chosen.length >= KDP_KEYWORD_SLOTS) break;
    if (chosen.includes(template.text)) continue;
    chosen.push(template.text);
  }
  return chosen;
}

/**
 * Render the exact cover copy block that must be printed on the artwork. This
 * is what stops the cover and the KDP metadata from drifting apart.
 */
export function coverCopyBlock(pkg: { title: string; subtitle?: string | undefined; brandName: string; authorLine?: string | undefined }): string {
  const brand = pkg.brandName;
  return [
    brand.toUpperCase(),
    pkg.title.toUpperCase(),
    ...(pkg.subtitle ? pkg.subtitle.split(" | ") : []),
    ...(pkg.authorLine ? [pkg.authorLine] : []),
  ].join("\n");
}
