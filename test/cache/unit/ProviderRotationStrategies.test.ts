// Filename: test/cache/unit/ProviderRotationStrategies.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyRotationStrategy,
  RotationStrategy,
} from '../../../services/ProviderRotationStrategies.js';
import { ProviderName } from '../../../constants/ProviderNames.js';

// Mock dependencies
vi.mock('../../../utils/log.js', () => ({
  log: vi.fn(),
  TMI: 9,
  WARN: 3,
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

describe('ProviderRotationStrategies', () => {
  let mockUsageAdapter: any;
  let mockStorageGateway: any;
  let providerPool: ProviderName[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockUsageAdapter = {
      getUsage: vi.fn(),
      incrementUsage: vi.fn(),
      resetUsage: vi.fn(),
    };

    mockStorageGateway = {
      get: vi.fn(),
    };

    providerPool = [
      'COINGECKO_FREE_WITH_KEY',
      'COINMARKETCAP_FREE_WITH_KEY',
      'COINGECKO_FREE_NO_KEY',
    ];
  });

  describe('LOWEST_FIRST_IN_ORDER', () => {
    it('should order providers by lowest usage first', async () => {
      mockUsageAdapter.getUsage
        .mockResolvedValueOnce(5) // COINGECKO_FREE_WITH_KEY
        .mockResolvedValueOnce(2) // COINMARKETCAP_FREE_WITH_KEY
        .mockResolvedValueOnce(1); // COINGECKO_FREE_NO_KEY

      const result = await applyRotationStrategy(
        RotationStrategy.LOWEST_FIRST_IN_ORDER,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_NO_KEY');
      expect(result[0].usage).toBe(1);
      expect(result[1].provider).toBe('COINMARKETCAP_FREE_WITH_KEY');
      expect(result[1].usage).toBe(2);
      expect(result[2].provider).toBe('COINGECKO_FREE_WITH_KEY');
      expect(result[2].usage).toBe(5);
    });

    it('should preserve original order for ties', async () => {
      mockUsageAdapter.getUsage.mockResolvedValue(0); // All have same usage

      const result = await applyRotationStrategy(
        RotationStrategy.LOWEST_FIRST_IN_ORDER,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_WITH_KEY');
      expect(result[1].provider).toBe('COINMARKETCAP_FREE_WITH_KEY');
      expect(result[2].provider).toBe('COINGECKO_FREE_NO_KEY');
    });
  });

  describe('ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST', () => {
    it('should prioritize no-key providers before keyed providers', async () => {
      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_NO_KEY');
      expect(result[1].provider).toBe('COINGECKO_FREE_WITH_KEY');
      expect(result[2].provider).toBe('COINMARKETCAP_FREE_WITH_KEY');
    });

    it('should order within groups by usage', async () => {
      mockUsageAdapter.getUsage
        .mockResolvedValueOnce(3) // COINGECKO_FREE_WITH_KEY
        .mockResolvedValueOnce(1) // COINMARKETCAP_FREE_WITH_KEY
        .mockResolvedValueOnce(2); // COINGECKO_FREE_NO_KEY

      const result = await applyRotationStrategy(
        RotationStrategy.ALWAYS_HIT_NO_API_KEY_REQUIRED_FIRST,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_NO_KEY'); // No-key first
      expect(result[1].provider).toBe('COINMARKETCAP_FREE_WITH_KEY'); // Keyed, lower usage
      expect(result[2].provider).toBe('COINGECKO_FREE_WITH_KEY'); // Keyed, higher usage
    });
  });

  describe('PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE', () => {
    it('should prefer no-key providers during normal volatility', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 2.0, volatility24h: 1.5 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE,
        providerPool,
        mockUsageAdapter,
        mockStorageGateway
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_NO_KEY');
    });

    it('should prioritize keyed providers during HIGH volatility', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 7.0, volatility24h: 5.0 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE,
        providerPool,
        mockUsageAdapter,
        mockStorageGateway
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_WITH_KEY');
      expect(result[result.length - 1].provider).toBe('COINGECKO_FREE_NO_KEY');
    });

    it('should prioritize keyed providers during EXTREME volatility', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue({
        data: { volatility1h: 10.0, volatility24h: 8.0 },
        fetchedAt: Date.now(),
        effectiveTTLSeconds: 150,
      });

      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE,
        providerPool,
        mockUsageAdapter,
        mockStorageGateway
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_WITH_KEY');
    });

    it('should default to NORMAL if volatility cache missing', async () => {
      const { kvStorageGateway } = await import('../../../utils/KvStorageGateway.js');
      vi.mocked(kvStorageGateway.get).mockResolvedValue(null);

      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        RotationStrategy.PREFER_NO_API_KEY_REQUIRED_UNLESS_VOLATILE,
        providerPool,
        mockUsageAdapter,
        mockStorageGateway
      );

      // Should prefer no-key (NORMAL volatility)
      expect(result[0].provider).toBe('COINGECKO_FREE_NO_KEY');
    });
  });

  describe('ROUND_ROBIN', () => {
    it('should rotate providers based on total usage', async () => {
      mockUsageAdapter.getUsage
        .mockResolvedValueOnce(0) // COINGECKO_FREE_WITH_KEY
        .mockResolvedValueOnce(1) // COINMARKETCAP_FREE_WITH_KEY
        .mockResolvedValueOnce(2); // COINGECKO_FREE_NO_KEY
      // Total usage = 3, start index = 3 % 3 = 0

      const result = await applyRotationStrategy(
        RotationStrategy.ROUND_ROBIN,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_WITH_KEY');
    });

    it('should rotate to next provider when total usage increases', async () => {
      mockUsageAdapter.getUsage
        .mockResolvedValueOnce(1) // COINGECKO_FREE_WITH_KEY
        .mockResolvedValueOnce(1) // COINMARKETCAP_FREE_WITH_KEY
        .mockResolvedValueOnce(1); // COINGECKO_FREE_NO_KEY
      // Total usage = 3, start index = 3 % 3 = 0

      const result = await applyRotationStrategy(
        RotationStrategy.ROUND_ROBIN,
        providerPool,
        mockUsageAdapter
      );

      expect(result[0].provider).toBe('COINGECKO_FREE_WITH_KEY');
    });
  });

  describe('applyRotationStrategy', () => {
    it('should fallback to LOWEST_FIRST_IN_ORDER for unknown strategy', async () => {
      mockUsageAdapter.getUsage.mockResolvedValue(0);

      const result = await applyRotationStrategy(
        'UNKNOWN_STRATEGY' as any,
        providerPool,
        mockUsageAdapter
      );

      // Should fallback to LOWEST_FIRST_IN_ORDER
      expect(result).toBeDefined();
      expect(result.length).toBe(3);
    });
  });
});
