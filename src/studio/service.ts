import type { AppConfig } from "../config/env.js";
import { JobStore } from "../jobs/store.js";
import { assertWithinBudget, evaluateBudget, normalizeRequest } from "../domain/request.js";
import { ProviderError, isProviderError } from "../providers/errors.js";
import { HiggsfieldProvider } from "../providers/higgsfield/index.js";
import { buildProviders, ProviderRegistry, type RegistryOptions } from "../providers/registry.js";
import type { MediaProvider } from "../providers/types.js";
import {
  AspectRatioSchema,
  ResolutionSchema,
  isTerminal,
  type CancelGenerationInput,
  type ErrorEnvelope,
  type EstimateGenerationInput,
  type EstimateGenerationOutput,
  type GenerateMediaInput,
  type GenerationJob,
  type GetGenerationStatusInput,
  type ListCapabilitiesInput,
  type ListCapabilitiesOutput,
  type ProviderCapability,
} from "../schemas/generation.js";

/**
 * The studio's application layer.
 *
 * Every MCP tool is a thin wrapper over one method here. Keeping the logic in a
 * plain class (no MCP types in the signatures) is what makes the behaviour
 * testable without standing up a transport, and keeps the provider adapters
 * free of protocol concerns.
 */

export const BILLING_WARNING =
  "Generation calls a paid third-party API. Every successful submission consumes real credits on the configured provider account, including runs you cancel after they start rendering.";

export interface StudioServiceOptions extends RegistryOptions {
  readonly registry?: ProviderRegistry;
  readonly store?: JobStore;
}

export class StudioService {
  readonly config: AppConfig;
  private readonly registry: ProviderRegistry;
  private readonly store: JobStore;

  constructor(config: AppConfig, options: StudioServiceOptions = {}) {
    this.config = config;
    this.registry = options.registry ?? buildProviders(config, options);
    this.store = options.store ?? new JobStore(config);
  }

  /* ------------------------------------------------------------- capabilities */

  listCapabilities(input: ListCapabilitiesInput = {}): ListCapabilitiesOutput {
    const providers = input.providerId
      ? [this.registry.get(input.providerId)]
      : [...this.registry.list()];

    const described: ProviderCapability[] = providers.map((provider) => {
      const status = provider.describeConfiguration();
      const models = provider
        .listModels()
        .filter((model) => !input.mediaType || model.mediaType === input.mediaType);

      return {
        id: provider.id,
        label: provider.label,
        docsUrl: provider.docsUrl,
        configured: status.configured,
        missingEnv: [...status.missingEnv],
        statusMessage: status.statusMessage,
        credentialFingerprint: status.credentialFingerprint,
        models,
      };
    });

    return {
      providers: described,
      defaultProviderId: this.registry.defaultProvider().id,
      anyProviderConfigured: this.registry.anyConfigured(),
      aspectRatios: [...AspectRatioSchema.options],
      resolutions: [...ResolutionSchema.options],
      maxCreditsPerGeneration: this.config.MAX_CREDITS_PER_GENERATION,
      billingWarning: BILLING_WARNING,
    };
  }

  /* ----------------------------------------------------------------- estimate */

  estimate(input: EstimateGenerationInput): EstimateGenerationOutput {
    const provider = this.registry.get(input.providerId);
    const { model, request, notes } = normalizeRequest(provider, input, {
      requiresReference: referenceRequirement(provider),
    });

    const estimate = provider.estimate(request);
    const decision = evaluateBudget(estimate, this.config);

    return {
      providerId: provider.id,
      modelId: model.id,
      modelLabel: model.label,
      mediaType: model.mediaType,
      estimate: {
        ...estimate,
        notes: [...estimate.notes, ...notes, ...(decision.reason ? [decision.reason] : [])],
      },
      withinServerLimit: decision.allowed,
      maxCreditsPerGeneration: this.config.MAX_CREDITS_PER_GENERATION,
      billingWarning: BILLING_WARNING,
    };
  }

  /* ----------------------------------------------------------------- generate */

  /**
   * Submits a job. Ordering matters and is load-bearing:
   *   1. resolve + validate against the catalog   (free)
   *   2. price it and apply both spend ceilings   (free)
   *   3. only then touch the provider             (billable)
   *
   * A credential gap surfaces at step 3 as `provider_not_configured`, before
   * which nothing has been charged and no placeholder job is recorded.
   */
  async generate(input: GenerateMediaInput, signal?: AbortSignal): Promise<GenerationJob> {
    const provider = this.registry.get(input.providerId);
    const { model, request, notes } = normalizeRequest(provider, input, {
      requiresReference: referenceRequirement(provider),
    });

    const estimate = provider.estimate(request);
    assertWithinBudget(estimate, this.config, provider.id, input.maxCredits);

    const submission = await provider.submit(request, signal);

    const now = new Date().toISOString();
    return this.store.put({
      jobId: JobStore.newJobId(),
      providerId: provider.id,
      providerJobId: submission.providerJobId,
      modelId: model.id,
      modelLabel: model.label,
      mediaType: model.mediaType,
      status: submission.status,
      progress: submission.status === "queued" ? 5 : 15,
      statusMessage: submission.statusMessage,
      prompt: request.prompt,
      request: {
        aspectRatio: asAspectRatio(request.aspectRatio),
        resolution: asResolution(request.resolution),
        durationSeconds: request.durationSeconds ?? null,
        quantity: request.quantity,
        referenceUrls: [...request.referenceUrls],
        seed: request.seed ?? null,
      },
      estimate: { ...estimate, notes: [...estimate.notes, ...notes] },
      assets: [],
      error: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelable: true,
    });
  }

