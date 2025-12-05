/**
 * Data Source Layer for Market Dominance
 * 
 * This module handles all data fetching from CoinGecko API.
 * The calculation logic is separated from the data source to allow
 * easy switching to alternative data providers in the future.
 */

import { log, ERR, LOG, WARN, TMI } from '../../utils/log.js';
import { fetchFromCoinGecko } from '../../utils/coingeckoClient.js';
import type {
  CoinGeckoGlobalData,
  CoinGeckoMarketData,
  MarketCapData,
} from './types.js';
import {
  BITCOIN_ID,
  ETHEREUM_ID,
} from './constants.js';
import {
  STABLECOIN_IDS,
  STABLECOIN_COUNT,
} from '../../constants/stablecoins.js';

/**
 * Fetches total market cap from CoinGecko /global endpoint
 * @returns Total market cap in USD
 */
export async function fetchTotalMarketCap(): Promise<number> {
  log('💪 Fetching total market cap from /global endpoint...', TMI);
  
  const params = new URLSearchParams();
  const data = await fetchFromCoinGecko<CoinGeckoGlobalData>('/global', params);
  
  const totalMarketCap = data.data.total_market_cap.usd;
  log(`💪 Total market cap: $${totalMarketCap.toLocaleString()}`, LOG);
  
  return totalMarketCap;
}

/**
 * Fetches Bitcoin market cap from CoinGecko /coins/markets endpoint
 * @returns Bitcoin market cap in USD
 */
export async function fetchBitcoinMarketCap(): Promise<number> {
  log('💪 Fetching Bitcoin market cap...', TMI);
  
  const params = new URLSearchParams();
  params.append('vs_currency', 'usd');
  params.append('ids', BITCOIN_ID);
  
  const data = await fetchFromCoinGecko<CoinGeckoMarketData[]>('/coins/markets', params);
  
  if (!data || data.length === 0) {
    log('💪 ⚠️ Bitcoin market data not found', WARN);
    return 0;
  }
  
  const btcMarketCap = data[0].market_cap;
  log(`💪 Bitcoin market cap: $${btcMarketCap.toLocaleString()}`, LOG);
  
  return btcMarketCap;
}

/**
 * Fetches Ethereum market cap from CoinGecko /coins/markets endpoint
 * @returns Ethereum market cap in USD
 */
export async function fetchEthereumMarketCap(): Promise<number> {
  log('💪 Fetching Ethereum market cap...', TMI);
  
  const params = new URLSearchParams();
  params.append('vs_currency', 'usd');
  params.append('ids', ETHEREUM_ID);
  
  const data = await fetchFromCoinGecko<CoinGeckoMarketData[]>('/coins/markets', params);
  
  if (!data || data.length === 0) {
    log('💪 ⚠️ Ethereum market data not found', WARN);
    return 0;
  }
  
  const ethMarketCap = data[0].market_cap;
  log(`💪 Ethereum market cap: $${ethMarketCap.toLocaleString()}`, LOG);
  
  return ethMarketCap;
}

/**
 * Fetches all stablecoin market caps from CoinGecko /coins/markets endpoint
 * @returns Sum of all stablecoin market caps in USD
 */
export async function fetchStablecoinsMarketCap(): Promise<number> {
  log(`💪 Fetching stablecoin market caps for ${STABLECOIN_COUNT} coins...`, TMI);
  
  const params = new URLSearchParams();
  params.append('vs_currency', 'usd');
  params.append('ids', STABLECOIN_IDS.join(','));
  
  const data = await fetchFromCoinGecko<CoinGeckoMarketData[]>('/coins/markets', params);
  
  if (!data || data.length === 0) {
    log('💪 ⚠️ No stablecoin market data found', WARN);
    return 0;
  }
  
  // Create a map of coin IDs to market caps for easier lookup
  const marketCapMap = new Map<string, number>();
  for (const coin of data) {
    marketCapMap.set(coin.id, coin.market_cap || 0);
  }
  
  // Sum market caps for all stablecoins
  let totalStablecoinMarketCap = 0;
  let foundCount = 0;
  let missingCoins: string[] = [];
  
  for (const stablecoinId of STABLECOIN_IDS) {
    const marketCap = marketCapMap.get(stablecoinId);
    if (marketCap !== undefined && marketCap > 0) {
      totalStablecoinMarketCap += marketCap;
      foundCount++;
    } else {
      missingCoins.push(stablecoinId);
    }
  }
  
  if (missingCoins.length > 0) {
    log(`💪 ⚠️ ${missingCoins.length} stablecoin(s) not found or have zero market cap: ${missingCoins.join(', ')}`, WARN);
  }
  
  log(`💪 Stablecoins market cap: $${totalStablecoinMarketCap.toLocaleString()} (${foundCount}/${STABLECOIN_COUNT} coins found)`, LOG);
  
  return totalStablecoinMarketCap;
}

/**
 * Fetches all market cap data needed for dominance calculation
 * This is the main entry point for data fetching
 * @returns MarketCapData object with all required market caps
 */
export async function fetchAllMarketCapData(): Promise<MarketCapData> {
  log('💪 Starting market cap data fetch...', LOG);
  
  // Fetch all data in parallel for better performance
  const [total, btc, eth, stablecoins] = await Promise.all([
    fetchTotalMarketCap(),
    fetchBitcoinMarketCap(),
    fetchEthereumMarketCap(),
    fetchStablecoinsMarketCap(),
  ]);
  
  log('💪 All market cap data fetched successfully', LOG);
  
  return {
    total,
    btc,
    eth,
    stablecoins,
  };
}

