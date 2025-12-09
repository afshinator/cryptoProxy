// Filename: src/services/ProviderRotationStrategies.ts

/**
 * Provider Rotation Strategies
 * 
 * Defines different strategies for selecting and ordering providers from a pool
 * when making API calls. Each strategy determines the order in which providers
 * are attempted, with failover to the next provider on failure.
 */

import { ProviderName } from '../constants/ProviderNames.js';
import { FeatureName } from '../constants/FeatureNames.js';
import { VolatilityLevel } from '../constants/VolatilityLevels.js';
import { KeyValueStore } from '../core/RawDataGateway.js';
import { kvStorageGateway } from '../utils/KvStorageGateway.js';
import { getFeatureCacheKey } from './CacheKeyService.js';
import type { CachedFeatureResult } from '../config/Config.Persistent.js';
import { log, TMI, WARN } from '../utils/log.js';
import { getDecisiveVolatilityLevel } from '../utils/volatility.js';
import type { ProviderUsageAdapter } from './ProviderUsageAdapter.js';

const LOG_EMOJI = '🔄';

/**
 * Enumeration of available rotation strategies
 */
export enum RotationStrategy {
  /**
   * LOWEST_FIRST_IN_ORDER: Selects providers based on lowest usage count first.
   * If multiple providers have the same (lowest) usage, they are attempted in
   * the order they appear in the providerPool array.
   * 
   * Example with CURRENT_VOLATILITY pool [A, B, C]:
   * - First request: All usage = 0, uses A (first in order), increments A to 1
   * - Second request: A=1, B=0, C=0, uses B (lowest), increments B to 1
   * - Third request: A=1, B=1, C=0, uses C (lowest), increments C to 1
   * - Fourth request: All=1, uses A (tied, first in order), increments A to 2
   */
  LOWEST_FIRST_IN_ORDER = 'LOWEST_FIRST_IN_ORDER',
  
  /**
   * ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST: Always prioritizes providers that don't
   * require API keys (providers with "NO_KEY" in their name) before providers that
   * require keys. Within each group, orders by lowest usage first.
   */
  ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST = 'ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST',
  
  /**
   * PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE: Prefers no-key providers first,
   * but if market volatility is HIGH or EXTREME, prioritizes keyed providers
   * for better reliability. Within each group, orders by lowest usage first.
   */
  PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE = 'PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE',
  
  /**
   * ROUND_ROBIN: Cycles through providers in the order they appear in the
   * providerPool array, using usage counts to determine the current position
   * in the rotation cycle.
   */
  ROUND_ROBIN = 'ROUND_ROBIN',
}

/**
 * Result of ordering providers according to a rotation strategy
 */
export interface OrderedProvider {
  provider: ProviderName;
  usage?: number; // Usage count (if strategy uses it)
}

/**
 * Strategy function type: Takes a provider pool and usage adapter,
 * returns an ordered list of providers to attempt
 */
export type RotationStrategyFunction = (
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter,
  storageGateway?: KeyValueStore // Optional for volatility-based strategies
) => Promise<OrderedProvider[]>;

/**
 * Helper: Determines if a provider requires an API key
 */
function requiresApiKey(provider: ProviderName): boolean {
  return !provider.includes('NO_KEY');
}

/**
 * Helper: Gets current market volatility level from backend cache
 * Reuses the existing getCachedVolatilityDetails logic from utils/ttl.ts
 */
async function getCurrentVolatilityLevel(
  storageGateway?: KeyValueStore
): Promise<VolatilityLevel> {
  try {
    const gateway = storageGateway || kvStorageGateway;
    const featureKey = getFeatureCacheKey('CURRENT_VOLATILITY' as FeatureName);

    const cachedEntry = await gateway.get(featureKey);
    
    if (!cachedEntry || !cachedEntry.data) {
      return 'NORMAL'; // Default to NORMAL if no data
    }
    
    // Handle both old format (raw data) and new format (CachedFeatureResult)
    const isCachedFeatureResult =
      cachedEntry &&
      typeof cachedEntry === 'object' &&
      'data' in cachedEntry &&
      'fetchedAt' in cachedEntry &&
      'effectiveTTLSeconds' in cachedEntry;

    const volCacheEntry = isCachedFeatureResult
      ? (cachedEntry as CachedFeatureResult)
      : { data: cachedEntry, fetchedAt: Date.now(), effectiveTTLSeconds: 300 };
    
    const volData = volCacheEntry.data as { volatility1h?: number; volatility24h?: number };
    
    if (typeof volData.volatility1h === 'number' && typeof volData.volatility24h === 'number') {
      return getDecisiveVolatilityLevel(volData.volatility1h, volData.volatility24h);
    }
    
    return 'NORMAL';
  } catch (error) {
    log(`${LOG_EMOJI} Strategy: Failed to get volatility level, defaulting to NORMAL`, WARN);
    return 'NORMAL';
  }
}

