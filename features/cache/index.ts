// Filename: features/cache/index.ts
/**
 * Cache Feature
 * 
 * Main exports for the cache feature.
 * 
 * This module re-exports all public APIs from the cache feature:
 * - Cache management functions (updateFeatureCache)
 * - Computation functions (computeFeatureData, FEATURE_COMPUTATIONS)
 * - Utility functions (findCacheKey, normalizeParams)
 * - Storage interface (cacheStorage, CacheStorage)
 * - Configuration objects (featuresCacheConfig, cacheConfig)
 * - Type definitions (CacheResult, VolatilityLevel, etc.)
 * 
 * Import from this file to use the cache feature in other parts of the application.
 */

export { updateFeatureCache } from './cacheManager.js';
export type { CacheResult } from './cacheManager.js';

export { computeFeatureData, FEATURE_COMPUTATIONS } from './cacheComputations.js';
export type { FeatureComputationFn } from './cacheComputations.js';

export { findCacheKey, normalizeParams } from './cacheUtils.js';

export { cacheStorage } from './cacheStorage.js';
export type { CacheStorage, CachedData } from './cacheStorage.js';

export { featuresCacheConfig } from './configFeaturesCache.js';
export { cacheConfig } from './configApiCache.js';

export type { VolatilityLevel, StorageType, RefreshRateConfig, CacheConfigBase } from './types.js';

