import { z } from "zod";

/**
 * Wire schemas for every MCP tool in the studio.
 *
 * These are the single source of truth: the MCP layer derives its JSON Schema
 * from them, the provider adapters consume the parsed output, and the widget
 * renders the result shapes. Nothing downstream re-validates, so keep the
 * constraints here strict.
 */

export const MediaTypeSchema = z.enum(["image", "video"]);
export type MediaType = z.infer<typeof MediaTypeSchema>;

export const AspectRatioSchema = z.enum(["1:1", "4:3", "3:4", "2:3", "16:9", "9:16", "21:9"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ResolutionSchema = z.enum(["480p", "720p", "1080p", "1440p", "2160p"]);
export type Resolution = z.infer<typeof ResolutionSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TERMINAL_STATUSES: readonly JobStatus[] = ["succeeded", "failed", "canceled"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Reference images must be publicly fetchable by the provider, so only
 * absolute `https` URLs are accepted. `http` is rejected because the URL is
 * forwarded to a third party and would leak in transit.
 */
export const ReferenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Reference URLs must be absolute https:// URLs." }
  );

export const ProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Provider ids are lowercase kebab-case.");

export const ModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/, "Model ids are lowercase and may contain . _ : -");

export const JobIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Job ids are opaque alphanumeric tokens.");

/** Fields shared by `estimate_generation` and `generate_media`. */
const generationRequestShape = {
  prompt: z
    .string()
    .trim()
    .min(3, "Describe what you want to create (at least 3 characters).")
    .max(2000, "Prompts are limited to 2000 characters."),
  negativePrompt: z.string().trim().max(1000).optional(),
  mediaType: MediaTypeSchema.default("image"),
  providerId: ProviderIdSchema.default("higgsfield"),
  modelId: ModelIdSchema.optional().describe(
    "Provider model id from list_capabilities. Defaults to the provider's default model for the media type."
  ),
  aspectRatio: AspectRatioSchema.optional(),
  resolution: ResolutionSchema.optional(),
  durationSeconds: z
    .number()
    .int()
    .min(1)
    .max(60)
    .optional()
    .describe("Video length in seconds. Rejected for image requests."),
  referenceUrls: z
    .array(ReferenceUrlSchema)
    .max(4, "At most 4 reference URLs.")
    .optional()
    .describe("Public https image URLs used as visual references."),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
  quantity: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1)
    .describe("Number of variations to generate. Multiplies cost."),
} as const;

/**
 * Rejects combinations that are nonsensical regardless of provider. Model- and
 * provider-specific limits are enforced later against the capability catalog,
 * because only the catalog knows them.
 */
function refineGenerationRequest<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value: any, ctx: z.RefinementCtx) => {
    if (value.mediaType === "image" && value.durationSeconds !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "durationSeconds only applies to video requests.",
      });
    }
    if (value.referenceUrls) {
      const unique = new Set(value.referenceUrls);
      if (unique.size !== value.referenceUrls.length) {
        ctx.addIssue({
          code: "custom",
          path: ["referenceUrls"],
          message: "Reference URLs must be unique.",
        });
      }
    }
  });
}

export const EstimateGenerationInputSchema = refineGenerationRequest(
  z.object(generationRequestShape).strict()
);
export type EstimateGenerationInput = z.infer<typeof EstimateGenerationInputSchema>;

export const GenerateMediaInputSchema = refineGenerationRequest(
  z
    .object({
      ...generationRequestShape,
      maxCredits: z
        .number()
        .positive()
        .max(100_000)
        .optional()
        .describe(
          "Per-request spend ceiling in provider credits. The job is refused before submission if the estimate exceeds it."
        ),
    })
    .strict()
);
export type GenerateMediaInput = z.infer<typeof GenerateMediaInputSchema>;

export const ListCapabilitiesInputSchema = z
  .object({
    mediaType: MediaTypeSchema.optional().describe("Filter models to one media type."),
    providerId: ProviderIdSchema.optional(),
  })
  .strict();
export type ListCapabilitiesInput = z.infer<typeof ListCapabilitiesInputSchema>;

export const GetGenerationStatusInputSchema = z
  .object({
    jobId: JobIdSchema,
  })
  .strict();