/**
 * LOWEST_FIRST_IN_ORDER Strategy Implementation
 * 
 * Orders providers by usage count (lowest first), preserving original
 * order for providers with the same usage count.
 */
async function lowestFirstInOrder(
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter
): Promise<OrderedProvider[]> {
  // 1. Get usage count for each provider
  const attempts: OrderedProvider[] = [];
  for (const provider of providerPool) {
    const usage = await usageAdapter.getUsage(provider);
    attempts.push({ provider, usage });
  }

  // 2. Sort by usage (lowest first), preserving original order for ties
  // Using a stable sort: if usage is equal, maintain original order
  attempts.sort((a, b) => {
    const usageDiff = (a.usage ?? 0) - (b.usage ?? 0);
    if (usageDiff !== 0) {
      return usageDiff;
    }
    // If usage is equal, maintain original order (stable sort)
    return providerPool.indexOf(a.provider) - providerPool.indexOf(b.provider);
  });

  log(
    `${LOG_EMOJI} Strategy: LOWEST_FIRST_IN_ORDER ordered providers: ${attempts.map((a) => `${a.provider}:${a.usage ?? 0}`).join(", ")}`,
    TMI
  );

  return attempts;
}

/**
 * ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST Strategy Implementation
 * 
 * Separates providers into no-key and keyed groups, then orders each group
 * by lowest usage first. No-key providers are always attempted before keyed.
 */
async function alwaysHitNoKeyFirst(
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter
): Promise<OrderedProvider[]> {
  // 1. Get usage count for each provider
  const attempts: OrderedProvider[] = [];
  for (const provider of providerPool) {
    const usage = await usageAdapter.getUsage(provider);
    attempts.push({ provider, usage });
  }

  // 2. Separate into no-key and keyed groups
  const noKeyProviders: OrderedProvider[] = [];
  const keyedProviders: OrderedProvider[] = [];
  
  for (const attempt of attempts) {
    if (requiresApiKey(attempt.provider)) {
      keyedProviders.push(attempt);
    } else {
      noKeyProviders.push(attempt);
    }
  }

  // 3. Sort each group by usage (lowest first), preserving original order for ties
  const sortByUsage = (a: OrderedProvider, b: OrderedProvider) => {
    const usageDiff = (a.usage ?? 0) - (b.usage ?? 0);
    if (usageDiff !== 0) {
      return usageDiff;
    }
    return providerPool.indexOf(a.provider) - providerPool.indexOf(b.provider);
  };
  
  noKeyProviders.sort(sortByUsage);
  keyedProviders.sort(sortByUsage);

  // 4. Combine: no-key first, then keyed
  const ordered = [...noKeyProviders, ...keyedProviders];

  log(
    `${LOG_EMOJI} Strategy: ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST ordered providers: ${ordered.map((a) => `${a.provider}:${a.usage ?? 0}`).join(", ")}`,
    TMI
  );

  return ordered;
}

/**
 * PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE Strategy Implementation
 * 
 * If market volatility is HIGH or EXTREME, prioritizes keyed providers.
 * Otherwise, prioritizes no-key providers. Within each group, orders by lowest usage.
 */
