/**
 * CoinGecko Historical Market Data Fetcher
 * 
 * This script fetches 90 days of historical market data for a list of cryptocurrencies
 * from the CoinGecko API and saves each coin's data to a separate JSON file.
 * 
 * This data will be used to seed the database with historical market volatility data,
 * and also used to calcuate current volatility.
 * 
 * How it works:
 * 1. Uses the same API key loading method as the markets endpoint (via coingeckoConfig)
 * 2. Iterates through the COIN_IDS array
 * 3. For each coin, calls the /coins/{id}/market_chart endpoint with:
 *    - vs_currency=usd
 *    - days=90
 *    - interval=daily
 * 4. Saves the response to a JSON file named: [coinId]-[startDate]-[endDate].json
 *    - Dates are formatted as MM-DD-YY
 * 5. Pauses 2 seconds between requests to avoid rate limiting
 * 6. Stops execution if any request fails
 * 
 * Output: One JSON file per coin containing prices, market_caps, and total_volumes arrays
 * 
 * Usage: npx tsx fetchCoinData.ts
 */

import * as fs from 'fs/promises';
import { log, ERR, WARN, LOG, INFO } from '../utils/log.js';
import { fetchFromCoinGecko, CoinGeckoApiError } from '../utils/coingeckoClient.js';
// Import coingeckoConfig to trigger dotenv loading (same as markets endpoint)
import '../utils/coingeckoConfig.js';

// Configuration
const PAUSE_DURATION_MS = 2000;
const VS_CURRENCY = 'usd';
const DAYS = 90;
const INTERVAL = 'daily';

// List of coin IDs to fetch data for
const COIN_IDS = [
  'bitcoin',
  'ethereum',
  'cardano',
  // Add more coin IDs here
];

interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${day}-${year}`;
}

export async function fetchCoinData(coinId: string): Promise<MarketChartResponse> {
  const params = new URLSearchParams({
    vs_currency: VS_CURRENCY,
    days: String(DAYS),
    interval: INTERVAL
  });

  return await fetchFromCoinGecko<MarketChartResponse>(
    `/coins/${coinId}/market_chart`,
    params
  );
}

export async function saveToFile(coinId: string, data: MarketChartResponse): Promise<void> {
  const startDate = formatDate(data.prices[0][0]);
  const endDate = formatDate(data.prices[data.prices.length - 1][0]);
  const filename = `${coinId}-${startDate}-${endDate}.json`;
  
  await fs.writeFile(filename, JSON.stringify(data, null, 2));
}

export async function main() {
  if (!process.env.COINGECKO_API_KEY) {
    log('COINGECKO_API_KEY not found in .env.local', ERR);
    process.exit(1);
  }

  log(`Starting data fetch for ${COIN_IDS.length} coins...`, LOG);

  for (let i = 0; i < COIN_IDS.length; i++) {
    const coinId = COIN_IDS[i];
    
    try {
      log(`[${i + 1}/${COIN_IDS.length}] Fetching ${coinId}...`, LOG);
      
      const data = await fetchCoinData(coinId);
      await saveToFile(coinId, data);
      
      log(`✓ ${coinId}: ${data.prices.length} data points saved`, LOG);
      
      // Pause between requests (except after the last one)
      if (i < COIN_IDS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION_MS));
      }
      
    } catch (error) {
      if (error instanceof CoinGeckoApiError) {
        log(`Failed to fetch ${coinId}: ${error.message} (Status: ${error.status})`, ERR);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log(`Failed to fetch ${coinId}: ${errorMessage}`, ERR);
      }
      process.exit(1);
    }
  }

  log('All data fetched successfully!', LOG);
}

// Only run main() if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetchSeedData.ts')) {
  main();
}