/**
 * Helper functions for Price Change Velocity Calculator
 */

import type { CoinGeckoMarketData, TopMover, VolatilityLevel } from './types.js';
import { VOLATILITY_THRESHOLDS_1H, VOLATILITY_THRESHOLDS_24H } from './constants.js';

/**
 * Classifies volatility percentage into a level category
 */
export function classifyVolatility(
  volatilityPercent: number,
  thresholds: typeof VOLATILITY_THRESHOLDS_1H | typeof VOLATILITY_THRESHOLDS_24H
): VolatilityLevel {
  if (volatilityPercent < thresholds.LOW_MAX) return 'LOW';
  if (volatilityPercent < thresholds.NORMAL_MAX) return 'NORMAL';
  if (volatilityPercent < thresholds.HIGH_MAX) return 'HIGH';
  return 'EXTREME';
}

/**
 * Finds the coin with the largest absolute price change
 * 
 * @param coins - Array of coin market data
 * @param timeframe - Either '1h' or '24h' to determine which change percentage to use
 * @returns TopMover object with coin information and change percentage, or null if no valid data exists
 */
export function findTopMover(
  coins: CoinGeckoMarketData[],
  timeframe: '1h' | '24h'
): TopMover | null {
  const changeKey = timeframe === '1h' 
    ? 'price_change_percentage_1h_in_currency' 
    : 'price_change_percentage_24h';
  
  let topCoin: CoinGeckoMarketData | null = null;
  let maxChange = 0;
  
  for (const coin of coins) {
    const change = coin[changeKey];
    if (change !== undefined && change !== null) {
      const absChange = Math.abs(change);
      if (absChange > maxChange) {
        maxChange = absChange;
        topCoin = coin;
      }
    }
  }
  
  // Return null if no valid changes found (avoids misleading "0% top mover" display)
  if (!topCoin) {
    return null;
  }
  
  const changeValue = topCoin[changeKey] ?? 0;
  
  return {
    coinId: topCoin.id,
    symbol: topCoin.symbol.toUpperCase(),
    name: topCoin.name,
    changePercentage: changeValue,
  };
}

