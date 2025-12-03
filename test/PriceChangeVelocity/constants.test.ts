import { describe, it, expect } from 'vitest';
import {
  TOP_COINS_COUNT,
  VOLATILITY_THRESHOLDS_1H,
  VOLATILITY_THRESHOLDS_24H,
} from '../../features/PriceChangeVelocity/constants.js';

describe('PriceChangeVelocity Constants', () => {
  describe('TOP_COINS_COUNT', () => {
    it('should be a positive number', () => {
      expect(TOP_COINS_COUNT).toBeGreaterThan(0);
    });

    it('should be 50', () => {
      expect(TOP_COINS_COUNT).toBe(50);
    });
  });

  describe('VOLATILITY_THRESHOLDS_1H', () => {
    it('should have LOW_MAX, NORMAL_MAX, and HIGH_MAX properties', () => {
      expect(VOLATILITY_THRESHOLDS_1H).toHaveProperty('LOW_MAX');
      expect(VOLATILITY_THRESHOLDS_1H).toHaveProperty('NORMAL_MAX');
      expect(VOLATILITY_THRESHOLDS_1H).toHaveProperty('HIGH_MAX');
    });

    it('should have correct threshold values', () => {
      expect(VOLATILITY_THRESHOLDS_1H.LOW_MAX).toBe(1.5);
      expect(VOLATILITY_THRESHOLDS_1H.NORMAL_MAX).toBe(4.0);
      expect(VOLATILITY_THRESHOLDS_1H.HIGH_MAX).toBe(8.0);
    });

    it('should have thresholds in ascending order', () => {
      expect(VOLATILITY_THRESHOLDS_1H.LOW_MAX).toBeLessThan(VOLATILITY_THRESHOLDS_1H.NORMAL_MAX);
      expect(VOLATILITY_THRESHOLDS_1H.NORMAL_MAX).toBeLessThan(VOLATILITY_THRESHOLDS_1H.HIGH_MAX);
    });
  });

  describe('VOLATILITY_THRESHOLDS_24H', () => {
    it('should have LOW_MAX, NORMAL_MAX, and HIGH_MAX properties', () => {
      expect(VOLATILITY_THRESHOLDS_24H).toHaveProperty('LOW_MAX');
      expect(VOLATILITY_THRESHOLDS_24H).toHaveProperty('NORMAL_MAX');
      expect(VOLATILITY_THRESHOLDS_24H).toHaveProperty('HIGH_MAX');
    });

    it('should have correct threshold values', () => {
      expect(VOLATILITY_THRESHOLDS_24H.LOW_MAX).toBe(2.0);
      expect(VOLATILITY_THRESHOLDS_24H.NORMAL_MAX).toBe(5.0);
      expect(VOLATILITY_THRESHOLDS_24H.HIGH_MAX).toBe(10.0);
    });

    it('should have thresholds in ascending order', () => {
      expect(VOLATILITY_THRESHOLDS_24H.LOW_MAX).toBeLessThan(VOLATILITY_THRESHOLDS_24H.NORMAL_MAX);
      expect(VOLATILITY_THRESHOLDS_24H.NORMAL_MAX).toBeLessThan(VOLATILITY_THRESHOLDS_24H.HIGH_MAX);
    });

    it('should have higher thresholds than 1h (24h allows more movement)', () => {
      expect(VOLATILITY_THRESHOLDS_24H.LOW_MAX).toBeGreaterThan(VOLATILITY_THRESHOLDS_1H.LOW_MAX);
      expect(VOLATILITY_THRESHOLDS_24H.NORMAL_MAX).toBeGreaterThan(VOLATILITY_THRESHOLDS_1H.NORMAL_MAX);
      expect(VOLATILITY_THRESHOLDS_24H.HIGH_MAX).toBeGreaterThan(VOLATILITY_THRESHOLDS_1H.HIGH_MAX);
    });
  });
});

