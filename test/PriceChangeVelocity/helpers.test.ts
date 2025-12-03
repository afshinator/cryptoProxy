import { describe, it, expect } from 'vitest';
import { classifyVolatility, findTopMover } from '../../features/PriceChangeVelocity/helpers.js';
import { VOLATILITY_THRESHOLDS_1H, VOLATILITY_THRESHOLDS_24H } from '../../features/PriceChangeVelocity/constants.js';
import type { CoinGeckoMarketData } from '../../features/PriceChangeVelocity/types.js';

describe('PriceChangeVelocity Helpers', () => {
  describe('classifyVolatility', () => {
    describe('1-hour thresholds', () => {
      it('should classify LOW volatility (< 1.5%)', () => {
        expect(classifyVolatility(0.5, VOLATILITY_THRESHOLDS_1H)).toBe('LOW');
        expect(classifyVolatility(1.4, VOLATILITY_THRESHOLDS_1H)).toBe('LOW');
        expect(classifyVolatility(0, VOLATILITY_THRESHOLDS_1H)).toBe('LOW');
      });

      it('should classify NORMAL volatility (1.5% to 4%)', () => {
        expect(classifyVolatility(1.5, VOLATILITY_THRESHOLDS_1H)).toBe('NORMAL');
        expect(classifyVolatility(2.5, VOLATILITY_THRESHOLDS_1H)).toBe('NORMAL');
        expect(classifyVolatility(3.99, VOLATILITY_THRESHOLDS_1H)).toBe('NORMAL');
      });

      it('should classify HIGH volatility (4% to 8%)', () => {
        expect(classifyVolatility(4.0, VOLATILITY_THRESHOLDS_1H)).toBe('HIGH');
        expect(classifyVolatility(6.0, VOLATILITY_THRESHOLDS_1H)).toBe('HIGH');
        expect(classifyVolatility(7.99, VOLATILITY_THRESHOLDS_1H)).toBe('HIGH');
      });

      it('should classify EXTREME volatility (> 8%)', () => {
        expect(classifyVolatility(8.0, VOLATILITY_THRESHOLDS_1H)).toBe('EXTREME');
        expect(classifyVolatility(10.0, VOLATILITY_THRESHOLDS_1H)).toBe('EXTREME');
        expect(classifyVolatility(50.0, VOLATILITY_THRESHOLDS_1H)).toBe('EXTREME');
      });
    });

    describe('24-hour thresholds', () => {
      it('should classify LOW volatility (< 2%)', () => {
        expect(classifyVolatility(0.5, VOLATILITY_THRESHOLDS_24H)).toBe('LOW');
        expect(classifyVolatility(1.9, VOLATILITY_THRESHOLDS_24H)).toBe('LOW');
        expect(classifyVolatility(0, VOLATILITY_THRESHOLDS_24H)).toBe('LOW');
      });

      it('should classify NORMAL volatility (2% to 5%)', () => {
        expect(classifyVolatility(2.0, VOLATILITY_THRESHOLDS_24H)).toBe('NORMAL');
        expect(classifyVolatility(3.5, VOLATILITY_THRESHOLDS_24H)).toBe('NORMAL');
        expect(classifyVolatility(4.99, VOLATILITY_THRESHOLDS_24H)).toBe('NORMAL');
      });

      it('should classify HIGH volatility (5% to 10%)', () => {
        expect(classifyVolatility(5.0, VOLATILITY_THRESHOLDS_24H)).toBe('HIGH');
        expect(classifyVolatility(7.5, VOLATILITY_THRESHOLDS_24H)).toBe('HIGH');
        expect(classifyVolatility(9.99, VOLATILITY_THRESHOLDS_24H)).toBe('HIGH');
      });

      it('should classify EXTREME volatility (> 10%)', () => {
        expect(classifyVolatility(10.0, VOLATILITY_THRESHOLDS_24H)).toBe('EXTREME');
        expect(classifyVolatility(15.0, VOLATILITY_THRESHOLDS_24H)).toBe('EXTREME');
        expect(classifyVolatility(100.0, VOLATILITY_THRESHOLDS_24H)).toBe('EXTREME');
      });
    });
  });

  describe('findTopMover', () => {
    const createCoin = (
      id: string,
      symbol: string,
      name: string,
      change1h?: number,
      change24h?: number
    ): CoinGeckoMarketData => ({
      id,
      symbol,
      name,
      current_price: 1000,
      market_cap: 1000000000,
      price_change_percentage_1h_in_currency: change1h,
      price_change_percentage_24h: change24h,
    });

    describe('1-hour timeframe', () => {
      it('should find coin with largest absolute 1h change', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 2.5, 5.0),
          createCoin('ethereum', 'eth', 'Ethereum', 5.0, 3.0),
          createCoin('solana', 'sol', 'Solana', 1.0, 2.0),
        ];

        const result = findTopMover(coins, '1h');

        expect(result).not.toBeNull();
        expect(result!.coinId).toBe('ethereum');
        expect(result!.symbol).toBe('ETH');
        expect(result!.changePercentage).toBe(5.0);
      });

      it('should handle negative changes (uses absolute value)', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', -2.5, 5.0),
          createCoin('ethereum', 'eth', 'Ethereum', -8.0, 3.0),
          createCoin('solana', 'sol', 'Solana', 1.0, 2.0),
        ];

        const result = findTopMover(coins, '1h');

        expect(result).not.toBeNull();
        expect(result!.coinId).toBe('ethereum');
        expect(result!.changePercentage).toBe(-8.0); // Returns original value, not absolute
      });

      it('should return null when no coins have valid 1h data', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', undefined, 5.0),
          createCoin('ethereum', 'eth', 'Ethereum', null, 3.0),
        ];

        const result = findTopMover(coins, '1h');

        expect(result).toBeNull();
      });

      it('should handle empty array', () => {
        const result = findTopMover([], '1h');
        expect(result).toBeNull();
      });

      it('should uppercase symbol', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 5.0, 3.0),
        ];

        const result = findTopMover(coins, '1h');

        expect(result).not.toBeNull();
        expect(result!.symbol).toBe('BTC');
      });
    });

    describe('24-hour timeframe', () => {
      it('should find coin with largest absolute 24h change', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 2.5, 5.0),
          createCoin('ethereum', 'eth', 'Ethereum', 5.0, 12.0),
          createCoin('solana', 'sol', 'Solana', 1.0, 2.0),
        ];

        const result = findTopMover(coins, '24h');

        expect(result).not.toBeNull();
        expect(result!.coinId).toBe('ethereum');
        expect(result!.symbol).toBe('ETH');
        expect(result!.changePercentage).toBe(12.0);
      });

      it('should handle negative changes (uses absolute value)', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 2.5, -15.0),
          createCoin('ethereum', 'eth', 'Ethereum', 5.0, -3.0),
        ];

        const result = findTopMover(coins, '24h');

        expect(result).not.toBeNull();
        expect(result!.coinId).toBe('bitcoin');
        expect(result!.changePercentage).toBe(-15.0);
      });

      it('should return null when no coins have valid 24h data', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 2.5, undefined),
          createCoin('ethereum', 'eth', 'Ethereum', 5.0, null),
        ];

        const result = findTopMover(coins, '24h');

        expect(result).toBeNull();
      });

      it('should return null when all changes are zero', () => {
        const coins = [
          createCoin('bitcoin', 'btc', 'Bitcoin', 2.5, 0.0),
          createCoin('ethereum', 'eth', 'Ethereum', 5.0, 0.0),
        ];

        const result = findTopMover(coins, '24h');

        // When all changes are 0, maxChange stays 0 and no coin is selected
        // This is correct behavior - null indicates no meaningful movement
        expect(result).toBeNull();
      });
    });
  });
});

