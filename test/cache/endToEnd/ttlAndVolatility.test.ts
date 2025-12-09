// Filename: test/cache/endToEnd/ttlAndVolatility.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureResolver } from '../../../core/FeatureResolver.js';
import { FeatureName } from '../../../constants/FeatureNames.js';
import type { UserRoleConfig } from '../../../config/configUserRoles.js';
import type { CachedFeatureResult } from '../../../config/Config.Persistent.js';

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
      rawDependencies: [],
      providerPool: ['COINGECKO_FREE_NO_KEY'],
      ttlBounds: { default: 150, min: 30, max: 300 },
      rotationStrategy: 'LOWEST_FIRST_IN_ORDER' as any,
    },
  },
}));

vi.mock('../../../core/RawDataGateway.js', () => ({
  RawDataGateway: {
    fetchRawDependency: vi.fn().mockResolvedValue([]),
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

describe('End-to-End: TTL and Volatility Integration', () => {
  let mockStorageGateway: any;
  let mockUsageAdapter: any;
  let mockUserConfig: UserRoleConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageGateway = {
      get: vi.fn(),
      set: vi.fn(),
    };

    mockUsageAdapter = {
      getUsage: vi.fn().mockResolvedValue(0),
      incrementUsage: vi.fn(),
      resetUsage: vi.fn(),
    };

    mockUserConfig = {
      name: 'basic',
      cache_control: {
        minimum_ttl_seconds: 60,
      },
    } as UserRoleConfig;
  });

  describe('Volatility-Based TTL Adjustment', () => {
    it('should use shorter TTL during high volatility', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      // Mock HIGH volatility in cache
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 7.0, volatility24h: 5.0 }, // HIGH volatility
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
      vi.mocked(calculateFeatureTTL).mockResolvedValue(75); // Reduced TTL for HIGH volatility

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        {},
        mockStorageGateway,
        mockUsageAdapter
      );

      // Verify TTL was reduced due to volatility
      expect(result.effectiveTTLSeconds).toBe(75);
      expect(mockStorageGateway.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        75
      );
    });

    it('should use longer TTL during low volatility', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 1.0, volatility24h: 0.5 }, // LOW volatility
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
      vi.mocked(calculateFeatureTTL).mockResolvedValue(150); // Full TTL for LOW volatility

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        {},
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(result.effectiveTTLSeconds).toBe(150);
    });

    it('should read volatility from CURRENT_VOLATILITY cache', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      const volatilityCache: CachedFeatureResult = {
        data: { volatility1h: 6.5, volatility24h: 4.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      };
      vi.mocked(kvStorageGateway.get).mockResolvedValue(volatilityCache);

      const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
      await calculateFeatureTTL('CURRENT_VOLATILITY' as FeatureName, mockUserConfig, mockStorageGateway);

      // Verify volatility cache was read
      expect(kvStorageGateway.get).toHaveBeenCalledWith('feature:CURRENT_VOLATILITY');
    });
  });

  describe('User Role TTL Constraints', () => {
    it('should respect user minimum TTL even if volatility suggests lower', async () => {
      mockStorageGateway.get.mockResolvedValue(null);

      const highMinUserConfig: UserRoleConfig = {
        name: 'user',
        cache_control: {
          minimum_ttl_seconds: 200, // High minimum
        },
      } as UserRoleConfig;

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 7.0, volatility24h: 5.0 }, // HIGH volatility
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const { calculateFeatureTTL } = await import('../../../utils/ttl.js');
      vi.mocked(calculateFeatureTTL).mockResolvedValue(200); // User min overrides volatility reduction

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        highMinUserConfig,
        {},
        mockStorageGateway,
        mockUsageAdapter
      );

      expect(result.effectiveTTLSeconds).toBe(200);
    });
  });

  describe('TTL Validation on Cache Read', () => {
    it('should reject expired cache entries based on fetchedAt and effectiveTTLSeconds', async () => {
      const now = Date.now();
      const expiredCache: CachedFeatureResult = {
        data: { volatility1h: 5.0, volatility24h: 3.0 },
        fetchedAt: now - 200000, // 200 seconds ago
        effectiveTTLSeconds: 150, // Expired (200 > 150)
      };

      mockStorageGateway.get.mockResolvedValue(expiredCache);

      const { RawDataGateway } = await import('../../../core/RawDataGateway.js');
      vi.mocked(RawDataGateway.fetchRawDependency).mockResolvedValue([]);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        {},
        mockStorageGateway,
        mockUsageAdapter
      );

      // Should fetch fresh data despite expired cache
      expect(RawDataGateway.fetchRawDependency).toHaveBeenCalled();
      expect(result.fetchedAt).toBeGreaterThan(expiredCache.fetchedAt);
    });

    it('should accept fresh cache entries within TTL', async () => {
      const now = Date.now();
      const freshCache: CachedFeatureResult = {
        data: { volatility1h: 5.0, volatility24h: 3.0 },
        fetchedAt: now - 50000, // 50 seconds ago
        effectiveTTLSeconds: 150, // Fresh (50 < 150)
      };

      mockStorageGateway.get.mockResolvedValue(freshCache);

      const result = await FeatureResolver.resolveFeature(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        {},
        mockStorageGateway,
        mockUsageAdapter
      );

      // Should return cached data without fetching
      expect(result).toEqual(freshCache);
      const { RawDataGateway } = await import('../../../core/RawDataGateway.js');
      expect(RawDataGateway.fetchRawDependency).not.toHaveBeenCalled();
    });
  });
});
