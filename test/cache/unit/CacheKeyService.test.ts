// Filename: test/cache/unit/CacheKeyService.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFeatureCacheKey,
  getRawDataCacheKey,
  getProviderUsageKey,
  KEY_PREFIXES,
} from '../../../services/CacheKeyService.js';
import { FeatureName } from '../../../constants/FeatureNames.js';
import { ProviderName } from '../../../constants/ProviderNames.js';

// Mock log
vi.mock('../../../utils/log.js', () => ({
  log: vi.fn(),
  TMI: 9,
}));

describe('CacheKeyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeatureCacheKey', () => {
    it('should generate feature cache key with correct prefix', () => {
      const key = getFeatureCacheKey('CURRENT_VOLATILITY' as FeatureName);
      expect(key).toBe('feature:CURRENT_VOLATILITY');
      expect(key.startsWith(KEY_PREFIXES.FEATURE)).toBe(true);
    });

    it('should generate different keys for different features', () => {
      const key1 = getFeatureCacheKey('CURRENT_VOLATILITY' as FeatureName);
      const key2 = getFeatureCacheKey('DOMINANCE_VIEW_90D' as FeatureName);
      expect(key1).not.toBe(key2);
    });
  });

  describe('getRawDataCacheKey', () => {
    it('should generate raw data cache key with provider and endpoint', () => {
      const key = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: { vs_currency: 'usd', per_page: 50 },
      });

      expect(key.startsWith(KEY_PREFIXES.RAW_DATA)).toBe(true);
      expect(key).toContain('COINGECKO_FREE_NO_KEY');
      expect(key).toContain('/coins/markets');
    });

    it('should generate deterministic keys for same parameters', () => {
      const params = {
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY' as ProviderName,
        queryParams: { vs_currency: 'usd', per_page: 50 },
      };

      const key1 = getRawDataCacheKey(params);
      const key2 = getRawDataCacheKey(params);

      expect(key1).toBe(key2);
    });

    it('should handle query params in sorted order', () => {
      const key1 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: { per_page: 50, vs_currency: 'usd' },
      });

      const key2 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: { vs_currency: 'usd', per_page: 50 },
      });

      expect(key1).toBe(key2);
    });

    it('should include historical flag in key', () => {
      const key1 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: {},
        isHistorical: false,
      });

      const key2 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: {},
        isHistorical: true,
      });

      expect(key1).not.toBe(key2);
      expect(key2).toContain('historical');
    });

    it('should include resourceId in key when provided', () => {
      const key = getRawDataCacheKey({
        endpointPath: '/coins/bitcoin',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: {},
        resourceId: 'bitcoin',
      });

      expect(key).toContain('bitcoin');
    });

    it('should generate different keys for different providers', () => {
      const key1 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINGECKO_FREE_NO_KEY',
        queryParams: { vs_currency: 'usd' },
      });

      const key2 = getRawDataCacheKey({
        endpointPath: '/coins/markets',
        provider: 'COINMARKETCAP_FREE_WITH_KEY',
        queryParams: { vs_currency: 'usd' },
      });

      expect(key1).not.toBe(key2);
    });
  });

  describe('getProviderUsageKey', () => {
    it('should generate usage key with correct prefix', () => {
      const key = getProviderUsageKey('COINGECKO_FREE_NO_KEY');
      expect(key).toBe('usage:provider:COINGECKO_FREE_NO_KEY');
      expect(key.startsWith(KEY_PREFIXES.ROTATION_USAGE)).toBe(true);
    });

    it('should generate different keys for different providers', () => {
      const key1 = getProviderUsageKey('COINGECKO_FREE_NO_KEY');
      const key2 = getProviderUsageKey('COINMARKETCAP_FREE_WITH_KEY');
      expect(key1).not.toBe(key2);
    });
  });
});
