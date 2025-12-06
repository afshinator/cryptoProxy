// Filename: features/cache/configFeaturesCache.ts
/**
 * Cache Configuration for Feature Endpoints
 * 
 * This configuration defines caching behavior for internal feature endpoints
 * (computed/aggregated data). Each feature can be configured with:
 * - Whether to cache the result
 * - Refresh rate (cache TTL) based on current volatility levels
 * - Storage location (currently only KV store is supported)
 * - Optional cacheKeys mapping for parameterized cache entries
 * - Optional dependsOn array for cache invalidation dependencies
 * 
 * Features configured:
 * - volatility_current: Current market volatility (price change velocity)
 * - volatility_vwatr: VWATR volatility calculations with bag/periods params
 * - dominance_current: Market dominance calculations (BTC, ETH, stablecoins, others)
 * - markets: Market data endpoint with query parameter support
 */

import type { CacheConfigBase } from './types.js';

export type { VolatilityLevel, StorageType, RefreshRateConfig } from './types.js';

export interface FeatureCacheConfig extends CacheConfigBase {
  /** Endpoint paths this feature cache depends on */
  dependsOn?: string[];
}

export interface FeaturesCacheConfig {
  [feature: string]: FeatureCacheConfig;

}

/**
 * Cache configuration for all feature endpoints
 * 
 * Features:
 * - volatility_vwatr: VWATR (Volume-Weighted Average True Range) volatility calculations
 * - volatility_current: Current market volatility based on price change velocity
 * - dominance_current: Current market dominance calculations (BTC, ETH, stablecoins, others)
 */
export const featuresCacheConfig: FeaturesCacheConfig = {
  // api/volatility/&type=current
  volatility_current: {
    cache: true,
    refresh_rate: {
      LOW: 300,      // 5 minutes - current volatility can be cached when stable
      NORMAL: 180,   // 3 minutes - normal volatility needs regular updates
      HIGH: 120,     // 2 minutes - high volatility requires near real-time data
      EXTREME: 60,   // 1 minute - extreme volatility needs very fresh data
    },
    storage: 'kv',
    dependsOn: ['/coins/markets'],
    cacheKeys: {
      // when /api/volatility?type=current is called without per_page, defaults to 50
      'volatility_current:50': { per_page: 50 },
    },
  },

  // api/volatility/&type=vwatr
  volatility_vwatr: {
    cache: true,
    refresh_rate: {
      LOW: 1800,     // 30 minutes - VWATR calculations are computationally expensive
      NORMAL: 900,   // 15 minutes - normal conditions
      HIGH: 300,     // 5 minutes - high volatility needs more frequent updates
      EXTREME: 120,  // 2 minutes - extreme conditions
    },
    storage: 'kv',
    dependsOn: ['/coins/markets', '/coins/{id}/ohlc', '/coins/{id}/market_chart'],
    cacheKeys: {
      // when /api/volatity is called without params, defaults to:
      'vwatr:top20_bag:7,14,30': { bag: 'top20_bag', periods: '7,14,30' },
      'vwatr:superstar_bag:7,14,30': { bag: 'superstar_bag', periods: '7,14,30' },
      'vwatr:all_coins:7,14,30': { bag: 'all_coins', periods: '7,14,30' },
    },
  },

  // api/dominance
  dominance_current: {
    cache: true,
    refresh_rate: {
      LOW: 600,      // 120 minutes - dominance changes slowly in stable markets
      NORMAL: 300,   // 60 minutes - normal market conditions
      HIGH: 120,     // 30 minutes - high volatility can shift dominance quickly
      EXTREME: 60,   // 5 minute - extreme conditions need frequent updates
    },
    storage: 'kv',
    dependsOn: ['/coins/markets', '/global'],
    cacheKeys: {
      // /api/dominance has no query params, single default cache entry
      'dominance_current:default': {},
    },
  },

  // api/markets
  markets: {
    cache: true,
    refresh_rate: {
      LOW: 300,      // 5 minutes - markets can be cached when stable
      NORMAL: 180,   // 3 minutes - normal markets need regular updates
      HIGH: 120,     // 2 minutes - high volatility requires near real-time data
      EXTREME: 60,   // 1 minute - extreme volatility needs very fresh data
    },
    storage: 'kv',
    dependsOn: ['/coins/markets'],
    cacheKeys: {
      // when /api/markets is called without params, defaults to:
      // vs_currency=usd, order=market_cap_desc, per_page=100, page=1, sparkline=false, locale=en
      'markets:usd:market_cap_desc:100:1:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 100,
        page: 1,
        sparkline: 'false',
        locale: 'en',
      },
      // per_page=250 for pages 1-5
      'markets:usd:market_cap_desc:250:1:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 1,
        sparkline: 'false',
        locale: 'en',
      },
      'markets:usd:market_cap_desc:250:2:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 2,
        sparkline: 'false',
        locale: 'en',
      },
      'markets:usd:market_cap_desc:250:3:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 3,
        sparkline: 'false',
        locale: 'en',
      },
      'markets:usd:market_cap_desc:250:4:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 4,
        sparkline: 'false',
        locale: 'en',
      },
      'markets:usd:market_cap_desc:250:5:false:en': {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250,
        page: 5,
        sparkline: 'false',
        locale: 'en',
      },
    },
  },
};

export default featuresCacheConfig;

