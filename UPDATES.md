# Backend Implementation Updates: Provider Rotation Strategies

This document outlines the changes needed to implement configurable provider rotation strategies in the backend codebase. The frontend implementation is complete; these changes mirror that implementation for the backend.

## Overview

The provider rotation system has been refactored to support multiple configurable strategies for selecting providers from a pool. Previously, the system used a hardcoded "lowest usage first" approach. Now, each feature can specify its own rotation strategy via the `rotationStrategy` property in its configuration.

## Required Changes

### 1. Create `services/ProviderRotationStrategies.ts`

Copy the entire file from the frontend implementation. This file contains:
- `RotationStrategy` enum with four strategies:
  - `LOWEST_FIRST_IN_ORDER`
  - `ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST`
  - `PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE`
  - `ROUND_ROBIN`
- Strategy function implementations
- `applyRotationStrategy()` function

**Backend-Specific Note:** The `PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE` strategy reads volatility from `usePersistedStore.getState().featureCache['CURRENT_VOLATILITY']`. On the backend, you'll need to modify `getCurrentVolatilityLevel()` to read from your backend cache (e.g., Redis/KV store) instead of the Zustand store.

```typescript
// Example backend modification for getCurrentVolatilityLevel():
function getCurrentVolatilityLevel(): VolatilityLevel {
  try {
    // Replace this line:
    // const cache = usePersistedStore.getState().featureCache;
    
    // With your backend cache access:
    const volCacheEntry = await storageGateway.get('feature:CURRENT_VOLATILITY');
    
    if (!volCacheEntry?.data) {
      return 'NORMAL';
    }
    
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
```

### 2. Update `config/ConfigFeaturesCache.interface.ts`

**Add import:**
```typescript
import { RotationStrategy } from "@/services/ProviderRotationStrategies";
```

**Update `FeatureConfig` interface:**
```typescript
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
```

### 3. Update `core/RawDataGateway.ts`

**Add import:**
```typescript
import { applyRotationStrategy, RotationStrategy } from "@/services/ProviderRotationStrategies";
```

**Update `executeApiCallWithRotation` method signature:**
```typescript
// BEFORE:
private static async executeApiCallWithRotation(
  rawDep: UsableEndpoint,
  providerPool: ProviderName[],
  localKeys: LocalApiKeys,
  usageAdapter: ProviderUsageAdapter
): Promise<{ data: any; providerUsed: ProviderName }> {
  // Hardcoded sorting logic...
}

// AFTER:
private static async executeApiCallWithRotation(
  rawDep: UsableEndpoint,
  providerPool: ProviderName[],
  localKeys: LocalApiKeys,
  usageAdapter: ProviderUsageAdapter,
  rotationStrategy: RotationStrategy // REQUIRED, no default
): Promise<{ data: any; providerUsed: ProviderName }> {
  // 1. Apply rotation strategy to get ordered provider list
  const orderedProviders = await applyRotationStrategy(
    rotationStrategy,
    providerPool,
    usageAdapter
  );

  log(
    `${LOG_EMOJI} Gateway: Prepared rotation list (strategy: ${rotationStrategy}): ${orderedProviders.map((a) => `${a.provider}${a.usage !== undefined ? `:${a.usage}` : ''}`).join(", ")}`,
    TMI
  );

  // 2. Loop through providers in strategy-determined order (failover is implicit)
  for (const { provider } of orderedProviders) {
    // ... existing failover logic unchanged ...
  }
}
```

