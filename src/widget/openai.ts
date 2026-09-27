/**
 * Typed access to the ChatGPT Apps SDK host bridge.
 *
 * The host injects `window.openai` into the widget iframe. Everything here is
 * defensive: the widget is also opened in a plain browser during development,
 * where the bridge is absent, and it must degrade to a readable
 * "not running inside ChatGPT" state rather than throwing on load.
 *
 * Note what is *not* here: there is no way to read provider credentials from
 * this side, by design. The widget can only call MCP tools; the server holds
 * the keys.
 */

export type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export interface OpenAiGlobals<TOutput = unknown, TState = unknown> {
  toolOutput?: TOutput | null;
  toolInput?: unknown;
  widgetState?: TState | null;
  displayMode?: "inline" | "pip" | "fullscreen";
  maxHeight?: number;
  theme?: "light" | "dark";
  locale?: string;
  callTool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  setWidgetState?: (state: unknown) => Promise<void> | void;
  requestDisplayMode?: (args: { mode: "inline" | "pip" | "fullscreen" }) => Promise<unknown>;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<unknown>;
}

declare global {
  interface Window {
    openai?: OpenAiGlobals;
  }
}

export const SET_GLOBALS_EVENT = "openai:set_globals";

export function getHost(): OpenAiGlobals | undefined {
  return typeof window === "undefined" ? undefined : window.openai;
}

export function isHostAvailable(): boolean {
  return typeof getHost()?.callTool === "function";
}

export interface ToolCallOutcome<T> {
  /** False for both transport failures and tool-reported failures. */
  readonly ok: boolean;
  /** Structured envelope, present whenever the server produced one. */
  readonly data: T | null;
  /** Human-readable failure text, already safe to display. */
  readonly message: string | null;
}

/**
 * Invokes an MCP tool through the host.
 *
 * Failures are returned rather than thrown, because the server reports expected
 * states (provider not configured, budget exceeded, invalid combination) as
 * tool errors that still carry a full structured envelope. The widget wants
 * both halves: the message to show, and the envelope to render actions from.
 */
export async function callTool<T>(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallOutcome<T>> {
  const host = getHost();
  if (!host?.callTool) {
    return {
      ok: false,
      data: null,
      message:
        "This widget is not connected to ChatGPT, so it cannot run tools. Open it from a ChatGPT conversation.",
    };
  }

  let result: ToolResult;
  try {
    result = await host.callTool(name, args);
  } catch (error) {
    return {
      ok: false,
      data: null,
      message: error instanceof Error ? error.message : `Tool "${name}" could not be reached.`,
    };
  }

  const text = result?.content?.find((part) => part.type === "text")?.text?.trim() || null;
  const data = (result?.structuredContent ?? null) as T | null;

  if (result?.isError) {
    return { ok: false, data, message: text ?? `Tool "${name}" failed.` };
  }
  if (data === null) {
    return { ok: false, data: null, message: text ?? `Tool "${name}" returned no structured result.` };
  }
  return { ok: true, data, message: text };
}

export function persistWidgetState(state: unknown): void {
  const host = getHost();
  void host?.setWidgetState?.(state);
}

/** Subscribes to host global changes (tool output, theme, display mode). */
export function subscribeToGlobals(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SET_GLOBALS_EVENT, listener);
  return () => window.removeEventListener(SET_GLOBALS_EVENT, listener);
}
