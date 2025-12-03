// features/PriceChangeVelocity/PriceChangeVelocityCalculator.ts
/**
 * CRYPTO MARKET VOLATILITY CALCULATOR
 * 
 * Calculates market-wide volatility using market-cap weighted average of price changes
 * across the top cryptocurrency assets. Uses CoinGecko API data structure.
 * 
 * ALGORITHM:
 * 1. Takes array of coin data (top 50 by market cap recommended)
 * 2. Calculates market-cap weighted average of absolute price changes
 * 3. Returns volatility metrics for both 1h (current) and 24h (context) windows
 * 
 * VOLATILITY VALUE INTERPRETATION:
 * 
 * 1-Hour Volatility (Most Current):
 * - < 1.5%:  LOW      - Very calm market, minimal movement
 * - 1.5-4%:  NORMAL   - Typical crypto market activity
 * - 4-8%:    HIGH     - Significant movement, elevated activity
 * - > 8%:    EXTREME  - Major event, crash, or pump occurring
 * 
 * 24-Hour Volatility (Broader Context):
 * - < 2%:    LOW      - Stable market conditions
 * - 2-5%:    NORMAL   - Standard daily fluctuation
 * - 5-10%:   HIGH     - Elevated daily movement
 * - > 10%:   EXTREME  - Major market shifts
 * 
 * USAGE RECOMMENDATIONS:
 * - Use 1h volatility for triggering dynamic refresh rate adjustments
 * - Use 24h volatility for user-facing metrics and context
 * - If BOTH 1h and 24h are HIGH/EXTREME → sustained volatility (adjust refresh)
 * - If ONLY 1h is HIGH → short-term spike (consider waiting before adjusting)
 * 
 * REFRESH RATE SUGGESTIONS:
 * - LOW:      10-15 min refresh
 * - NORMAL:   5 min refresh
 * - HIGH:     1-2 min refresh
 * - EXTREME:  30 sec refresh
 * 
 * Important note: CoinGecko's 1-hour data field is price_change_percentage_1h_in_currency 
 * - you may need to add &price_change_percentage=1h to your API request URL to get this data.
 * 
 * Example API call:
 * https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&price_change_percentage=1h,24h
 */

import type { CoinGeckoMarketData, VolatilityAnalysis } from './types.js';
import { VOLATILITY_THRESHOLDS_1H, VOLATILITY_THRESHOLDS_24H } from './constants.js';
import { classifyVolatility, findTopMover } from './helpers.js';
import { log, ERR, WARN } from '../../utils/log.js';

/**
 * Calculates market-wide volatility from CoinGecko market data
 * 
 * @param coins - Array of coin market data from CoinGecko API (should be top coins by market cap)
 * @returns Complete volatility analysis with metrics and classifications
 * 
 * @throws Error if coins array is empty or missing required fields
 * 
 * @example
 * const coins = await fetchCoinGeckoMarkets(); // Your fetch implementation
 * const analysis = calculateMarketVolatility(coins);
 * 
 * if (analysis.level1h === 'HIGH' || analysis.level1h === 'EXTREME') {
 *   // Increase app refresh rate
 *   setRefreshInterval(60000); // 1 minute
 * }
 */
export function calculateMarketVolatility(
  coins: CoinGeckoMarketData[]
): VolatilityAnalysis {
  // Validation
  if (!coins || coins.length === 0) {
    log('PriceChangeVelocity: Coins array is empty or undefined', ERR);
    throw new Error('Coins array cannot be empty');
  }
  
  // Filter coins with valid data
  const validCoins = coins.filter(
    coin => 
      coin.market_cap > 0 &&
      coin.current_price > 0 &&
      coin.price_change_percentage_1h_in_currency !== undefined &&
      coin.price_change_percentage_1h_in_currency !== null &&
      coin.price_change_percentage_24h !== undefined &&
      coin.price_change_percentage_24h !== null
  );
  
  // Log warning if some coins were filtered out
  const invalidCount = coins.length - validCoins.length;
  if (invalidCount > 0) {
    log(`PriceChangeVelocity: Filtered out ${invalidCount} coin(s) with missing or invalid data (market_cap, price, or price_change_percentage)`, WARN);
  }
  
  if (validCoins.length === 0) {
    log(`PriceChangeVelocity: No coins with valid market data found. Input had ${coins.length} coin(s), but all were missing required fields (market_cap, current_price, price_change_percentage_1h_in_currency, or price_change_percentage_24h)`, ERR);
    throw new Error('No coins with valid market data found');
  }
  
  // Calculate total market cap
  const totalMarketCap = validCoins.reduce(
    (sum, coin) => sum + coin.market_cap,
    0
  );
  
  // Calculate market-cap weighted volatility for both timeframes
  let weightedVolatility1h = 0;
  let weightedVolatility24h = 0;
  
  for (const coin of validCoins) {
    const weight = coin.market_cap / totalMarketCap;
    
    // Use absolute value to measure magnitude of movement (not direction)
    const absChange1h = Math.abs(coin.price_change_percentage_1h_in_currency!);
    const absChange24h = Math.abs(coin.price_change_percentage_24h!);
    
    weightedVolatility1h += weight * absChange1h;
    weightedVolatility24h += weight * absChange24h;
  }
  
  // Find top movers
  const topMover1h = findTopMover(validCoins, '1h');
  const topMover24h = findTopMover(validCoins, '24h');
  
  // Log warning if top movers are null (shouldn't happen with validated data, but indicates data quality issue)
  if (topMover1h === null) {
    log('PriceChangeVelocity: No valid 1h price change data found for top mover calculation', WARN);
  }
  if (topMover24h === null) {
    log('PriceChangeVelocity: No valid 24h price change data found for top mover calculation', WARN);
  }
  
  // Classify volatility levels
  const level1h = classifyVolatility(weightedVolatility1h, VOLATILITY_THRESHOLDS_1H);
  const level24h = classifyVolatility(weightedVolatility24h, VOLATILITY_THRESHOLDS_24H);
  
  // Calculate market cap coverage (for transparency)
  const allCoinsMarketCap = coins.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);
  const marketCapCoverage = allCoinsMarketCap > 0 
    ? (totalMarketCap / allCoinsMarketCap) 
    : 1;
  
  return {
    volatility1h: Number(weightedVolatility1h.toFixed(2)),
    volatility24h: Number(weightedVolatility24h.toFixed(2)),
    level1h,
    level24h,
    topMover1h,
    topMover24h,
    marketCapCoverage: Number(marketCapCoverage.toFixed(4)),
    coinsAnalyzed: validCoins.length,
    timestamp: Date.now(),
  };
}

/**
 * Determines if current volatility warrants faster refresh rates
 * 
 * @param analysis - Volatility analysis result
 * @returns true if app should increase refresh frequency
 */
export function shouldIncreaseRefreshRate(analysis: VolatilityAnalysis): boolean {
  return analysis.level1h === 'HIGH' || analysis.level1h === 'EXTREME';
}

/**
 * Checks if volatility is sustained (both 1h and 24h elevated)
 * Useful for avoiding false positives from short-term spikes
 * 
 * @param analysis - Volatility analysis result
 * @returns true if both timeframes show elevated volatility
 */
export function isSustainedVolatility(analysis: VolatilityAnalysis): boolean {
  const elevated1h = analysis.level1h === 'HIGH' || analysis.level1h === 'EXTREME';
  const elevated24h = analysis.level24h === 'HIGH' || analysis.level24h === 'EXTREME';
  
  return elevated1h && elevated24h;
}
