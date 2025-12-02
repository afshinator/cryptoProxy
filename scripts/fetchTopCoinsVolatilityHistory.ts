// Filename: scripts/fetchTopCoinsVolatilityHistory.ts
/**
 * Top Coins Historical Market Data Fetcher - to seed the database with historical market volatility data
 * 
 * This script fetches the top N coins by market cap from CoinGecko, then retrieves
 * 90 days of historical market data for each coin and saves each coin's data to a separate JSON file.
 * 
 * This data will be used to seed the database with historical market volatility data,
 * and also used to calculate current volatility.
 * 
 * How it works:
 * 1. Uses the same API key loading method as the markets endpoint (via coingeckoConfig)
 * 2. Fetches top N coins from CoinGecko markets endpoint (ordered by market cap)
 * 3. For each coin, calls the /coins/{id}/market_chart endpoint with:
 *    - vs_currency=usd
 *    - days=90
 *    - interval=daily
 * 4. Saves the response to a JSON file in the top-coins-history/ directory
 *    - Filename format: [coinId]-[startDate]-[endDate].json
 *    - Dates are formatted as MM-DD-YY
 * 5. Pauses between requests to avoid rate limiting
 * 6. Skips coins that return 404 (not found)
 * 
 * Output: One JSON file per coin in the top-coins-history/ directory containing prices, market_caps, and total_volumes arrays
 * 
 * Usage: npx tsx scripts/fetchTopCoinsData.ts
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

// Configuration
const TOP_COINS_COUNT = 25;    // We only want 20 but we'll skip stablecoins
const OUTPUT_DIR = 'top-coins-history';

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  [key: string]: any;
}

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

    // Filter out stablecoins
    const filteredCoins = topCoins.filter(coin => !isStablecoin(coin));
    const skippedCount = topCoins.length - filteredCoins.length;
    
    if (skippedCount > 0) {
      log(`Skipped ${skippedCount} stablecoin(s)`, LOG);
    }
    
    if (filteredCoins.length === 0) {
      log('No non-stablecoin coins found after filtering', ERR);
      process.exit(1);
    }

    log(`Starting data fetch for ${filteredCoins.length} coins...`, LOG);

    // Convert MarketCoin[] to CoinInfo[]
    const coins: CoinInfo[] = filteredCoins.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name
    }));

    await processCoins(coins, OUTPUT_DIR);
    log('All data fetched successfully!', LOG);
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
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetchTopCoinsData.ts')) {
  main();
}

