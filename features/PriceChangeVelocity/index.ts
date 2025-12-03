/**
 * Price Change Velocity Calculator
 * 
 * Main exports for the Price Change Velocity feature.
 * This module calculates market-wide volatility using market-cap weighted
 * average of price changes across top cryptocurrency assets.
 */

// Main calculation function and utilities
export {
  calculateMarketVolatility,
  shouldIncreaseRefreshRate,
  isSustainedVolatility,
} from './PriceChangeVelocityCalculator.js';

// Types
export type {
  CoinGeckoMarketData,
  VolatilityLevel,
  TopMover,
  VolatilityAnalysis,
} from './types.js';

// Constants
export {
  TOP_COINS_COUNT,
  VOLATILITY_THRESHOLDS_1H,
  VOLATILITY_THRESHOLDS_24H,
} from './constants.js';

