import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { formatDate, fetchCoinData, saveToFile, isStablecoin, fetchTopCoins } from '../scripts/fetchTopCoinsVolatilityHistory.js';
import { CoinGeckoApiError } from '../utils/coingeckoClient.js';
import { stablecoins } from '../constants/stablecoins.js';

// Mock the log module
vi.mock('../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  LOG: 5,
  INFO: 7
}));

// Mock the coingeckoClient
vi.mock('../utils/coingeckoClient.js', () => ({
  fetchFromCoinGecko: vi.fn(),
  CoinGeckoApiError: class extends Error {
    constructor(public status: number, message: string, public details?: string) {
      super(message);
      this.name = 'CoinGeckoApiError';
    }
  }
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
  throw new Error(`process.exit(${code})`);
});

// Mock process.env
const originalEnv = process.env;

import { fetchFromCoinGecko } from '../utils/coingeckoClient.js';

describe('fetchTopCoinsVolatilityHistory Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, COINGECKO_API_KEY: 'test-key' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('formatDate', () => {
    it('should format timestamp correctly', () => {
      // January 15, 2024 at noon UTC to avoid timezone issues
      const timestamp = Date.UTC(2024, 0, 15, 12, 0, 0);
      expect(formatDate(timestamp)).toBe('01-15-24');
    });

    it('should pad single digit months and days', () => {
      // February 5, 2024 at noon UTC
      const timestamp = Date.UTC(2024, 1, 5, 12, 0, 0);
      expect(formatDate(timestamp)).toBe('02-05-24');
    });

    it('should handle year correctly (last 2 digits)', () => {
      // December 31, 2023 at noon UTC
      const timestamp = Date.UTC(2023, 11, 31, 12, 0, 0);
      expect(formatDate(timestamp)).toBe('12-31-23');
    });

    it('should handle different dates', () => {
      // March 20, 2025 at noon UTC
      const timestamp = Date.UTC(2025, 2, 20, 12, 0, 0);
      expect(formatDate(timestamp)).toBe('03-20-25');
    });
  });

  describe('isStablecoin', () => {
    it('should identify stablecoin by symbol', () => {
      const coin = {
        id: 'tether',
        symbol: 'USDT',
        name: 'Tether',
        current_price: 1.0,
        market_cap: 100000000000
      };
      expect(isStablecoin(coin)).toBe(true);
    });

    it('should identify stablecoin by name', () => {
      const coin = {
        id: 'usd-coin',
        symbol: 'USDC',
        name: 'USD Coin',
        current_price: 1.0,
        market_cap: 50000000000
      };
      expect(isStablecoin(coin)).toBe(true);
    });

    it('should identify stablecoin case-insensitively', () => {
      const coin = {
        id: 'dai',
        symbol: 'dai',
        name: 'Dai',
        current_price: 1.0,
        market_cap: 5000000000
      };
      expect(isStablecoin(coin)).toBe(true);
    });

    it('should return false for non-stablecoin', () => {
      const coin = {
        id: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        current_price: 45000,
        market_cap: 850000000000
      };
      expect(isStablecoin(coin)).toBe(false);
    });

    it('should return false for ethereum', () => {
      const coin = {
        id: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        current_price: 3000,
        market_cap: 360000000000
      };
      expect(isStablecoin(coin)).toBe(false);
    });
  });

  describe('fetchTopCoins', () => {
    it('should call fetchFromCoinGecko with correct parameters', async () => {
      const mockCoins = [
        {
          id: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          current_price: 45000,
          market_cap: 850000000000
        },
        {
          id: 'ethereum',
          symbol: 'ETH',
          name: 'Ethereum',
          current_price: 3000,
          market_cap: 360000000000
        }
      ];

      vi.mocked(fetchFromCoinGecko).mockResolvedValue(mockCoins);

      const result = await fetchTopCoins();

      expect(fetchFromCoinGecko).toHaveBeenCalledWith(
        '/coins/markets',
        expect.any(URLSearchParams)
      );

      const params = vi.mocked(fetchFromCoinGecko).mock.calls[0][1] as URLSearchParams;
      expect(params.get('vs_currency')).toBe('usd');
      expect(params.get('order')).toBe('market_cap_desc');
      expect(params.get('per_page')).toBe('25');
      expect(params.get('page')).toBe('1');
      expect(params.get('sparkline')).toBe('false');

      expect(result).toEqual(mockCoins);
    });

    it('should throw CoinGeckoApiError when API fails', async () => {
      const apiError = new CoinGeckoApiError(429, 'Rate limit exceeded');
      vi.mocked(fetchFromCoinGecko).mockRejectedValue(apiError);

      await expect(fetchTopCoins()).rejects.toThrow(CoinGeckoApiError);
      await expect(fetchTopCoins()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetchFromCoinGecko).mockRejectedValue(new Error('Network error'));

      await expect(fetchTopCoins()).rejects.toThrow('Network error');
    });
  });

  describe('fetchCoinData', () => {
    it('should call both OHLC and market_chart endpoints and merge data', async () => {
      const startTime = Date.UTC(2024, 0, 1, 12, 0, 0); // Jan 1, 2024
      const endTime = Date.UTC(2024, 0, 2, 12, 0, 0); // Jan 2, 2024
      
      // Mock OHLC data: [timestamp, open, high, low, close]
      const mockOhlcData: [number, number, number, number, number][] = [
        [startTime, 44000, 46000, 43000, 45000],
        [endTime, 45000, 47000, 44000, 46000]
      ];
      
      // Mock market chart data
      const mockMarketChartData = {
        prices: [[startTime, 45000], [endTime, 46000]],
        market_caps: [[startTime, 850000000000], [endTime, 870000000000]],
        total_volumes: [[startTime, 20000000000], [endTime, 22000000000]]
      };

      // Mock both API calls - they're called in parallel
      vi.mocked(fetchFromCoinGecko)
        .mockResolvedValueOnce(mockOhlcData) // First call: OHLC
        .mockResolvedValueOnce(mockMarketChartData); // Second call: market_chart

      const result = await fetchCoinData('bitcoin');

      // Verify both endpoints were called
      expect(fetchFromCoinGecko).toHaveBeenCalledTimes(2);
      
      // Check OHLC endpoint call
      expect(fetchFromCoinGecko).toHaveBeenCalledWith(
        '/coins/bitcoin/ohlc',
        expect.any(URLSearchParams)
      );
      
      // Check market_chart endpoint call
      expect(fetchFromCoinGecko).toHaveBeenCalledWith(
        '/coins/bitcoin/market_chart',
        expect.any(URLSearchParams)
      );

      // Verify market_chart params (find by endpoint)
      const marketChartCall = vi.mocked(fetchFromCoinGecko).mock.calls.find(
        call => call[0] === '/coins/bitcoin/market_chart'
      );
      expect(marketChartCall).toBeDefined();
      const marketChartParams = marketChartCall![1] as URLSearchParams;
      expect(marketChartParams.get('vs_currency')).toBe('usd');
      expect(marketChartParams.get('days')).toBe('30');
      expect(marketChartParams.get('interval')).toBe('daily');

      // Verify OHLC params (find by endpoint)
      const ohlcCall = vi.mocked(fetchFromCoinGecko).mock.calls.find(
        call => call[0] === '/coins/bitcoin/ohlc'
      );
      expect(ohlcCall).toBeDefined();
      const ohlcParams = ohlcCall![1] as URLSearchParams;
      expect(ohlcParams.get('vs_currency')).toBe('usd');
      expect(ohlcParams.get('days')).toBe('30');

      // Verify merged result structure
      // Note: The code now aggregates 4-hour candles into daily candles, rounding timestamps to midnight
      expect(result).toHaveLength(2);
      const dayStart1 = Math.floor(startTime / 86400000) * 86400000; // Round to midnight
      const dayStart2 = Math.floor(endTime / 86400000) * 86400000; // Round to midnight
      expect(result[0]).toEqual({
        time: dayStart1,
        open: 44000,
        high: 46000,
        low: 43000,
        close: 45000,
        volume: 20000000000
      });
      expect(result[1]).toEqual({
        time: dayStart2,
        open: 45000,
        high: 47000,
        low: 44000,
        close: 46000,
        volume: 22000000000
      });
    });

    it('should throw CoinGeckoApiError when OHLC API fails', async () => {
      const apiError = new CoinGeckoApiError(429, 'Rate limit exceeded');
      // Mock both calls - OHLC fails, market_chart is also mocked (though Promise.all will reject on first error)
      vi.mocked(fetchFromCoinGecko)
        .mockRejectedValueOnce(apiError) // OHLC fails
        .mockResolvedValueOnce({ prices: [], market_caps: [], total_volumes: [] }); // market_chart (won't be used)

      const resultPromise = fetchCoinData('bitcoin');
      await expect(resultPromise).rejects.toThrow(CoinGeckoApiError);
      await expect(resultPromise).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw CoinGeckoApiError when market_chart API fails', async () => {
      const mockOhlcData: [number, number, number, number, number][] = [
        [Date.UTC(2024, 0, 1, 12, 0, 0), 44000, 46000, 43000, 45000]
      ];
      const apiError = new CoinGeckoApiError(429, 'Rate limit exceeded');
      
      // Mock both calls - OHLC succeeds, market_chart fails
      vi.mocked(fetchFromCoinGecko)
        .mockResolvedValueOnce(mockOhlcData)
        .mockRejectedValueOnce(apiError);

      const resultPromise = fetchCoinData('bitcoin');
      await expect(resultPromise).rejects.toThrow(CoinGeckoApiError);
      await expect(resultPromise).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetchFromCoinGecko).mockRejectedValue(new Error('Network error'));

      await expect(fetchCoinData('ethereum')).rejects.toThrow('Network error');
    });
  });

  describe('saveToFile', () => {
    it('should save OHLCV data to file with correct filename format', async () => {
      const startTime = Date.UTC(2024, 0, 1, 12, 0, 0); // Jan 1, 2024
      const endTime = Date.UTC(2024, 2, 31, 12, 0, 0); // Mar 31, 2024
      const mockData = [
        {
          time: startTime,
          open: 44000,
          high: 46000,
          low: 43000,
          close: 45000,
          volume: 20000000000
        },
        {
          time: endTime,
          open: 49000,
          high: 51000,
          low: 48000,
          close: 50000,
          volume: 25000000000
        }
      ];

      await saveToFile('bitcoin', mockData);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('data/top-coins-history'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
      const callArgs = vi.mocked(fs.writeFile).mock.calls[0];
      expect(callArgs[0]).toContain('data/top-coins-history/bitcoin-01-01-24-03-31-24.json');
      expect(callArgs[1]).toBe(JSON.stringify(mockData, null, 2));
    });

    it('should format filename correctly for different coins', async () => {
      const startTime = Date.UTC(2024, 5, 15, 12, 0, 0); // Jun 15, 2024
      const endTime = Date.UTC(2024, 8, 15, 12, 0, 0); // Sep 15, 2024
      const mockData = [
        {
          time: startTime,
          open: 2900,
          high: 3100,
          low: 2800,
          close: 3000,
          volume: 15000000000
        },
        {
          time: endTime,
          open: 3400,
          high: 3600,
          low: 3300,
          close: 3500,
          volume: 18000000000
        }
      ];

      await saveToFile('ethereum', mockData);

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('data/top-coins-history'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
      const lastCallIndex = vi.mocked(fs.writeFile).mock.calls.length - 1;
      const callArgs = vi.mocked(fs.writeFile).mock.calls[lastCallIndex];
      expect(callArgs[0]).toContain('data/top-coins-history/ethereum-06-15-24-09-15-24.json');
      expect(callArgs[1]).toBe(JSON.stringify(mockData, null, 2));
    });

    it('should handle file write errors', async () => {
      const mockData = [
        {
          time: Date.UTC(2024, 0, 1, 12, 0, 0),
          open: 44000,
          high: 46000,
          low: 43000,
          close: 45000,
          volume: 20000000000
        }
      ];

      const writeError = new Error('Permission denied');
      vi.mocked(fs.writeFile).mockRejectedValue(writeError);

      await expect(saveToFile('bitcoin', mockData)).rejects.toThrow('Permission denied');
    });
  });
});

