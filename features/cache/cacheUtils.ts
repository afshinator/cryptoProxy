// Filename: features/cache/cacheUtils.ts
/**
 * Cache Utilities
 * 
 * Helper functions for cache key matching and parameter normalization.
 * 
 * This module provides:
 * - normalizeParams() - Normalizes query parameters to match cache key format
 * - findCacheKey() - Matches normalized parameters to configured cache keys
 * 
 * These utilities ensure that incoming request parameters (with defaults applied)
 * can be matched against the cacheKeys configuration in configFeaturesCache.ts.
 */

import { featuresCacheConfig } from './configFeaturesCache.js';

/**
 * Normalizes query parameters to match cache key format
 */
export function normalizeParams(
  params: Record<string, any>,
  featureName: string
): Record<string, string | number> {
  const normalized: Record<string, string | number> = {};

  // Apply defaults based on feature
  if (featureName === 'volatility_vwatr') {
    normalized.bag = params.bag || 'top20_bag';
    normalized.periods = params.periods || '7,14,30';
    // Normalize periods to string format
    if (Array.isArray(normalized.periods)) {
      normalized.periods = normalized.periods.join(',');
    }
  } else if (featureName === 'volatility_current') {
    // volatility_current doesn't need normalization for cacheKeys
  } else if (featureName === 'markets') {
    // Markets params normalization
    normalized.vs_currency = params.vs_currency || 'usd';
    normalized.order = params.order || 'market_cap_desc';
    normalized.per_page = params.per_page || 100;
    normalized.page = params.page || 1;
    // Normalize sparkline to string
    const sparkline = params.sparkline !== undefined 
      ? (typeof params.sparkline === 'boolean' ? String(params.sparkline) : String(params.sparkline))
      : 'false';
    normalized.sparkline = sparkline;
    normalized.locale = params.locale || 'en';
  }

  return normalized;
}

/**
 * Finds the matching cache key for given parameters
 */
export function findCacheKey(
  featureName: string,
  params: Record<string, any>
): string | null {
  const config = featuresCacheConfig[featureName];
  if (!config?.cacheKeys) {
    // No cacheKeys defined, use feature name as key
    return featureName;
  }

  const normalized = normalizeParams(params, featureName);

  // Find matching cache key by comparing normalized params
  for (const [cacheKey, keyParams] of Object.entries(config.cacheKeys)) {
    let matches = true;
    for (const [key, value] of Object.entries(keyParams)) {
      // Convert both to strings for comparison
      const normalizedValue = String(normalized[key] ?? '');
      const keyValue = String(value);
      if (normalizedValue !== keyValue) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return cacheKey;
    }
  }

  // No match found - return null to indicate this combination shouldn't be cached
  return null;
}

