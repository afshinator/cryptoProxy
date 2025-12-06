// Filename: test/cache/cacheManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateFeatureCache } from '../../features/cache/cacheManager.js';
import type { CacheResult } from '../../features/cache/cacheManager.js';
import { findCacheKey } from '../../features/cache/cacheUtils.js';
import { computeFeatureData } from '../../features/cache/cacheComputations.js';

// Mock the log module
vi.mock('../../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  LOG: 5,
  INFO: 7,
  TMI: 9,
}));

// Mock cacheStorage
const { mockCacheGet, mockCacheSet } = vi.hoisted(() => ({
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
}));

vi.mock('../../features/cache/cacheStorage.js', () => ({
  cacheStorage: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
  CachedData: {},
}));

// Mock computeFeatureData
vi.mock('../../features/cache/cacheComputations.js', () => ({
  computeFeatureData: vi.fn(),
  FEATURE_COMPUTATIONS: {},
}));

// Mock findCacheKey
const mockFindCacheKey = vi.fn();
vi.mock('../../features/cache/cacheUtils.js', () => ({
  findCacheKey: vi.fn(),
  normalizeParams: vi.fn(),
}));

// Mock featuresCacheConfig
vi.mock('../../features/cache/configFeaturesCache.js', () => ({
  featuresCacheConfig: {
    dominance_current: {
      cache: true,
      refresh_rate: {
        LOW: 600,
        NORMAL: 300,
        HIGH: 120,
        EXTREME: 60,
      },
      storage: 'kv',
    },
    volatility_current: {
      cache: true,
      refresh_rate: {
        LOW: 300,
        NORMAL: 180,
        HIGH: 120,
        EXTREME: 60,
      },
      storage: 'kv',
      cacheKeys: {
        'volatility_current:50': { per_page: 50 },
      },
    },
    test_no_cache: {
      cache: false,
      refresh_rate: {
        LOW: 300,
        NORMAL: 180,
        HIGH: 120,
        EXTREME: 60,
      },
      storage: 'kv',
    },
  },
}));

