import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateDominance } from '../../features/dominance/DominanceCalculator.js';
import type { MarketCapData, DominanceAnalysis } from '../../features/dominance/types.js';

// Mock the log module
vi.mock('../../utils/log.js', () => ({
  log: vi.fn(),
  ERR: 1,
  WARN: 3,
  LOG: 5,
  INFO: 7,
  TMI: 9,
}));

describe('DominanceCalculator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now() to return a fixed timestamp for consistent testing
    vi.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateDominance', () => {
    it('should calculate dominance correctly for all categories', () => {
      // Example from spec: Total = 2.5T, BTC = 1T (40%), ETH = 500B (20%), Stablecoins = 200B (8%), Others = 800B (32%)
      const marketCapData: MarketCapData = {
        total: 2500000000000,
        btc: 1000000000000,
        eth: 500000000000,
        stablecoins: 200000000000,
      };

      const result = calculateDominance(marketCapData);

      // BTC Dominance: (1T / 2.5T) × 100 = 40%
      expect(result.btc.marketCap).toBe(1000000000000);
      expect(result.btc.dominance).toBe(40.0);

      // ETH Dominance: (500B / 2.5T) × 100 = 20%
      expect(result.eth.marketCap).toBe(500000000000);
      expect(result.eth.dominance).toBe(20.0);

      // Stablecoins Dominance: (200B / 2.5T) × 100 = 8%
      expect(result.stablecoins.marketCap).toBe(200000000000);
      expect(result.stablecoins.dominance).toBe(8.0);

      // Others Market Cap: 2.5T - (1T + 500B + 200B) = 800B
      // Others Dominance: (800B / 2.5T) × 100 = 32%
      expect(result.others.marketCap).toBe(800000000000);
      expect(result.others.dominance).toBe(32.0);

      // Total market cap should be preserved
      expect(result.totalMarketCap).toBe(2500000000000);

      // All dominances should sum to 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);

      // Timestamp should be set
      expect(result.timestamp).toBe(1234567890000);
    });

    it('should calculate BTC dominance correctly', () => {
      // Formula: BTC.D = (MC_BTC / MC_Total) × 100
      const marketCapData: MarketCapData = {
        total: 1000000000000, // 1T
        btc: 500000000000,    // 500B (50%)
        eth: 300000000000,    // 300B
        stablecoins: 100000000000, // 100B
      };

      const result = calculateDominance(marketCapData);

      expect(result.btc.dominance).toBe(50.0);
      expect(result.btc.marketCap).toBe(500000000000);
    });

    it('should calculate ETH dominance correctly', () => {
      // Formula: ETH.D = (MC_ETH / MC_Total) × 100
      const marketCapData: MarketCapData = {
        total: 1000000000000, // 1T
        btc: 400000000000,    // 400B
        eth: 300000000000,    // 300B (30%)
        stablecoins: 200000000000, // 200B
      };

      const result = calculateDominance(marketCapData);

      expect(result.eth.dominance).toBe(30.0);
      expect(result.eth.marketCap).toBe(300000000000);
    });

    it('should calculate Stablecoins dominance correctly', () => {
      // Formula: Stablecoins.D = (MC_Stablecoins / MC_Total) × 100
      const marketCapData: MarketCapData = {
        total: 1000000000000, // 1T
        btc: 500000000000,    // 500B
        eth: 300000000000,    // 300B
        stablecoins: 150000000000, // 150B (15%)
      };

      const result = calculateDominance(marketCapData);

      expect(result.stablecoins.dominance).toBe(15.0);
      expect(result.stablecoins.marketCap).toBe(150000000000);
    });

    it('should calculate Others dominance correctly', () => {
      // Formula: MC_Others = MC_Total - (MC_BTC + MC_ETH + MC_Stablecoins)
      // Formula: Others.D = (MC_Others / MC_Total) × 100
      const marketCapData: MarketCapData = {
        total: 1000000000000, // 1T
        btc: 400000000000,    // 400B
        eth: 300000000000,    // 300B
        stablecoins: 200000000000, // 200B
        // Others = 1T - (400B + 300B + 200B) = 100B (10%)
      };

      const result = calculateDominance(marketCapData);

      expect(result.others.marketCap).toBe(100000000000);
      expect(result.others.dominance).toBe(10.0);

      // Verify all sum to 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should handle decimal dominance percentages correctly', () => {
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 333333333333,    // 33.333...%
        eth: 250000000000,    // 25%
        stablecoins: 166666666667, // 16.666...%
      };

      const result = calculateDominance(marketCapData);

      // Should round to 2 decimal places
      expect(result.btc.dominance).toBe(33.33);
      expect(result.eth.dominance).toBe(25.0);
      expect(result.stablecoins.dominance).toBe(16.67);
      expect(result.others.dominance).toBe(25.0); // 100 - 33.33 - 25 - 16.67 = 25.0

      // Sum should still be 100% (within rounding)
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBeCloseTo(100.0, 1);
    });

    it('should handle zero market cap for a category', () => {
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 0,              // 0%
        eth: 500000000000,   // 50%
        stablecoins: 300000000000, // 30%
      };

      const result = calculateDominance(marketCapData);

      expect(result.btc.dominance).toBe(0.0);
      expect(result.eth.dominance).toBe(50.0);
      expect(result.stablecoins.dominance).toBe(30.0);
      expect(result.others.marketCap).toBe(200000000000); // 1T - 500B - 300B = 200B
      expect(result.others.dominance).toBe(20.0);

      // Sum should still be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should handle zero stablecoins market cap', () => {
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 600000000000,   // 60%
        eth: 300000000000,   // 30%
        stablecoins: 0,      // 0%
      };

      const result = calculateDominance(marketCapData);

      expect(result.stablecoins.dominance).toBe(0.0);
      expect(result.others.marketCap).toBe(100000000000); // 1T - 600B - 300B = 100B
      expect(result.others.dominance).toBe(10.0);

      // Sum should still be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should handle very small market caps', () => {
      const marketCapData: MarketCapData = {
        total: 1000,
        btc: 500,      // 50%
        eth: 300,     // 30%
        stablecoins: 150, // 15%
      };

      const result = calculateDominance(marketCapData);

      expect(result.btc.dominance).toBe(50.0);
      expect(result.eth.dominance).toBe(30.0);
      expect(result.stablecoins.dominance).toBe(15.0);
      expect(result.others.marketCap).toBe(50); // 1000 - 500 - 300 - 150 = 50
      expect(result.others.dominance).toBe(5.0);

      // Sum should still be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should handle very large market caps', () => {
      const marketCapData: MarketCapData = {
        total: 5000000000000000, // 5 quadrillion
        btc: 2000000000000000,   // 2 quadrillion (40%)
        eth: 1000000000000000,   // 1 quadrillion (20%)
        stablecoins: 500000000000000, // 500 trillion (10%)
      };

      const result = calculateDominance(marketCapData);

      expect(result.btc.dominance).toBe(40.0);
      expect(result.eth.dominance).toBe(20.0);
      expect(result.stablecoins.dominance).toBe(10.0);
      expect(result.others.marketCap).toBe(1500000000000000); // 1.5 quadrillion (30%)
      expect(result.others.dominance).toBe(30.0);

      // Sum should still be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should ensure Others is not negative (safety check)', () => {
      // Edge case: if sum of BTC + ETH + Stablecoins exceeds total (shouldn't happen in reality)
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 500000000000,
        eth: 400000000000,
        stablecoins: 200000000000, // Sum = 1.1T > 1T
      };

      const result = calculateDominance(marketCapData);

      // Others should be 0, not negative
      expect(result.others.marketCap).toBe(0);
      expect(result.others.dominance).toBe(0.0);
    });

    it('should handle case where BTC + ETH + Stablecoins equals total (Others = 0)', () => {
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 500000000000,   // 50%
        eth: 300000000000,   // 30%
        stablecoins: 200000000000, // 20%
        // Sum = 1T, Others = 0
      };

      const result = calculateDominance(marketCapData);

      expect(result.others.marketCap).toBe(0);
      expect(result.others.dominance).toBe(0.0);

      // Sum should still be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should return correct structure matching DominanceAnalysis interface', () => {
      const marketCapData: MarketCapData = {
        total: 1000000000000,
        btc: 400000000000,
        eth: 300000000000,
        stablecoins: 200000000000,
      };

      const result = calculateDominance(marketCapData);

      // Verify structure
      expect(result).toHaveProperty('totalMarketCap');
      expect(result).toHaveProperty('btc');
      expect(result).toHaveProperty('eth');
      expect(result).toHaveProperty('stablecoins');
      expect(result).toHaveProperty('others');
      expect(result).toHaveProperty('timestamp');

      // Verify nested structure
      expect(result.btc).toHaveProperty('marketCap');
      expect(result.btc).toHaveProperty('dominance');
      expect(result.eth).toHaveProperty('marketCap');
      expect(result.eth).toHaveProperty('dominance');
      expect(result.stablecoins).toHaveProperty('marketCap');
      expect(result.stablecoins).toHaveProperty('dominance');
      expect(result.others).toHaveProperty('marketCap');
      expect(result.others).toHaveProperty('dominance');

      // Verify types
      expect(typeof result.totalMarketCap).toBe('number');
      expect(typeof result.btc.marketCap).toBe('number');
      expect(typeof result.btc.dominance).toBe('number');
      expect(typeof result.eth.marketCap).toBe('number');
      expect(typeof result.eth.dominance).toBe('number');
      expect(typeof result.stablecoins.marketCap).toBe('number');
      expect(typeof result.stablecoins.dominance).toBe('number');
      expect(typeof result.others.marketCap).toBe('number');
      expect(typeof result.others.dominance).toBe('number');
      expect(typeof result.timestamp).toBe('number');
    });

    it('should handle realistic market scenario', () => {
      // Realistic scenario: BTC ~50%, ETH ~20%, Stablecoins ~10%, Others ~20%
      const marketCapData: MarketCapData = {
        total: 2500000000000, // ~2.5T total market cap
        btc: 1250000000000,   // ~1.25T (50%)
        eth: 500000000000,    // ~500B (20%)
        stablecoins: 250000000000, // ~250B (10%)
      };

      const result = calculateDominance(marketCapData);

      expect(result.btc.dominance).toBe(50.0);
      expect(result.eth.dominance).toBe(20.0);
      expect(result.stablecoins.dominance).toBe(10.0);
      expect(result.others.marketCap).toBe(500000000000); // 500B (20%)
      expect(result.others.dominance).toBe(20.0);

      // Sum should be 100%
      const totalDominance = result.btc.dominance + result.eth.dominance + 
                             result.stablecoins.dominance + result.others.dominance;
      expect(totalDominance).toBe(100.0);
    });

    it('should round dominance percentages to 2 decimal places', () => {
      const marketCapData: MarketCapData = {
        total: 1000,
        btc: 333,      // 33.3%
        eth: 250,     // 25%
        stablecoins: 166, // 16.6%
      };

      const result = calculateDominance(marketCapData);

      // Should be rounded to 2 decimal places
      expect(result.btc.dominance).toBe(33.3);
      expect(result.eth.dominance).toBe(25.0);
      expect(result.stablecoins.dominance).toBe(16.6);
      expect(result.others.dominance).toBe(25.1); // 100 - 33.3 - 25 - 16.6 = 25.1

      // Verify all are numbers (not strings)
      expect(typeof result.btc.dominance).toBe('number');
      expect(typeof result.eth.dominance).toBe('number');
      expect(typeof result.stablecoins.dominance).toBe('number');
      expect(typeof result.others.dominance).toBe('number');
    });
  });
});

