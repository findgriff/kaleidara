import type { AppConfig } from "../../config/env.js";
import type { CostEstimate, ModelCapability } from "../../schemas/generation.js";
import { roundCredits } from "../../domain/request.js";
import { ProviderError, ProviderNotConfiguredError } from "../errors.js";
import type {
  MediaProvider,
  NormalizedGenerationRequest,
  ProviderConfigurationStatus,
  ProviderJobSnapshot,
  ProviderSubmission,
} from "../types.js";
import { fingerprint } from "../../util/redact.js";
import { HiggsfieldClient, type FetchLike } from "./client.js";
import {
  HIGGSFIELD_MODELS,
  MODELS_REQUIRING_REFERENCE,
  defaultHiggsfieldModel,
  findHiggsfieldModel,
  type HiggsfieldModel,
} from "./catalog.js";
import { extractJobSetId, mapJobSnapshot, progressForStatus } from "./mapping.js";

export const HIGGSFIELD_PROVIDER_ID = "higgsfield";
const HIGGSFIELD_LABEL = "Higgsfield";
const HIGGSFIELD_DOCS_URL = "https://docs.higgsfield.ai";
const REQUIRED_ENV = ["HF_API_KEY_ID", "HF_API_KEY_SECRET"] as const;

/**
 * Higgsfield provider adapter.
 *
 * Lifecycle is async throughout: `submit` returns as soon as the platform has
 * accepted a job set, and the caller polls `getStatus` until a terminal state.
 * Nothing in this class fabricates media — when credentials are missing every
 * network-touching method throws `ProviderNotConfiguredError` before any work
 * begins, and the widget renders that as a setup prompt.
 */
export class HiggsfieldProvider implements MediaProvider {
  readonly id = HIGGSFIELD_PROVIDER_ID;
  readonly label = HIGGSFIELD_LABEL;
  readonly docsUrl = HIGGSFIELD_DOCS_URL;

  private readonly config: AppConfig;
  private readonly fetchImpl: FetchLike | undefined;
  private client: HiggsfieldClient | null = null;

  constructor(config: AppConfig, fetchImpl?: FetchLike) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  /* ------------------------------------------------------------ configuration */

  private missingEnv(): string[] {
    const missing: string[] = [];
    if (!this.config.HF_API_KEY_ID) missing.push("HF_API_KEY_ID");
    if (!this.config.HF_API_KEY_SECRET) missing.push("HF_API_KEY_SECRET");
    return missing;
  }

  describeConfiguration(): ProviderConfigurationStatus {
    const missing = this.missingEnv();
    if (missing.length > 0) {
      return {
        configured: false,
        missingEnv: missing,
        statusMessage: `Not configured — set ${missing.join(" and ")} on the server to enable generation.`,
        credentialFingerprint: null,
      };
    }
    return {
      configured: true,
      missingEnv: [],
      statusMessage: `Connected to ${this.config.HF_API_BASE_URL}. Generations are billed to the linked Higgsfield account.`,
      // A digest, not the key: lets an operator confirm which credential loaded.
      credentialFingerprint: fingerprint(this.config.HF_API_KEY_ID),
    };
  }

  /** Lazily builds the authenticated client, or refuses if unkeyed. */
  private requireClient(): HiggsfieldClient {
    const missing = this.missingEnv();
    if (missing.length > 0) {
      throw new ProviderNotConfiguredError(this.id, missing, HIGGSFIELD_LABEL);
    }
    this.client ??= new HiggsfieldClient(
      {
        keyId: this.config.HF_API_KEY_ID as string,
        keySecret: this.config.HF_API_KEY_SECRET as string,
      },
      this.config,
      this.fetchImpl
    );
    return this.client;
  }

  /* ---------------------------------------------------------------- catalogue */

