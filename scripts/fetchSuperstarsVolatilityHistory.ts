// Filename: scripts/fetchSuperstarsVolatilityHistory.ts
/**
 * Superstars Portfolio Historical Market Data Fetcher
 * 
 * This script fetches 90 days of historical OHLCV (Open, High, Low, Close, Volume) data
 * for cryptocurrencies from the "Superstars" portfolio defined in SeedCoinLists.ts
 * and saves each coin's data to a separate JSON file.
 * 
 * This data will be used to seed the database with historical market volatility data,
 * and also used to calculate current volatility.
 * 
 * How it works (via utils/volatilityHistory.ts):
 * 1. Uses the same API key loading method as the markets endpoint (via coingeckoConfig)
 * 2. Loads coin list from constants/SeedCoinLists.ts (first portfolio, "Superstars")
 * 3. For each coin, calls TWO CoinGecko endpoints in parallel:
 *    - /coins/{id}/ohlc (for Open, High, Low, Close)
 *    - /coins/{id}/market_chart (for Volume)
 * 4. Merges OHLC and Volume data by timestamp to form a complete OHLCV array
 * 5. Saves the OHLCV array to a JSON file in the data/coin-history/ directory
 *    - Filename format: [coinId]-[startDate]-[endDate].json
 *    - Dates are formatted as MM-DD-YY
 * 6. Pauses 4 seconds between requests to avoid rate limiting
 * 7. Skips coins that return 404 (not found)
 * 
 * Output: One JSON file per coin in the data/coin-history/ directory containing
 * an array of HistoricalOHLCVDataPoint objects with { time, open, high, low, close, volume }
 * 
 * Usage: npx tsx scripts/fetchSuperstarsVolatilityHistory.ts
 */

import { log, ERR, LOG } from '../utils/log.js';
import { CoinGeckoApiError } from '../utils/coingeckoClient.js';
import { cryptoPortfolios } from '../constants/SeedCoinLists.js';
import { 
  processCoins, 
  type CoinInfo, 
  formatDate, 
  fetchCoinData, 
  saveToFile as saveToFileUtil 
} from '../utils/volatilityHistory.js';
// Import coingeckoConfig to trigger dotenv loading (same as markets endpoint)
import '../utils/coingeckoConfig.js';

// Configuration
const OUTPUT_DIR = 'data/coin-history';

// Re-export for tests
export { formatDate, fetchCoinData };
export async function saveToFile(coinId: string, data: Parameters<typeof saveToFileUtil>[1]): Promise<void> {
  return saveToFileUtil(coinId, data, OUTPUT_DIR);
}

// Get coin tickers from the first portfolio
const COIN_TICKERS = Object.keys(cryptoPortfolios[0].coins);

export async function main() {
  if (!process.env.COINGECKO_API_KEY) {
    log('COINGECKO_API_KEY not found in .env.local', ERR);
    process.exit(1);
  }

  log(`Starting data fetch for ${COIN_TICKERS.length} coins from ${cryptoPortfolios[0].title}...`, LOG);

  // Convert tickers to CoinInfo format
  const coins: CoinInfo[] = COIN_TICKERS.map(ticker => {
    const coinName = cryptoPortfolios[0].coins[ticker];
    // CoinGecko IDs are lowercase versions of the full names
    const coinGeckoId = coinName.toLowerCase();
    return {
      id: coinGeckoId,
      symbol: ticker,
      name: coinName
    };
  });

  try {
    await processCoins(coins, OUTPUT_DIR);
    log('All data fetched successfully!', LOG);
  } catch (error) {
    if (error instanceof CoinGeckoApiError) {
      log(`Failed to fetch coin data: ${error.message} (Status: ${error.status})`, ERR);
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Failed to fetch coin data: ${errorMessage}`, ERR);
    }
    process.exit(1);
  }
}

// Only run main() if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetchSuperstarsVolatilityHistory.ts')) {
  main();
}