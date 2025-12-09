// Filename: src/config/ConfigFeaturesCache.interface.ts

import type { FeatureName } from "../constants/FeatureNames.js";
import type { ProviderName } from "../constants/ProviderNames.js";
import { RotationStrategy } from "../services/ProviderRotationStrategies.js";

/**
 * Interface defining a specific external API endpoint (or proxy)
 * needed to fetch raw data. This is what the RawDataGateway will execute.
 */
export interface UsableEndpoint {
  /** The abstract name of the raw data. Used to retrieve the RawDataCacheKey. */
  name: FeatureName;
  /** The base endpoint path (e.g., '/simple/price' for CoinGecko). */
  endpointPath: string;
  /** The specific query parameters for this endpoint. */
  queryParams: Record<string, string | number>;
  /** If true, data is large/historical and should use Blob storage on backend. */
  isHistorical?: boolean;
}

/**
 * Interface for the function that computes the final Feature output from raw data.
 * The output type T is the final structure stored in the feature cache.
 */
export interface CalculationFunction<T = any> {
  (rawDependencies: Record<FeatureName, any>): T;
}

/**
 * Interface for the minimum and maximum TTL (in seconds) for a feature.
 * The final TTL will be clamped by volatility and the user's minimum_ttl_seconds.
 */
export interface TTLBounds {
  /** The standard TTL before adjustment for volatility or user role, in seconds. */
  default: number;
  /** The absolute minimum freshness (seconds) the feature is allowed to have. */
  min: number;
  /** The absolute maximum staleness (seconds) the feature is allowed to reach. */
  max: number;
}

/**
 * Interface defining the entire configuration for a single Feature.
 */
export interface FeatureConfig<T = any> {
  /** The function that computes the final feature result. */
  calculate: CalculationFunction<T>;
  /** The raw data endpoints this feature relies on. */
  rawDependencies: UsableEndpoint[];
  /** The pool of providers allowed to satisfy these rawDependencies. */
  providerPool: ProviderName[];
  /** The minimum and maximum TTL for the feature's cache entry. */
  ttlBounds: TTLBounds;
  /** The rotation strategy for selecting providers from the pool. */
  rotationStrategy: RotationStrategy; // REQUIRED, not optional
}