  /* ------------------------------------------------------------------- status */

  async getStatus(input: GetGenerationStatusInput, signal?: AbortSignal): Promise<GenerationJob> {
    const job = this.requireJob(input.jobId);

    // Terminal jobs are immutable; re-polling would spend a request for nothing.
    if (isTerminal(job.status) || !job.providerJobId) return job;

    const provider = this.registry.get(job.providerId);

    try {
      const snapshot = await pollProvider(provider, job.providerJobId, job.mediaType, signal);
      return (
        this.store.update(job.jobId, {
          status: snapshot.status,
          progress: snapshot.progress ?? job.progress,
          statusMessage: snapshot.statusMessage,
          assets: [...snapshot.assets],
          error: snapshot.error ? { ...snapshot.error, remediation: null } : null,
        }) ?? job
      );
    } catch (error) {
      // A transient polling failure must not destroy a job that is still
      // rendering upstream and still being paid for: record it and let the
      // caller retry.
      if (isProviderError(error) && error.retryable) {
        return (
          this.store.update(job.jobId, {
            statusMessage: `Could not reach the provider for an update: ${error.message}`,
          }) ?? job
        );
      }
      throw error;
    }
  }

  /* ------------------------------------------------------------------- cancel */

  async cancel(input: CancelGenerationInput, signal?: AbortSignal): Promise<GenerationJob> {
    const job = this.requireJob(input.jobId);

    if (isTerminal(job.status)) {
      throw new ProviderError(
        "not_cancelable",
        `Job ${job.jobId} already finished with status "${job.status}" and cannot be canceled.`,
        { providerId: job.providerId }
      );
    }
    if (!job.providerJobId) {
      throw new ProviderError(
        "not_cancelable",
        `Job ${job.jobId} has no provider job id, so there is nothing to cancel upstream.`,
        { providerId: job.providerId }
      );
    }

    const provider = this.registry.get(job.providerId);
    const snapshot = await provider.cancel(job.providerJobId, signal);

    const reason = input.reason ? ` Reason: ${input.reason}` : "";
    return (
      this.store.update(job.jobId, {
        status: snapshot.status,
        progress: snapshot.progress ?? 100,
        statusMessage: `${snapshot.statusMessage}${reason}`,
        assets: [...snapshot.assets],
        error: snapshot.error ? { ...snapshot.error, remediation: null } : null,
      }) ?? job
    );
  }

  /* -------------------------------------------------------------------- misc */

  recentJobs(limit?: number): readonly GenerationJob[] {
    return this.store.recent(limit);
  }

  private requireJob(jobId: string): GenerationJob {
    const job = this.store.get(jobId);
    if (!job) {
      throw new ProviderError(
        "job_not_found",
        `No job "${jobId}" is tracked by this server. Job history is kept in memory and is cleared on restart or after ${Math.round(
          this.config.JOB_RETENTION_MS / 60000
        )} minutes.`,
        { remediation: "Start a new generation with generate_media." }
      );
    }
    return job;
  }
}

/** Providers may declare models that cannot run without a reference image. */
function referenceRequirement(provider: MediaProvider): ((modelId: string) => boolean) | undefined {
  return provider instanceof HiggsfieldProvider
    ? (modelId: string) => provider.requiresReference(modelId)
    : undefined;
}

/** Uses the media-type-aware poll when the adapter offers one. */
function pollProvider(
  provider: MediaProvider,
  providerJobId: string,
  mediaType: "image" | "video",
  signal?: AbortSignal
) {
  if (provider instanceof HiggsfieldProvider) {
    return provider.getStatusForMediaType(providerJobId, mediaType, signal);
  }
  return provider.getStatus(providerJobId, signal);
}

function asAspectRatio(value: string) {
  const parsed = AspectRatioSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asResolution(value: string) {
  const parsed = ResolutionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Converts any thrown error into the widget's error envelope.
 * Unknown errors are reported without their stack or message internals, since
 * those can carry request context we have not scrubbed.
 */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (isProviderError(error)) {
    const missingEnv =
      "missingEnv" in error && Array.isArray((error as { missingEnv?: unknown }).missingEnv)
        ? ((error as { missingEnv: string[] }).missingEnv as string[])
        : [];
    return {
      code: error.code,
      message: error.message,
      providerId: error.providerId ?? null,
      retryable: error.retryable,
      remediation: error.remediation ?? null,
      missingEnv,
    };
  }
  return {
    code: "internal_error",
    message: "The studio hit an unexpected internal error. Check the server logs for details.",
    providerId: null,
    retryable: true,
    remediation: null,
    missingEnv: [],
  };
}