async function preferNoKeyUnlessVolatile(
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter,
  storageGateway?: KeyValueStore
): Promise<OrderedProvider[]> {
  // 1. Check current volatility
  const volatilityLevel = await getCurrentVolatilityLevel(storageGateway);
  const isVolatile = volatilityLevel === 'HIGH' || volatilityLevel === 'EXTREME';

  // 2. Get usage count for each provider
  const attempts: OrderedProvider[] = [];
  for (const provider of providerPool) {
    const usage = await usageAdapter.getUsage(provider);
    attempts.push({ provider, usage });
  }

  // 3. Separate into no-key and keyed groups
  const noKeyProviders: OrderedProvider[] = [];
  const keyedProviders: OrderedProvider[] = [];
  
  for (const attempt of attempts) {
    if (requiresApiKey(attempt.provider)) {
      keyedProviders.push(attempt);
    } else {
      noKeyProviders.push(attempt);
    }
  }

  // 4. Sort each group by usage (lowest first), preserving original order for ties
  const sortByUsage = (a: OrderedProvider, b: OrderedProvider) => {
    const usageDiff = (a.usage ?? 0) - (b.usage ?? 0);
    if (usageDiff !== 0) {
      return usageDiff;
    }
    return providerPool.indexOf(a.provider) - providerPool.indexOf(b.provider);
  };
  
  noKeyProviders.sort(sortByUsage);
  keyedProviders.sort(sortByUsage);

  // 5. Combine based on volatility: if volatile, keyed first; otherwise, no-key first
  const ordered = isVolatile ? [...keyedProviders, ...noKeyProviders] : [...noKeyProviders, ...keyedProviders];

  log(
    `${LOG_EMOJI} Strategy: PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE (volatility: ${volatilityLevel}, isVolatile: ${isVolatile}) ordered providers: ${ordered.map((a) => `${a.provider}:${a.usage ?? 0}`).join(", ")}`,
    TMI
  );

  return ordered;
}

/**
 * ROUND_ROBIN Strategy Implementation
 * 
 * Cycles through providers in the order they appear in providerPool.
 * Uses the sum of all usage counts to determine the current position in the cycle.
 */
async function roundRobin(
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter
): Promise<OrderedProvider[]> {
  // 1. Get usage count for each provider
  const attempts: OrderedProvider[] = [];
  let totalUsage = 0;
  for (const provider of providerPool) {
    const usage = await usageAdapter.getUsage(provider);
    attempts.push({ provider, usage });
    totalUsage += usage;
  }

  // 2. Calculate the starting index for this round
  // Use total usage modulo pool size to determine where to start in the cycle
  const startIndex = totalUsage % providerPool.length;

  // 3. Rotate the array to start at the calculated index
  const ordered: OrderedProvider[] = [];
  for (let i = 0; i < providerPool.length; i++) {
    const index = (startIndex + i) % providerPool.length;
    ordered.push(attempts[index]);
  }

  log(
    `${LOG_EMOJI} Strategy: ROUND_ROBIN (total usage: ${totalUsage}, start index: ${startIndex}) ordered providers: ${ordered.map((a) => `${a.provider}:${a.usage ?? 0}`).join(", ")}`,
    TMI
  );

  return ordered;
}

/**
 * Strategy function registry
 */
const STRATEGY_FUNCTIONS: Record<RotationStrategy, RotationStrategyFunction> = {
  [RotationStrategy.LOWEST_FIRST_IN_ORDER]: lowestFirstInOrder,
  [RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST]: alwaysHitNoKeyFirst,
  [RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE]: preferNoKeyUnlessVolatile,
  [RotationStrategy.ROUND_ROBIN]: roundRobin,
};

/**
 * Applies a rotation strategy to order providers for API calls
 * 
 * @param strategy - The rotation strategy to use
 * @param providerPool - The pool of available providers
 * @param usageAdapter - Adapter for getting usage counts
 * @param storageGateway - Optional storage gateway for volatility-based strategies
 * @returns Ordered list of providers to attempt (in order)
 */
export async function applyRotationStrategy(
  strategy: RotationStrategy,
  providerPool: ProviderName[],
  usageAdapter: ProviderUsageAdapter,
  storageGateway?: KeyValueStore
): Promise<OrderedProvider[]> {
  const strategyFunction = STRATEGY_FUNCTIONS[strategy];
  
  if (!strategyFunction) {
    log(
      `${LOG_EMOJI} Strategy: Unknown strategy ${strategy}, falling back to LOWEST_FIRST_IN_ORDER`,
      WARN
    );
    return STRATEGY_FUNCTIONS[RotationStrategy.LOWEST_FIRST_IN_ORDER](
      providerPool,
      usageAdapter,
      storageGateway
    );
  }

  return strategyFunction(providerPool, usageAdapter, storageGateway);
}
