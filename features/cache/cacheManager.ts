// Filename: features/cache/cacheManager.ts
/**
 * Cache Manager for Feature Endpoints
 * 
 * Manages caching of feature computation results.
 * Handles cache checking, refresh logic, and data computation.
 * Separated from storage implementation details.
 * 
 * This module provides:
 * - updateFeatureCache() - Main function to update/retrieve cached feature data
 * - CacheResult interface - Return type with data, cached flag, and timestamp
 * 
 * The cache manager:
 * 1. Checks if feature is configured for caching
 * 2. Finds matching cache key based on parameters
 * 3. Checks cache storage for existing data
 * 4. Validates cache freshness based on volatility level and refresh rates
 * 5. Computes fresh data when needed or serves cached data when fresh
 * 6. Handles errors gracefully (returns stale data if computation fails)
 */

import { log, LOG, WARN, ERR } from '../../utils/log.js';
import { featuresCacheConfig } from './configFeaturesCache.js';
import type { VolatilityLevel } from './types.js';
import { cacheStorage, type CachedData } from './cacheStorage.js';
import { computeFeatureData } from './cacheComputations.js';
import { findCacheKey } from './cacheUtils.js';

export interface CacheResult<T = any> {
  data: T;
  cached: boolean;
  timestamp: number;
}

/**
 * Checks cache for feature data. Returns cached data if fresh (based on refresh_rates
 * in config), otherwise computes fresh data, updates cache, and returns it.
 * Handles errors by returning stale cached data when available.
 * 
 * @param featureName - One of the keys in featuresCacheConfig
 * @param volatilityLevel - Optional volatility level (defaults to NORMAL)
 * @param params - Optional query parameters for features that support them
 * @param forceSource - Optional: 'api' to force fresh pull and update cache, 'cache' to force serve from cache only
 * @returns Cache result with data, cached flag, and timestamp
 */
