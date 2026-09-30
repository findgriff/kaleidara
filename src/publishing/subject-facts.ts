import { z } from "zod";

/**
 * Subject-aware reverse-page content.
 *
 * The plugin never invents educational facts. A fact must arrive with the
 * species/subject it describes and a public HTTPS source record. This keeps
 * the page useful while preserving the evidence trail needed for publishing.
 */
export const ReversePageModeSchema = z.enum(["quotation", "subject-fact"]);
export type ReversePageMode = z.infer<typeof ReversePageModeSchema>;

export const SubjectFactPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  subject: z.string().trim().min(2).max(160),
  fact: z.string().trim().min(20).max(500),
  sourceTitle: z.string().trim().min(2).max(200),
  sourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "Source URL must use HTTPS"),
  sourceAccessed: z.string().trim().min(4).max(40).optional(),
}).strict();
export type SubjectFactPage = z.infer<typeof SubjectFactPageSchema>;

export const SubjectFactReversePagesInputSchema = z.object({
  bookTitle: z.string().trim().min(1).max(160),
  subjectFamily: z.string().trim().min(2).max(160),
  pages: z.array(SubjectFactPageSchema).min(1).max(500),
  paletteCubes: z.number().int().min(8).max(12).default(8),
  noQuotations: z.boolean().default(true),
}).strict().superRefine((value, ctx) => {
  const pageNumbers = new Set<number>();
  const factTexts = new Set<string>();
  for (const [index, page] of value.pages.entries()) {
    if (pageNumbers.has(page.pageNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "pageNumber"], message: `Page ${page.pageNumber} appears more than once.` });
    }
    pageNumbers.add(page.pageNumber);
    const normalizedFact = page.fact.toLowerCase().replace(/\s+/g, " ").trim();
    if (factTexts.has(normalizedFact)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "fact"], message: "The same fact is repeated on another page; use a page-specific fact." });
    }
    factTexts.add(normalizedFact);
  }
  if (!value.noQuotations) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["noQuotations"], message: "Subject-fact mode must set noQuotations=true." });
  }
});
export type SubjectFactReversePagesInput = z.infer<typeof SubjectFactReversePagesInputSchema>;

export type SubjectFactReversePage = {
  pageNumber: number;
  mode: "subject-fact";
  subject: string;
  fact: string;
  source: { title: string; url: string; accessed?: string };
  palette: {
    title: "MY COLOUR PALETTE";
    cubes: number;
    showNumberedKey: boolean;
    penFieldLabel: "Pen / colour:";
  };
  contentRules: string[];
};

export function buildSubjectFactReversePages(input: SubjectFactReversePagesInput): SubjectFactReversePage[] {
  const parsed = SubjectFactReversePagesInputSchema.parse(input);
  return parsed.pages.map((page) => ({
    pageNumber: page.pageNumber,
    mode: "subject-fact" as const,
    subject: page.subject,
    fact: page.fact,
    source: { title: page.sourceTitle, url: page.sourceUrl, ...(page.sourceAccessed ? { accessed: page.sourceAccessed } : {}) },
    palette: {
      title: "MY COLOUR PALETTE" as const,
      cubes: parsed.paletteCubes,
      showNumberedKey: true,
      penFieldLabel: "Pen / colour:" as const,
    },
    contentRules: [
      "Use the supplied fact exactly as written; do not embellish, paraphrase or add unsourced claims.",
      "Display the fact prominently on the reverse page above the palette.",
      "Display the exact subject/species label with the fact.",
      "Display the source title and HTTPS source URL in a small source note.",
      "Do not display quotations, quotation marks, historical attribution or invented educational copy.",
      "Keep eight numbered colour swatches and a Pen / colour: field for every swatch.",
      "In colour-by-numbers mode, the swatch numbers must match every number on the facing artwork.",
    ],
  }));
}

export function subjectFactReversePageTemplate(input: { subject: string; fact: string; sourceTitle: string; sourceUrl: string; paletteCubes?: number }): string {
  const page = buildSubjectFactReversePages({
    bookTitle: "Subject fact page",
    subjectFamily: input.subject,
    paletteCubes: input.paletteCubes ?? 8,
    pages: [{ pageNumber: 1, subject: input.subject, fact: input.fact, sourceTitle: input.sourceTitle, sourceUrl: input.sourceUrl }],
    noQuotations: true,
  })[0]!;
  return [
    "SUBJECT FACT",
    page.subject,
    page.fact,
    `Source: ${page.source.title} — ${page.source.url}`,
    "MY COLOUR PALETTE",
    "" + page.palette.cubes + " numbered swatches; record each tool at Pen / colour:.",
  ].join("\n");
}
