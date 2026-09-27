import type { ReactNode } from "react";

import type {
  CostEstimate,
  ErrorEnvelope,
  GenerationJob,
  JobStatus,
  MediaAsset,
  ProviderCapability,
} from "../schemas/generation.js";

/** Presentational building blocks for the studio widget. No data fetching here. */

export function Pill({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "busy";
  pulse?: boolean;
  children: ReactNode;
}) {
  const toneClass = tone === "neutral" ? "" : ` aos-pill--${tone}`;
  return (
    <span className={`aos-pill${toneClass}`}>
      <span className={`aos-dot${pulse ? " aos-dot--pulse" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Banner({
  tone = "info",
  icon,
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger";
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  const toneClass = tone === "info" ? "" : ` aos-banner--${tone}`;
  return (
    <div className={`aos-banner${toneClass}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="aos-banner__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="aos-banner__body">
        <p className="aos-banner__title">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * The provider-not-configured state. This is a first-class screen, not an
 * afterthought: it names the exact environment variables the operator must set
 * and makes clear that nothing can be generated until they are.
 */
export function NotConfiguredBanner({ providers }: { providers: readonly ProviderCapability[] }) {
  const unconfigured = providers.filter((provider) => !provider.configured);
  return (
    <Banner tone="warn" icon="⚙" title="No generation provider is configured">
      <p className="aos-banner__text">
        This studio talks to real provider APIs and ships without credentials. Until a provider is
        configured on the server, nothing can be generated — there is no demo or sample mode.
      </p>
      <ul>
        {unconfigured.map((provider) => (
          <li key={provider.id}>
            <strong>{provider.label}</strong> — set{" "}
            {provider.missingEnv.map((name, index) => (
              <span key={name}>
                {index > 0 ? " and " : ""}
                <code>{name}</code>
              </span>
            ))}{" "}
            in the server environment, then restart.
            {provider.docsUrl ? (
              <>
                {" "}
                <a
                  className="aos-link"
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Provider docs ↗
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="aos-banner__text" style={{ marginTop: 8 }}>
        Credentials are read server-side only. They are never sent to this widget or to the model.
      </p>
    </Banner>
  );
}

export function ErrorBanner({
  error,
  message,
  onRetry,
}: {
  error?: ErrorEnvelope | null;
  message?: string | null;
  onRetry?: () => void;
}) {
  const text = error?.message ?? message;
  if (!text) return null;

  const title =
    error?.code === "budget_exceeded"
      ? "Refused before spending anything"
      : error?.code === "provider_not_configured"
        ? "Provider not configured"
        : error?.code === "invalid_request"
          ? "That combination is not available"
          : "Something went wrong";

  return (
    <Banner tone="danger" icon="⚠" title={title}>
      <p className="aos-banner__text">{text}</p>
      {error?.remediation ? (
        <p className="aos-banner__text" style={{ marginTop: 6 }}>
          {error.remediation}
        </p>
      ) : null}
      {error?.missingEnv?.length ? (
        <p className="aos-banner__text" style={{ marginTop: 6 }}>
          Missing:{" "}
          {error.missingEnv.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : ""}
              <code>{name}</code>
            </span>
          ))}
        </p>
      ) : null}
      {onRetry && (error?.retryable ?? false) ? (
        <button type="button" className="aos-btn aos-btn--sm" style={{ marginTop: 10 }} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </Banner>
  );
}

export function EstimateBar({
  estimate,
  pending,
  withinLimit,
  limit,
}: {
  estimate: CostEstimate | null;
  pending: boolean;
  withinLimit: boolean;
  limit: number;
}) {
  return (
    <div className="aos-estimate">
      <div className="aos-estimate__figure">
        <span className="aos-estimate__value">
          {pending ? "…" : estimate ? formatCredits(estimate.credits) : "—"}
        </span>
        <span className="aos-estimate__unit">credits est.</span>
      </div>

      {estimate?.approxUsd != null ? (
        <span className="aos-faint">≈ ${estimate.approxUsd.toFixed(2)}</span>
      ) : null}

      {estimate ? <span className="aos-faint">ETA ~{formatDuration(estimate.etaSeconds)}</span> : null}

      {estimate && !withinLimit ? (
        <Pill tone="warn">Over the {formatCredits(limit)}-credit server limit</Pill>
      ) : null}

      <span className="aos-spacer" />

      {estimate?.breakdown.length ? (
        <ul className="aos-breakdown">
          {estimate.breakdown
            .filter((line) => line.credits > 0)
            .map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span>{formatCredits(line.credits)}</span>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

export function JobProgress({ job }: { job: GenerationJob }) {
  const active = job.status === "queued" || job.status === "running";
  return (
    <div className="aos-grid" style={{ gap: 9 }}>
      <div className="aos-row aos-row--wrap">
        <StatusPill status={job.status} />
        <span className="aos-muted" style={{ fontSize: 12.5 }}>
          {job.statusMessage}
        </span>
        <span className="aos-spacer" />
        <span className="aos-faint">{job.progress}%</span>
      </div>
      <div
        className={`aos-progress${active && job.progress <= 5 ? " aos-progress--indeterminate" : ""}`}
        role="progressbar"
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Generation progress"
      >
        <div className="aos-progress__fill" style={{ width: `${Math.max(job.progress, 2)}%` }} />
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: JobStatus }) {
  switch (status) {
    case "queued":
      return (
        <Pill tone="busy" pulse>
          Queued
        </Pill>
      );
    case "running":
      return (
        <Pill tone="busy" pulse>
          Rendering
        </Pill>
      );
    case "succeeded":
      return <Pill tone="ok">Complete</Pill>;
    case "failed":
      return <Pill tone="warn">Failed</Pill>;
    case "canceled":
      return <Pill>Canceled</Pill>;
  }
}

export function ResultCard({ asset, index }: { asset: MediaAsset; index: number }) {
  const label = `${asset.kind === "video" ? "Video" : "Image"} ${index + 1}`;
  return (
    <figure className="aos-result" style={{ margin: 0 }}>
      {asset.kind === "video" ? (
        <video
          className="aos-result__media"
          src={asset.url}
          {...(asset.thumbnailUrl ? { poster: asset.thumbnailUrl } : {})}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
        />
      ) : (
        <img
          className="aos-result__media"
          src={asset.thumbnailUrl ?? asset.url}
          alt={label}
          loading="lazy"
        />
      )}
      <figcaption className="aos-result__bar">
        <span>
          {label}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
          {asset.durationSeconds ? ` · ${asset.durationSeconds}s` : ""}
        </span>
        <span className="aos-spacer" />
        <a
          className="aos-btn aos-btn--ghost aos-btn--icon"
          href={asset.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open ↗
        </a>
        {/* `download` is advisory for cross-origin URLs; the new tab is the fallback. */}
        <a
          className="aos-btn aos-btn--ghost aos-btn--icon"
          href={asset.url}
          download
          target="_blank"
          rel="noreferrer noopener"
        >
          ↓
          <span className="aos-sr">Download {label}</span>
        </a>
      </figcaption>
    </figure>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="aos-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="aos-faint" style={{ margin: "5px 0 0" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
