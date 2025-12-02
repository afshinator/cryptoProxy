// Filename: utils/volatilityHistory.ts
/**
 * Shared utilities for fetching and saving cryptocurrency volatility history data
 *
 * 1. /ohlc (to get Open, High, Low, Close)
 * 2. /market_chart (to get Volume)
 * The data is then merged into a single OHLCV structure before saving.
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

// Interface for raw market chart response (specifically needed for total_volumes)
export interface MarketChartResponse {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][]; // [timestamp, volume]
}

// Interface for raw OHLC response
export type OhlcResponse = [number, number, number, number, number][]; 
// [timestamp, open, high, low, close]

// Interface for coin information used in processing
export interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
}

// TARGET STRUCTURE: The final, merged OHLCV data point for VWATR calculation
export interface HistoricalOHLCVDataPoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
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
 * Fetches historical OHLC (Open, High, Low, Close) data for a coin from CoinGecko
 */
async function fetchOhlcData(coinId: string): Promise<OhlcResponse> {
    const params = new URLSearchParams({
        vs_currency: VS_CURRENCY,
        days: String(DAYS),
    });
    const endpoint = `/coins/${coinId}/ohlc`;
    return await fetchFromCoinGecko<OhlcResponse>(endpoint, params);
}

/**
 * Fetches historical market chart data (primarily for Total Volume) for a coin from CoinGecko
 */
async function fetchMarketChartData(coinId: string): Promise<MarketChartResponse> {
    const params = new URLSearchParams({
        vs_currency: VS_CURRENCY,
        days: String(DAYS),
        interval: INTERVAL // 'daily' interval for market chart
    });
    const endpoint = `/coins/${coinId}/market_chart`;
    return await fetchFromCoinGecko<MarketChartResponse>(endpoint, params);
}


/**
 * Fetches OHLC and Volume data, merges them, and returns the combined OHLCV array.
 */
export async function fetchCoinData(coinId: string): Promise<HistoricalOHLCVDataPoint[]> {
    log(`Fetching OHLC and Volume data for ${coinId}...`);
    
    // 1. Fetch OHLC (for Open, High, Low, Close)
    const ohlcDataPromise = fetchOhlcData(coinId);
    
    // 2. Fetch Market Chart (for Volume)
    const marketChartPromise = fetchMarketChartData(coinId);

    const [ohlc, marketChart] = await Promise.all([ohlcDataPromise, marketChartPromise]);
    
    // Index total volumes by timestamp for fast lookup
    const volumeMap = new Map<number, number>();
    for (const [timestamp, volume] of marketChart.total_volumes) {
        // CoinGecko timestamps from /market_chart are often rounded differently than /ohlc.
        // We round down the timestamp to the nearest day (86400000 ms) for merging reliability.
        const roundedTimestamp = Math.floor(timestamp / 86400000) * 86400000;
        volumeMap.set(roundedTimestamp, volume);
    }

    // 3. Merge OHLC and Volume Data
    const mergedData: HistoricalOHLCVDataPoint[] = [];
    
    ohlc.forEach(candle => {
        const [timestamp, open, high, low, close] = candle;
        
        // Match the OHLC timestamp to the rounded Volume timestamp
        const roundedTimestamp = Math.floor(timestamp / 86400000) * 86400000;
        const volume = volumeMap.get(roundedTimestamp) || 0; // Default to 0 if volume is missing
        
        if (volume === 0) {
            log(`Warning: Volume data missing for ${coinId} at timestamp ${timestamp}.`, WARN);
        }

        mergedData.push({
            time: timestamp,
            open,
            high,
            low,
            close,
            volume,
        });
    });

    log(`Successfully merged ${mergedData.length} OHLCV data points.`);
    return mergedData;
}

/**
 * Saves market chart data to a JSON file
 * @param coinId - The coin identifier to use in the filename
 * @param data - The OHLCV data to save (now the HistoricalOHLCVDataPoint[])
 * @param outputDir - The directory to save the file in
 */
export async function saveToFile(coinId: string, data: HistoricalOHLCVDataPoint[], outputDir: string): Promise<void> {
  if (data.length === 0) {
    log(`Cannot save file for ${coinId}: data array is empty.`, WARN);
    return;
  }
  
  const startDate = formatDate(data[0].time);
  const endDate = formatDate(data[data.length - 1].time);
  // The filename format remains the same, but the content is the merged array
  const filename = `${coinId}-${startDate}-${endDate}.json`;
  
  // Ensure the output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
  
  // Save file to output directory
  const filePath = join(outputDir, filename);
  // Save the OHLCV array directly
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
    
    // fetchCoinData now returns the merged OHLCV array
    const data = await fetchCoinData(coinId);
    
    if (data.length > 0) {
      await saveToFile(coinId, data, outputDir);
      log(`✓ ${coinSymbol}: ${data.length} OHLCV data points saved`, LOG);
      return true;
    } else {
      log(`⚠ Skipping ${coinSymbol}: Fetched data was empty.`, WARN);
      return false;
    }
    
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