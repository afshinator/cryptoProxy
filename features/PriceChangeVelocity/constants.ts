/**
 * Constants for Price Change Velocity Calculator
 */

/** Number of top coins to analyze (by market cap) */
export const TOP_COINS_COUNT = 50;

/** Volatility level thresholds for 1-hour window (%) */
export const VOLATILITY_THRESHOLDS_1H = {
  LOW_MAX: 1.5,
  NORMAL_MAX: 4.0,
  HIGH_MAX: 8.0,
  // EXTREME is > HIGH_MAX
} as const;

/** Volatility level thresholds for 24-hour window (%) */
export const VOLATILITY_THRESHOLDS_24H = {
  LOW_MAX: 2.0,
  NORMAL_MAX: 5.0,
  HIGH_MAX: 10.0,
  // EXTREME is > HIGH_MAX
} as const;

