// Filename: src/utils/KvUsageAdapter.ts

import { ProviderName } from "../constants/ProviderNames.js";
import { ProviderUsageAdapter } from "../services/ProviderUsageAdapter.js";
import { getProviderUsageKey } from "../services/CacheKeyService.js";
import { kv } from "./redis.js"; // Imports the initialized KV client
import { log, TMI } from "./log.js";

// KV Usage Adapter specific emoji
const LOG_EMOJI = "💾";

/**
 * Concrete implementation of the ProviderUsageAdapter interface for the backend,
 * using Vercel KV (Redis) to store and manage provider usage counts atomically.
 */
export class KvUsageAdapter implements ProviderUsageAdapter {
  /**
   * Retrieves the current usage count for a specific provider from Vercel KV.
   * Assumes 0 if the key does not exist.
   * @param provider - The name of the API provider.
   * @returns The current usage count.
   */
  public async getUsage(provider: ProviderName): Promise<number> {
    const key = getProviderUsageKey(provider);

    // We expect the count to be a number or null if the key hasn't been created yet.
    const count = await kv.get<number>(key);
    const usage = count ?? 0;

    log(`${LOG_EMOJI} KV Usage: Fetched usage for ${provider} -> ${usage}`, TMI);
    return usage;
  }

  /**
   * Atomically increments the usage count for a provider after a successful API call.
   * Uses Redis INCR command for a safe, concurrent update.
   * @param provider - The name of the API provider.
   */
  public async incrementUsage(provider: ProviderName): Promise<void> {
    const key = getProviderUsageKey(provider);

    // INCR returns the new value after incrementing.
    const newCount = await kv.incr(key);

    log(`${LOG_EMOJI} KV Usage: Incremented usage for ${provider} to ${newCount}`, TMI);
  }

  /**
   * Resets the usage counter for a specific provider by setting the value back to 0.
   * @param provider - The name of the API provider.
   */
  public async resetUsage(provider: ProviderName): Promise<void> {
    const key = getProviderUsageKey(provider);
    await kv.set(key, 0);

    log(`${LOG_EMOJI} KV Usage: Reset usage for ${provider} to 0`, TMI);
  }
}

/**
 * Export a singleton instance for easy access across backend services.
 */
export const kvUsageAdapter = new KvUsageAdapter();
