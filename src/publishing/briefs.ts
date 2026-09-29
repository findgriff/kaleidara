import { z } from "zod";
import { ReferenceUrlSchema, ResolutionSchema, ModelIdSchema, ProviderIdSchema, type GenerateMediaInput } from "../schemas/generation.js";

export const PaletteModeSchema = z.enum(["natural", "psychedelic", "dmt-inspired"]);
export type PaletteMode = z.infer<typeof PaletteModeSchema>;

const sharedPublishingShape = {
  providerId: ProviderIdSchema.default("higgsfield"),
  modelId: ModelIdSchema.optional(),
  resolution: ResolutionSchema.default("2160p"),
  referenceUrls: z.array(ReferenceUrlSchema).max(4).optional(),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
  maxCredits: z.number().positive().max(100_000).optional(),
} as const;

export const CreateBookCoverInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(3).max(160),
  subtitle: z.string().trim().max(160).optional(),
  authorLine: z.string().trim().max(120).optional(),
  brandName: z.string().trim().min(1).max(60).default("Kaleidara"),
  paletteMode: PaletteModeSchema.default("natural"),
  ...sharedPublishingShape,
}).strict();
export type CreateBookCoverInput = z.infer<typeof CreateBookCoverInputSchema>;

export const CreateColorByNumbersSetInputSchema = z.object({
  bookTitle: z.string().trim().max(120).optional(),
  subject: z.string().trim().min(3).max(160),
  quantity: z.number().int().min(2).max(4).default(4),
  paletteMode: PaletteModeSchema.default("natural"),
  paletteSize: z.number().int().min(4).max(12).default(8),
  resolution: ResolutionSchema.default("1440p"),
  providerId: ProviderIdSchema.default("higgsfield"),
  modelId: ModelIdSchema.optional(),
  referenceUrls: z.array(ReferenceUrlSchema).max(4).optional(),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
  maxCredits: z.number().positive().max(100_000).optional(),
}).strict();
export type CreateColorByNumbersSetInput = z.infer<typeof CreateColorByNumbersSetInputSchema>;

const naturalPalette = "an anatomically and ecologically plausible palette for the subject, with colour regions that make sense for the real creature or object";
const psychedelicPalette = "a deliberate psychedelic palette with luminous complementary colours, but still a recognisable subject and clean enclosed colour regions";
const dmtPalette = "a DMT-inspired visionary palette with prismatic neon geometry and iridescent colour logic, while preserving a recognisable subject and clean enclosed colour regions";

export function paletteDirection(mode: PaletteMode): string {
  return mode === "natural" ? naturalPalette : mode === "psychedelic" ? psychedelicPalette : dmtPalette;
}

export function buildBookCoverPrompt(input: CreateBookCoverInput): string {
  const subtitle = input.subtitle ? ` Subtitle text: “${input.subtitle}”.` : "";
  const author = input.authorLine ? ` Author line: “${input.authorLine}”.` : "";
  return [
    "Create a premium Amazon KDP front cover only for a high-quality colouring book.",
    `Book title: “${input.title}”.${subtitle}${author}`,
    `Core subject: ${input.subject}.`,
    `Brand the cover with the exact name “${input.brandName}”, elegantly integrated but subordinate to the title.`,
    `Use a vivid, highly polished, commercially legible cover composition with ${paletteDirection(input.paletteMode)}.`,
    "Make the cover clearly relevant to the subject, visually rich at thumbnail size, print-safe, sharp, and suitable for a professional 2:3 KDP cover layout.",
    "No mockup, no phone, no hands holding a book, no watermark, no illegible pseudo-text, no unrelated objects, no copied artist style.",
  ].join(" ");
}

const variationDirections = [
  "a close three-quarter hero composition with a different pose and a calm natural environment",
  "a full-body or full-object composition with a different pose, habitat or supporting details",
  "a dynamic diagonal composition with a different viewpoint and a clearly distinct silhouette",
  "an elegant editorial composition with a different pose, framing and background pattern",
];

export function buildColorByNumbersPrompts(input: CreateColorByNumbersSetInput): string[] {
  return Array.from({ length: input.quantity }, (_, index) => {
    const direction = variationDirections[index % variationDirections.length];
    return [
      "Create one distinct printable colour-by-numbers interior artwork page.",
      `Subject: ${input.subject}.`,
      `Variation ${index + 1} of ${input.quantity}: ${direction}. Do not repeat another variation's pose, silhouette, viewpoint or background arrangement.`,
      `Use ${paletteDirection(input.paletteMode)}.`,
      `Use exactly ${input.paletteSize} numbered colour regions with a matching palette logic; numbers must be legible, enclosed, and placed inside regions.`,
      "Clean black outlines, no gradients, no grey wash, no tiny unusable fragments, no cropped subject, no text except the region numbers, white background, print-ready composition.",
      input.bookTitle ? `The book context is “${input.bookTitle}”, but do not place the title on the page.` : "",
    ].filter(Boolean).join(" ");
  });
}

export function coverGenerationRequest(input: CreateBookCoverInput): GenerateMediaInput {
  return {
    prompt: buildBookCoverPrompt(input),
    negativePrompt: "blurry, low resolution, cropped subject, illegible text, misspelled text, watermark, mockup, duplicate subject, extra limbs, malformed anatomy",
    mediaType: "image",
    providerId: input.providerId,
    modelId: input.modelId,
    aspectRatio: "2:3",
    resolution: input.resolution,
    referenceUrls: input.referenceUrls,
    seed: input.seed,
    quantity: 1,
    maxCredits: input.maxCredits,
  };
}
