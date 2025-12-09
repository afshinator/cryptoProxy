# Cache Feature Tests

This directory contains tests for the cache and provider rotation system.

## Directory Structure

- **`unit/`** - Unit tests for individual components
  - `FeatureResolver.test.ts` - Tests for feature resolution, cache checking, and TTL validation
  - `RawDataGateway.test.ts` - Tests for raw data fetching, cache checking in rotation order, and storage
  - `TTL.test.ts` - Tests for TTL calculation with volatility and user role constraints
  - `ProviderRotationStrategies.test.ts` - Tests for all rotation strategies
  - `CacheKeyService.test.ts` - Tests for cache key generation

- **`endToEnd/`** - End-to-end tests covering full flows from CACHE.md
  - `featureResolution.test.ts` - Full feature resolution flow (cache hits, misses, dependencies)
  - `providerRotation.test.ts` - Provider rotation with cache checking in strategy order
  - `ttlAndVolatility.test.ts` - TTL calculation with volatility integration and cache validation

## Test Coverage

### Unit Tests
- Feature cache validation and TTL checking
- Raw data cache checking in rotation order
- TTL calculation with volatility multipliers
- All four rotation strategies
- Cache key generation and determinism

### End-to-End Tests
- Complete request-to-response flow
- Cache hit and miss scenarios
- Provider rotation respecting cache
- Volatility-based TTL adjustment
- User role TTL constraints
- Expired cache handling

## Running Tests

```bash
# Run all cache tests
npm test test/cache

# Run only unit tests
npm test test/cache/unit

# Run only end-to-end tests
npm test test/cache/endToEnd
```
