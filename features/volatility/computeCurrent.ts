/**
 * Compute Current Volatility (Price Change Velocity)
 * 
 * Extracted computation logic for volatility_current feature.
 * This can be used by both API handlers and cache managers.
 */

import { fetchFromCoinGecko } from '../../utils/coingeckoClient.js';
import { calculateMarketVolatility } from '../PriceChangeVelocity/index.js';
import { TOP_COINS_COUNT } from '../PriceChangeVelocity/constants.js';
import type { CoinGeckoMarketData } from '../PriceChangeVelocity/types.js';
import { log, LOG } from '../../utils/log.js';

export interface ComputeCurrentVolatilityOptions {
  per_page?: number;
}

export interface CurrentVolatilityResult {
  volatility1h: number;
  volatility24h: number;
  level1h: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  level24h: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  topMoverPercentage: number | null;
  topMoverCoin: string | null;
  marketCapCoverage: number;
}

/**
 * Computes current market volatility using price change velocity
 * 
 * @param options - Optional parameters (per_page defaults to TOP_COINS_COUNT)
 * @returns Current volatility analysis
 */
export async function computeCurrentVolatility(
  options: ComputeCurrentVolatilityOptions = {}
): Promise<CurrentVolatilityResult> {
  const perPage = options.per_page ?? TOP_COINS_COUNT;

  // Validate per_page
  if (isNaN(perPage) || perPage <= 0 || perPage > 250) {
    throw new Error('Invalid per_page parameter. Must be a positive number between 1 and 250.');
  }

  // Build query parameters for CoinGecko markets endpoint
  const params = new URLSearchParams();
  params.append('vs_currency', 'usd');
  params.append('order', 'market_cap_desc');
  params.append('per_page', String(perPage));
  params.append('page', '1');
  params.append('price_change_percentage', '1h,24h'); // Required for price change velocity calculation

  // Fetch market data from CoinGecko
  log(`Fetching top ${perPage} coins from CoinGecko for price change velocity calculation...`, LOG);
  const marketData = await fetchFromCoinGecko<CoinGeckoMarketData[]>('/coins/markets', params);

  if (!marketData || marketData.length === 0) {
    throw new Error('No market data returned from CoinGecko API');
  }

  log(`Received ${marketData.length} coins from CoinGecko. Calculating market volatility...`, LOG);

  // Calculate market volatility
  const analysis = calculateMarketVolatility(marketData);

  // Transform to simplified response format
  const response: CurrentVolatilityResult = {
    volatility1h: analysis.volatility1h,
    volatility24h: analysis.volatility24h,
    level1h: analysis.level1h,
    level24h: analysis.level24h,
    topMoverPercentage: analysis.topMover1h?.changePercentage ?? null,
    topMoverCoin: analysis.topMover1h?.symbol ?? null,
    marketCapCoverage: analysis.marketCapCoverage,
  };

  log(`Price change velocity calculated: 1h=${response.volatility1h}% (${response.level1h}), 24h=${response.volatility24h}% (${response.level24h})`, LOG);

  return response;
}