  listModels(): readonly ModelCapability[] {
    // Strip the adapter-private fields so endpoint paths never reach the widget.
    return HIGGSFIELD_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      description: model.description,
      mediaType: model.mediaType,
      aspectRatios: model.aspectRatios,
      resolutions: model.resolutions,
      durationsSeconds: model.durationsSeconds,
      maxReferenceUrls: model.maxReferenceUrls,
      supportsNegativePrompt: model.supportsNegativePrompt,
      supportsSeed: model.supportsSeed,
      maxQuantity: model.maxQuantity,
      baseCredits: model.baseCredits,
      isDefault: model.isDefault,
    }));
  }

  requiresReference(modelId: string): boolean {
    return MODELS_REQUIRING_REFERENCE.has(modelId);
  }

  private model(modelId: string): HiggsfieldModel {
    const model = findHiggsfieldModel(modelId);
    if (!model) {
      throw new ProviderError("model_unknown", `Unknown Higgsfield model "${modelId}".`, {
        providerId: this.id,
      });
    }
    return model;
  }

  defaultModelId(mediaType: "image" | "video"): string {
    return defaultHiggsfieldModel(mediaType).id;
  }

  /* ----------------------------------------------------------------- estimate */

  estimate(request: NormalizedGenerationRequest): CostEstimate {
    const model = this.model(request.modelId);
    const multiplier = model.resolutionMultipliers[request.resolution] ?? 1;
    const duration = request.durationSeconds ?? 0;

    const perVariationBase = model.baseCredits * multiplier;
    const perVariationMotion = model.creditsPerSecond * duration * multiplier;
    const perVariation = perVariationBase + perVariationMotion;
    const credits = roundCredits(perVariation * request.quantity);

    const breakdown = [
      {
        label: `${model.label} base × ${request.resolution} (${multiplier}×)`,
        credits: roundCredits(perVariationBase * request.quantity),
      },
    ];
    if (perVariationMotion > 0) {
      breakdown.push({
        label: `Motion ${duration}s @ ${model.creditsPerSecond}/s × ${request.resolution} (${multiplier}×)`,
        credits: roundCredits(perVariationMotion * request.quantity),
      });
    }
    if (request.quantity > 1) {
      breakdown.push({
        label: `${request.quantity} variations`,
        credits: 0,
      });
    }

    const etaSeconds = Math.round(
      model.baseEtaSeconds +
        model.etaSecondsPerSecondOfVideo * duration +
        (request.quantity - 1) * model.baseEtaSeconds * 0.4
    );

    const notes = [
      "Credit figures are this server's local projection from src/providers/higgsfield/catalog.ts, not a quote from Higgsfield. Confirm live pricing for your account before relying on them.",
    ];
    if (request.referenceUrls.length > 0) {
      notes.push(
        `${request.referenceUrls.length} reference URL(s) will be sent to Higgsfield and must be publicly reachable.`
      );
    }

    const rate = this.config.CREDIT_USD_RATE;
    return {
      credits,
      currency: "credits",
      approxUsd: rate > 0 ? roundCredits(credits * rate) : null,
      breakdown,
      etaSeconds,
      notes,
    };
  }

  /* ---------------------------------------------------------------- lifecycle */

  private submitPath(model: HiggsfieldModel): string {
    return this.config.HF_MODEL_PATH_OVERRIDES[model.id] ?? model.submitPath;
  }

  /** Builds the upstream payload. Kept separate so tests can assert on it. */
  buildSubmitPayload(request: NormalizedGenerationRequest): Record<string, unknown> {
    const model = this.model(request.modelId);

    const params: Record<string, unknown> = {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio,
      resolution: request.resolution,
      quantity: request.quantity,
    };
    if (request.negativePrompt) params["negative_prompt"] = request.negativePrompt;
    if (request.seed !== undefined) params["seed"] = request.seed;
    if (request.durationSeconds !== undefined) params["duration"] = request.durationSeconds;
    if (request.referenceUrls.length > 0 && model.referenceField) {
      params[model.referenceField] = request.referenceUrls.map((url) => ({
        type: "image_url",
        image_url: url,
      }));
    }

    return { params };
  }

  async submit(
    request: NormalizedGenerationRequest,
    signal?: AbortSignal
  ): Promise<ProviderSubmission> {
    const client = this.requireClient();
    const model = this.model(request.modelId);

    const response = await client.request({
      method: "POST",
      path: this.submitPath(model),
      body: this.buildSubmitPayload(request),
      ...(signal ? { signal } : {}),
    });

    const providerJobId = extractJobSetId(response.body);

    // The submit response usually already carries a status; fall back to queued.
    let status: ProviderSubmission["status"] = "queued";
    try {
      status = mapJobSnapshot(response.body, request.mediaType).status;
    } catch {
      // A submit ack that does not yet describe a status is normal — the job id
      // is what matters, and the first poll will establish the real state.
    }

    return {
      providerJobId,
      status: status === "succeeded" ? "running" : status,
      statusMessage: "Submitted to Higgsfield.",
    };
  }

  private path(template: string, jobSetId: string): string {
    return template.replace("{jobSetId}", encodeURIComponent(jobSetId));
  }

  /**
   * Interface-level poll. The job payload does not echo the media type, so this
   * defaults to `image`; callers holding the original request should prefer
   * `getStatusForMediaType` so video assets are tagged correctly.
   */
  async getStatus(providerJobId: string, signal?: AbortSignal): Promise<ProviderJobSnapshot> {
    return this.getStatusForMediaType(providerJobId, "image", signal);
  }

  async cancel(providerJobId: string, signal?: AbortSignal): Promise<ProviderJobSnapshot> {
    const client = this.requireClient();
    const response = await client.request({
      method: "POST",
      path: this.path(this.config.HF_JOB_CANCEL_PATH, providerJobId),
      ...(signal ? { signal } : {}),
    });

    // A cancel endpoint may return the updated job set, or an empty 2xx body.
    try {
      return this.toSnapshot(response.body, "image");
    } catch {
      return {
        status: "canceled",
        progress: 100,
        statusMessage: "Cancellation accepted by Higgsfield.",
        assets: [],
        error: null,
      };
    }
  }

  private toSnapshot(body: unknown, mediaType: "image" | "video"): ProviderJobSnapshot {
    const mapped = mapJobSnapshot(body, mediaType);
    return {
      status: mapped.status,
      progress: mapped.progress ?? progressForStatus(mapped.status),
      statusMessage: mapped.statusMessage,
      assets: mapped.assets,
      error: mapped.error,
    };
  }

  /** Status poll that knows the media type of the original request. */
  async getStatusForMediaType(
    providerJobId: string,
    mediaType: "image" | "video",
    signal?: AbortSignal
  ): Promise<ProviderJobSnapshot> {
    const client = this.requireClient();
    const response = await client.request({
      method: "GET",
      path: this.path(this.config.HF_JOB_STATUS_PATH, providerJobId),
      ...(signal ? { signal } : {}),
    });
    return this.toSnapshot(response.body, mediaType);
  }
}
