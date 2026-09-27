import type { AppConfig } from "../config/env.js";
import type {
  CostEstimate,
  EstimateGenerationInput,
  ModelCapability,
} from "../schemas/generation.js";
import { ProviderError } from "../providers/errors.js";
import type { MediaProvider, NormalizedGenerationRequest } from "../providers/types.js";

/**
 * Turns a schema-valid tool input into a request a provider can execute.
 *
 * Schema validation proves the *shape* is sane; this proves the *combination*
 * is sane for the chosen model. Both run before any network call, so an
 * impossible request costs nothing.
 */

function pickModel(provider: MediaProvider, input: EstimateGenerationInput): ModelCapability {
  const models = provider.listModels();
  const forMediaType = models.filter((model) => model.mediaType === input.mediaType);

  if (forMediaType.length === 0) {
    throw new ProviderError(
      "invalid_request",
      `${provider.label} does not offer any ${input.mediaType} models.`,
      { providerId: provider.id }
    );
  }

  if (!input.modelId) {
    const fallback = forMediaType.find((model) => model.isDefault) ?? forMediaType[0];
    // `forMediaType` is non-empty here, so this is always defined.
    return fallback as ModelCapability;
  }

  const chosen = models.find((model) => model.id === input.modelId);
  if (!chosen) {
    throw new ProviderError(
      "model_unknown",
      `Unknown model "${input.modelId}" for ${provider.label}. Available ${
        input.mediaType
      } models: ${forMediaType.map((model) => model.id).join(", ")}.`,
      { providerId: provider.id, remediation: "Call list_capabilities for the current model list." }
    );
  }
  if (chosen.mediaType !== input.mediaType) {
    throw new ProviderError(
      "invalid_request",
      `Model "${chosen.id}" produces ${chosen.mediaType}, but the request asked for ${input.mediaType}.`,
      { providerId: provider.id }
    );
  }
  return chosen;
}

function nearest(values: readonly number[], target: number): number {
  let best = values[0] as number;
  for (const value of values) {
    if (Math.abs(value - target) < Math.abs(best - target)) best = value;
  }
  return best;
}

export interface NormalizeResult {
  readonly model: ModelCapability;
  readonly request: NormalizedGenerationRequest;
  /** Human-readable adjustments made to the input, surfaced in the widget. */
  readonly notes: readonly string[];
}

