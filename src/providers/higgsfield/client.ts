import type { AppConfig } from "../../config/env.js";
import { ProviderError } from "../errors.js";
import { redactObject, redactSecrets } from "../../util/redact.js";

/**
 * Minimal authenticated HTTP client for the Higgsfield platform API.
 *
 * Responsibilities kept deliberately narrow: attach credentials, enforce a
 * timeout, and convert transport/HTTP failures into `ProviderError`s with
 * scrubbed messages. It has no knowledge of models or job shapes.
 *
 * Credentials are read from the validated config, held only in this closure,
 * and attached as request headers. They are never returned, logged, or included
 * in an error message — `toSafeMessage` strips them defensively in case the
 * upstream echoes them back in a response body.
 */

/** Header names carrying the key pair. Overridable per deployment if the API renames them. */
export const HF_KEY_ID_HEADER = "hf-api-key";
export const HF_KEY_SECRET_HEADER = "hf-secret";

export interface HiggsfieldCredentials {
  readonly keyId: string;
  readonly keySecret: string;
}

export interface HiggsfieldRequestOptions {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface HiggsfieldResponse {
  readonly status: number;
  readonly body: unknown;
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}>;

export class HiggsfieldClient {
  private readonly credentials: HiggsfieldCredentials;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;
  private readonly fetchImpl: FetchLike;

  constructor(
    credentials: HiggsfieldCredentials,
    config: Pick<AppConfig, "HF_API_BASE_URL" | "PROVIDER_TIMEOUT_MS" | "DEBUG_PROVIDER_LOGGING">,
    fetchImpl?: FetchLike
  ) {
    this.credentials = credentials;
    this.baseUrl = config.HF_API_BASE_URL.replace(/\/+$/, "");
    this.timeoutMs = config.PROVIDER_TIMEOUT_MS;
    this.debug = config.DEBUG_PROVIDER_LOGGING;
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  /** Values that must be scrubbed from anything user- or log-facing. */
  private get secrets(): string[] {
    return [this.credentials.keyId, this.credentials.keySecret];
  }

  private toSafeMessage(value: string): string {
    return redactSecrets(value, this.secrets);
  }

  async request(options: HiggsfieldRequestOptions): Promise<HiggsfieldResponse> {
    const url = `${this.baseUrl}${options.path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // Honour a caller-supplied signal without losing our own timeout.
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    const headers: Record<string, string> = {
      accept: "application/json",
      [HF_KEY_ID_HEADER]: this.credentials.keyId,
      [HF_KEY_SECRET_HEADER]: this.credentials.keySecret,
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";

    if (this.debug) {
      console.error(
        "[higgsfield] request",
        JSON.stringify(
          redactObject({ method: options.method, url, body: options.body }, this.secrets)
        )
      );
    }

    let status: number;
    let rawText: string;
    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });
      status = response.status;
      rawText = await response.text();
    } catch (error) {
      const aborted = controller.signal.aborted;
      throw new ProviderError(
        aborted ? "timeout" : "provider_unavailable",
        aborted
          ? `Higgsfield did not respond within ${this.timeoutMs}ms.`
          : `Could not reach Higgsfield: ${this.toSafeMessage(
              error instanceof Error ? error.message : String(error)
            )}`,
        { providerId: "higgsfield", retryable: true, cause: error }
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }

    const body = parseJsonSafely(rawText);

    if (this.debug) {
      console.error(
        "[higgsfield] response",
        JSON.stringify(redactObject({ status, body }, this.secrets))
      );
    }

    if (status >= 200 && status < 300) {
      return { status, body };
    }

    throw this.toHttpError(status, body, rawText);
  }

  private toHttpError(status: number, body: unknown, rawText: string): ProviderError {
    const detail = this.toSafeMessage(extractErrorDetail(body) ?? truncate(rawText, 300));

    if (status === 401 || status === 403) {
      return new ProviderError(
        "provider_unauthorized",
        `Higgsfield rejected the configured credentials (HTTP ${status}).${detail ? ` Detail: ${detail}` : ""}`,
        {
          providerId: "higgsfield",
          status,
          remediation:
            "Verify HF_API_KEY_ID and HF_API_KEY_SECRET belong to an active account with API access enabled.",
        }
      );
    }
    if (status === 404) {
      return new ProviderError(
        "job_not_found",
        `Higgsfield returned HTTP 404 for this request. The job may have expired, or the configured API path may be wrong.${detail ? ` Detail: ${detail}` : ""}`,
        {
          providerId: "higgsfield",
          status,
          remediation:
            "Check HF_JOB_STATUS_PATH / HF_MODEL_PATH_OVERRIDES against the current Higgsfield API reference.",
        }
      );
    }
    if (status === 402) {
      return new ProviderError(
        "budget_exceeded",
        `Higgsfield reported insufficient account credit (HTTP 402).${detail ? ` Detail: ${detail}` : ""}`,
        { providerId: "higgsfield", status, remediation: "Top up the Higgsfield account." }
      );
    }
    if (status === 429) {
      return new ProviderError(
        "rate_limited",
        `Higgsfield rate limit hit (HTTP 429).${detail ? ` Detail: ${detail}` : ""}`,
        { providerId: "higgsfield", status, retryable: true }
      );
    }
    if (status >= 400 && status < 500) {
      return new ProviderError(
        "invalid_request",
        `Higgsfield rejected the request (HTTP ${status}).${detail ? ` Detail: ${detail}` : ""}`,
        { providerId: "higgsfield", status }
      );
    }
    return new ProviderError(
      "provider_unavailable",
      `Higgsfield returned HTTP ${status}.${detail ? ` Detail: ${detail}` : ""}`,
      { providerId: "higgsfield", status, retryable: true }
    );
  }
}

function parseJsonSafely(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/** Pulls a message out of the common error-body shapes without assuming one. */
export function extractErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  for (const key of ["message", "detail", "error", "error_message", "title"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return truncate(value, 300);
    if (value && typeof value === "object") {
      const nested = extractErrorDetail(value);
      if (nested) return nested;
    }
  }
  if (Array.isArray(record["errors"])) {
    const first = record["errors"][0];
    if (typeof first === "string") return truncate(first, 300);
    const nested = extractErrorDetail(first);
    if (nested) return nested;
  }
  return null;
}
