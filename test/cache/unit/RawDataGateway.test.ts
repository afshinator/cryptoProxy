// Filename: test/cache/unit/RawDataGateway.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawDataGateway } from '../../../core/RawDataGateway.js';
import { RotationStrategy } from '../../../services/ProviderRotationStrategies.js';
import { ProviderName } from '../../../constants/ProviderNames.js';
import type { CachedRawDataResult } from '../../../config/Config.Persistent.js';

// Mock dependencies
vi.mock('../../../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  TMI: 9,
}));

vi.mock('../../../services/CacheKeyService.js', () => ({
  getRawDataCacheKey: vi.fn((params) => `raw:${params.provider}:${params.endpointPath}`),
}));

vi.mock('../../../services/ProviderRotationStrategies.js', () => ({
  applyRotationStrategy: vi.fn(),
  RotationStrategy: {
    LOWEST_FIRST_IN_ORDER: 'LOWEST_FIRST_IN_ORDER',
    ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST: 'ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST',
    PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE: 'PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE',
    ROUND_ROBIN: 'ROUND_ROBIN',
  },
}));

vi.mock('../../../core/ProviderClients.js', () => ({
  providerClients: {
    COINGECKO_FREE_NO_KEY: vi.fn(),
    COINGECKO_FREE_WITH_KEY: vi.fn(),
  },
}));

describe('RawDataGateway', () => {
  let mockStorageGateway: any;
  let mockUsageAdapter: any;
  let mockRawDep: any;
  let mockProviderPool: ProviderName[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageGateway = {
      get: vi.fn(),
      set: vi.fn(),
      getBlob: vi.fn(),
      putBlob: vi.fn(),
    };

    mockUsageAdapter = {
      getUsage: vi.fn().mockResolvedValue(0),
      incrementUsage: vi.fn(),
      resetUsage: vi.fn(),
    };

    mockRawDep = {
      name: 'CURRENT_VOLATILITY' as any,
      endpointPath: '/coins/markets',
      queryParams: { vs_currency: 'usd', per_page: 50 },
      isHistorical: false,
    };

    mockProviderPool = ['COINGECKO_FREE_NO_KEY', 'COINGECKO_FREE_WITH_KEY'];

    const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
    vi.mocked(applyRotationStrategy).mockResolvedValue([
      { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
      { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
    ]);
  });

  describe('fetchRawDependency', () => {
    it('should return cached data if found and not expired', async () => {
      const now = Date.now();
      const cachedResult: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 100000, // 100 seconds ago
        ttlSeconds: 300,
      };

      mockStorageGateway.get.mockResolvedValue(cachedResult);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(result).toEqual(cachedResult.data);
      expect(mockStorageGateway.get).toHaveBeenCalled();
    });

    it('should check cache in rotation order (preferred provider first)', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
      ]);

      // No cache for first provider, cache for second
      const now = Date.now();
      const cachedResult: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 100000,
        ttlSeconds: 300,
      };

      mockStorageGateway.get
        .mockResolvedValueOnce(null) // First provider (preferred) - no cache
        .mockResolvedValueOnce(cachedResult); // Second provider - has cache

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(mockStorageGateway.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(cachedResult.data);
    });

    it('should skip expired cache entries and check next provider', async () => {
      const now = Date.now();
      const expiredCache: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 400000, // 400 seconds ago (expired for 300s TTL)
        ttlSeconds: 300,
      };

      mockStorageGateway.get
        .mockResolvedValueOnce(expiredCache) // First provider - expired
        .mockResolvedValueOnce(null); // Second provider - no cache

      const { providerClients } = await import('../../../core/ProviderClients.js');
      vi.mocked(providerClients.COINGECKO_FREE_WITH_KEY).mockResolvedValue([
        { id: 'ethereum', price: 3000 },
      ]);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(mockStorageGateway.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 'ethereum', price: 3000 }]);
    });

    it('should fetch from API if no valid cache found', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      const { providerClients } = await import('../../../core/ProviderClients.js');
      const mockData = [{ id: 'bitcoin', price: 50000 }];
      vi.mocked(providerClients.COINGECKO_FREE_NO_KEY).mockResolvedValue(mockData);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(result).toEqual(mockData);
      expect(mockStorageGateway.set).toHaveBeenCalled();
      expect(mockUsageAdapter.incrementUsage).toHaveBeenCalledWith('COINGECKO_FREE_NO_KEY');
    });

    it('should store result with provider that was actually used', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 1 },
      ]);

      const { providerClients } = await import('../../../core/ProviderClients.js');
      vi.mocked(providerClients.COINGECKO_FREE_WITH_KEY).mockResolvedValue([
        { id: 'bitcoin', price: 50000 },
      ]);

      await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(mockStorageGateway.set).toHaveBeenCalledWith(
        expect.stringContaining('COINGECKO_FREE_WITH_KEY'),
        expect.objectContaining({
          data: expect.any(Array),
          fetchedAt: expect.any(Number),
          ttlSeconds: 300,
        }),
        300
      );
    });

    it('should handle old format cache entries', async () => {
      const oldFormatData = [{ id: 'bitcoin', price: 50000 }];
      mockStorageGateway.get.mockResolvedValue(oldFormatData);

      const { providerClients } = await import('../../../core/ProviderClients.js');
      vi.mocked(providerClients.COINGECKO_FREE_NO_KEY).mockResolvedValue([
        { id: 'ethereum', price: 3000 },
      ]);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      // Should treat old format as cache miss and fetch fresh
      expect(result).toEqual([{ id: 'ethereum', price: 3000 }]);
    });

    it('should use blob storage for historical data', async () => {
      const historicalDep = {
        ...mockRawDep,
        isHistorical: true,
      };

      const now = Date.now();
      const cachedResult: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 100000,
        ttlSeconds: 300,
      };

      mockStorageGateway.getBlob.mockResolvedValue(cachedResult);

      const result = await RawDataGateway.fetchRawDependency(
        historicalDep,
        mockProviderPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      expect(mockStorageGateway.getBlob).toHaveBeenCalled();
      expect(result).toEqual(cachedResult.data);
    });
  });
});
