import type { JobStatus, MediaAsset, MediaType } from "../../schemas/generation.js";
import { ProviderError } from "../errors.js";

/**
 * Translation layer between Higgsfield job payloads and our domain types.
 *
 * The mapper is written to be *tolerant of shape* and *strict about meaning*:
 * it accepts the several reasonable spellings a job API might use for a status
 * or a result URL, but if it cannot positively identify a status it raises
 * `unexpected_response` rather than guessing a terminal state. Guessing here
 * would either strand a paid job or report success with no media — both worse
 * than a visible error.
 */

const STATUS_ALIASES: Readonly<Record<string, JobStatus>> = {
  queued: "queued",
  queue: "queued",
  in_queue: "queued",
  pending: "queued",
  created: "queued",
  submitted: "queued",
  accepted: "queued",
  running: "running",
  in_progress: "running",
  inprogress: "running",
  processing: "running",
  started: "running",
  succeeded: "succeeded",
  success: "succeeded",
  successful: "succeeded",
  completed: "succeeded",
  complete: "succeeded",
  done: "succeeded",
  finished: "succeeded",
  failed: "failed",
  failure: "failed",
  error: "failed",
  errored: "failed",
  rejected: "failed",
  nsfw: "failed",
  canceled: "canceled",
  cancelled: "canceled",
  aborted: "canceled",
};

export function normalizeStatus(raw: unknown): JobStatus | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_ALIASES[key] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Finds the object that actually carries the job-set fields. */
function unwrapJobSet(body: unknown): Record<string, unknown> {
  const root = asRecord(body);
  if (!root) {
    throw new ProviderError("unexpected_response", "Higgsfield returned a non-object job payload.", {
      providerId: "higgsfield",
    });
  }
  for (const key of ["job_set", "jobSet", "data", "result"]) {
    const nested = asRecord(root[key]);
    if (nested && (nested["id"] !== undefined || nested["status"] !== undefined)) return nested;
  }
  return root;
}

