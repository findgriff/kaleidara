import type {
  CostEstimate,
  GenerationJob,
  MediaAsset,
  MediaType,
  ModelCapability,
} from "../schemas/generation.js";

/**
 * Contract every media provider adapter implements.
 *
 * Adapters own three things and nothing else: translating a normalised request
 * into a provider payload, translating a provider response back into our
 * domain types, and authenticating. They never touch the job store, MCP
 * plumbing, or spend limits — that keeps adding a second real provider a
 * matter of writing one file plus a registry line.
 */

/** A request that has already passed schema validation and catalog validation. */
export interface NormalizedGenerationRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly mediaType: MediaType;
  readonly modelId: string;
  readonly aspectRatio: string;
  readonly resolution: string;
  readonly durationSeconds?: number;
  readonly referenceUrls: readonly string[];
  readonly seed?: number;
  readonly quantity: number;
}

/** What an adapter returns after a successful submit. */
export interface ProviderSubmission {
  /** Provider-side identifier used for subsequent status/cancel calls. */
  readonly providerJobId: string;
  readonly status: GenerationJob["status"];
  readonly statusMessage: string;
}

/** A point-in-time snapshot of a provider-side job. */
export interface ProviderJobSnapshot {
  readonly status: GenerationJob["status"];
  /** 0–100 when the provider reports it, otherwise null (caller derives one). */
  readonly progress: number | null;
  readonly statusMessage: string;
  readonly assets: readonly MediaAsset[];
  readonly error: { code: string; message: string; retryable: boolean } | null;
}

export interface ProviderConfigurationStatus {
  readonly configured: boolean;
  /** Names only — never values. */
  readonly missingEnv: readonly string[];
  readonly statusMessage: string;
  /** Non-reversible digest identifying the loaded credential, or null. */
  readonly credentialFingerprint: string | null;
}

export interface MediaProvider {
  readonly id: string;
  readonly label: string;
  readonly docsUrl: string | null;

  /** Whether credentials are present. Must not perform network I/O. */
  describeConfiguration(): ProviderConfigurationStatus;

  /** Static capability catalog. Must not perform network I/O. */
  listModels(): readonly ModelCapability[];

  /**
   * Local cost projection. Deterministic and offline so the widget can price a
   * request before any money is spent.
   */
  estimate(request: NormalizedGenerationRequest): CostEstimate;

  /** Starts an async job. Throws `ProviderNotConfiguredError` when unkeyed. */
  submit(request: NormalizedGenerationRequest, signal?: AbortSignal): Promise<ProviderSubmission>;

  /** Polls a job. */
  getStatus(providerJobId: string, signal?: AbortSignal): Promise<ProviderJobSnapshot>;

  /**
   * Requests cancellation. Resolves with the post-cancel snapshot. Adapters
   * whose upstream cannot cancel must throw `ProviderError("not_cancelable")`
   * rather than silently succeed.
   */
  cancel(providerJobId: string, signal?: AbortSignal): Promise<ProviderJobSnapshot>;
}
