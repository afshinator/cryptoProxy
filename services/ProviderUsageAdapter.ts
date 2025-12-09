// Filename: src/services/ProviderUsageAdapter.ts

import type { ProviderName } from "../constants/ProviderNames.js";

/**
 * Defines the contract for an abstract service capable of reading and managing
 * usage counts for API providers. This allows the core rotation logic to work
 * on both the backend (using KV/Redis) and the frontend (using AsyncStorage).
 */
export interface ProviderUsageAdapter {
  /** Retrieves the current usage count for a provider. */
  getUsage(provider: ProviderName): Promise<number>;

  /** Atomically increments the usage count for a provider after a successful call. */
  incrementUsage(provider: ProviderName): Promise<void>;

  /** Resets the usage count to zero. */
  resetUsage(provider: ProviderName): Promise<void>;
}
