// Filename: src/core/RawDataGateway.ts

import { ProviderName } from "../constants/ProviderNames.js";
import { UsableEndpoint } from "../config/ConfigFeaturesCache.interface.js";
import { getRawDataCacheKey, RawDependencyKeyParams } from "../services/CacheKeyService.js";
import { applyRotationStrategy, RotationStrategy } from "../services/ProviderRotationStrategies.js";
import { HttpError } from "../utils/httpClient.js";
import { log, ERR, TMI, WARN } from "../utils/log.js";
import { providerClients, LocalApiKeys } from "./ProviderClients.js";
import type { ProviderUsageAdapter } from "../services/ProviderUsageAdapter.js";
import type { CachedRawDataResult } from "../config/Config.Persistent.js";

// Raw Data Gateway specific emoji
const LOG_EMOJI = "📥";

/**
 * Defines the abstract interface for simple Key-Value storage (used by FeatureResolver).
 */
export interface KeyValueStore {
  /** Retrieves data based on the key. Must handle TTL checks/expiration itself. */
  get(key: string): Promise<any>;
  /** Stores data with a TTL in seconds. */
  set(key: string, data: any, ttlSeconds: number): Promise<void>;
}

/**
 * Defines the abstract interface for the full storage mechanism (KV + Blob),
 * used internally by the RawDataGateway.
 */
export interface StorageGateway extends KeyValueStore {
  /** Retrieves Blob data (used for historical data). */
  getBlob(key: string): Promise<any>;
  /** Stores Blob data (used for historical data). */
  putBlob(key: string, data: any, ttlSeconds: number): Promise<void>; // ADDED TTL
}

/**
 * Core service responsible for fetching raw API data dependencies, managing the
 * Raw API Cache (KV/Blob/AsyncStorage), and orchestrating the API rotation/failover logic.
 */
export class RawDataGateway {
  // Standard TTL for raw data cache entries (can be refined later)
  private static readonly RAW_DATA_TTL_SECONDS = 300;

  /**
   * Executes the API call and failover logic, attempting to fetch data from the
   * best available provider in the pool.
   * @param rawDep - The dependency configuration.
   * @param providerPool - The allowed providers for this dependency.
   * @param localKeys - User's local API keys for signing direct requests.
   * @param usageAdapter - The storage adapter for tracking provider usage.
   * @param rotationStrategy - The rotation strategy to use for ordering providers.
   * @param storageGateway - Optional storage gateway for volatility-based strategies.
   * @returns Raw API response data and the provider that was successfully used.
   */
  private static async executeApiCallWithRotation(
    rawDep: UsableEndpoint,
    providerPool: ProviderName[],
    localKeys: LocalApiKeys,
    usageAdapter: ProviderUsageAdapter,
    rotationStrategy: RotationStrategy, // REQUIRED, no default
    storageGateway?: StorageGateway // Optional for volatility-based strategies
  ): Promise<{ data: any; providerUsed: ProviderName }> {
    // 1. Apply rotation strategy to get ordered provider list
    const orderedProviders = await applyRotationStrategy(
      rotationStrategy,
      providerPool,
      usageAdapter,
      storageGateway
    );

    log(
      `${LOG_EMOJI} Gateway: Prepared rotation list (strategy: ${rotationStrategy}): ${orderedProviders.map((a) => `${a.provider}${a.usage !== undefined ? `:${a.usage}` : ''}`).join(", ")}`,
      TMI
    );

    // 2. Loop through providers in strategy-determined order (failover is implicit)
    for (const { provider } of orderedProviders) {
      const client = providerClients[provider];

      try {
        log(`${LOG_EMOJI} Gateway: Attempting fetch from: ${provider}`, TMI);

        const data = await client(rawDep, localKeys);

        // SUCCESS: Record usage and break
        await usageAdapter.incrementUsage(provider);
        log(`${LOG_EMOJI} Gateway: ✅ Successful fetch from ${provider}. Usage tracked.`, TMI);
        return { data, providerUsed: provider };
      } catch (error) {
        // FAILOVER: Check for predictable failures (429, 401, etc.)
        if (error instanceof HttpError && (error.status === 429 || error.status === 401)) {
          log(
            `${LOG_EMOJI} Gateway: ⚠️ Provider ${provider} failed (${error.status}). Failing over...`,
            WARN
          );
          // Do NOT increment usage on failure
          continue; // Move to the next provider
        }

        // Critical error (e.g., Network, Bad Logic, 500)
        log(`${LOG_EMOJI} Gateway: ❌ Critical failure with ${provider}. Aborting rotation.`, ERR);
        // Throw the critical error to stop the entire feature resolution process
        throw error;
      }
    }

    // If the loop finishes without returning, all providers failed.
    throw new Error(`All providers failed for endpoint: ${rawDep.endpointPath}`);
  }

