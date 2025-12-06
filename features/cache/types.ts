// Filename: features/cache/types.ts
/**
 * Shared Types for Cache Configuration
 * 
 * Common types and interfaces used by both API endpoint cache config
 * and feature endpoint cache config.
 * 
 * This module provides:
 * - VolatilityLevel type (re-exported from PriceChangeVelocity for single source of truth)
 * - StorageType type for storage backend selection
 * - RefreshRateConfig interface for volatility-based TTL configuration
 * - CacheConfigBase interface for common cache configuration properties
 * 
 * These types ensure type safety across all cache configuration files.
 */

// Import VolatilityLevel from PriceChangeVelocity (single source of truth)
export type { VolatilityLevel } from '../PriceChangeVelocity/types.js';

export type StorageType = 'kv';

export interface RefreshRateConfig {
  /** Cache TTL in seconds for LOW volatility */
  LOW: number;
  /** Cache TTL in seconds for NORMAL volatility */
  NORMAL: number;
  /** Cache TTL in seconds for HIGH volatility */
  HIGH: number;
  /** Cache TTL in seconds for EXTREME volatility */
  EXTREME: number;
}

export interface CacheConfigBase {
  /** Whether to cache responses */
  cache: boolean;
  /** Cache refresh rates (TTL) based on volatility levels, in seconds */
  refresh_rate: RefreshRateConfig;
  /** Where to store the cache (currently only 'kv' is supported) */
  storage: StorageType;
  /** Optional mapping of cache keys to query parameter combinations */
  cacheKeys?: {
    [cacheKey: string]: Record<string, string | number>;
  };
}

