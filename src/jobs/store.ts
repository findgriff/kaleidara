import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config/env.js";
import type { GenerationJob } from "../schemas/generation.js";
import { isTerminal } from "../schemas/generation.js";

/**
 * In-memory registry of jobs this server has submitted.
 *
 * The provider owns the authoritative job state; this store exists so the
 * studio can (a) hand the widget one stable `jobId` that survives polling,
 * (b) remember the original request for display, and (c) know which provider
 * and media type a job belongs to.
 *
 * It is deliberately process-local and bounded. A multi-instance deployment
 * should back this with a shared store — see "Deployment" in the README — but
 * nothing here is on the critical path for correctness of billing, because the
 * provider job id is what actually identifies spend.
 */
export class JobStore {
  private readonly jobs = new Map<string, GenerationJob>();
  private readonly retentionMs: number;
  private readonly maxJobs: number;

  constructor(config: Pick<AppConfig, "JOB_RETENTION_MS" | "MAX_TRACKED_JOBS">) {
    this.retentionMs = config.JOB_RETENTION_MS;
    this.maxJobs = config.MAX_TRACKED_JOBS;
  }

  static newJobId(): string {
    return `job_${randomUUID().replaceAll("-", "")}`;
  }

  get size(): number {
    return this.jobs.size;
  }

  put(job: GenerationJob): GenerationJob {
    this.jobs.set(job.jobId, job);
    this.evict();
    return job;
  }

  get(jobId: string): GenerationJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (this.isExpired(job)) {
      this.jobs.delete(jobId);
      return undefined;
    }
    return job;
  }

  /** Applies a patch and refreshes `updatedAt`/`completedAt` consistently. */
  update(jobId: string, patch: Partial<GenerationJob>): GenerationJob | undefined {
    const existing = this.get(jobId);
    if (!existing) return undefined;

    const next: GenerationJob = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    const reachedTerminal = isTerminal(next.status);
    next.completedAt = reachedTerminal ? (next.completedAt ?? next.updatedAt) : null;
    next.cancelable = !reachedTerminal;

    this.jobs.set(jobId, next);
    return next;
  }

  /** Most recently updated first. Used by the widget's session history. */
  recent(limit = 10): readonly GenerationJob[] {
    return [...this.jobs.values()]
      .filter((job) => !this.isExpired(job))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  private isExpired(job: GenerationJob): boolean {
    return Date.now() - Date.parse(job.updatedAt) > this.retentionMs;
  }

  /** Drops expired entries, then the oldest entries above the size cap. */
  private evict(): void {
    for (const [jobId, job] of this.jobs) {
      if (this.isExpired(job)) this.jobs.delete(jobId);
    }
    if (this.jobs.size <= this.maxJobs) return;

    const byAge = [...this.jobs.entries()].sort((a, b) =>
      a[1].updatedAt.localeCompare(b[1].updatedAt)
    );
    for (const [jobId] of byAge.slice(0, this.jobs.size - this.maxJobs)) {
      this.jobs.delete(jobId);
    }
  }
}
