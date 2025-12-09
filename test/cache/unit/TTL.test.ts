// Filename: test/cache/unit/TTL.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFeatureTTL } from '../../../utils/ttl.js';
import { FeatureName } from '../../../constants/FeatureNames.js';
import type { UserRoleConfig } from '../../../config/configUserRoles.js';

// Mock dependencies
vi.mock('../../../utils/log.js', () => ({
  log: vi.fn(),
  TMI: 9,
  WARN: 3,
}));

vi.mock('../../../config/configFeaturesCache.js', () => ({
  featureConfig: {
    CURRENT_VOLATILITY: {
      ttlBounds: { default: 150, min: 30, max: 300 },
    },
    TEST_FEATURE: {
      ttlBounds: { default: 600, min: 300, max: 3600 },
    },
    NO_DEFAULT_FEATURE: {
      ttlBounds: { min: 100, max: 500 }, // No default
    },
  },
}));

vi.mock('../../../config/configVolatilityTTL.js', () => ({
  VOLATILITY_TTL_MULTIPLIERS: {
    LOW: 1.0,
    NORMAL: 0.8,
    HIGH: 0.5,
    EXTREME: 0.2,
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

describe('TTL Calculation', () => {
  let mockStorageGateway: any;
  let mockUserConfig: UserRoleConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorageGateway = {
      get: vi.fn(),
    };

    mockUserConfig = {
      name: 'basic',
      cache_control: {
        minimum_ttl_seconds: 60,
      },
    } as UserRoleConfig;
  });

  describe('calculateFeatureTTL', () => {
    it('should use default TTL when provided', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 2.0, volatility24h: 1.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      expect(ttl).toBe(120); // 150 * 0.8 (NORMAL multiplier) = 120
    });

    it('should calculate midpoint when default not provided', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 2.0, volatility24h: 1.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 300,
      });

      const ttl = await calculateFeatureTTL(
        'NO_DEFAULT_FEATURE' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      // Midpoint: (100 + 500) / 2 = 300, then * 0.8 (NORMAL) = 240
      expect(ttl).toBe(240);
    });

    it('should apply volatility multiplier correctly', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      
      // Test HIGH volatility
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 7.0, volatility24h: 5.0 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttlHigh = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      expect(ttlHigh).toBe(75); // 150 * 0.5 (HIGH multiplier) = 75

      // Test EXTREME volatility
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 10.0, volatility24h: 8.0 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttlExtreme = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      expect(ttlExtreme).toBe(30); // 150 * 0.2 (EXTREME multiplier) = 30, clamped to min 30
    });

    it('should respect minimum TTL bounds', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 10.0, volatility24h: 8.0 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      // 150 * 0.2 = 30, but min is 30, so should be 30
      expect(ttl).toBeGreaterThanOrEqual(30);
    });

    it('should respect user minimum TTL', async () => {
      const userConfigWithHighMin: UserRoleConfig = {
        name: 'user',
        cache_control: {
          minimum_ttl_seconds: 200,
        },
      } as UserRoleConfig;

      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 2.0, volatility24h: 1.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        userConfigWithHighMin,
        mockStorageGateway
      );

      // 150 * 0.8 = 120, but user min is 200, so should be 200
      expect(ttl).toBe(200);
    });

    it('should respect maximum TTL bounds', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 1.0, volatility24h: 0.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      // 150 * 1.0 (LOW multiplier) = 150, max is 300, so should be 150
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should default to NORMAL volatility if cache missing', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue(null);

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      // Should use NORMAL multiplier (0.8) when volatility data missing
      expect(ttl).toBe(120); // 150 * 0.8
    });

    it('should default to NORMAL volatility if cache data invalid', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { invalid: 'data' },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      const ttl = await calculateFeatureTTL(
        'CURRENT_VOLATILITY' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      expect(ttl).toBe(120); // Should default to NORMAL
    });

    it('should return user min TTL if feature not found', async () => {
      const ttl = await calculateFeatureTTL(
        'NONEXISTENT_FEATURE' as FeatureName,
        mockUserConfig,
        mockStorageGateway
      );

      expect(ttl).toBe(60); // User's minimum_ttl_seconds
    });
  });
});
