/**
 * Error taxonomy shared by every provider adapter.
 *
 * The `code` is what the widget branches on, so it is part of the public
 * contract of the MCP tools. Messages are surfaced to the user verbatim and
 * must therefore never contain credential material — see `redactSecrets`.
 */
export type ProviderErrorCode =
  | "provider_not_configured"
  | "provider_unknown"
  | "model_unknown"
  | "invalid_request"
  | "budget_exceeded"
  | "rate_limited"
  | "provider_unauthorized"
  | "provider_unavailable"
  | "job_not_found"
  | "not_cancelable"
  | "timeout"
  | "unexpected_response";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly providerId: string | undefined;
  readonly retryable: boolean;
  readonly status: number | undefined;
  /** Operator-facing hint, e.g. which environment variable to set. */
  readonly remediation: string | undefined;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: {
      providerId?: string;
      retryable?: boolean;
      status?: number;
      remediation?: string;
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.providerId = options.providerId;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.remediation = options.remediation;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      retryable: this.retryable,
      remediation: this.remediation,
    };
  }
}

/**
 * Thrown when an adapter has no usable credentials. This is a first-class,
 * expected state: the studio ships without keys and must say so plainly
 * instead of pretending to generate anything.
 */
export class ProviderNotConfiguredError extends ProviderError {
  readonly missingEnv: readonly string[];

  constructor(providerId: string, missingEnv: readonly string[], displayName = providerId) {
    super(
      "provider_not_configured",
      `${displayName} is not configured on this server. Missing environment ${
        missingEnv.length === 1 ? "variable" : "variables"
      }: ${missingEnv.join(", ")}.`,
      {
        providerId,
        remediation: `Set ${missingEnv.join(" and ")} in the server environment and restart. Credentials stay server-side and are never sent to the widget.`,
      }
    );
    this.name = "ProviderNotConfiguredError";
    this.missingEnv = missingEnv;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
