import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AspectRatio,
  GenerationJob,
  MediaType,
  ModelCapability,
  ProviderCapability,
  Resolution,
} from "../schemas/generation.js";
import type { StudioPayload, WidgetState } from "../schemas/widget.js";
import {
  Banner,
  ErrorBanner,
  EstimateBar,
  Field,
  JobProgress,
  NotConfiguredBanner,
  Pill,
  ResultCard,
  StatusPill,
  formatCredits,
} from "./components.js";
import { callTool, getHost, isHostAvailable, persistWidgetState, subscribeToGlobals } from "./openai.js";

/**
 * OpsPocket Creative Studio widget.
 *
 * Data flow: the host seeds `toolOutput` with a `StudioPayload` whenever a tool
 * runs in the conversation; from then on the widget drives itself by calling
 * the same tools through `window.openai.callTool`. Every response is another
 * full payload, so there is exactly one way state arrives and no divergence
 * between "rendered from chat" and "rendered from a widget action".
 *
 * The widget never holds credentials — it only learns *whether* a provider is
 * configured, and which env vars are missing if not.
 */

const POLL_INTERVAL_MS = 2500;
const ACTIVE_STATUSES = new Set(["queued", "running"]);

interface FormState {
  prompt: string;
  negativePrompt: string;
  mediaType: MediaType;
  providerId: string;
  modelId: string;
  aspectRatio: string;
  resolution: string;
  durationSeconds: number | null;
  quantity: number;
  referenceUrls: string[];
  seed: string;
}

