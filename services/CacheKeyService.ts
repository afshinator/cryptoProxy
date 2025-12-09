// Filename: src/services/CacheKeyService.ts

import { FeatureName } from "../constants/FeatureNames.js";
import { ProviderName } from "../constants/ProviderNames.js";
import { log, TMI } from "../utils/log.js";

// Key Service specific emoji
const LOG_EMOJI = "🔑";

/**
 * Interface defining the parameters needed to identify a unique piece of raw data.
 * This should match the UsableEndpoint definition from configFeaturesCache.ts (to be created later).
 */
export interface RawDependencyKeyParams {
  /** The external API endpoint path (e.g., '/coins/markets') */
  endpointPath: string;
  /** The primary provider being used for this raw fetch, determined at runtime. */
  provider: ProviderName;
  /** Query parameters, alphabetized and stringified for deterministic key generation. */
  queryParams: Record<string, string | number>;
  /** Unique ID for the specific resource (e.g., coin ID, fiat currency) */
  resourceId?: string;
  /** Denotes if the data is historical/large (Blob) or current (KV). */
  isHistorical?: boolean;
}

// --- KV/Blob Key Prefixes ---
export const KEY_PREFIXES = {
  FEATURE: "feature:",
  RAW_DATA: "raw:",
  ROTATION_USAGE: "usage:provider:",
  TRACKING: "tracking:",
};

// --- Private Utility ---

/**
 * Converts a query parameters object into a sorted, deterministic string.
 * Keys are sorted alphabetically to ensure the same parameters yield the same string.
 */
function getSortedQueryString(params: Record<string, string | number>): string {
  const keys = Object.keys(params).sort();
  const parts = keys.map((key) => `${key}_${params[key]}`);
  return parts.join("&");
}

// --- Public Key Generation Functions ---

/**
 * Generates a key for a final, calculated Feature result (e.g., DOMINANCE_VIEW_90D).
 * @param featureName - The name of the calculated feature.
 * @returns The Vercel KV key.
 */
export function getFeatureCacheKey(featureName: FeatureName): string {
  const key = `${KEY_PREFIXES.FEATURE}${featureName}`;
  log(`${LOG_EMOJI} Key Service: Feature Key for ${featureName} -> ${key}`, TMI);
  return key;
}

/**
 * Generates a key for a raw, unprocessed API response based on endpoint, provider, and params.
 * This key is deterministic and ensures the same API call always maps to the same cache entry.
 * @param params - Parameters defining the raw API call.
 * @returns The Vercel KV/Blob key.
 */
export function getRawDataCacheKey(params: RawDependencyKeyParams): string {
  const { endpointPath, provider, queryParams, resourceId, isHistorical } = params;

  // 1. Create a stable, sorted query string to ensure determinism
  const sortedQuery = getSortedQueryString(queryParams);

  // 2. Build the unique identifier part
  const identifier = [
    endpointPath,
    sortedQuery,
    resourceId,
    isHistorical ? "historical" : "current",
  ]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-zA-Z0-9_:-]/g, ""); // Basic sanitization

  // 3. Assemble the final key with prefix and provider
  const prefix = KEY_PREFIXES.RAW_DATA;
  const key = `${prefix}${provider}:${identifier}`;

  log(`${LOG_EMOJI} Key Service: Raw Data Key for ${provider}${endpointPath} -> ${key}`, TMI);
  return key;
}

/**
 * Generates the key used for tracking the usage count of a specific API provider.
 * This key is used by the ProviderRotationService.
 * @param provider - The name of the API provider.
 * @returns The Vercel KV key.
 */
export function getProviderUsageKey(provider: ProviderName): string {
  const key = `${KEY_PREFIXES.ROTATION_USAGE}${provider}`;
  log(`${LOG_EMOJI} Key Service: Usage Key for ${provider} -> ${key}`, TMI);
  return key;
}

/**
 * Generates the key for telemetry data (e.g., total feature requests).
 * @param metricType - 'feature', 'widget', or 'raw_api'.
 * @param id - The specific feature/widget/user ID.
 * @param isDaily - If true, returns the short-term tracking key (with expiry).
 * If false, returns the long-term total key (no expiry).
 * @returns The Vercel KV key.
 */
export function getTelemetryKey(
  metricType: "feature" | "widget" | "raw_api",
  id: string,
  isDaily: boolean
): string {
  const prefix = KEY_PREFIXES.TRACKING;
  const suffix = isDaily ? "daily" : "all_time";
  const key = `${prefix}${metricType}:${id}:${suffix}`;
  log(
    `${LOG_EMOJI} Key Service: Telemetry Key for ${metricType}:${id} (Daily=${isDaily}) -> ${key}`,
    TMI
  );
  return key;
}
