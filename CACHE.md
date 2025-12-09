Here is a summary of the core functionality and components implemented in this data pipeline system.


## 🏗️ System Overview: Smart Caching & Provider Rotation

The primary function of this system is to serve complex feature data (like price indexes, volatility scores, etc.) to the frontend with an optimal balance of **freshness** and **efficiency**. It achieves this through dynamic cache management and intelligent rotation among multiple data providers.


### 1. 🚦 Policy & Configuration

These modules define the rules of the system:

* **`configUserRoles.ts`**: Defines the access tiers (`basic`, `user`, `TWW`, `superuser`), mapping each role to specific **Rate Limits**, a **Minimum Freshness Guarantee** (`minimum_ttl_seconds`), and a list of **`authorizedProviders`**.
* **`configFeaturesCache.ts`**: Defines the "recipe" for every feature, including its **`rawDependencies`** (what underlying data it needs), its **Default TTL bounds**, and its **`rotationStrategy`** (how providers are selected from the pool).
* **`configVolatilityTTL.ts`**: Defines how market conditions (`EXTREME`, `HIGH`, `MEDIUM`) translate into a **TTL Multiplier** to shorten cache times during volatile periods.

### 2. 🧠 Core Services

These services implement the intelligent logic using the defined policies:

* **`FeatureResolver.resolveFeature` (Orchestrator)**: The main entry point. It coordinates the entire process:
    1.  Determines the user's role and feature configuration.
    2.  Checks the feature cache and validates TTL (returns cached data if fresh).
    3.  Calculates the **Final Cache Time (TTL)** using the volatility score, feature defaults, and the user's minimum freshness guarantee.
    4.  Passes execution to the **`RawDataGateway`** for dependency fetching, using the feature's configured **`rotationStrategy`**.
* **`ProviderRotationStrategies.applyRotationStrategy`**:
    * **Functionality:** Applies a configurable rotation strategy to order providers from a pool. Each feature can specify its own strategy via `rotationStrategy` in its configuration. Available strategies:
      - **`LOWEST_FIRST_IN_ORDER`**: Selects providers with lowest usage count first, preserving original order for ties. Good for balanced usage across all providers.
      - **`ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST`**: Always prioritizes free-tier providers (no API key required) before keyed providers. Good for minimizing API key usage.
      - **`PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE`**: Prefers free providers during normal conditions, but prioritizes keyed providers during HIGH/EXTREME volatility for reliability. Good for time-sensitive features like `CURRENT_VOLATILITY`.
      - **`ROUND_ROBIN`**: Cycles through providers in a predictable rotation. Good for testing or strict rotation requirements.
* **`CacheKeyService.getRawDataCacheKey`**:
    * **Functionality:** Generates a unique, deterministic key (hash) for every raw data request based on the provider, endpoint path, query parameters (alphabetized), and resource ID. This key is used for both KV and Blob storage lookups.

### 3. ☁️ Data Storage & Cache

* **KV Store (e.g., Redis/Upstash)**: Used via the **`KvStorageGateway`** to store:
  - **Feature Cache**: Final calculated features wrapped in `CachedFeatureResult` with metadata (`data`, `fetchedAt`, `effectiveTTLSeconds`)
  - **Raw Data Cache**: API responses wrapped in `CachedRawDataResult` with metadata (`data`, `fetchedAt`, `ttlSeconds`)
  - **Provider Usage Counts**: Tracked by `KvUsageAdapter` for rotation strategies
* **Blob Store (e.g., Vercel Blob)**: Used via the **`BlobStorageGateway`** to store **large, historical** datasets that exceed KV size limits. Also stores `CachedRawDataResult` with metadata (TTL validation is manual since Blob doesn't support native expiration).

---

## 🎯 High-Level Flow (Request to Response)

1.  **Client Request**: The frontend calls `/api/feature` with `featureName`, `userRole`, and `localApiKeys`.
2.  **Feature Cache Check**: The system checks the feature cache using `feature:${featureName}` key. If found and not expired (validates TTL based on `fetchedAt` and `effectiveTTLSeconds`), returns cached result immediately.
3.  **Dependency Resolution**: For each raw dependency required by the feature:
    a.  **Raw Data Cache Check**: The system checks the raw data cache (KV/Blob) using the unique `RawDataCacheKey`. Validates TTL before returning.
    b.  **Cache Miss/Expired**: If the data is missing or expired:
        i.  **Provider Selection**: The `applyRotationStrategy()` function applies the feature's configured **`rotationStrategy`** to order providers from the pool. Strategies consider usage counts, API key requirements, and market volatility (for volatility-aware strategies).
        ii. **External Fetch**: The data is fetched from the external API, attempting providers in the strategy-determined order (with automatic failover on rate limits or errors).
        iii. **Cache Write**: The new data is wrapped in `CachedRawDataResult` (with `fetchedAt` and `ttlSeconds` metadata) and written to the appropriate cache store (KV or Blob).
        iv. **Usage Increment**: The usage count for the successfully used provider is incremented in the KV store.
4.  **Feature Calculation**: Once all dependencies are fetched, the feature's `calculate()` function processes the raw data into the final feature result.
5.  **TTL Calculation**: The backend determines the necessary freshness, dynamically adjusting the feature's default TTL based on the **user's role** and the current **market volatility** (read from `CURRENT_VOLATILITY` cache).
6.  **Feature Cache Write**: The calculated feature is wrapped in `CachedFeatureResult` (with `fetchedAt` and `effectiveTTLSeconds` metadata) and stored in the feature cache.
7.  **Response**: The requested feature data is returned to the client, along with the cache metadata (`fetchedAt`, `effectiveTTLSeconds`) for the frontend's `PersistedStore`. 