describe('Cache Manager', () => {
  beforeEach(() => {
    // Clear call history but keep implementations
    vi.mocked(computeFeatureData).mockClear();
    mockCacheGet.mockClear();
    mockCacheSet.mockClear();
    vi.mocked(findCacheKey).mockClear();
    
    // Mock Date.now() to return a fixed timestamp for consistent testing
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000); // 2001-09-09 01:46:40 UTC
    vi.mocked(findCacheKey).mockReturnValue('dominance_current');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateFeatureCache', () => {
    describe('forceSource = "api"', () => {
      it('should force fresh pull from API, update cache, and return fresh data', async () => {
        const mockData = { totalMarketCap: 1000000, btc: { dominance: 50 } };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {}, 'api');

        expect(computeFeatureData).toHaveBeenCalledWith('dominance_current', {});
        expect(mockCacheSet).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
        expect(result.timestamp).toBe(1000000000000);
      });

      it('should throw error if computation fails when forceSource is "api"', async () => {
        const error = new Error('API call failed');
        vi.mocked(computeFeatureData).mockRejectedValue(error);

        await expect(
          updateFeatureCache('dominance_current', 'NORMAL', {}, 'api')
        ).rejects.toThrow('API call failed');

        expect(mockCacheSet).not.toHaveBeenCalled();
      });

      it('should use cache key from findCacheKey when forceSource is "api"', async () => {
        vi.mocked(findCacheKey).mockReturnValue('custom_cache_key');
        const mockData = { test: 'data' };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        await updateFeatureCache('volatility_current', 'NORMAL', { per_page: 50 }, 'api');

        expect(findCacheKey).toHaveBeenCalledWith('volatility_current', { per_page: 50 });
        expect(mockCacheSet).toHaveBeenCalledWith(
          'custom_cache_key',
          expect.stringContaining('"test":"data"')
        );
      });
    });

    describe('forceSource = "cache"', () => {
      it('should serve from cache only when forceSource is "cache"', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000, btc: { dominance: 60 } },
          timestamp: 999000000000, // 10 seconds ago
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {}, 'cache');

        expect(mockCacheGet).toHaveBeenCalledWith('dominance_current');
        expect(computeFeatureData).not.toHaveBeenCalled();
        expect(result.data).toEqual(cachedData.data);
        expect(result.cached).toBe(true);
        expect(result.timestamp).toBe(999000000000);
      });

      it('should throw error if cache entry not found when forceSource is "cache"', async () => {
        mockCacheGet.mockResolvedValue(null);

        await expect(
          updateFeatureCache('dominance_current', 'NORMAL', {}, 'cache')
        ).rejects.toThrow("Cache entry 'dominance_current' not found");

        expect(computeFeatureData).not.toHaveBeenCalled();
      });

      it('should throw error if cache data is invalid JSON when forceSource is "cache"', async () => {
        mockCacheGet.mockResolvedValue('invalid json');

        await expect(
          updateFeatureCache('dominance_current', 'NORMAL', {}, 'cache')
        ).rejects.toThrow();
      });
    });

    describe('normal cache behavior', () => {
      it('should return fresh data when cache is missing', async () => {
        mockCacheGet.mockResolvedValue(null);
        const mockData = { totalMarketCap: 1000000 };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(mockCacheGet).toHaveBeenCalled();
        expect(computeFeatureData).toHaveBeenCalled();
        expect(mockCacheSet).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
      });

      it('should return cached data when cache is fresh', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 1000000000000 - (150 * 1000), // 150 seconds ago (within NORMAL refresh rate of 300s)
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(mockCacheGet).toHaveBeenCalled();
        expect(computeFeatureData).not.toHaveBeenCalled();
        expect(result.data).toEqual(cachedData.data);
        expect(result.cached).toBe(true);
        expect(result.timestamp).toBe(cachedData.timestamp);
      });

      it('should compute fresh data when cache is stale', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 999000000000, // 1000 seconds ago (stale for NORMAL refresh rate of 300s)
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));
        const freshData = { totalMarketCap: 3000000 };
        vi.mocked(computeFeatureData).mockResolvedValue(freshData);
        mockCacheSet.mockResolvedValue(undefined);

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(mockCacheGet).toHaveBeenCalled();
        expect(computeFeatureData).toHaveBeenCalled();
        expect(mockCacheSet).toHaveBeenCalled();
        expect(result.data).toEqual(freshData);
        expect(result.cached).toBe(false);
      });

      it('should return stale cached data if computation fails', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 999000000000, // stale
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));
        vi.mocked(computeFeatureData).mockRejectedValue(new Error('API failed'));

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(result.data).toEqual(cachedData.data);
        expect(result.cached).toBe(true);
        expect(result.timestamp).toBe(999000000000);
      });

      it('should compute fresh data if cache parse fails', async () => {
        mockCacheGet.mockResolvedValue('invalid json');
        const mockData = { totalMarketCap: 1000000 };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(computeFeatureData).toHaveBeenCalled();
        expect(mockCacheSet).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
      });

      it('should compute fresh data if storage read fails', async () => {
        mockCacheGet.mockRejectedValue(new Error('Storage error'));
        const mockData = { totalMarketCap: 1000000 };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        const result = await updateFeatureCache('dominance_current', 'NORMAL', {});

        expect(computeFeatureData).toHaveBeenCalled();
        expect(mockCacheSet).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
      });

      it('should throw error if computation fails after storage read failure', async () => {
        mockCacheGet.mockRejectedValue(new Error('Storage error'));
        vi.mocked(computeFeatureData).mockRejectedValue(new Error('Computation failed'));

        await expect(
          updateFeatureCache('dominance_current', 'NORMAL', {})
        ).rejects.toThrow('Computation failed');
      });
    });

    describe('feature configuration', () => {
      it('should compute fresh data if feature is not configured for caching', async () => {
        const mockData = { test: 'data' };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);

        const result = await updateFeatureCache('test_no_cache', 'NORMAL', {});

        expect(mockCacheGet).not.toHaveBeenCalled();
        expect(computeFeatureData).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
      });

      it('should throw error if feature not found in config', async () => {
        await expect(
          updateFeatureCache('nonexistent_feature', 'NORMAL', {})
        ).rejects.toThrow("Feature 'nonexistent_feature' not found in featuresCacheConfig");
      });

      it('should compute fresh data if cache key not found in config', async () => {
        vi.mocked(findCacheKey).mockReturnValue(null);
        const mockData = { test: 'data' };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);

        const result = await updateFeatureCache('volatility_current', 'NORMAL', { per_page: 100 });

        expect(mockCacheGet).not.toHaveBeenCalled();
        expect(computeFeatureData).toHaveBeenCalled();
        expect(result.data).toEqual(mockData);
        expect(result.cached).toBe(false);
      });
    });

    describe('volatility level refresh rates', () => {
      it('should use LOW refresh rate when volatilityLevel is LOW', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 1000000000000 - (200 * 1000), // 200 seconds ago (well within LOW refresh rate of 600s)
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));

        const result = await updateFeatureCache('dominance_current', 'LOW', {});

        expect(result.cached).toBe(true);
        expect(computeFeatureData).not.toHaveBeenCalled();
      });

      it('should use HIGH refresh rate when volatilityLevel is HIGH', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 1000000000000 - (40 * 1000), // 40 seconds ago (well within HIGH refresh rate of 120s)
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));

        const result = await updateFeatureCache('dominance_current', 'HIGH', {});

        expect(result.cached).toBe(true);
        expect(computeFeatureData).not.toHaveBeenCalled();
      });

      it('should use EXTREME refresh rate when volatilityLevel is EXTREME', async () => {
        const cachedData = {
          data: { totalMarketCap: 2000000 },
          timestamp: 1000000000000 - (10 * 1000), // 10 seconds ago (well within EXTREME refresh rate of 60s)
        };
        mockCacheGet.mockResolvedValue(JSON.stringify(cachedData));

        const result = await updateFeatureCache('dominance_current', 'EXTREME', {});

        expect(result.cached).toBe(true);
        expect(computeFeatureData).not.toHaveBeenCalled();
      });
    });

    describe('parameters', () => {
      it('should pass params to computeFeatureData', async () => {
        mockCacheGet.mockResolvedValue(null);
        const mockData = { test: 'data' };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        await updateFeatureCache('volatility_current', 'NORMAL', { per_page: 50 });

        expect(computeFeatureData).toHaveBeenCalledWith('volatility_current', { per_page: 50 });
      });

      it('should use findCacheKey with params', async () => {
        vi.mocked(findCacheKey).mockReturnValue('volatility_current:50');
        mockCacheGet.mockResolvedValue(null);
        const mockData = { test: 'data' };
        vi.mocked(computeFeatureData).mockResolvedValue(mockData);
        mockCacheSet.mockResolvedValue(undefined);

        await updateFeatureCache('volatility_current', 'NORMAL', { per_page: 50 });

        expect(findCacheKey).toHaveBeenCalledWith('volatility_current', { per_page: 50 });
        expect(mockCacheGet).toHaveBeenCalledWith('volatility_current:50');
      });
    });
  });
});

