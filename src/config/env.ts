import { z } from "zod";

/**
 * Validated server configuration.
 *
 * Every value is read from `process.env` exactly once, at startup, and the
 * resulting object is the only way the rest of the server reads configuration.
 * Provider credentials live here and are never placed in a tool result,
 * `structuredContent`, or `_meta` payload.
 */

const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0", "yes", "no"])])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return value === "true" || value === "1" || value === "yes";
  });

const positiveIntFromString = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const nonEmpty = z.string().trim().min(1);

/**
 * Credentials are `.optional()` rather than required: the server must boot and
 * serve `list_capabilities` so the widget can render an actionable
 * "provider not configured" state instead of crash-looping.
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: positiveIntFromString(8000),
    HOST: nonEmpty.default("0.0.0.0"),

    /** Comma-separated allowlist of Origins permitted to call the MCP endpoint. */
    ALLOWED_ORIGINS: z.string().trim().default("*"),

    /** Public base URL of this server; used for absolute widget/resource URLs. */
    PUBLIC_BASE_URL: z.string().url().optional(),

    /* ----------------------------------------------------- Higgsfield provider */
    HF_API_KEY_ID: nonEmpty.optional(),
    HF_API_KEY_SECRET: nonEmpty.optional(),
    HF_API_BASE_URL: z.string().url().default("https://platform.higgsfield.ai"),
    /**
     * Path templates for the async job lifecycle. Exposed as configuration so a
     * deployment can be corrected against the current published API without a
     * code change. `{jobSetId}` is substituted verbatim.
     */
    HF_JOB_STATUS_PATH: nonEmpty.default("/v1/job-sets/{jobSetId}"),
    HF_JOB_CANCEL_PATH: nonEmpty.default("/v1/job-sets/{jobSetId}/cancel"),
    /**
     * JSON object mapping catalog model id -> submit path, overriding the
     * defaults baked into the model catalog.
     * Example: {"soul":"/v1/text2image/soul"}
     */
    HF_MODEL_PATH_OVERRIDES: z
      .string()
      .trim()
      .optional()
      .transform((raw, ctx) => {
        if (!raw) return {} as Record<string, string>;
        try {
          const parsed: unknown = JSON.parse(raw);
          return z.record(z.string(), nonEmpty).parse(parsed);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "HF_MODEL_PATH_OVERRIDES must be a JSON object of {modelId: path}.",
          });
          return {} as Record<string, string>;
        }
      }),

    /* ------------------------------------------------------------- guard rails */
    /** Hard ceiling on the estimated credits of any single generation. */
    MAX_CREDITS_PER_GENERATION: z.coerce.number().positive().default(200),
    /** Optional credits -> USD rate, purely for display. 0 disables it. */
    CREDIT_USD_RATE: z.coerce.number().nonnegative().default(0),
    /** Upper bound on a single upstream HTTP request. */
    PROVIDER_TIMEOUT_MS: positiveIntFromString(30_000),
    /** Jobs older than this are evicted from the in-memory store. */
    JOB_RETENTION_MS: positiveIntFromString(6 * 60 * 60 * 1000),
    MAX_TRACKED_JOBS: positiveIntFromString(500),
    /** Log redacted upstream request/response metadata. Never logs credentials. */
    DEBUG_PROVIDER_LOGGING: booleanish.default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A half-configured credential pair is almost always a deploy mistake and
    // would otherwise surface as an opaque 401 from the provider.
    const hasId = Boolean(value.HF_API_KEY_ID);
    const hasSecret = Boolean(value.HF_API_KEY_SECRET);
    if (hasId !== hasSecret) {
      ctx.addIssue({
        code: "custom",
        path: [hasId ? "HF_API_KEY_SECRET" : "HF_API_KEY_ID"],
        message:
          "HF_API_KEY_ID and HF_API_KEY_SECRET must be set together. Set both, or neither to run the studio in unconfigured mode.",
      });
    }
    for (const [key, path] of Object.entries(value.HF_MODEL_PATH_OVERRIDES)) {
      if (!path.startsWith("/")) {
        ctx.addIssue({
          code: "custom",
          path: ["HF_MODEL_PATH_OVERRIDES", key],
          message: `Path override for "${key}" must start with "/".`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

/**
 * Parses configuration from a raw environment. Keys present but empty are
 * treated as absent, which is what container platforms produce for an unset
 * secret reference.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const picked: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const raw = source[key];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    picked[key] = trimmed;
  }

  const result = EnvSchema.safeParse(picked);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

/**
 * The exhaustive list of variables the server reads. Declared explicitly so an
 * unrelated variable in the ambient environment can never satisfy the `.strict()`
 * schema or shadow a real setting.
 */
export const ENV_KEYS = [
  "NODE_ENV",
  "PORT",
  "HOST",
  "ALLOWED_ORIGINS",
  "PUBLIC_BASE_URL",
  "HF_API_KEY_ID",
  "HF_API_KEY_SECRET",
  "HF_API_BASE_URL",
  "HF_JOB_STATUS_PATH",
  "HF_JOB_CANCEL_PATH",
  "HF_MODEL_PATH_OVERRIDES",
  "MAX_CREDITS_PER_GENERATION",
  "CREDIT_USD_RATE",
  "PROVIDER_TIMEOUT_MS",
  "JOB_RETENTION_MS",
  "MAX_TRACKED_JOBS",
  "DEBUG_PROVIDER_LOGGING",
] as const;

export function parseAllowedOrigins(value: string): "*" | string[] {
  const trimmed = value.trim();
  if (trimmed === "*" || trimmed === "") return "*";
  return trimmed
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

let cached: AppConfig | null = null;

/** Process-wide configuration singleton. */
export function getConfig(): AppConfig {
  cached ??= parseEnv();
  return cached;
}

/** Test seam — forces the next `getConfig()` to re-read the environment. */
export function resetConfigCache(): void {
  cached = null;
}
