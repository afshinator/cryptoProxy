// Filename: test/cache/unit/FeatureResolver.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureResolver } from '../../../core/FeatureResolver.js';
import { FeatureName } from '../../../constants/FeatureNames.js';
import type { UserRoleConfig } from '../../../config/configUserRoles.js';
import type { CachedFeatureResult } from '../../../config/Config.Persistent.js';
import { RotationStrategy } from '../../../services/ProviderRotationStrategies.js';

// Mock dependencies
vi.mock('../../../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  TMI: 9,
}));

vi.mock('../../../config/configFeaturesCache.js', () => ({
  featureConfig: {
    CURRENT_VOLATILITY: {
      calculate: vi.fn((deps) => ({ volatility1h: 5.0, volatility24h: 3.0 })),
      rawDependencies: [
        {
          name: 'CURRENT_VOLATILITY' as FeatureName,
          endpointPath: '/coins/markets',
          queryParams: { vs_currency: 'usd', per_page: 50 },
          isHistorical: false,
        },
      ],
      providerPool: ['COINGECKO_FREE_NO_KEY'],
      ttlBounds: { default: 150, min: 30, max: 300 },
      rotationStrategy: RotationStrategy.LOWEST_FIRST_IN_ORDER,
    },
  },
}));

vi.mock('../../../core/RawDataGateway.js', () => ({
  RawDataGateway: {
    fetchRawDependency: vi.fn(),
  },
  KeyValueStore: {},
  StorageGateway: {},
}));

vi.mock('../../../utils/ttl.js', () => ({
  calculateFeatureTTL: vi.fn(),
}));

vi.mock('../../../services/CacheKeyService.js', () => ({
  getFeatureCacheKey: vi.fn((name) => `feature:${name}`),
}));

describe('FeatureResolver', () => {
  let mockStorageGateway: any;
  let mockUsageAdapter: any;
  let mockUserConfig: UserRoleConfig;
  let mockLocalKeys: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageGateway = {
      get: vi.fn(),
      set: vi.fn(),
    };

    mockUsageAdapter = {
      getUsage: vi.fn(),
      incrementUsage: vi.fn(),
      resetUsage: vi.fn(),
    };

    mockUserConfig = {
      name: 'basic',
      cache_control: {
        minimum_ttl_seconds: 60,
      },
    } as UserRoleConfig;

    mockLocalKeys = {};

    // Mock calculateFeatureTTL to return a fixed value
    const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
    vi.mocked(calculateFeatureTTL).mockResolvedValue(150);
  });

  describe('resolveFeature', () => {
    it('should return cached feature if found and not expired', async () => {
      const now = Date.now();
      const cachedResult: CachedFeatureResult = {
        data: { volatility1h: 5.0, volatility24h: 3.0 },
        fetchedAt: now - 50000, // 50 seconds ago
        effectiveTTLSeconds: 150,
      };

      mockStorageGateway.get.mockResolvedValue(cachedResult);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockLocalKeys,
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(result).toEqual(cachedResult);
      expect(mockStorageGateway.get).toHaveBeenCalledWith('feature:CURRENT_VOLATILITY');
      expect(mockStorageGateway.set).not.toHaveBeenCalled();
    });

    it('should treat expired cache as miss and fetch fresh data', async () => {
      const now = Date.now();
      const expiredCache: CachedFeatureResult = {
        data: { volatility1h: 5.0, volatility24h: 3.0 },
        fetchedAt: now - 200000, // 200 seconds ago (expired for 150s TTL)
        effectiveTTLSeconds: 150,
      };

      mockStorageGateway.get.mockResolvedValue(expiredCache);
      const { RawDataGateway } = await import('../../../core/RawDataGateway.js');
      vi.mocked(RawDataGateway.fetchRawDependency).mockResolvedValue([
        { id: 'bitcoin', price: 50000 },
      ]);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockLocalKeys,
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(result.data).toBeDefined();
      expect(mockStorageGateway.set).toHaveBeenCalled();
      expect(result.fetchedAt).toBeGreaterThan(expiredCache.fetchedAt);
    });

    it('should convert old format cache to new format', async () => {
      const oldFormatData = { volatility1h: 5.0, volatility24h: 3.0 };
      mockStorageGateway.get.mockResolvedValue(oldFormatData);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockLocalKeys,
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(result.data).toEqual(oldFormatData);
      expect(result.fetchedAt).toBeDefined();
      expect(result.effectiveTTLSeconds).toBeDefined();
      expect(mockStorageGateway.set).toHaveBeenCalled();
    });

    it('should fetch dependencies and calculate feature on cache miss', async () => {
      mockStorageGateway.get.mockResolvedValue(null);
      const { RawDataGateway } = await import('../../../core/RawDataGateway.js');
      vi.mocked(RawDataGateway.fetchRawDependency).mockResolvedValue([
        { id: 'bitcoin', price: 50000 },
      ]);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockLocalKeys,
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(RawDataGateway.fetchRawDependency).toHaveBeenCalled();
      expect(result.data).toBeDefined();
      expect(result.fetchedAt).toBeDefined();
      expect(result.effectiveTTLSeconds).toBe(150);
      expect(mockStorageGateway.set).toHaveBeenCalled();
    });

    it('should throw error if feature config not found', async () => {
      vi.doMock('../../../config/configFeaturesCache.js', () => ({
        featureConfig: {},
      }));

      await expect(
        FeatureResolver.resolveFeature(
          'NONEXISTENT_FEATURE' as FeatureName,
          mockUserConfig,
          mockLocalKeys,
          mockStorageGateway,
          mockUsageAdapter
        )
      ).rejects.toThrow('Feature configuration not found');
    });

    it('should store feature with calculated TTL', async () => {
      mockStorageGateway.get.mockResolvedValue(null);
      const { RawDataGateway } = await import('../../../core/RawDataGateway.js');
      const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
      vi.mocked(RawDataGateway.fetchRawDependency).mockResolvedValue([]);
      vi.mocked(calculateFeatureTTL).mockResolvedValue(200);

      await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockLocalKeys,
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(mockStorageGateway.set).toHaveBeenCalledWith(
        'feature:CURRENT_VOLATILITY',
        expect.objectContaining({
          data: expect.any(Object),
          fetchedAt: expect.any(Number),
          effectiveTTLSeconds: 200,
        }),
        200
      );
    });
  });
});