/** Extracts the provider-side job identifier from a submit response. */
export function extractJobSetId(body: unknown): string {
  const jobSet = unwrapJobSet(body);
  for (const key of ["id", "job_set_id", "jobSetId", "uuid"]) {
    const value = jobSet[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  throw new ProviderError(
    "unexpected_response",
    "Higgsfield accepted the request but the response contained no job id, so the job cannot be tracked. Check the configured submit path against the current API reference.",
    { providerId: "higgsfield", remediation: "Review HF_MODEL_PATH_OVERRIDES and the API version in use." }
  );
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Pulls a media URL out of a result node, which may be a string or an object. */
function urlFrom(node: unknown): string | null {
  if (typeof node === "string") return isHttpUrl(node) ? node : null;
  const record = asRecord(node);
  if (!record) return null;
  const direct = firstString(record, ["url", "raw_url", "signed_url", "download_url", "src"]);
  if (direct && isHttpUrl(direct)) return direct;
  for (const key of ["raw", "original", "full", "output", "video", "image"]) {
    const nested = urlFrom(record[key]);
    if (nested) return nested;
  }
  return null;
}

function thumbnailFrom(node: unknown): string | null {
  const record = asRecord(node);
  if (!record) return null;
  const direct = firstString(record, ["thumbnail_url", "thumbnailUrl", "preview_url", "poster_url"]);
  if (direct && isHttpUrl(direct)) return direct;
  for (const key of ["min", "thumbnail", "preview", "small"]) {
    const nested = urlFrom(record[key]);
    if (nested) return nested;
  }
  return null;
}

function collectJobNodes(jobSet: Record<string, unknown>): unknown[] {
  for (const key of ["jobs", "items", "results", "outputs", "data"]) {
    const value = jobSet[key];
    if (Array.isArray(value)) return value;
  }
  // A single-job payload: treat the job set itself as the only job.
  return [jobSet];
}

function assetsFromJobNode(
  node: unknown,
  mediaType: MediaType,
  index: number
): MediaAsset[] {
  const record = asRecord(node);
  if (!record) {
    const url = urlFrom(node);
    return url ? [buildAsset(url, null, null, mediaType, index, {})] : [];
  }

  const resultsNode = record["results"] ?? record["result"] ?? record["output"] ?? record;

  // `results` may itself be a list of variations.
  if (Array.isArray(resultsNode)) {
    return resultsNode.flatMap((entry, i) => {
      const url = urlFrom(entry);
      if (!url) return [];
      return [buildAsset(url, thumbnailFrom(entry), record, mediaType, index + i, asRecord(entry) ?? {})];
    });
  }

  const url = urlFrom(resultsNode);
  if (!url) return [];
  return [
    buildAsset(url, thumbnailFrom(resultsNode), record, mediaType, index, asRecord(resultsNode) ?? {}),
  ];
}

function buildAsset(
  url: string,
  thumbnailUrl: string | null,
  jobRecord: Record<string, unknown> | null,
  mediaType: MediaType,
  index: number,
  resultRecord: Record<string, unknown>
): MediaAsset {
  const dimensionSource = { ...(jobRecord ?? {}), ...resultRecord };
  const id =
    firstString(resultRecord, ["id", "uuid"]) ??
    firstString(jobRecord ?? {}, ["id", "uuid"]) ??
    `asset-${index + 1}`;

  return {
    id,
    kind: mediaType,
    url,
    thumbnailUrl,
    width: firstNumber(dimensionSource, ["width", "w"]),
    height: firstNumber(dimensionSource, ["height", "h"]),
    durationSeconds: firstNumber(dimensionSource, ["duration", "duration_seconds", "length"]),
    mimeType: firstString(dimensionSource, ["mime_type", "mimeType", "content_type"]),
  };
}

export interface MappedSnapshot {
  readonly status: JobStatus;
  readonly progress: number | null;
  readonly statusMessage: string;
  readonly assets: MediaAsset[];
  readonly error: { code: string; message: string; retryable: boolean } | null;
}

/**
 * Maps a job-set payload to a snapshot.
 *
 * A job set may contain several jobs (one per requested variation). The set is
 * only `succeeded` when every job succeeded; any failure makes the set failed,
 * and any still-running job keeps it running. Partial results are still
 * returned so the widget can show what did land.
 */
export function mapJobSnapshot(body: unknown, mediaType: MediaType): MappedSnapshot {
  const jobSet = unwrapJobSet(body);
  const nodes = collectJobNodes(jobSet);

  const setStatus = normalizeStatus(jobSet["status"] ?? jobSet["state"]);
  const jobStatuses: JobStatus[] = [];
  const assets: MediaAsset[] = [];
  const failureMessages: string[] = [];

  for (const [index, node] of nodes.entries()) {
    const record = asRecord(node);
    if (record && record !== jobSet) {
      const status = normalizeStatus(record["status"] ?? record["state"]);
      if (status) jobStatuses.push(status);
      if (status === "failed") {
        const message =
          firstString(record, ["error", "error_message", "message", "failure_reason"]) ?? null;
        if (message) failureMessages.push(message);
      }
    }
    assets.push(...assetsFromJobNode(node, mediaType, index));
  }

  const status = reduceStatus(setStatus, jobStatuses, assets.length > 0);
  if (!status) {
    throw new ProviderError(
      "unexpected_response",
      "Could not determine the job status from the Higgsfield response. The API shape may have changed.",
      {
        providerId: "higgsfield",
        retryable: true,
        remediation: "Enable DEBUG_PROVIDER_LOGGING to inspect the redacted payload.",
      }
    );
  }

  const progress =
    firstNumber(jobSet, ["progress", "percent", "percentage", "completion"]) ??
    progressFromJobs(jobStatuses);

  const topLevelError = firstString(jobSet, ["error", "error_message", "failure_reason"]);
  const errorMessage = failureMessages[0] ?? topLevelError ?? null;

  return {
    status,
    progress: progress === null ? null : clampPercent(progress),
    statusMessage: describeStatus(status, assets.length, jobStatuses.length || nodes.length),
    assets,
    error:
      status === "failed"
        ? {
            code: "provider_job_failed",
            message: errorMessage ?? "Higgsfield reported the generation as failed without a reason.",
            retryable: true,
          }
        : null,
  };
}

function reduceStatus(
  setStatus: JobStatus | null,
  jobStatuses: readonly JobStatus[],
  hasAssets: boolean
): JobStatus | null {
  if (jobStatuses.length > 0) {
    if (jobStatuses.includes("failed")) return "failed";
    if (jobStatuses.includes("canceled") && !jobStatuses.includes("running")) return "canceled";
    if (jobStatuses.some((status) => status === "running" || status === "queued")) {
      return jobStatuses.every((status) => status === "queued") ? "queued" : "running";
    }
    if (jobStatuses.every((status) => status === "succeeded")) return "succeeded";
  }
  if (setStatus) {
    // Never report success with nothing to show — that reads as a silent loss.
    if (setStatus === "succeeded" && !hasAssets) return "running";
    return setStatus;
  }
  return null;
}

function progressFromJobs(statuses: readonly JobStatus[]): number | null {
  if (statuses.length === 0) return null;
  const done = statuses.filter((status) => status === "succeeded").length;
  return (done / statuses.length) * 100;
}

function clampPercent(value: number): number {
  // Some APIs report 0–1, others 0–100.
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/** Coarse progress for providers that report status but not a percentage. */
export function progressForStatus(status: JobStatus): number {
  switch (status) {
    case "queued":
      return 5;
    case "running":
      return 45;
    case "succeeded":
      return 100;
    case "failed":
    case "canceled":
      return 100;
  }
}

export function describeStatus(status: JobStatus, assetCount: number, jobCount: number): string {
  switch (status) {
    case "queued":
      return jobCount > 1 ? `Queued at Higgsfield (${jobCount} variations).` : "Queued at Higgsfield.";
    case "running":
      return "Rendering on Higgsfield…";
    case "succeeded":
      return assetCount === 1 ? "1 result ready." : `${assetCount} results ready.`;
    case "failed":
      return "Generation failed.";
    case "canceled":
      return "Generation canceled.";
  }
}