export default function App() {
  const [payload, setPayload] = useState<StudioPayload | null>(() => readToolOutput());
  const [job, setJob] = useState<GenerationJob | null>(() => readToolOutput()?.job ?? null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState<null | "estimate" | "generate" | "cancel" | "capabilities">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hostAvailable = isHostAvailable();

  /* ------------------------------------------------- host-driven state updates */

  useEffect(
    () =>
      subscribeToGlobals(() => {
        const next = readToolOutput();
        if (!next) return;
        setPayload(next);
        if (next.job) setJob(next.job);
      }),
    []
  );

  /** Without a seeded payload (e.g. widget opened first), fetch capabilities. */
  const loadCapabilities = useCallback(async () => {
    setBusy("capabilities");
    const outcome = await callTool<StudioPayload>("list_capabilities", {});
    setBusy(null);
    if (outcome.data) setPayload(outcome.data);
    else setNotice(outcome.message);
  }, []);

  useEffect(() => {
    if (!payload && hostAvailable) void loadCapabilities();
  }, [payload, hostAvailable, loadCapabilities]);

  /* ------------------------------------------------------------- form defaults */

  const capabilities = payload?.capabilities ?? null;

  useEffect(() => {
    if (!capabilities || form) return;
    setForm(buildInitialForm(capabilities, readWidgetState(), job));
  }, [capabilities, form, job]);

  const provider: ProviderCapability | null = useMemo(() => {
    if (!capabilities || !form) return null;
    return (
      capabilities.providers.find((candidate) => candidate.id === form.providerId) ??
      capabilities.providers[0] ??
      null
    );
  }, [capabilities, form]);

  const modelsForType = useMemo(
    () => (provider ? provider.models.filter((model) => model.mediaType === form?.mediaType) : []),
    [provider, form?.mediaType]
  );

  const model: ModelCapability | null = useMemo(
    () => modelsForType.find((candidate) => candidate.id === form?.modelId) ?? modelsForType[0] ?? null,
    [modelsForType, form?.modelId]
  );

  /* ----------------------------------------------------------------- estimate */

  const estimate = payload?.estimate ?? null;
  const estimateKey = form && model ? serializeForEstimate(form, model.id) : null;
  const lastEstimateKey = useRef<string | null>(null);

  /**
   * Re-prices the request whenever the parameters change. Estimation is a pure
   * server-side calculation with no provider call, so it is safe to run on
   * every edit and lets the user see the cost before committing to it.
   */
  useEffect(() => {
    if (!form || !model || !hostAvailable || !estimateKey) return;
    if (form.prompt.trim().length < 3) return;
    if (estimateKey === lastEstimateKey.current) return;

    const timer = setTimeout(async () => {
      lastEstimateKey.current = estimateKey;
      setBusy((current) => (current === null ? "estimate" : current));
      const outcome = await callTool<StudioPayload>("estimate_generation", toEstimateArgs(form, model));
      setBusy((current) => (current === "estimate" ? null : current));
      if (outcome.data) setPayload(outcome.data);
    }, 450);

    return () => clearTimeout(timer);
  }, [estimateKey, form, model, hostAvailable]);

  /* ------------------------------------------------------------------ actions */

  const runGenerate = useCallback(async () => {
    if (!form || !model) return;
    setNotice(null);
    setBusy("generate");
    const outcome = await callTool<StudioPayload>("generate_media", toGenerateArgs(form, model));
    setBusy(null);

    if (outcome.data) {
      setPayload(outcome.data);
      if (outcome.data.job) setJob(outcome.data.job);
    }
    if (!outcome.ok && !outcome.data) setNotice(outcome.message);
  }, [form, model]);

  const runCancel = useCallback(async () => {
    if (!job) return;
    setBusy("cancel");
    const outcome = await callTool<StudioPayload>("cancel_generation", { jobId: job.jobId });
    setBusy(null);
    if (outcome.data) {
      setPayload(outcome.data);
      if (outcome.data.job) setJob(outcome.data.job);
    } else {
      setNotice(outcome.message);
    }
  }, [job]);

  const refreshJob = useCallback(
    async (jobId: string) => {
      const outcome = await callTool<StudioPayload>("get_generation_status", { jobId });
      if (outcome.data) {
        setPayload(outcome.data);
        if (outcome.data.job) setJob(outcome.data.job);
      }
    },
    []
  );

  /** Polls an in-flight job until it reaches a terminal state. */
  useEffect(() => {
    if (!job || !hostAvailable || !ACTIVE_STATUSES.has(job.status)) return;
    const timer = setInterval(() => void refreshJob(job.jobId), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [job?.jobId, job?.status, hostAvailable, refreshJob, job]);

  /* --------------------------------------------------------- persisted state */

  useEffect(() => {
    if (!form) return;
    const state: WidgetState = {
      prompt: form.prompt,
      negativePrompt: form.negativePrompt,
      mediaType: form.mediaType,
      providerId: form.providerId,
      modelId: form.modelId,
      aspectRatio: form.aspectRatio,
      resolution: form.resolution,
      durationSeconds: form.durationSeconds ?? undefined,
      quantity: form.quantity,
      referenceUrls: form.referenceUrls.filter(Boolean),
      ...(job ? { lastJobId: job.jobId } : {}),
    };
    persistWidgetState(state);
  }, [form, job]);

  /* ------------------------------------------------------------------- render */

  if (!hostAvailable) {
    return (
      <div className="aos-studio">
        <Header />
        <Banner tone="warn" icon="🔌" title="Not connected to ChatGPT">
          <p className="aos-banner__text">
            This is the OpsPocket Creative Studio widget shell. It needs the ChatGPT Apps SDK host
            bridge to call tools. Connect the MCP server in ChatGPT developer mode and open the
            studio from a conversation.
          </p>
        </Banner>
      </div>
    );
  }

  if (!capabilities || !form) {
    return (
      <div className="aos-studio">
        <Header />
        <div className="aos-card aos-row">
          <Pill tone="busy" pulse>
            Loading studio capabilities…
          </Pill>
        </div>
        <ErrorBanner message={notice} onRetry={() => void loadCapabilities()} />
      </div>
    );
  }

  const configured = provider?.configured ?? false;
  const canGenerate =
    configured &&
    form.prompt.trim().length >= 3 &&
    !busy &&
    (estimate?.withinServerLimit ?? true) &&
    (!model || form.referenceUrls.filter(Boolean).length <= model.maxReferenceUrls);

  const update = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="aos-studio">
      <Header provider={provider} />

      {!capabilities.anyProviderConfigured ? (
        <NotConfiguredBanner providers={capabilities.providers} />
      ) : null}

      <ErrorBanner error={payload?.error ?? null} message={notice} />

      {/* ------------------------------------------------------------ composer */}
      <section className="aos-card aos-grid" style={{ gap: 14 }} aria-label="Generation setup">
        <Field label="Prompt" htmlFor="aos-prompt">
          <textarea
            id="aos-prompt"
            className="aos-textarea"
            placeholder="A rain-slick neon alleyway at dusk, anamorphic lens, volumetric haze, slow push-in…"
            value={form.prompt}
            maxLength={2000}
            disabled={!configured}
            onChange={(event) => update({ prompt: event.target.value })}
          />
        </Field>

        <div className="aos-row aos-row--wrap">
          <div className="aos-seg" role="group" aria-label="Media type">
            {(["image", "video"] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={form.mediaType === type}
                disabled={!configured}
                onClick={() => {
                  const next = provider?.models.find((candidate) => candidate.mediaType === type);
                  update({
                    mediaType: type,
                    modelId: next?.id ?? "",
                    aspectRatio: next?.aspectRatios[0] ?? form.aspectRatio,
                    resolution: next?.resolutions[0] ?? form.resolution,
                    durationSeconds: type === "video" ? (next?.durationsSeconds[0] ?? 5) : null,
                    quantity: Math.min(form.quantity, next?.maxQuantity ?? 1),
                  });
                }}
              >
                {type === "image" ? "Image" : "Video"}
              </button>
            ))}
          </div>

          <span className="aos-spacer" />

          {model ? (
            <span className="aos-faint">
              max {model.maxQuantity} per run · {model.maxReferenceUrls} reference slot
              {model.maxReferenceUrls === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div className="aos-fields">
          <Field label="Provider" htmlFor="aos-provider">
            <select
              id="aos-provider"
              className="aos-select"
              value={form.providerId}
              disabled={capabilities.providers.length < 2}
              onChange={(event) => update({ providerId: event.target.value, modelId: "" })}
            >
              {capabilities.providers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                  {candidate.configured ? "" : " (not configured)"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Model" htmlFor="aos-model" hint={model?.description}>
            <select
              id="aos-model"
              className="aos-select"
              value={model?.id ?? ""}
              disabled={!configured}
              onChange={(event) => {
                const next = modelsForType.find((candidate) => candidate.id === event.target.value);
                update({
                  modelId: event.target.value,
                  ...(next
                    ? {
                        aspectRatio: next.aspectRatios.includes(form.aspectRatio as AspectRatio)
                          ? form.aspectRatio
                          : (next.aspectRatios[0] as string),
                        resolution: next.resolutions.includes(form.resolution as Resolution)
                          ? form.resolution
                          : (next.resolutions[0] as string),
                        durationSeconds:
                          next.mediaType === "video"
                            ? (next.durationsSeconds[0] ?? 5)
                            : null,
                        quantity: Math.min(form.quantity, next.maxQuantity),
                      }
                    : {}),
                });
              }}
            >
              {modelsForType.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Resolution" htmlFor="aos-resolution">
            <select
              id="aos-resolution"
              className="aos-select"
              value={form.resolution}
              disabled={!configured || !model}
              onChange={(event) => update({ resolution: event.target.value })}
            >
              {(model?.resolutions ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          {form.mediaType === "video" ? (
            <Field label="Duration" htmlFor="aos-duration">
              <select
                id="aos-duration"
                className="aos-select"
                value={form.durationSeconds ?? ""}
                disabled={!configured || !model}
                onChange={(event) => update({ durationSeconds: Number(event.target.value) })}
              >
                {(model?.durationsSeconds ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}s
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Variations" htmlFor="aos-quantity">
            <select
              id="aos-quantity"
              className="aos-select"
              value={form.quantity}
              disabled={!configured || !model}
              onChange={(event) => update({ quantity: Number(event.target.value) })}
            >
              {Array.from({ length: model?.maxQuantity ?? 1 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>

          {model?.supportsSeed ? (
            <Field label="Seed" htmlFor="aos-seed" hint="Blank for random">
              <input
                id="aos-seed"
                className="aos-input"
                inputMode="numeric"
                placeholder="random"
                value={form.seed}
                disabled={!configured}
                onChange={(event) => update({ seed: event.target.value.replace(/[^0-9]/g, "") })}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Aspect ratio">
          <div className="aos-row aos-row--wrap" role="group" aria-label="Aspect ratio">
            {(model?.aspectRatios ?? []).map((value) => (
              <button
                key={value}
                type="button"
                className="aos-chip"
                aria-pressed={form.aspectRatio === value}
                disabled={!configured}
                onClick={() => update({ aspectRatio: value })}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>

        {model?.supportsNegativePrompt ? (
          <Field label="Avoid (negative prompt)" htmlFor="aos-negative">
            <input
              id="aos-negative"
              className="aos-input"
              placeholder="blurry, text artifacts, extra limbs"
              value={form.negativePrompt}
              maxLength={1000}
              disabled={!configured}
              onChange={(event) => update({ negativePrompt: event.target.value })}
            />
          </Field>
        ) : null}

        {model && model.maxReferenceUrls > 0 ? (
          <Field
            label={`Reference URLs (optional, up to ${model.maxReferenceUrls})`}
            hint="Public https image URLs. These are forwarded to the provider and must be reachable by it."
          >
            <div className="aos-refs">
              {form.referenceUrls.map((url, index) => (
                <div className="aos-ref" key={`ref-${index}`}>
                  <input
                    className="aos-input"
                    type="url"
                    placeholder="https://example.com/reference.jpg"
                    value={url}
                    disabled={!configured}
                    aria-label={`Reference URL ${index + 1}`}
                    onChange={(event) =>
                      update({
                        referenceUrls: form.referenceUrls.map((existing, i) =>
                          i === index ? event.target.value : existing
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="aos-btn aos-btn--ghost aos-btn--icon"
                    disabled={!configured}
                    onClick={() =>
                      update({ referenceUrls: form.referenceUrls.filter((_, i) => i !== index) })
                    }
                  >
                    ✕<span className="aos-sr">Remove reference URL {index + 1}</span>
                  </button>
                </div>
              ))}
              {form.referenceUrls.length < model.maxReferenceUrls ? (
                <button
                  type="button"
                  className="aos-btn aos-btn--ghost aos-btn--sm"
                  style={{ justifySelf: "start" }}
                  disabled={!configured}
                  onClick={() => update({ referenceUrls: [...form.referenceUrls, ""] })}
                >
                  + Add reference URL
                </button>
              ) : null}
            </div>
          </Field>
        ) : null}

        <hr className="aos-divider" />

        <EstimateBar
          estimate={estimate?.estimate ?? null}
          pending={busy === "estimate"}
          withinLimit={estimate?.withinServerLimit ?? true}
          limit={capabilities.maxCreditsPerGeneration}
        />

        <div className="aos-row aos-row--wrap">
          <button
            type="button"
            className="aos-btn aos-btn--primary"
            disabled={!canGenerate}
            onClick={() => void runGenerate()}
          >
            {busy === "generate" ? "Submitting…" : form.mediaType === "video" ? "Generate video" : "Generate image"}
          </button>
          {job && ACTIVE_STATUSES.has(job.status) ? (
            <button
              type="button"
              className="aos-btn aos-btn--danger"
              disabled={busy === "cancel"}
              onClick={() => void runCancel()}
            >
              {busy === "cancel" ? "Canceling…" : "Cancel run"}
            </button>
          ) : null}
          <span className="aos-spacer" />
          <span className="aos-faint" style={{ maxWidth: 420, textAlign: "right" }}>
            {capabilities.billingWarning}
          </span>
        </div>
      </section>

      {/* ----------------------------------------------------------------- job */}
      {job ? <JobPanel job={job} onRefresh={() => void refreshJob(job.jobId)} /> : null}

      {/* ------------------------------------------------------------- history */}
      {payload?.recentJobs?.length && payload.recentJobs.length > 1 ? (
        <section className="aos-card aos-grid" style={{ gap: 10 }} aria-label="Recent runs">
          <span className="aos-label" style={{ marginBottom: 0 }}>
            This session
          </span>
          <div className="aos-history">
            {payload.recentJobs
              .filter((entry) => entry.jobId !== job?.jobId)
              .slice(0, 5)
              .map((entry) => (
                <button
                  key={entry.jobId}
                  type="button"
                  className="aos-history__item"
                  onClick={() => void refreshJob(entry.jobId)}
                >
                  <StatusPill status={entry.status} />
                  <span className="aos-history__prompt">{entry.prompt}</span>
                  <span className="aos-faint">{entry.modelLabel}</span>
                </button>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Header({ provider }: { provider?: ProviderCapability | null }) {
  return (
    <header className="aos-header">
      <div className="aos-brand">
        <span className="aos-mark" aria-hidden="true">
          AOS
        </span>
        <div>
          <h1 className="aos-title">Kaleidara</h1>
          <p className="aos-subtitle">Generative image and video, wired to real provider APIs</p>
        </div>
      </div>
      <span className="aos-spacer" />
      {provider ? (
        <Pill tone={provider.configured ? "ok" : "warn"}>
          {provider.label} · {provider.configured ? "connected" : "not configured"}
        </Pill>
      ) : null}
    </header>
  );
}

function JobPanel({ job, onRefresh }: { job: GenerationJob; onRefresh: () => void }) {
  const active = ACTIVE_STATUSES.has(job.status);
  return (
    <section className="aos-card aos-grid" style={{ gap: 14 }} aria-label="Generation run">
      <div className="aos-row aos-row--wrap">
        <span className="aos-label" style={{ marginBottom: 0 }}>
          Run
        </span>
        <span className="aos-mono aos-muted">{job.jobId}</span>
        <span className="aos-spacer" />
        <span className="aos-faint">
          {job.modelLabel} · {job.request.resolution ?? "—"}
          {job.request.aspectRatio ? ` · ${job.request.aspectRatio}` : ""}
          {job.request.durationSeconds ? ` · ${job.request.durationSeconds}s` : ""}
          {job.request.quantity > 1 ? ` · ×${job.request.quantity}` : ""}
          {` · est. ${formatCredits(job.estimate.credits)} credits`}
        </span>
        {!active ? (
          <button type="button" className="aos-btn aos-btn--ghost aos-btn--sm" onClick={onRefresh}>
            Refresh
          </button>
        ) : null}
      </div>

      <JobProgress job={job} />

      {job.error ? (
        <Banner tone="danger" icon="⚠" title="The provider could not complete this run">
          <p className="aos-banner__text">{job.error.message}</p>
          {job.error.retryable ? (
            <p className="aos-banner__text" style={{ marginTop: 6 }}>
              This is usually transient — adjusting the prompt or retrying often clears it. A failed
              run may still have consumed provider credits.
            </p>
          ) : null}
        </Banner>
      ) : null}

      {job.assets.length > 0 ? (
        <div className="aos-results">
          {job.assets.map((asset, index) => (
            <ResultCard key={asset.id || asset.url} asset={asset} index={index} />
          ))}
        </div>
      ) : job.status === "succeeded" ? (
        <p className="aos-faint" style={{ margin: 0 }}>
          The provider reported success but returned no downloadable media.
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------- helpers */

function readToolOutput(): StudioPayload | null {
  const output = getHost()?.toolOutput;
  if (!output || typeof output !== "object") return null;
  // Trust but verify the discriminator: the host may seed an unrelated payload.
  return "capabilities" in output ? (output as StudioPayload) : null;
}

function readWidgetState(): WidgetState {
  const state = getHost()?.widgetState;
  return state && typeof state === "object" ? (state as WidgetState) : {};
}

function buildInitialForm(
  capabilities: NonNullable<StudioPayload["capabilities"]>,
  saved: WidgetState,
  job: GenerationJob | null
): FormState {
  const providerId =
    saved.providerId && capabilities.providers.some((p) => p.id === saved.providerId)
      ? saved.providerId
      : (capabilities.defaultProviderId ?? capabilities.providers[0]?.id ?? "");

  const provider = capabilities.providers.find((candidate) => candidate.id === providerId);
  const mediaType: MediaType = saved.mediaType ?? job?.mediaType ?? "image";
  const models = (provider?.models ?? []).filter((candidate) => candidate.mediaType === mediaType);
  const model =
    models.find((candidate) => candidate.id === (saved.modelId ?? job?.modelId)) ??
    models.find((candidate) => candidate.isDefault) ??
    models[0];

  return {
    prompt: saved.prompt ?? job?.prompt ?? "",
    negativePrompt: saved.negativePrompt ?? "",
    mediaType,
    providerId,
    modelId: model?.id ?? "",
    aspectRatio: pick(saved.aspectRatio, model?.aspectRatios) ?? model?.aspectRatios[0] ?? "1:1",
    resolution: pick(saved.resolution, model?.resolutions) ?? model?.resolutions[0] ?? "1080p",
    durationSeconds:
      mediaType === "video"
        ? (pickNumber(saved.durationSeconds, model?.durationsSeconds) ??
          model?.durationsSeconds[0] ??
          5)
        : null,
    quantity: Math.min(Math.max(saved.quantity ?? 1, 1), model?.maxQuantity ?? 1),
    referenceUrls: (saved.referenceUrls ?? []).slice(0, model?.maxReferenceUrls ?? 0),
    seed: "",
  };
}

function pick(value: string | undefined, allowed: readonly string[] | undefined): string | undefined {
  return value && allowed?.includes(value) ? value : undefined;
}

function pickNumber(
  value: number | undefined,
  allowed: readonly number[] | undefined
): number | undefined {
  return value !== undefined && allowed?.includes(value) ? value : undefined;
}

/** Only the fields that change the price, so estimates are not re-fetched on noise. */
function serializeForEstimate(form: FormState, modelId: string): string {
  return [
    form.providerId,
    modelId,
    form.mediaType,
    form.resolution,
    form.aspectRatio,
    form.durationSeconds ?? "",
    form.quantity,
    form.referenceUrls.filter(Boolean).length,
    form.prompt.trim().length >= 3 ? "ok" : "short",
  ].join("|");
}

function toEstimateArgs(form: FormState, model: ModelCapability): Record<string, unknown> {
  const references = form.referenceUrls.map((url) => url.trim()).filter(Boolean);
  const seed = form.seed.trim();

  return {
    prompt: form.prompt.trim(),
    mediaType: form.mediaType,
    providerId: form.providerId,
    modelId: model.id,
    aspectRatio: form.aspectRatio,
    resolution: form.resolution,
    quantity: form.quantity,
    ...(form.mediaType === "video" && form.durationSeconds
      ? { durationSeconds: form.durationSeconds }
      : {}),
    ...(references.length > 0 ? { referenceUrls: references } : {}),
    ...(form.negativePrompt.trim() && model.supportsNegativePrompt
      ? { negativePrompt: form.negativePrompt.trim() }
      : {}),
    ...(seed && model.supportsSeed ? { seed: Number(seed) } : {}),
  };
}

function toGenerateArgs(form: FormState, model: ModelCapability): Record<string, unknown> {
  return toEstimateArgs(form, model);
}
