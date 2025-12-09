// Filename: src/utils/ttl.ts

import type { FeatureName } from "../constants/FeatureNames.js";
import type { UserRoleConfig } from "../config/configUserRoles.js";
import type { VolatilityLevel } from "../constants/VolatilityLevels.js";
import { featureConfig } from "../config/configFeaturesCache.js";
import { VOLATILITY_TTL_MULTIPLIERS } from "../config/configVolatilityTTL.js";
import { getDecisiveVolatilityLevel } from "./volatility.js";
import { getFeatureCacheKey } from "../services/CacheKeyService.js";
import { KeyValueStore } from "../core/RawDataGateway.js";
import { kvStorageGateway } from "./KvStorageGateway.js";
import type { CachedFeatureResult } from "../config/Config.Persistent.js";
import { log, TMI, WARN } from "./log.js";

// TTL Utility specific emoji
const LOG_EMOJI = "⏲️";

/**
 * Retrieves the current market state by consulting the CURRENT_VOLATILITY feature cache.
 * Reads from the storage gateway to get cached volatility data.
 * @param storageGateway - Optional storage gateway (defaults to kvStorageGateway singleton).
 * @returns The determined global volatility level (based on the highest score) and its multiplier.
 */
async function getCachedVolatilityDetails(
  storageGateway?: KeyValueStore
): Promise<{ level: VolatilityLevel; multiplier: number }> {
  const gateway = storageGateway || kvStorageGateway;
  const featureKey = getFeatureCacheKey("CURRENT_VOLATILITY" as FeatureName);

  try {
    const cachedEntry = await gateway.get(featureKey);

    // Check if we have valid, non-stale data in the cache
    if (!cachedEntry || !cachedEntry.data) {
      log(
        `${LOG_EMOJI} Volatility Data Missing from Cache. Defaulting to NORMAL.`,
        WARN
      );
      const normalMultiplier = VOLATILITY_TTL_MULTIPLIERS["NORMAL"] || 1.0;
      return { level: "NORMAL", multiplier: normalMultiplier };
    }

    // Handle both old format (raw data) and new format (CachedFeatureResult)
    const isCachedFeatureResult =
      cachedEntry &&
      typeof cachedEntry === "object" &&
      "data" in cachedEntry &&
      "fetchedAt" in cachedEntry &&
      "effectiveTTLSeconds" in cachedEntry;

    const volCacheEntry = isCachedFeatureResult
      ? (cachedEntry as CachedFeatureResult)
      : { data: cachedEntry, fetchedAt: Date.now(), effectiveTTLSeconds: 300 };

    // NOTE: volCacheEntry.data structure from calculateMarketVolatility: { volatility1h, volatility24h, ... }
    const volData = volCacheEntry.data as {
      volatility1h: number;
      volatility24h: number;
    };

    if (
      typeof volData.volatility1h !== "number" ||
      typeof volData.volatility24h !== "number"
    ) {
      log(
        `${LOG_EMOJI} Cached Volatility Data Invalid. Defaulting to NORMAL.`,
        WARN
      );
      const normalMultiplier = VOLATILITY_TTL_MULTIPLIERS["NORMAL"] || 1.0;
      return { level: "NORMAL", multiplier: normalMultiplier };
    }

    // 1. Determine the decisive volatility level
    const volatilityLevel = getDecisiveVolatilityLevel(
      volData.volatility1h,
      volData.volatility24h
    );

    // 2. Get the corresponding multiplier
    const multiplier = VOLATILITY_TTL_MULTIPLIERS[volatilityLevel] || 1.0;

    return { level: volatilityLevel, multiplier: multiplier };
  } catch (error) {
    log(
      `${LOG_EMOJI} Error reading volatility cache: ${error}. Defaulting to NORMAL.`,
      WARN
    );
    const normalMultiplier = VOLATILITY_TTL_MULTIPLIERS["NORMAL"] || 1.0;
    return { level: "NORMAL", multiplier: normalMultiplier };
  }
}

/**
 * Calculates the optimal Time-To-Live (TTL) in seconds for a feature cache entry.
 * NOTE: This function is ASYNCHRONOUS because it reads from the storage cache.
 * @param featureName - The feature being requested.
 * @param userConfig - The configuration object for the requesting user's role.
 * @param storageGateway - Optional storage gateway (defaults to kvStorageGateway singleton).
 * @returns The final determined TTL in seconds.
 */
export async function calculateFeatureTTL(
  featureName: FeatureName,
  userConfig: UserRoleConfig,
  storageGateway?: KeyValueStore
): Promise<number> {
  const feature = featureConfig[featureName];
  if (!feature) {
    log(
      `${LOG_EMOJI} TTL Error: Feature ${featureName} not found in configuration.`,
      TMI
    );
    return userConfig.cache_control.minimum_ttl_seconds;
  }

  // --- 1. Get the Market Volatility Multiplier (Decisive Level) ---
  // The cache read is now asynchronous using the storage gateway
  const { level: volatilityLevel, multiplier } =
    await getCachedVolatilityDetails(storageGateway);

  // --- 2. Calculate the Volatility-Clamped Feature TTL ---
  // Use default if provided, otherwise use midpoint between min and max
  const baseTTL =
    feature.ttlBounds.default ??
    Math.floor((feature.ttlBounds.min + feature.ttlBounds.max) / 2);

  let effectiveTTL = baseTTL;

  // Apply the market volatility factor.
  effectiveTTL = Math.floor(effectiveTTL * multiplier);

  // Clamp the TTL so it never falls below the feature's minimum (min TTL).
  effectiveTTL = Math.max(effectiveTTL, feature.ttlBounds.min);

  log(
    `${LOG_EMOJI} Calculated Feature TTL (Base: ${baseTTL}s, Volatility ${volatilityLevel}/${multiplier.toFixed(2)}): ${effectiveTTL}s`,
    TMI
  );

  // --- 3. Apply the User's Minimum Freshness Guarantee ---
  const userMinTTL = userConfig.cache_control.minimum_ttl_seconds;

  let finalTTL = Math.max(effectiveTTL, userMinTTL);

  // --- 4. Apply the Feature's Maximum TTL (Final Clamp) ---
  finalTTL = Math.min(finalTTL, feature.ttlBounds.max);

  log(
    `${LOG_EMOJI} Final TTL (User Min: ${userMinTTL}s, Max: ${feature.ttlBounds.max}s, Result: ${finalTTL}s)`,
    TMI
  );

  return finalTTL;
}
