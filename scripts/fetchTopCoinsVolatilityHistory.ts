// Filename: scripts/fetchTopCoinsVolatilityHistory.ts
/**
 * Top Coins Historical Market Data Fetcher
 * 
 * This script fetches the top N coins by market cap from CoinGecko, then retrieves
 * 30 days of historical OHLCV (Open, High, Low, Close, Volume) data for each coin
 * and saves each coin's data to a separate JSON file.
 * 
 * NOTE: Using 30 days ensures daily granularity. CoinGecko's OHLC endpoint uses
 * 4-day intervals for requests > 30 days, which is less accurate for VWATR calculations.
 * 
 * This data will be used to seed the database with historical market volatility data,
 * and also used to calculate current volatility.
 * 
 * How it works (via utils/volatilityHistory.ts):
 * 1. Uses the same API key loading method as the markets endpoint (via coingeckoConfig)
 * 2. Fetches top N coins from CoinGecko markets endpoint (ordered by market cap)
 * 3. For each coin, calls TWO CoinGecko endpoints in parallel:
 *    - /coins/{id}/ohlc (for Open, High, Low, Close)
 *    - /coins/{id}/market_chart (for Volume)
 * 4. Merges OHLC and Volume data by timestamp to form a complete OHLCV array
 * 5. Saves the OHLCV array to a JSON file in the data/top-coins-history/ directory
 *    - Filename format: [coinId]-[startDate]-[endDate].json
 *    - Dates are formatted as MM-DD-YY
 * 6. Pauses 4 seconds between requests to avoid rate limiting
 * 7. Skips coins that return 404 (not found)
 * 
 * Output: One JSON file per coin in the data/top-coins-history/ directory containing
 * an array of HistoricalOHLCVDataPoint objects with { time, open, high, low, close, volume }
 * 
 * Usage: npx tsx scripts/fetchTopCoinsVolatilityHistory.ts
 */

import { log, ERR, LOG } from '../utils/log.js';
import { fetchFromCoinGecko, CoinGeckoApiError } from '../utils/coingeckoClient.js';
import { stablecoins } from '../constants/stablecoins.js';
import { 
  processCoins, 
  type CoinInfo, 
  VS_CURRENCY,
  formatDate, 
  fetchCoinData, 
  saveToFile as saveToFileUtil 
} from '../utils/volatilityHistory.js';
// Import coingeckoConfig to trigger dotenv loading (same as markets endpoint)
import '../utils/coingeckoConfig.js';
import { join } from 'path';

// Configuration
const TOP_COINS_COUNT = 25;    // We only want 20 but we'll skip stablecoins
// Use absolute path from project root to ensure consistency
const OUTPUT_DIR = join(process.cwd(), 'data', 'top-coins-history');

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  [key: string]: any;
}

// NOTE: This function is preserved but no longer used in main()
export function isStablecoin(coin: MarketCoin): boolean {
  // Check if coin symbol or name matches any stablecoin
  const coinSymbolUpper = coin.symbol.toUpperCase();
  const coinNameLower = coin.name.toLowerCase();
  
  return stablecoins.some(stablecoin => 
    stablecoin.symbol.toUpperCase() === coinSymbolUpper ||
    stablecoin.name.toLowerCase() === coinNameLower
  );
}

export async function fetchTopCoins(): Promise<MarketCoin[]> {
  const params = new URLSearchParams({
    vs_currency: VS_CURRENCY,
    order: 'market_cap_desc',
    per_page: String(TOP_COINS_COUNT),
    page: '1',
    sparkline: 'false'
  });

  return await fetchFromCoinGecko<MarketCoin[]>('/coins/markets', params);
}

// Re-export shared utilities for tests
export { formatDate, fetchCoinData };
export async function saveToFile(coinId: string, data: Parameters<typeof saveToFileUtil>[1]): Promise<void> {
  return saveToFileUtil(coinId, data, OUTPUT_DIR);
}

export async function main() {
  if (!process.env.COINGECKO_API_KEY) {
    log('COINGECKO_API_KEY not found in .env.local', ERR);
    process.exit(1);
  }

  try {
    log(`Fetching top ${TOP_COINS_COUNT} coins by market cap...`, LOG);
    const topCoins = await fetchTopCoins();
    
    if (topCoins.length === 0) {
      log('No coins found from markets endpoint', ERR);
      process.exit(1);
    }

    // --- START UPDATED LOGIC: Stablecoin filtering removed ---
    const coinsToProcess = topCoins;
    
    if (coinsToProcess.length === 0) {
      log('No coins found to process', ERR);
      process.exit(1);
    }

    log(`Starting data fetch for ${coinsToProcess.length} coins (including stablecoins)...`, LOG);

    // Convert MarketCoin[] to CoinInfo[]
    const coins: CoinInfo[] = coinsToProcess.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name
    }));

    await processCoins(coins, OUTPUT_DIR);
    log('All data fetched successfully!', LOG);
    // --- END UPDATED LOGIC ---
  } catch (error) {
    if (error instanceof CoinGeckoApiError) {
      log(`Failed to fetch top coins: ${error.message} (Status: ${error.status})`, ERR);
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Failed to fetch top coins: ${errorMessage}`, ERR);
    }
    process.exit(1);
  }
}

// Only run main() if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetchTopCoinsVolatilityHistory.ts')) {
  main();
}