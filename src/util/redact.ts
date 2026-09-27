/**
 * Secret hygiene helpers.
 *
 * Everything that can reach the model, the widget, or the log stream passes
 * through `redactSecrets` first. Upstream providers sometimes echo request
 * headers back inside error bodies, so scrubbing at the boundary is the only
 * reliable defence.
 */

import { createHash } from "node:crypto";

const MIN_SECRET_LENGTH = 8;

export const REDACTION_PLACEHOLDER = "[redacted]";

/** Header and field names whose values must never be serialised. */
export const SENSITIVE_KEY_PATTERN =
  /(authorization|api[-_]?key|secret|token|password|credential|cookie|bearer|hf[-_]?key)/i;

function collectSecretValues(): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    if (SENSITIVE_KEY_PATTERN.test(key)) values.push(value);
  }
  // Longest first so that a secret which contains another is masked whole.
  return values.sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces any live secret value from the process environment, plus any
 * `Authorization: Bearer …`-style inline credential, with a placeholder.
 */
export function redactSecrets(input: string, extraSecrets: readonly string[] = []): string {
  let output = input;

  const secrets = [...collectSecretValues(), ...extraSecrets.filter((s) => s && s.length >= MIN_SECRET_LENGTH)];
  for (const secret of secrets) {
    output = output.replaceAll(secret, REDACTION_PLACEHOLDER);
  }

  // Catch credentials that never lived in our env (e.g. echoed by upstream).
  output = output.replace(
    /\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    `$1 ${REDACTION_PLACEHOLDER}`
  );

  return output;
}

/**
 * Deep-clones a value, masking sensitive keys and redacting secrets found in
 * any string. Used before logging provider payloads.
 */
export function redactObject<T>(value: T, extraSecrets: readonly string[] = []): unknown {
  const seen = new WeakSet<object>();

  const walk = (node: unknown, keyHint?: string): unknown => {
    if (typeof node === "string") {
      if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) return REDACTION_PLACEHOLDER;
      return redactSecrets(node, extraSecrets);
    }
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return "[circular]";
    seen.add(node);

    if (Array.isArray(node)) return node.map((item) => walk(item));

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTION_PLACEHOLDER : walk(child, key);
    }
    return out;
  };

  return walk(value);
}

/**
 * Stable, non-reversible identifier for a credential, so operators can confirm
 * *which* key a deployment loaded without any plaintext being written down.
 * Deliberately not a substring of the secret.
 */
export function fingerprint(secret: string | undefined): string | null {
  if (!secret) return null;
  return `sha256:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}