**Update `fetchRawDependency` method signature and cache check logic:**
```typescript
// BEFORE (WRONG - always checks cache for first provider):
public static async fetchRawDependency(
  rawDep: UsableEndpoint,
  providerPool: ProviderName[],
  localKeys: LocalApiKeys,
  storageGateway: StorageGateway,
  usageAdapter: ProviderUsageAdapter
): Promise<any> {
  // 1. Determine Cache Key (using the first provider as a canonical name for the key)
  const keyParams: RawDependencyKeyParams = {
    endpointPath: rawDep.endpointPath,
    provider: providerPool[0], // ❌ Always uses first provider
    queryParams: rawDep.queryParams,
    isHistorical: rawDep.isHistorical,
  };
  const cacheKey = getRawDataCacheKey(keyParams);
  
  // 2. Check Cache (only for first provider)
  const cachedEntry = await storageGateway.get(cacheKey);
  // ... rest of logic
}

// AFTER (CORRECT - checks cache in rotation order):
public static async fetchRawDependency(
  rawDep: UsableEndpoint,
  providerPool: ProviderName[],
  localKeys: LocalApiKeys,
  storageGateway: StorageGateway,
  usageAdapter: ProviderUsageAdapter,
  rotationStrategy: RotationStrategy // REQUIRED, no default
): Promise<any> {
  // 1. Apply rotation strategy to determine provider order
  const orderedProviders = await applyRotationStrategy(
    rotationStrategy,
    providerPool,
    usageAdapter,
    storageGateway
  );

  // 2. Check cache for each provider in rotation order (preferred first)
  for (const { provider } of orderedProviders) {
    const keyParams: RawDependencyKeyParams = {
      endpointPath: rawDep.endpointPath,
      provider: provider, // ✅ Uses provider from rotation strategy
      queryParams: rawDep.queryParams,
      isHistorical: rawDep.isHistorical,
    };
    const cacheKey = getRawDataCacheKey(keyParams);

    const cachedEntry = rawDep.isHistorical
      ? await storageGateway.getBlob(cacheKey)
      : await storageGateway.get(cacheKey);

    if (cachedEntry) {
      // Validate cache entry structure and TTL
      if (isCachedRawDataResult && ageSeconds < cached.ttlSeconds) {
        // Cache HIT - return cached data
        return cached.data;
      } else {
        // Cache EXPIRED - continue to next provider
        continue;
      }
    }
  }

  // 3. No valid cache found for any provider - Execute API Call with Rotation/Failover
  const { data, providerUsed } = await this.executeApiCallWithRotation(
    rawDep,
    providerPool,
    localKeys,
    usageAdapter,
    rotationStrategy,
    storageGateway
  );
  
  // 4. Store result using the provider that was actually used
  const usedProviderKeyParams: RawDependencyKeyParams = {
    endpointPath: rawDep.endpointPath,
    provider: providerUsed, // ✅ Store with the provider that was actually used
    queryParams: rawDep.queryParams,
    isHistorical: rawDep.isHistorical,
  };
  const usedProviderCacheKey = getRawDataCacheKey(usedProviderKeyParams);
  await storageGateway.set(usedProviderCacheKey, wrappedResult, ttl);
}
```

### 4. Update `core/FeatureResolver.ts`

**Update `resolveFeature` method:**
```typescript
// In the dependency fetching section, update the RawDataGateway.fetchRawDependency call:

// BEFORE:
const data = await RawDataGateway.fetchRawDependency(
  rawDep,
  providerPool,
  localKeys,
  storageGateway as unknown as StorageGateway,
  usageAdapter
);

// AFTER:
const data = await RawDataGateway.fetchRawDependency(
  rawDep,
  providerPool,
  localKeys,
  storageGateway as unknown as StorageGateway,
  usageAdapter,
  config.rotationStrategy // Pass rotation strategy from feature config
);
```

### 5. Update `config/configFeaturesCache.ts`

**Add import:**
```typescript
import { RotationStrategy } from "../services/ProviderRotationStrategies";
```

**Add `rotationStrategy` to ALL feature configs:**
```typescript
export const featureConfig: Record<FeatureName, FeatureConfig> = {
  CURRENT_VOLATILITY: {
    calculate: (rawDependencies) => {
      // ... existing calculation logic ...
    },
    rawDependencies: [
      // ... existing dependencies ...
    ],
    providerPool: [
      "COINGECKO_FREE_WITH_KEY",
      "COINMARKETCAP_FREE_WITH_KEY",
      "COINGECKO_FREE_NO_KEY",
    ],
    ttlBounds: {
      default: 120,
      min: 30,
      max: 300,
    },
    rotationStrategy: RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE, // ADD THIS
  },
  
  RAW_MARKETS_TOP_50: {
    // ... existing config ...
    rotationStrategy: RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST, // ADD THIS
  },
  
  DOMINANCE_VIEW_90D: {
    // ... existing config ...
    rotationStrategy: RotationStrategy.LOWEST_FIRST_IN_ORDER, // ADD THIS
  },
  
  // ... all other features must also include rotationStrategy ...
};
```

**Note:** All features must specify a `rotationStrategy`. There is no default value.

