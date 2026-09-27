import type { AppConfig } from "../config/env.js";
import { ProviderError } from "./errors.js";
import { HiggsfieldProvider } from "./higgsfield/index.js";
import type { MediaProvider } from "./types.js";
import type { FetchLike } from "./higgsfield/client.js";

/**
 * Provider registry.
 *
 * Adding a second real provider means implementing `MediaProvider` and adding
 * one line to `buildProviders`. Nothing else in the server knows a provider by
 * name — tools resolve through `ProviderRegistry`, and the widget only ever
 * sees ids that came back from `list_capabilities`.
 */

export interface RegistryOptions {
  /** Injected only by tests, to avoid real network calls. */
  readonly fetchImpl?: FetchLike;
}

export class ProviderRegistry {
  private readonly providers: Map<string, MediaProvider>;
  private readonly order: readonly string[];

  constructor(providers: readonly MediaProvider[]) {
    if (providers.length === 0) {
      throw new Error("ProviderRegistry requires at least one provider.");
    }
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.order = providers.map((provider) => provider.id);
  }

  list(): readonly MediaProvider[] {
    return this.order.map((id) => this.providers.get(id) as MediaProvider);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  get(id: string): MediaProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new ProviderError(
        "provider_unknown",
        `Unknown provider "${id}". Available providers: ${this.order.join(", ")}.`,
        { remediation: "Call list_capabilities to see the providers this server exposes." }
      );
    }
    return provider;
  }

  /**
   * Preferred provider for a fresh request: the first configured one, falling
   * back to the first registered so the widget still has something to show (and
   * a clear "not configured" banner) on an unkeyed deployment.
   */
  defaultProvider(): MediaProvider {
    const configured = this.list().find((provider) => provider.describeConfiguration().configured);
    return configured ?? (this.list()[0] as MediaProvider);
  }

  anyConfigured(): boolean {
    return this.list().some((provider) => provider.describeConfiguration().configured);
  }
}

export function buildProviders(config: AppConfig, options: RegistryOptions = {}): ProviderRegistry {
  return new ProviderRegistry([new HiggsfieldProvider(config, options.fetchImpl)]);
}
