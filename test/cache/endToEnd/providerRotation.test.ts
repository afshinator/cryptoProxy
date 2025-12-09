// Filename: test/cache/endToEnd/providerRotation.test.ts

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
    COINMARKETCAP_FREE_WITH_KEY: vi.fn(),
  },
}));

vi.mock('../../../utils/KvStorageGateway.js', () => ({
  kvStorageGateway: {
    get: vi.fn(),
  },
}));

vi.mock('../../../services/CacheKeyService.js', () => ({
  getFeatureCacheKey: vi.fn(() => 'feature:CURRENT_VOLATILITY'),
}));

vi.mock('../../../utils/volatility.js', () => ({
  getDecisiveVolatilityLevel: vi.fn((v1h, v24h) => {
    if (v1h >= 8 || v24h >= 6) return 'EXTREME';
    if (v1h >= 6 || v24h >= 4) return 'HIGH';
    if (v1h >= 3 || v24h >= 2) return 'NORMAL';
    return 'LOW';
  }),
}));

describe('End-to-End: Provider Rotation with Cache', () => {
  let mockStorageGateway: any;
  let mockUsageAdapter: any;
  let mockRawDep: any;
  let providerPool: ProviderName[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageGateway = {
      get: vi.fn(),
      set: vi.fn(),
      getBlob: vi.fn(),
      putBlob: vi.fn(),
    };

    mockUsageAdapter = {
      getUsage: vi.fn(),
      incrementUsage: vi.fn(),
      resetUsage: vi.fn(),
    };

    mockRawDep = {
      name: 'CURRENT_VOLATILITY' as any,
      endpointPath: '/coins/markets',
      queryParams: { vs_currency: 'usd', per_page: 50 },
      isHistorical: false,
    };

    providerPool = ['COINGECKO_FREE_WITH_KEY', 'COINGECKO_FREE_NO_KEY'];
  });

  describe('ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST Strategy', () => {
    it('should check no-key provider cache first, then keyed providers', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
      ]);

      // No cache for no-key provider, cache for keyed provider
      const now = Date.now();
      const cachedData: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 100000,
        ttlSeconds: 300,
      };

      mockStorageGateway.get
        .mockResolvedValueOnce(null) // No-key provider - no cache
        .mockResolvedValueOnce(cachedData); // Keyed provider - has cache

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST
      );

      // Should use cache from keyed provider (second in order)
      expect(result).toEqual(cachedData.data);
      expect(mockStorageGateway.get).toHaveBeenCalledTimes(2);
    });

    it('should prefer no-key provider cache when available', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
      ]);

      const now = Date.now();
      const noKeyCache: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 50000,
        ttlSeconds: 300,
      };

      mockStorageGateway.get.mockResolvedValueOnce(noKeyCache);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST
      );

      // Should use no-key provider cache (first checked)
      expect(result).toEqual(noKeyCache.data);
      expect(mockStorageGateway.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE Strategy', () => {
    it('should check no-key provider first during normal volatility', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
      ]);

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 2.0, volatility24h: 1.5 }, // NORMAL volatility
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const now = Date.now();
      const noKeyCache: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 50000,
        ttlSeconds: 300,
      };

      mockStorageGateway.get.mockResolvedValueOnce(noKeyCache);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE
      );

      // Should check no-key provider first (preferred during normal volatility)
      expect(result).toEqual(noKeyCache.data);
    });

    it('should check keyed providers first during high volatility', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 1 },
      ]);

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 7.0, volatility24h: 5.0 }, // HIGH volatility
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const now = Date.now();
      const keyedCache: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 50000,
        ttlSeconds: 300,
      };

      mockStorageGateway.get.mockResolvedValueOnce(keyedCache);

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE
      );

      // Should check keyed provider first (preferred during high volatility)
      expect(result).toEqual(keyedCache.data);
    });
  });

  describe('Cache Storage with Provider Used', () => {
    it('should store cache with provider that was actually used (not first in pool)', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 1 },
      ]);

      mockStorageGateway.get.mockResolvedValue(null);

      const { providerClients } = await import('../../../core/ProviderClients.js');
      vi.mocked(providerClients.COINGECKO_FREE_WITH_KEY).mockResolvedValue([
        { id: 'bitcoin', price: 50000 },
      ]);

      await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      // Should store with COINGECKO_FREE_WITH_KEY (the provider that was used)
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
  });

  describe('Failover with Cache Check', () => {
    it('should check cache for each provider in failover order', async () => {
      const { applyRotationStrategy } = await import('../../../services/ProviderRotationStrategies.js');
      vi.mocked(applyRotationStrategy).mockResolvedValue([
        { provider: 'COINGECKO_FREE_NO_KEY', usage: 0 },
        { provider: 'COINGECKO_FREE_WITH_KEY', usage: 1 },
      ]);

      // First provider: expired cache
      // Second provider: valid cache
      const now = Date.now();
      const expiredCache: CachedRawDataResult = {
        data: [{ id: 'bitcoin', price: 50000 }],
        fetchedAt: now - 400000, // Expired
        ttlSeconds: 300,
      };

      const validCache: CachedRawDataResult = {
        data: [{ id: 'ethereum', price: 3000 }],
        fetchedAt: now - 100000, // Fresh
        ttlSeconds: 300,
      };

      mockStorageGateway.get
        .mockResolvedValueOnce(expiredCache) // First provider - expired
        .mockResolvedValueOnce(validCache); // Second provider - valid

      const result = await RawDataGateway.fetchRawDependency(
        mockRawDep,
        providerPool,
        {},
        mockStorageGateway,
        mockUsageAdapter,
        RotationStrategy.LOWEST_FIRST_IN_ORDER
      );

      // Should use valid cache from second provider
      expect(result).toEqual(validCache.data);
      expect(mockStorageGateway.get).toHaveBeenCalledTimes(2);
    });
  });
});
