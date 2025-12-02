// Filename: utils/volatilityHistory.ts
/**
 * Shared utilities for fetching and saving cryptocurrency volatility history data
 */

import * as fs from 'fs/promises';
import { join } from 'path';
import { log, ERR, WARN, LOG } from './log.js';
import { fetchFromCoinGecko, CoinGeckoApiError } from './coingeckoClient.js';
import { COINGECKO_BASE_URL } from '../constants/api.js';

// Shared configuration constants
export const VS_CURRENCY = 'usd';
export const DAYS = 90;
export const INTERVAL = 'daily';
export const PAUSE_DURATION_MS = 4000;

// Interface for market chart response from CoinGecko
export interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

// Interface for coin information used in processing
export interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
}

/**
 * Formats a timestamp to MM-DD-YY format
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}-${day}-${year}`;
}

/**
 * Fetches historical market data for a coin from CoinGecko
 */
export async function fetchCoinData(coinId: string): Promise<MarketChartResponse> {
  const params = new URLSearchParams({
    vs_currency: VS_CURRENCY,
    days: String(DAYS),
    interval: INTERVAL
  });

  const endpoint = `/coins/${coinId}/market_chart`;

  try {
    return await fetchFromCoinGecko<MarketChartResponse>(endpoint, params);
  } catch (error) {
    // Log the full URL on error for debugging/testing
    const fullUrl = `${COINGECKO_BASE_URL}${endpoint}?${params.toString()}`;
    log(`Failed request URL: ${fullUrl}`, ERR);
    throw error;
  }
}

/**
 * Saves market chart data to a JSON file
 * @param coinId - The coin identifier to use in the filename
 * @param data - The market chart data to save
 * @param outputDir - The directory to save the file in
 */
export async function saveToFile(coinId: string, data: MarketChartResponse, outputDir: string): Promise<void> {
  const startDate = formatDate(data.prices[0][0]);
  const endDate = formatDate(data.prices[data.prices.length - 1][0]);
  const filename = `${coinId}-${startDate}-${endDate}.json`;
  
  // Ensure the output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
  
  // Save file to output directory
  const filePath = join(outputDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Processes a single coin: fetches data and saves to file
 * @param coin - Coin information
 * @param outputDir - Directory to save the file
 * @param index - Current index (for logging)
 * @param total - Total number of coins (for logging)
 * @returns true if successful, false if skipped (404), throws on other errors
 */
export async function processCoin(
  coin: CoinInfo,
  outputDir: string,
  index: number,
  total: number
): Promise<boolean> {
  const { id: coinId, symbol: coinSymbol, name: coinName } = coin;
  
  try {
    log(`[${index + 1}/${total}] Fetching ${coinSymbol} (${coinName})...`, LOG);
    
    const data = await fetchCoinData(coinId);
    await saveToFile(coinId, data, outputDir);
    
    log(`✓ ${coinSymbol}: ${data.prices.length} data points saved`, LOG);
    return true;
  } catch (error) {
    if (error instanceof CoinGeckoApiError) {
      // Don't stop on 404 errors, just log and continue
      if (error.status === 404) {
        log(`⚠ Skipping ${coinSymbol} (${coinId}): Coin not found (404)`, WARN);
        return false;
      } else {
        log(`Failed to fetch ${coinSymbol} (${coinId}): ${error.message} (Status: ${error.status})`, ERR);
        throw error;
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Failed to fetch ${coinSymbol} (${coinId}): ${errorMessage}`, ERR);
      throw error;
    }
  }
}

/**
 * Processes a list of coins with rate limiting pauses between requests
 * @param coins - Array of coins to process
 * @param outputDir - Directory to save files
 */
export async function processCoins(coins: CoinInfo[], outputDir: string): Promise<void> {
  for (let i = 0; i < coins.length; i++) {
    await processCoin(coins[i], outputDir, i, coins.length);
    
    // Pause between requests (except after the last one)
    if (i < coins.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION_MS));
    }
  }
}

