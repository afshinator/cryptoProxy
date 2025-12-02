import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { formatDate, fetchCoinData, saveToFile } from '../scripts/fetchSuperstarsVolatilityHistory.js';
import { CoinGeckoApiError } from '../utils/coingeckoClient.js';

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

import { fetchFromCoinGecko } from '../utils/coingeckoClient.js';

describe('fetchSuperstarsVolatilityHistory Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  describe('fetchCoinData', () => {
    it('should call fetchFromCoinGecko with correct parameters', async () => {
      const mockData: any = {
        prices: [[1000000, 45000]],
        market_caps: [[1000000, 850000000000]],
        total_volumes: [[1000000, 20000000000]]
      };

      vi.mocked(fetchFromCoinGecko).mockResolvedValue(mockData);

      const result = await fetchCoinData('bitcoin');

      expect(fetchFromCoinGecko).toHaveBeenCalledWith(
        '/coins/bitcoin/market_chart',
        expect.any(URLSearchParams)
      );

      const params = vi.mocked(fetchFromCoinGecko).mock.calls[0][1] as URLSearchParams;
      expect(params.get('vs_currency')).toBe('usd');
      expect(params.get('days')).toBe('90');
      expect(params.get('interval')).toBe('daily');

      expect(result).toEqual(mockData);
    });

    it('should throw CoinGeckoApiError when API fails', async () => {
      const apiError = new CoinGeckoApiError(429, 'Rate limit exceeded');
      vi.mocked(fetchFromCoinGecko).mockRejectedValue(apiError);

      await expect(fetchCoinData('bitcoin')).rejects.toThrow(CoinGeckoApiError);
      await expect(fetchCoinData('bitcoin')).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network errors', async () => {
      vi.mocked(fetchFromCoinGecko).mockRejectedValue(new Error('Network error'));

      await expect(fetchCoinData('ethereum')).rejects.toThrow('Network error');
    });
  });

  describe('saveToFile', () => {
    it('should save data to file with correct filename format', async () => {
      const startTime = Date.UTC(2024, 0, 1, 12, 0, 0); // Jan 1, 2024
      const endTime = Date.UTC(2024, 2, 31, 12, 0, 0); // Mar 31, 2024
      const mockData = {
        prices: [
          [startTime, 45000],
          [endTime, 50000]
        ] as [number, number][],
        market_caps: [
          [startTime, 850000000000],
          [endTime, 950000000000]
        ] as [number, number][],
        total_volumes: [
          [startTime, 20000000000],
          [endTime, 25000000000]
        ] as [number, number][]
      };

      await saveToFile('bitcoin', mockData);

      expect(fs.mkdir).toHaveBeenCalledWith('coin-history', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
      const callArgs = vi.mocked(fs.writeFile).mock.calls[0];
      expect(callArgs[0]).toBe('coin-history/bitcoin-01-01-24-03-31-24.json');
      expect(callArgs[1]).toBe(JSON.stringify(mockData, null, 2));
    });

    it('should format filename correctly for different coins', async () => {
      const startTime = Date.UTC(2024, 5, 15, 12, 0, 0); // Jun 15, 2024
      const endTime = Date.UTC(2024, 8, 15, 12, 0, 0); // Sep 15, 2024
      const mockData = {
        prices: [
          [startTime, 3000],
          [endTime, 3500]
        ] as [number, number][],
        market_caps: [] as [number, number][],
        total_volumes: [] as [number, number][]
      };

      await saveToFile('ethereum', mockData);

      expect(fs.mkdir).toHaveBeenCalledWith('coin-history', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
      const lastCallIndex = vi.mocked(fs.writeFile).mock.calls.length - 1;
      const callArgs = vi.mocked(fs.writeFile).mock.calls[lastCallIndex];
      expect(callArgs[0]).toBe('coin-history/ethereum-06-15-24-09-15-24.json');
      expect(callArgs[1]).toBe(JSON.stringify(mockData, null, 2));
    });

    it('should handle file write errors', async () => {
      const mockData = {
        prices: [[1000000, 45000]] as [number, number][],
        market_caps: [] as [number, number][],
        total_volumes: [] as [number, number][]
      };

      const writeError = new Error('Permission denied');
      vi.mocked(fs.writeFile).mockRejectedValue(writeError);

      await expect(saveToFile('bitcoin', mockData)).rejects.toThrow('Permission denied');
    });
  });
});

