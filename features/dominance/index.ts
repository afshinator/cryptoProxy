/**
 * Market Dominance Calculator
 * 
 * Main exports for the Market Dominance feature.
 * This module calculates market dominance percentages for BTC, ETH, stablecoins, and others.
 */

// Main calculation function
export { calculateDominance } from './DominanceCalculator.js';

// Data source functions
export {
  fetchAllMarketCapData,
  fetchTotalMarketCap,
  fetchBitcoinMarketCap,
  fetchEthereumMarketCap,
  fetchStablecoinsMarketCap,
} from './dataSource.js';

// Types
export type {
  DominanceAnalysis,
  CategoryDominance,
  MarketCapData,
  CoinGeckoGlobalData,
  CoinGeckoMarketData,
} from './types.js';

// Constants
export {
  BITCOIN_ID,
  ETHEREUM_ID,
} from './constants.js';

// Stablecoin constants are exported from constants/stablecoins.ts
export {
  STABLECOIN_IDS,
  STABLECOIN_COUNT,
} from '../../constants/stablecoins.js';