export async function updateFeatureCache(
  featureName: string,
  volatilityLevel: VolatilityLevel = 'NORMAL',
  params: Record<string, any> = {},
  forceSource?: 'api' | 'cache'
): Promise<CacheResult> {
  // Get feature config
  const config = featuresCacheConfig[featureName];
  if (!config) {
    throw new Error(`💿 Feature '${featureName}' not found in featuresCacheConfig`);
  }

  // Handle forceSource parameter
  if (forceSource === 'api') {
    // Force fresh pull from APIs, compute value, update cache, return
    log(`💿 🔄 Force source 'api': computing fresh data for '${featureName}'...`, LOG);
    const cacheKey = findCacheKey(featureName, params) || featureName;
    const now = Date.now();
    
    try {
      const data = await computeFeatureData(featureName, params);
      const cachedData: CachedData = {
        data,
        timestamp: now,
      };
      
      await cacheStorage.set(cacheKey, JSON.stringify(cachedData));
      log(`💿 ✅ Force API: Updated cache entry for '${cacheKey}' with fresh data`, LOG);
      
      return {
        data,
        cached: false,
        timestamp: now,
      };
    } catch (error) {
      log(`💿 ❌ Force API: Failed to compute data for '${featureName}': ${error instanceof Error ? error.message : String(error)}`, ERR);
      throw error;
    }
  }

  if (forceSource === 'cache') {
    // Force serve from cache only
    log(`💿 📦 Force source 'cache': serving from cache for '${featureName}'...`, LOG);
    const cacheKey = findCacheKey(featureName, params) || featureName;
    
    try {
      const cachedValue = await cacheStorage.get(cacheKey);
      
      if (!cachedValue) {
        throw new Error(`💿 Cache entry '${cacheKey}' not found`);
      }
      
      const cachedData: CachedData = JSON.parse(cachedValue);
      log(`💿 ✅ Force Cache: Serving cached data for '${cacheKey}' (age: ${((Date.now() - cachedData.timestamp) / 1000).toFixed(1)}s)`, LOG);
      
      return {
        data: cachedData.data,
        cached: true,
        timestamp: cachedData.timestamp,
      };
    } catch (error) {
      log(`💿 ❌ Force Cache: Failed to get cached data for '${cacheKey}': ${error instanceof Error ? error.message : String(error)}`, ERR);
      throw error;
    }
  }

  if (!config.cache) {
    // Feature is not configured for caching, compute fresh data
    log(`💿⁉️Feature '${featureName}' is not configured for caching, computing fresh data...`, LOG);
    const data = await computeFeatureData(featureName, params);
    return {
      data,
      cached: false,
      timestamp: Date.now(),
    };
  }

  // Find the appropriate cache key based on params
  const cacheKey = findCacheKey(featureName, params);
  if (!cacheKey) {
    // This parameter combination is not configured for caching
    log(`💿 Feature '${featureName}' with params ${JSON.stringify(params)} is not configured for caching, computing fresh data...`, LOG);
    const data = await computeFeatureData(featureName, params);
    return {
      data,
      cached: false,
      timestamp: Date.now(),
    };
  }

  const refreshRate = config.refresh_rate[volatilityLevel];
  const now = Date.now();

  try {
    // Try to get cached data from storage
    const cachedValue = await cacheStorage.get(cacheKey);

    if (!cachedValue) {
      // Key doesn't exist, create it
      log(`💿 Cache key '${cacheKey}' not found, creating new cache entry...`, LOG);

      try {
        const data = await computeFeatureData(featureName, params);
        const cachedData: CachedData = {
          data,
          timestamp: now,
        };

        await cacheStorage.set(cacheKey, JSON.stringify(cachedData));
        log(`💿 ✅ Created cache entry for '${cacheKey}'`, LOG);

        return {
          data,
          cached: false,
          timestamp: now,
        };
      } catch (error) {
        log(`💿 ❌ Failed to compute data for '${featureName}': ${error instanceof Error ? error.message : String(error)}`, ERR);
        throw error;
      }
    }

    // Key exists, parse the cached data
    let cachedData: CachedData;
    try {
      cachedData = JSON.parse(cachedValue);
    } catch (parseError) {
      log(`💿 ⚠️ Failed to parse cached data for '${cacheKey}', computing fresh data...`, WARN);
      const data = await computeFeatureData(featureName, params);
      const newCachedData: CachedData = {
        data,
        timestamp: now,
      };
      await cacheStorage.set(cacheKey, JSON.stringify(newCachedData));
      return {
        data,
        cached: false,
        timestamp: now,
      };
    }

    const ageSeconds = (now - cachedData.timestamp) / 1000;
    const isStale = ageSeconds >= refreshRate;

    if (isStale) {
      // Data is stale, refresh it
      log(`💿 Cache entry '${cacheKey}' is stale (${ageSeconds.toFixed(1)}s old, refresh rate: ${refreshRate}s), computing fresh data...`, LOG);

      try {
        const data = await computeFeatureData(featureName, params);
        const newCachedData: CachedData = {
          data,
          timestamp: now,
        };

        await cacheStorage.set(cacheKey, JSON.stringify(newCachedData));
        log(`💿 ✅ Updated cache entry for '${cacheKey}' with fresh data`, LOG);

        return {
          data,
          cached: false,
          timestamp: now,
        };
      } catch (error) {
        // API call failed, return stale data
        log(`💿 ⚠️ Failed to compute fresh data for '${featureName}', returning stale cached data: ${error instanceof Error ? error.message : String(error)}`, WARN);
        return {
          data: cachedData.data,
          cached: true,
          timestamp: cachedData.timestamp,
        };
      }
    } else {
      // Data is fresh, serve from cache
      log(`💿 ✅ Serving cached data for '${cacheKey}' (${ageSeconds.toFixed(1)}s old, refresh rate: ${refreshRate}s)`, LOG);
      return {
        data: cachedData.data,
        cached: true,
        timestamp: cachedData.timestamp,
      };
    }
  } catch (storageError) {
    // Storage read failed, try to get fresh data
    log(`💿 ⚠️ Storage read failed for '${cacheKey}', attempting fresh data pull: ${storageError instanceof Error ? storageError.message : String(storageError)}`, WARN);

    try {
      const data = await computeFeatureData(featureName, params);
      const cachedData: CachedData = {
        data,
        timestamp: now,
      };

      // Try to save to storage (but don't fail if this fails)
      try {
        await cacheStorage.set(cacheKey, JSON.stringify(cachedData));
      } catch (saveError) {
        log(`💿 ⚠️ Failed to save to storage after fresh pull: ${saveError instanceof Error ? saveError.message : String(saveError)}`, WARN);
      }

      return {
        data,
        cached: false,
        timestamp: now,
      };
    } catch (computeError) {
      log(`💿 ❌ Failed to compute data after storage failure: ${computeError instanceof Error ? computeError.message : String(computeError)}`, ERR);
      throw computeError;
    }
  }
}
