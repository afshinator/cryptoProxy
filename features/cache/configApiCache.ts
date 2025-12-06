// Filename: features/cache/configApiCache.ts
/**
 * Cache Configuration for API Endpoints
 * 
 * This configuration defines caching behavior for all external API endpoints
 * called by this application. Each endpoint can be configured with:
 * - Whether to cache the result
 * - Refresh rate (cache TTL) based on current volatility levels
 * - Storage location (currently only KV store is supported)
 * 
 * Endpoints configured:
 * - /coins/markets: Market data endpoint used by /api/markets, /api/dominance, and /api/volatility
 * - /global: Global market data endpoint used by /api/dominance
 * - /coins/{id}/ohlc: OHLC (Open, High, Low, Close) data for individual coins (used by scripts)
 * - /coins/{id}/market_chart: Market chart data for individual coins (used by scripts)
 */

import type { CacheConfigBase } from './types.js';

export type { VolatilityLevel, StorageType, RefreshRateConfig } from './types.js';

export interface EndpointCacheConfig extends CacheConfigBase {}

export interface CacheConfig {
  [endpoint: string]: EndpointCacheConfig;
}

/**
 * Cache configuration for all API endpoints
 * 
 * Endpoints:
 * - /coins/markets: Market data endpoint used by /api/markets, /api/dominance, and /api/volatility
 * - /global: Global market data endpoint used by /api/dominance
 * - /coins/{id}/ohlc: OHLC (Open, High, Low, Close) data for individual coins (used by scripts)
 * - /coins/{id}/market_chart: Market chart data for individual coins (used by scripts)
 */
export const cacheConfig: CacheConfig = {
  '/coins/markets': {
    cache: true,
    refresh_rate: {
      LOW: 300,      // 5 minutes - stable markets can be cached longer
      NORMAL: 180,   // 3 minutes - normal volatility needs more frequent updates
      HIGH: 90,      // 1.5 minutes - high volatility requires near real-time data
      EXTREME: 60,   // 1 minute - extreme volatility needs very fresh data
    },
    storage: 'kv',
  },

  '/global': {
    cache: true,
    refresh_rate: {
      LOW: 600,      // 10 minutes - global market data changes slowly
      NORMAL: 300,   // 5 minutes - normal market conditions
      HIGH: 120,     // 2 minutes - high volatility affects global metrics
      EXTREME: 60,   // 1 minute - extreme conditions need frequent updates
    },
    storage: 'kv',
  },

  '/coins/{id}/ohlc': {
    cache: true,
    refresh_rate: {
      LOW: 3600,     // 1 hour - OHLC data is historical, can cache longer
      NORMAL: 1800,  // 30 minutes - normal conditions
      HIGH: 900,     // 15 minutes - high volatility may need more recent data
      EXTREME: 300,  // 5 minutes - extreme conditions
    },
    storage: 'kv',
  },

  '/coins/{id}/market_chart': {
    cache: true,
    refresh_rate: {
      LOW: 3600,     // 1 hour - market chart data is historical
      NORMAL: 1800,  // 30 minutes - normal conditions
      HIGH: 900,     // 15 minutes - high volatility
      EXTREME: 300,  // 5 minutes - extreme conditions
    },
    storage: 'kv',
  },
};

export default cacheConfig;