### 6. Update Test Files

Any test files that call `RawDataGateway.fetchRawDependency()` or `executeApiCallWithRotation()` must be updated to include the `rotationStrategy` parameter:

```typescript
// Add import:
import { RotationStrategy } from '../../services/ProviderRotationStrategies';

// Update all calls:
const result = await RawDataGateway.fetchRawDependency(
  rawDep,
  providerPool,
  localKeys,
  mockStorageGateway,
  mockUsageAdapter,
  RotationStrategy.LOWEST_FIRST_IN_ORDER // Add this parameter
);
```

## Critical Fix: Cache Check Respects Rotation Strategy

### Problem

The initial implementation had a bug where the cache was always checked for `providerPool[0]` (the first provider in the pool), regardless of the rotation strategy. This meant that even if a rotation strategy preferred a different provider (e.g., `COINGECKO_FREE_NO_KEY`), the system would check the cache for the first provider in the pool (e.g., `COINGECKO_FREE_WITH_KEY`), find cached data, and return it without making an API call. This effectively bypassed the rotation strategy.

### Solution

The cache check now respects the rotation strategy by:

1. **Applying the rotation strategy first** to determine provider order
2. **Checking the cache for each provider in rotation order** (preferred first)
3. **Using the first valid cache entry found**, or making an API call if no valid cache exists
4. **Storing results with the provider that was actually used** (not the first in pool)

### Implementation Details

The fix is implemented in `core/RawDataGateway.ts` in the `fetchRawDependency` method:

- **Before**: Always checked cache for `providerPool[0]`
- **After**: Applies rotation strategy, then checks cache for each provider in order
- **Storage**: Stores cached data using the provider that was actually used (`providerUsed`), not the first provider

This ensures that:
- `ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST` checks free providers' cache first
- `PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE` checks the appropriate provider's cache based on volatility
- Each provider's cache is independent and checked in strategy-determined order
- The rotation strategy cannot be bypassed by cached data from a different provider

## Strategy Selection Guidelines

Choose the appropriate strategy for each feature based on your requirements:

- **`LOWEST_FIRST_IN_ORDER`**: Default choice for balanced usage across all providers. Good for general-purpose features.
- **`ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST`**: Use when you want to minimize API key usage and prefer free tier providers. Good for non-critical features.
- **`PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE`**: Use for features that benefit from free providers during normal conditions but need reliable keyed providers during volatile market periods. Good for `CURRENT_VOLATILITY` and similar time-sensitive features.
- **`ROUND_ROBIN`**: Use when you want predictable, evenly-distributed usage across providers regardless of usage counts. Good for testing or when you want strict rotation.

## Backend-Specific Considerations

1. **Usage Adapter**: Ensure your backend `ProviderUsageAdapter` implementation (e.g., `KvUsageAdapter`) correctly implements:
   - `getUsage(provider: ProviderName): Promise<number>`
   - `incrementUsage(provider: ProviderName): Promise<void>`
   - `resetUsage(provider: ProviderName): Promise<void>`

2. **Volatility Detection**: The `PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE` strategy needs access to `CURRENT_VOLATILITY` cache. Modify `getCurrentVolatilityLevel()` in `ProviderRotationStrategies.ts` to read from your backend cache store instead of the Zustand store.

3. **Storage Gateway**: No changes needed to `StorageGateway` interface. The rotation strategies work with any storage implementation.

4. **No Breaking Changes**: All existing features must be updated to include `rotationStrategy` in their config. There is no default fallback.

## Migration Checklist

- [x] Copy `services/ProviderRotationStrategies.ts` from frontend
- [x] Modify `getCurrentVolatilityLevel()` for backend cache access
- [x] Update `config/ConfigFeaturesCache.interface.ts` to require `rotationStrategy`
- [x] Update `core/RawDataGateway.ts` to accept and use `rotationStrategy`
- [x] Update `core/RawDataGateway.ts` to check cache in rotation order (CRITICAL FIX)
- [x] Update `core/FeatureResolver.ts` to pass `rotationStrategy` from config
- [x] Update `config/configFeaturesCache.ts` to add `rotationStrategy` to all features
- [ ] Update all test files to include `rotationStrategy` parameter
- [x] Verify usage adapter correctly implements all required methods
- [ ] Test each rotation strategy with your backend setup