export type GetGenerationStatusInput = z.infer<typeof GetGenerationStatusInputSchema>;

export const CancelGenerationInputSchema = z
  .object({
    jobId: JobIdSchema,
    reason: z.string().trim().max(280).optional(),
  })
  .strict();
export type CancelGenerationInput = z.infer<typeof CancelGenerationInputSchema>;

/* ------------------------------------------------------------------ outputs */

export const CostEstimateSchema = z.object({
  credits: z.number().nonnegative(),
  currency: z.literal("credits"),
  /** Optional fiat conversion, present only when the operator configured a rate. */
  approxUsd: z.number().nonnegative().nullable(),
  breakdown: z.array(
    z.object({
      label: z.string(),
      credits: z.number(),
    })
  ),
  etaSeconds: z.number().int().nonnegative(),
  notes: z.array(z.string()),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const MediaAssetSchema = z.object({
  id: z.string(),
  kind: MediaTypeSchema,
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  mimeType: z.string().nullable(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const GenerationJobSchema = z.object({
  jobId: JobIdSchema,
  providerId: ProviderIdSchema,
  providerJobId: z.string().nullable(),
  modelId: ModelIdSchema,
  modelLabel: z.string(),
  mediaType: MediaTypeSchema,
  status: JobStatusSchema,
  /** 0–100. Providers that do not report progress get coarse status-derived values. */
  progress: z.number().min(0).max(100),
  statusMessage: z.string(),
  prompt: z.string(),
  request: z.object({
    aspectRatio: AspectRatioSchema.nullable(),
    resolution: ResolutionSchema.nullable(),
    durationSeconds: z.number().nullable(),
    quantity: z.number().int().positive(),
    referenceUrls: z.array(z.string()),
    seed: z.number().int().nullable(),
  }),
  estimate: CostEstimateSchema,
  assets: z.array(MediaAssetSchema),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
      remediation: z.string().nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  cancelable: z.boolean(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export const ModelCapabilitySchema = z.object({
  id: ModelIdSchema,
  label: z.string(),
  description: z.string(),
  mediaType: MediaTypeSchema,
  aspectRatios: z.array(AspectRatioSchema).nonempty(),
  resolutions: z.array(ResolutionSchema).nonempty(),
  durationsSeconds: z.array(z.number().int().positive()),
  maxReferenceUrls: z.number().int().nonnegative(),
  supportsNegativePrompt: z.boolean(),
  supportsSeed: z.boolean(),
  maxQuantity: z.number().int().positive(),
  baseCredits: z.number().nonnegative(),
  isDefault: z.boolean(),
});
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ProviderCapabilitySchema = z.object({
  id: ProviderIdSchema,
  label: z.string(),
  docsUrl: z.string().url().nullable(),
  configured: z.boolean(),
  /** Env var names the operator still needs to set. Never contains values. */
  missingEnv: z.array(z.string()),
  statusMessage: z.string(),
  credentialFingerprint: z.string().nullable(),
  models: z.array(ModelCapabilitySchema),
});
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const ListCapabilitiesOutputSchema = z.object({
  providers: z.array(ProviderCapabilitySchema),
  defaultProviderId: ProviderIdSchema.nullable(),
  anyProviderConfigured: z.boolean(),
  aspectRatios: z.array(AspectRatioSchema),
  resolutions: z.array(ResolutionSchema),
  maxCreditsPerGeneration: z.number().positive(),
  billingWarning: z.string(),
});
export type ListCapabilitiesOutput = z.infer<typeof ListCapabilitiesOutputSchema>;

export const EstimateGenerationOutputSchema = z.object({
  providerId: ProviderIdSchema,
  modelId: ModelIdSchema,
  modelLabel: z.string(),
  mediaType: MediaTypeSchema,
  estimate: CostEstimateSchema,
  withinServerLimit: z.boolean(),
  maxCreditsPerGeneration: z.number().positive(),
  billingWarning: z.string(),
});
export type EstimateGenerationOutput = z.infer<typeof EstimateGenerationOutputSchema>;

export const ErrorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  providerId: ProviderIdSchema.nullable(),
  retryable: z.boolean(),
  remediation: z.string().nullable(),
  /** Env vars to set, when the failure is a configuration gap. */
  missingEnv: z.array(z.string()),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
