// Filename: features/cache/cacheComputations.ts
/**
 * Cache Computations
 * 
 * Maps feature names to their computation functions.
 * This keeps the computation logic separate from cache management.
 * 
 * This module provides:
 * - FEATURE_COMPUTATIONS constant mapping feature names to computation functions
 * - computeFeatureData() function to execute feature computations
 * - FeatureComputationFn type for computation function signatures
 * 
 * Each feature computation function handles parameter normalization and
 * calls the appropriate underlying computation logic (e.g., volatility,
 * dominance, markets data fetching).
 */

import { computeCurrentVolatility } from '../volatility/computeCurrent.js';
import { computeVwatr } from '../volatility/computeVwatr.js';
import { fetchAllMarketCapData, calculateDominance } from '../dominance/index.js';
import { fetchFromCoinGecko } from '../../utils/coingeckoClient.js';

/**
 * Type for feature computation functions
 */
export type FeatureComputationFn = (params?: Record<string, any>) => Promise<any>;

/**
 * Mapping of feature names to their computation functions
 */
export const FEATURE_COMPUTATIONS: Record<string, FeatureComputationFn> = {
  volatility_current: async (params?: Record<string, any>) => {
    return await computeCurrentVolatility({
      per_page: params?.per_page ? parseInt(String(params.per_page), 10) : undefined,
    });
  },

  volatility_vwatr: async (params?: Record<string, any>) => {
    // Normalize periods - can be string or array
    let periods: number[] | string | undefined = params?.periods;
    if (Array.isArray(periods)) {
      periods = periods.join(',');
    }

    return await computeVwatr({
      bag: params?.bag as string | undefined,
      periods: periods as string | undefined,
    });
  },

  dominance_current: async () => {
    const marketCapData = await fetchAllMarketCapData();
    return calculateDominance(marketCapData);
  },

  markets: async (params?: Record<string, any>) => {
    const urlParams = new URLSearchParams();
    urlParams.append('vs_currency', String(params?.vs_currency || 'usd'));
    urlParams.append('order', String(params?.order || 'market_cap_desc'));
    urlParams.append('per_page', String(params?.per_page || 100));
    urlParams.append('page', String(params?.page || 1));
    // Handle sparkline as boolean or string
    const sparkline = params?.sparkline !== undefined 
      ? (typeof params.sparkline === 'boolean' ? String(params.sparkline) : String(params.sparkline))
      : 'false';
    urlParams.append('sparkline', sparkline);
    urlParams.append('locale', String(params?.locale || 'en'));

    // Optional params
    if (params?.price_change_percentage) {
      urlParams.append('price_change_percentage', String(params.price_change_percentage));
    }
    if (params?.ids) {
      urlParams.append('ids', String(params.ids));
    }
    if (params?.category) {
      urlParams.append('category', String(params.category));
    }

    return await fetchFromCoinGecko('/coins/markets', urlParams);
  },
};

/**
 * Computes fresh data for a given feature
 */
export async function computeFeatureData(
  featureName: string,
  params?: Record<string, any>
): Promise<any> {
  const computationFn = FEATURE_COMPUTATIONS[featureName];
  if (!computationFn) {
    throw new Error(`Unknown feature: ${featureName}`);
  }

  return await computationFn(params);
}

