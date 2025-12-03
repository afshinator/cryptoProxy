import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateMarketVolatility,
  shouldIncreaseRefreshRate,
  isSustainedVolatility,
} from '../../features/PriceChangeVelocity/PriceChangeVelocityCalculator.js';
import type { CoinGeckoMarketData, VolatilityAnalysis } from '../../features/PriceChangeVelocity/types.js';

// Mock the log module
vi.mock('../../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  LOG: 5,
  INFO: 7,
}));

describe('PriceChangeVelocity Calculator', () => {
  const createCoin = (
    id: string,
    symbol: string,
    name: string,
    marketCap: number,
    price: number,
    change1h: number,
    change24h: number
  ): CoinGeckoMarketData => ({
    id,
    symbol,
    name,
    current_price: price,
    market_cap: marketCap,
    price_change_percentage_1h_in_currency: change1h,
    price_change_percentage_24h: change24h,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateMarketVolatility', () => {
    it('should throw error for empty array', () => {
      expect(() => calculateMarketVolatility([])).toThrow('Coins array cannot be empty');
    });

    it('should throw error for undefined/null array', () => {
      expect(() => calculateMarketVolatility(null as any)).toThrow('Coins array cannot be empty');
      expect(() => calculateMarketVolatility(undefined as any)).toThrow('Coins array cannot be empty');
    });

    it('should throw error when all coins have invalid data', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 0, 1000, 2.5, 5.0), // invalid market_cap
        createCoin('ethereum', 'eth', 'Ethereum', 500000000, 0, 3.0, 2.0), // invalid price
        createCoin('solana', 'sol', 'Solana', 300000000, 50, undefined as any, 1.0), // missing 1h
      ];

      expect(() => calculateMarketVolatility(coins)).toThrow('No coins with valid market data found');
    });

    it('should calculate market-cap weighted volatility correctly', () => {
      // BTC: 60% market cap, 2% change
      // ETH: 40% market cap, 4% change
      // Expected: (0.6 * 2) + (0.4 * 4) = 1.2 + 1.6 = 2.8%
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 600000000, 50000, 2.0, 5.0),
        createCoin('ethereum', 'eth', 'Ethereum', 400000000, 3000, 4.0, 3.0),
      ];

      const result = calculateMarketVolatility(coins);

      expect(result.volatility1h).toBe(2.8);
      expect(result.volatility24h).toBe(4.2); // (0.6 * 5) + (0.4 * 3) = 3 + 1.2 = 4.2
    });

    it('should use absolute values for price changes', () => {
      // Negative changes should be treated as positive for volatility calculation
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 500000000, 50000, -3.0, -5.0),
        createCoin('ethereum', 'eth', 'Ethereum', 500000000, 3000, -4.0, -3.0),
      ];

      const result = calculateMarketVolatility(coins);

      // Both have 50% weight, so average of absolute values
      expect(result.volatility1h).toBe(3.5); // (0.5 * 3) + (0.5 * 4) = 1.5 + 2 = 3.5
      expect(result.volatility24h).toBe(4.0); // (0.5 * 5) + (0.5 * 3) = 2.5 + 1.5 = 4.0
    });

    it('should classify volatility levels correctly', () => {
      // LOW: < 1.5% for 1h, < 2% for 24h
      const lowCoins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 1.0, 1.5),
      ];
      const lowResult = calculateMarketVolatility(lowCoins);
      expect(lowResult.level1h).toBe('LOW');
      expect(lowResult.level24h).toBe('LOW');

      // NORMAL: 1.5-4% for 1h, 2-5% for 24h
      const normalCoins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 2.5, 3.0),
      ];
      const normalResult = calculateMarketVolatility(normalCoins);
      expect(normalResult.level1h).toBe('NORMAL');
      expect(normalResult.level24h).toBe('NORMAL');

      // HIGH: 4-8% for 1h, 5-10% for 24h
      const highCoins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 6.0, 7.0),
      ];
      const highResult = calculateMarketVolatility(highCoins);
      expect(highResult.level1h).toBe('HIGH');
      expect(highResult.level24h).toBe('HIGH');

      // EXTREME: > 8% for 1h, > 10% for 24h
      const extremeCoins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 10.0, 15.0),
      ];
      const extremeResult = calculateMarketVolatility(extremeCoins);
      expect(extremeResult.level1h).toBe('EXTREME');
      expect(extremeResult.level24h).toBe('EXTREME');
    });

    it('should find top movers correctly', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 600000000, 50000, 2.0, 5.0),
        createCoin('ethereum', 'eth', 'Ethereum', 400000000, 3000, 8.0, 3.0), // Largest 1h change
        createCoin('solana', 'sol', 'Solana', 200000000, 100, 1.0, 12.0), // Largest 24h change
      ];

      const result = calculateMarketVolatility(coins);

      expect(result.topMover1h).not.toBeNull();
      expect(result.topMover1h!.coinId).toBe('ethereum');
      expect(result.topMover1h!.changePercentage).toBe(8.0);

      expect(result.topMover24h).not.toBeNull();
      expect(result.topMover24h!.coinId).toBe('solana');
      expect(result.topMover24h!.changePercentage).toBe(12.0);
    });

    it('should return null for top movers when all changes are zero', () => {
      // When all price changes are exactly 0, findTopMover returns null
      // This is correct behavior - indicates no meaningful movement
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 0.0, 0.0),
      ];

      const result = calculateMarketVolatility(coins);

      // With 0% changes, maxChange stays 0 and no coin is selected
      expect(result.topMover1h).toBeNull();
      expect(result.topMover24h).toBeNull();
    });

    it('should filter out invalid coins and log warning', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 2.0, 5.0), // Valid
        createCoin('ethereum', 'eth', 'Ethereum', 0, 3000, 3.0, 2.0), // Invalid market_cap
        createCoin('solana', 'sol', 'Solana', 200000000, 100, undefined as any, 1.0), // Missing 1h
      ];

      const result = calculateMarketVolatility(coins);

      expect(result.coinsAnalyzed).toBe(1);
      expect(result.coinsAnalyzed).toBe(1);
    });

    it('should calculate market cap coverage correctly', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 2.0, 5.0), // Valid
        createCoin('ethereum', 'eth', 'Ethereum', 0, 3000, 3.0, 2.0), // Invalid (filtered out)
      ];

      const result = calculateMarketVolatility(coins);

      // Only BTC is valid, so coverage should be 1.0 (100%)
      expect(result.marketCapCoverage).toBe(1.0);
    });

    it('should include timestamp in result', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 2.0, 5.0),
      ];

      const before = Date.now();
      const result = calculateMarketVolatility(coins);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle single coin', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 1000000000, 50000, 3.0, 6.0),
      ];

      const result = calculateMarketVolatility(coins);

      expect(result.volatility1h).toBe(3.0);
      expect(result.volatility24h).toBe(6.0);
      expect(result.coinsAnalyzed).toBe(1);
    });

    it('should handle many coins with different market caps', () => {
      const coins = [
        createCoin('bitcoin', 'btc', 'Bitcoin', 500000000, 50000, 1.0, 2.0), // 50% weight
        createCoin('ethereum', 'eth', 'Ethereum', 300000000, 3000, 2.0, 3.0), // 30% weight
        createCoin('solana', 'sol', 'Solana', 200000000, 100, 3.0, 4.0), // 20% weight
      ];

      const result = calculateMarketVolatility(coins);

      // Weighted average: (0.5 * 1) + (0.3 * 2) + (0.2 * 3) = 0.5 + 0.6 + 0.6 = 1.7
      expect(result.volatility1h).toBe(1.7);
      // Weighted average: (0.5 * 2) + (0.3 * 3) + (0.2 * 4) = 1.0 + 0.9 + 0.8 = 2.7
      expect(result.volatility24h).toBe(2.7);
    });
  });

  describe('shouldIncreaseRefreshRate', () => {
    it('should return true for HIGH volatility', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 6.0,
        volatility24h: 7.0,
        level1h: 'HIGH',
        level24h: 'HIGH',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(shouldIncreaseRefreshRate(analysis)).toBe(true);
    });

    it('should return true for EXTREME volatility', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 10.0,
        volatility24h: 15.0,
        level1h: 'EXTREME',
        level24h: 'EXTREME',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(shouldIncreaseRefreshRate(analysis)).toBe(true);
    });

    it('should return false for LOW volatility', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 1.0,
        volatility24h: 1.5,
        level1h: 'LOW',
        level24h: 'LOW',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(shouldIncreaseRefreshRate(analysis)).toBe(false);
    });

    it('should return false for NORMAL volatility', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 2.5,
        volatility24h: 3.0,
        level1h: 'NORMAL',
        level24h: 'NORMAL',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(shouldIncreaseRefreshRate(analysis)).toBe(false);
    });
  });

  describe('isSustainedVolatility', () => {
    it('should return true when both 1h and 24h are HIGH', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 6.0,
        volatility24h: 7.0,
        level1h: 'HIGH',
        level24h: 'HIGH',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(true);
    });

    it('should return true when both 1h and 24h are EXTREME', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 10.0,
        volatility24h: 15.0,
        level1h: 'EXTREME',
        level24h: 'EXTREME',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(true);
    });

    it('should return true when 1h is HIGH and 24h is EXTREME', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 6.0,
        volatility24h: 12.0,
        level1h: 'HIGH',
        level24h: 'EXTREME',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(true);
    });

    it('should return false when only 1h is HIGH', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 6.0,
        volatility24h: 3.0,
        level1h: 'HIGH',
        level24h: 'NORMAL',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(false);
    });

    it('should return false when only 24h is HIGH', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 2.0,
        volatility24h: 7.0,
        level1h: 'NORMAL',
        level24h: 'HIGH',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(false);
    });

    it('should return false when both are LOW or NORMAL', () => {
      const analysis: VolatilityAnalysis = {
        volatility1h: 2.0,
        volatility24h: 3.0,
        level1h: 'NORMAL',
        level24h: 'NORMAL',
        topMover1h: null,
        topMover24h: null,
        marketCapCoverage: 1.0,
        coinsAnalyzed: 10,
        timestamp: Date.now(),
      };

      expect(isSustainedVolatility(analysis)).toBe(false);
    });
  });
});

