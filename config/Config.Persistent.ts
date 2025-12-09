// Filename: src/config/Config.Persistent.ts

import type { FeatureName } from '../constants/FeatureNames.js';
import type { ProviderName } from '../constants/ProviderNames.js';

// --- Types for Stored Cache Data ---

/**
 * Interface for a single cached feature result, stored on the frontend.
 * This structure mirrors the necessary metadata for cache revalidation.
 */
export interface CachedFeatureResult {
  /** The data payload itself (can be anything from a volatility score to historical markets). */
  data: any; 
  
  /** Unix timestamp (milliseconds) when the data was successfully fetched from the backend. */
  fetchedAt: number; 
  
  /** The effective TTL (in seconds) that was calculated for this specific fetch operation. */
  effectiveTTLSeconds: number; 
}

/**
 * Interface for a single cached raw data result, stored on the frontend.
 * This structure mirrors the necessary metadata for cache revalidation of raw API responses.
 */
export interface CachedRawDataResult {
  /** The raw API response data. */
  data: any;
  
  /** Unix timestamp (milliseconds) when the data was successfully fetched from the API. */
  fetchedAt: number;
  
  /** The TTL (in seconds) for this raw data cache entry. */
  ttlSeconds: number;
}

/**
 * The primary storage structure for the frontend feature cache.
 * Keyed by the abstract FeatureName.
 */
export type FeatureCache = Record<FeatureName, CachedFeatureResult | null>;

/**
 * The storage structure for raw API data cache entries.
 * Keyed by the raw data cache key (e.g., "raw:COINGECKO_FREE_WITH_KEY:/coins/markets_...").
 */
export type RawDataCache = Record<string, CachedRawDataResult | null>;

// --- Types for Stored User Keys ---

/**
 * Record of API keys provided by the user, keyed by the abstract ProviderName.
 * Example: { 'COINMARKETCAP_FREE_WITH_KEY': 'user_cmc_key_xyz' }
 */
export type LocalApiKeys = Record<ProviderName, string>;

// --- Constants for Store ---

// --- Full State Interface  ---
export interface PersistedState {
    featureCache: FeatureCache;
    rawDataCache: RawDataCache;
    localApiKeys: LocalApiKeys;
    _hasHydrated: boolean;
    // Actions: These are functions and should NOT be in the default state object!
    setFeatureCache: (cache: FeatureCache) => void;
    setCachedFeatureData: (featureName: FeatureName, data: CachedFeatureResult) => void;
    setRawDataCache: (cache: RawDataCache) => void;
    setCachedRawData: (key: string, data: CachedRawDataResult) => void;
    setLocalApiKeys: (keys: LocalApiKeys) => void;
    setLocalApiKey: (providerName: ProviderName, apiKey: string) => void;
    setHasHydrated: (state: boolean) => void;
  }
  
  // --- Constants for Store   ---
  
  export const PERSISTED_STORAGE_KEY = 'cache-v1';
  
  // Define only the persistent DATA structure defaults
  export const DEFAULT_PERSISTENT_DATA = {
    featureCache: {} as FeatureCache,
    rawDataCache: {} as RawDataCache,
    localApiKeys: {} as LocalApiKeys,
  };