  /**
   * Fetches data for a single raw dependency, checking the cache first.
   * Validates TTL before returning cached data.
   * @param rawDep - The raw dependency configuration.
   * @param providerPool - The allowed providers for this dependency.
   * @param localKeys - User's local API keys.
   * @param storageGateway - The abstract **full** storage implementation.
   * @param usageAdapter - The abstract usage tracking implementation.
   * @param rotationStrategy - The rotation strategy to use for ordering providers.
   * @returns Raw API response data (unwrapped from CachedRawDataResult).
   */
  public static async fetchRawDependency(
    rawDep: UsableEndpoint,
    providerPool: ProviderName[],
    localKeys: LocalApiKeys,
    storageGateway: StorageGateway,
    usageAdapter: ProviderUsageAdapter,
    rotationStrategy: RotationStrategy // REQUIRED, no default
  ): Promise<any> {
    // 1. Apply rotation strategy to determine provider order
    const orderedProviders = await applyRotationStrategy(
      rotationStrategy,
      providerPool,
      usageAdapter,
      storageGateway
    );

    // 2. Check cache for each provider in rotation order (preferred first)
    for (const { provider } of orderedProviders) {
      const keyParams: RawDependencyKeyParams = {
        endpointPath: rawDep.endpointPath,
        provider: provider, // ✅ Uses provider from rotation strategy
        queryParams: rawDep.queryParams,
        isHistorical: rawDep.isHistorical,
      };
      const cacheKey = getRawDataCacheKey(keyParams);

      const cachedEntry = rawDep.isHistorical
        ? await storageGateway.getBlob(cacheKey)
        : await storageGateway.get(cacheKey);

      if (cachedEntry) {
        // Validate that it's a CachedRawDataResult structure
        const isCachedRawDataResult =
          cachedEntry &&
          typeof cachedEntry === 'object' &&
          'data' in cachedEntry &&
          'fetchedAt' in cachedEntry &&
          'ttlSeconds' in cachedEntry;

        if (isCachedRawDataResult) {
          const cached = cachedEntry as CachedRawDataResult;
          const ageSeconds = (Date.now() - cached.fetchedAt) / 1000;

          // Check if cache entry is still valid (not expired)
          if (ageSeconds < cached.ttlSeconds) {
            log(
              `${LOG_EMOJI} Gateway: Cache HIT for raw key ${cacheKey} (provider: ${provider}). Age: ${ageSeconds.toFixed(1)}s / ${cached.ttlSeconds}s. Serving cached data.`,
              TMI
            );
            return cached.data; // Return just the data, not the wrapper
          } else {
            log(
              `${LOG_EMOJI} Gateway: Cache EXPIRED for raw key ${cacheKey} (provider: ${provider}). Age: ${ageSeconds.toFixed(1)}s / ${cached.ttlSeconds}s. Checking next provider.`,
              TMI
            );
            // Continue to next provider in rotation order
            continue;
          }
        } else {
          // Old format detected - treat as cache miss for this provider
          log(
            `${LOG_EMOJI} Gateway: Cache entry for ${cacheKey} (provider: ${provider}) has old format. Checking next provider.`,
            WARN
          );
          // Continue to next provider in rotation order
          continue;
        }
      }
      // No cache entry for this provider - continue to next
    }

    log(`${LOG_EMOJI} Gateway: Cache MISS for all providers. Initiating API rotation.`, TMI);

    // 3. No valid cache found for any provider - Execute API Call with Rotation/Failover
    const { data, providerUsed } = await this.executeApiCallWithRotation(
      rawDep,
      providerPool,
      localKeys,
      usageAdapter,
      rotationStrategy,
      storageGateway
    );

    // 4. Wrap data in CachedRawDataResult and Store in Cache (KV or Blob)
    // Store using the provider that was actually used (not the first in pool)
    const usedProviderKeyParams: RawDependencyKeyParams = {
      endpointPath: rawDep.endpointPath,
      provider: providerUsed, // ✅ Store with the provider that was actually used
      queryParams: rawDep.queryParams,
      isHistorical: rawDep.isHistorical,
    };
    const usedProviderCacheKey = getRawDataCacheKey(usedProviderKeyParams);

    const ttl = this.RAW_DATA_TTL_SECONDS;
    const now = Date.now();
    const wrappedResult: CachedRawDataResult = {
      data: data,
      fetchedAt: now,
      ttlSeconds: ttl,
    };

    try {
      if (rawDep.isHistorical) {
        await storageGateway.putBlob(usedProviderCacheKey, wrappedResult, ttl);
        log(`${LOG_EMOJI} Gateway: Stored raw data to BLOB store: ${usedProviderCacheKey} (provider: ${providerUsed}, TTL: ${ttl}s)`, TMI);
      } else {
        await storageGateway.set(usedProviderCacheKey, wrappedResult, ttl);
        log(`${LOG_EMOJI} Gateway: Stored raw data to KV store: ${usedProviderCacheKey} (provider: ${providerUsed}, TTL: ${ttl}s)`, TMI);
      }
    } catch (storeError) {
      log(`${LOG_EMOJI} Gateway: ❌ Failed to store raw data in cache! Error: ${storeError}`, WARN);
    }

    return data; // Return just the data, not the wrapper
  }
}
