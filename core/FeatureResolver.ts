// Filename: src/core/FeatureResolver.ts

import { FeatureName } from "../constants/FeatureNames.js";
import { featureConfig } from "../config/configFeaturesCache.js";
import type { UserRoleConfig } from "../config/configUserRoles.js";
import { calculateFeatureTTL } from "../utils/ttl.js";
import { getFeatureCacheKey } from "../services/CacheKeyService.js";
import { KeyValueStore, RawDataGateway, StorageGateway } from "./RawDataGateway.js";
import type { ProviderUsageAdapter } from "../services/ProviderUsageAdapter.js";
import { LocalApiKeys } from "./ProviderClients.js";
import { log, TMI, ERR } from "../utils/log.js";
import type { CachedFeatureResult } from "../config/Config.Persistent.js";

// Feature Resolver specific emoji
const LOG_EMOJI = "✨";

/**
 * The core service responsible for resolving a final Feature.
 * It handles cache lookups, dependency fetching, calculation, and final caching.
 */
export class FeatureResolver {
  /**
   * Resolves and returns a calculated feature, fetching dependencies if necessary.
   * @param featureName - The name of the feature to resolve.
   * @param userConfig - Configuration of the requesting user's role.
   * @param localKeys - User's local API keys for direct requests.
   * @param storageGateway - The abstract **Key-Value** storage implementation.
   * @param usageAdapter - The abstract usage tracking implementation.
   * @returns The final, calculated feature data wrapped in CachedFeatureResult.
   */
  public static async resolveFeature(
    featureName: FeatureName,
    userConfig: UserRoleConfig,
    localKeys: LocalApiKeys,
    // --- CORRECTED TYPE HERE ---
    storageGateway: KeyValueStore,
    usageAdapter: ProviderUsageAdapter
  ): Promise<CachedFeatureResult> {
    log(`${LOG_EMOJI} RESOLVER: Starting resolution for feature: ${featureName}`, TMI);

    const config = featureConfig[featureName];
    if (!config) {
      log(`${LOG_EMOJI} RESOLVER: ❌ Feature configuration not found for ${featureName}`, ERR);
      throw new Error(`Feature configuration not found for ${featureName}`);
    }

    const featureKey = getFeatureCacheKey(featureName);

    // --- 1. Check Feature Cache and Validate TTL ---
    const cachedFeature = await storageGateway.get(featureKey);
    
    if (cachedFeature) {
      // Validate cache entry structure - handle both old format (raw data) and new format (CachedFeatureResult)
      const isCachedFeatureResult = 
        cachedFeature && 
        typeof cachedFeature === 'object' && 
        'data' in cachedFeature && 
        'fetchedAt' in cachedFeature && 
        'effectiveTTLSeconds' in cachedFeature;
      
      if (isCachedFeatureResult) {
        const cached = cachedFeature as CachedFeatureResult;
        const ageSeconds = (Date.now() - cached.fetchedAt) / 1000;
        
        // Check if cache entry is still valid (not expired)
        if (ageSeconds < cached.effectiveTTLSeconds) {
          log(
            `${LOG_EMOJI} RESOLVER: Cache HIT for feature ${featureName}. Age: ${ageSeconds.toFixed(1)}s / ${cached.effectiveTTLSeconds}s. Serving cached result.`,
            TMI
          );
          return cachedFeature as CachedFeatureResult;
        } else {
          log(
            `${LOG_EMOJI} RESOLVER: Cache EXPIRED for feature ${featureName}. Age: ${ageSeconds.toFixed(1)}s / ${cached.effectiveTTLSeconds}s. Fetching fresh data.`,
            TMI
          );
          // Fall through to fetch fresh data (treat as cache miss)
        }
      } else {
        // Old format detected - wrap it in CachedFeatureResult
        log(
          `${LOG_EMOJI} RESOLVER: Cache HIT (old format) for feature ${featureName}. Converting to new format.`,
          TMI
        );
        const now = Date.now();
        const ttlSeconds = await calculateFeatureTTL(featureName, userConfig, storageGateway);
        const wrappedResult: CachedFeatureResult = {
          data: cachedFeature,
          fetchedAt: now,
          effectiveTTLSeconds: ttlSeconds,
        };
        // Update cache with new format
        await storageGateway.set(featureKey, wrappedResult, ttlSeconds);
        return wrappedResult;
      }
    }

    log(
      `${LOG_EMOJI} RESOLVER: Cache MISS for feature ${featureName}. Initiating dependency fetch.`,
      TMI
    );

    // --- 2. Fetch Dependencies ---
    const rawDependencies: Partial<Record<FeatureName, any>> = {} as Partial<Record<FeatureName, any>>;
    const dependencyPromises = config.rawDependencies.map(async (rawDep) => {
      // Determine the provider pool for this raw data (from the feature's config)
      const providerPool = config.providerPool;

      // Note: RawDataGateway.fetchRawDependency requires the full StorageGateway 
      // interface because it handles both KV and Blob lookups internally.
      // This is a current limitation, addressed in the RawDataGateway section below.
      // For now, we assume the calling context ensures 'storageGateway' has all required methods.
      // If the caller is the frontend, the StorageGateway MUST be implemented with mocks for getBlob/putBlob.
      
      const data = await RawDataGateway.fetchRawDependency(
        rawDep,
        providerPool,
        localKeys,
        // TYPE CASTING: Requires the calling adapter to implement the full interface (or mock Blob methods).
        storageGateway as unknown as StorageGateway,
        usageAdapter,
        config.rotationStrategy // Pass rotation strategy from feature config
      );

      // Map data to its abstract name for the calculation function
      rawDependencies[rawDep.name] = data;
    });

    // Run all dependency fetches concurrently
    await Promise.all(dependencyPromises);

    // --- 3. Calculate Final Feature ---
    log(`${LOG_EMOJI} RESOLVER: All dependencies fetched. Starting calculation.`, TMI);
    const calculatedFeature = config.calculate(rawDependencies as Record<FeatureName, any>);

    // --- 4. Calculate Final TTL and Store Feature ---
    const ttlSeconds = await calculateFeatureTTL(featureName, userConfig, storageGateway);
    const now = Date.now();

    // Wrap the calculated feature in CachedFeatureResult for frontend storage
    // Backend storage adapters can unwrap this if needed
    const cachedResult: CachedFeatureResult = {
      data: calculatedFeature,
      fetchedAt: now,
      effectiveTTLSeconds: ttlSeconds,
    };

    try {
      await storageGateway.set(featureKey, cachedResult, ttlSeconds);
      log(`${LOG_EMOJI} RESOLVER: ✅ Feature stored successfully. TTL: ${ttlSeconds}s`, TMI);
    } catch (storeError) {
      log(`${LOG_EMOJI} RESOLVER: ⚠️ Failed to store feature ${featureName} in cache.`, ERR);
    }

    return cachedResult;
  }
}