export function normalizeRequest(
  provider: MediaProvider,
  input: EstimateGenerationInput,
  options: { requiresReference?: (modelId: string) => boolean } = {}
): NormalizeResult {
  const model = pickModel(provider, input);
  const notes: string[] = [];

  const aspectRatio = input.aspectRatio ?? (model.aspectRatios[0] as string);
  if (input.aspectRatio && !model.aspectRatios.includes(input.aspectRatio)) {
    throw new ProviderError(
      "invalid_request",
      `Model "${model.id}" does not support aspect ratio ${input.aspectRatio}. Supported: ${model.aspectRatios.join(", ")}.`,
      { providerId: provider.id }
    );
  }
  if (!input.aspectRatio) notes.push(`Aspect ratio defaulted to ${aspectRatio}.`);

  const resolution = input.resolution ?? (model.resolutions[0] as string);
  if (input.resolution && !model.resolutions.includes(input.resolution)) {
    throw new ProviderError(
      "invalid_request",
      `Model "${model.id}" does not support ${input.resolution}. Supported: ${model.resolutions.join(", ")}.`,
      { providerId: provider.id }
    );
  }
  if (!input.resolution) notes.push(`Resolution defaulted to ${resolution}.`);

  let durationSeconds: number | undefined;
  if (model.mediaType === "video") {
    if (model.durationsSeconds.length === 0) {
      throw new ProviderError(
        "invalid_request",
        `Catalog entry for "${model.id}" declares no supported durations.`,
        { providerId: provider.id }
      );
    }
    if (input.durationSeconds === undefined) {
      durationSeconds = model.durationsSeconds[0] as number;
      notes.push(`Duration defaulted to ${durationSeconds}s.`);
    } else if (model.durationsSeconds.includes(input.durationSeconds)) {
      durationSeconds = input.durationSeconds;
    } else {
      const snapped = nearest(model.durationsSeconds, input.durationSeconds);
      durationSeconds = snapped;
      notes.push(
        `Duration ${input.durationSeconds}s is not offered by ${model.id}; snapped to the nearest supported ${snapped}s (options: ${model.durationsSeconds.join("s, ")}s).`
      );
    }
  }

  const referenceUrls = input.referenceUrls ?? [];
  if (referenceUrls.length > model.maxReferenceUrls) {
    throw new ProviderError(
      "invalid_request",
      model.maxReferenceUrls === 0
        ? `Model "${model.id}" does not accept reference URLs.`
        : `Model "${model.id}" accepts at most ${model.maxReferenceUrls} reference URL(s); ${referenceUrls.length} were supplied.`,
      { providerId: provider.id }
    );
  }
  if (referenceUrls.length === 0 && options.requiresReference?.(model.id)) {
    throw new ProviderError(
      "invalid_request",
      `Model "${model.id}" requires at least one reference URL to work from.`,
      { providerId: provider.id, remediation: "Add a public https image URL under referenceUrls." }
    );
  }

  if (input.quantity > model.maxQuantity) {
    throw new ProviderError(
      "invalid_request",
      `Model "${model.id}" can generate at most ${model.maxQuantity} variation(s) per request; ${input.quantity} were requested.`,
      { providerId: provider.id }
    );
  }

  if (input.negativePrompt && !model.supportsNegativePrompt) {
    throw new ProviderError(
      "invalid_request",
      `Model "${model.id}" does not support a negative prompt.`,
      { providerId: provider.id }
    );
  }
  if (input.seed !== undefined && !model.supportsSeed) {
    throw new ProviderError("invalid_request", `Model "${model.id}" does not support a fixed seed.`, {
      providerId: provider.id,
    });
  }

  const request: NormalizedGenerationRequest = {
    prompt: input.prompt,
    ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
    mediaType: model.mediaType,
    modelId: model.id,
    aspectRatio,
    resolution,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    referenceUrls,
    ...(input.seed === undefined ? {} : { seed: input.seed }),
    quantity: input.quantity,
  };

  return { model, request, notes };
}

export interface BudgetDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly serverLimit: number;
  readonly requestLimit: number | null;
}

/**
 * Applies the two independent spend ceilings: the operator's server-wide limit
 * and the caller's optional per-request limit. Both are evaluated against the
 * local estimate *before* submission, which is the only moment a refusal is free.
 */
export function evaluateBudget(
  estimate: CostEstimate,
  config: Pick<AppConfig, "MAX_CREDITS_PER_GENERATION">,
  requestMaxCredits?: number
): BudgetDecision {
  const serverLimit = config.MAX_CREDITS_PER_GENERATION;
  const requestLimit = requestMaxCredits ?? null;

  if (estimate.credits > serverLimit) {
    return {
      allowed: false,
      serverLimit,
      requestLimit,
      reason: `Estimated ${estimate.credits} credits exceeds this server's per-generation limit of ${serverLimit}. Lower the resolution, duration, or variation count, or raise MAX_CREDITS_PER_GENERATION.`,
    };
  }
  if (requestLimit !== null && estimate.credits > requestLimit) {
    return {
      allowed: false,
      serverLimit,
      requestLimit,
      reason: `Estimated ${estimate.credits} credits exceeds the maxCredits ceiling of ${requestLimit} set on this request. Nothing was submitted and nothing was charged.`,
    };
  }
  return { allowed: true, reason: null, serverLimit, requestLimit };
}

export function assertWithinBudget(
  estimate: CostEstimate,
  config: Pick<AppConfig, "MAX_CREDITS_PER_GENERATION">,
  providerId: string,
  requestMaxCredits?: number
): void {
  const decision = evaluateBudget(estimate, config, requestMaxCredits);
  if (!decision.allowed) {
    throw new ProviderError("budget_exceeded", decision.reason as string, {
      providerId,
      remediation: "Reduce the request, or raise the applicable credit ceiling.",
    });
  }
}

/** Rounds credits to 2dp so floating-point multipliers never leak into the UI. */
export function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}
