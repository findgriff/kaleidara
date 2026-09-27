import { z } from "zod";

import {
  ErrorEnvelopeSchema,
  EstimateGenerationOutputSchema,
  GenerationJobSchema,
  ListCapabilitiesOutputSchema,
} from "./generation.js";

/**
 * Every tool in the studio returns this one envelope as `structuredContent`.
 *
 * A single shape means the widget can render any tool result without a second
 * round trip — in particular, `capabilities` always rides along, so a job
 * result still knows the model list, the spend ceiling, and whether the
 * provider is configured. `view` tells the widget which section to foreground.
 */
export const StudioViewSchema = z.enum(["capabilities", "estimate", "job"]);
export type StudioView = z.infer<typeof StudioViewSchema>;

export const StudioPayloadSchema = z.object({
  view: StudioViewSchema,
  capabilities: ListCapabilitiesOutputSchema,
  estimate: EstimateGenerationOutputSchema.nullable(),
  job: GenerationJobSchema.nullable(),
  recentJobs: z.array(GenerationJobSchema),
  /** Present when the call failed in an expected, actionable way. */
  error: ErrorEnvelopeSchema.nullable(),
});
export type StudioPayload = z.infer<typeof StudioPayloadSchema>;

/** Form values the widget persists between renders via `setWidgetState`. */
export const WidgetStateSchema = z
  .object({
    prompt: z.string().optional(),
    negativePrompt: z.string().optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    providerId: z.string().optional(),
    modelId: z.string().optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    durationSeconds: z.number().optional(),
    quantity: z.number().optional(),
    referenceUrls: z.array(z.string()).optional(),
    seed: z.number().nullable().optional(),
    lastJobId: z.string().optional(),
  })
  .partial();
export type WidgetState = z.infer<typeof WidgetStateSchema>;
