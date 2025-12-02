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
// IMPORTANT: CoinGecko OHLC endpoint granularity:
// - 1-30 days: 4-hour intervals (can be aggregated to daily)
// - 31+ days: 4-day intervals (less accurate for VWATR)
// Using 30 days ensures daily granularity for accurate VWATR calculations
export const DAYS = 30;
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
    log(`  [${coinId}] Calling CoinGecko OHLC endpoint: ${endpoint}?${params.toString()}`, LOG);
    const data = await fetchFromCoinGecko<OhlcResponse>(endpoint, params);
    log(`  [${coinId}] OHLC API returned ${data.length} candles`, LOG);
    return data;
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
    log(`  [${coinId}] Calling CoinGecko Market Chart endpoint: ${endpoint}?${params.toString()}`, LOG);
    const data = await fetchFromCoinGecko<MarketChartResponse>(endpoint, params);
    log(`  [${coinId}] Market Chart API returned ${data.total_volumes.length} volume points`, LOG);
    return data;
}


/**
 * Fetches OHLC and Volume data, merges them, and returns the combined OHLCV array.
 */
export async function fetchCoinData(coinId: string): Promise<HistoricalOHLCVDataPoint[]> {
    log(`Fetching OHLC and Volume data for ${coinId} (requesting ${DAYS} days)...`, LOG);
    
    // 1. Fetch OHLC (for Open, High, Low, Close)
    const ohlcDataPromise = fetchOhlcData(coinId);
    
    // 2. Fetch Market Chart (for Volume)
    const marketChartPromise = fetchMarketChartData(coinId);

    const [ohlc, marketChart] = await Promise.all([ohlcDataPromise, marketChartPromise]);
    
    // Log raw data counts
    log(`  [${coinId}] OHLC endpoint returned ${ohlc.length} data points`, LOG);
    log(`  [${coinId}] Market Chart endpoint returned ${marketChart.total_volumes.length} volume data points`, LOG);
    
    // CoinGecko API granularity explanation
    // For requests <= 30 days: 4-hour intervals (can be aggregated to ~daily)
    // For requests > 30 days: 4-day intervals (less accurate)
    // With DAYS=30, we should get ~30 candles (one per day, from 4-hour data)
    const expectedOhlcCandles = DAYS; // For 30 days, expect ~30 candles
    if (ohlc.length >= DAYS * 0.9 && ohlc.length <= DAYS * 1.1) {
        log(`  [${coinId}] ✅ OHLC returned ${ohlc.length} candles (expected ~${expectedOhlcCandles} for ${DAYS} days with daily granularity).`, LOG);
    } else if (ohlc.length < DAYS * 0.8) {
        log(`  [${coinId}] ⚠️ WARNING: OHLC data count (${ohlc.length}) is less than 80% of expected (${expectedOhlcCandles} candles for ${DAYS} days).`, WARN);
    } else {
        log(`  [${coinId}] ℹ️ INFO: OHLC returned ${ohlc.length} candles (expected ~${expectedOhlcCandles} for ${DAYS} days).`, LOG);
    }
    
    // Validate volume data (should be daily)
    if (marketChart.total_volumes.length < DAYS * 0.8) {
        log(`  [${coinId}] ⚠️ WARNING: Volume data count (${marketChart.total_volumes.length}) is less than 80% of requested days (${DAYS}). Expected ~${DAYS} points.`, WARN);
    }
    
    // Calculate date range from OHLC data
    if (ohlc.length > 0) {
        const firstTimestamp = ohlc[0][0];
        const lastTimestamp = ohlc[ohlc.length - 1][0];
        const firstDate = new Date(firstTimestamp).toISOString().split('T')[0];
        const lastDate = new Date(lastTimestamp).toISOString().split('T')[0];
        const daysSpan = Math.round((lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24));
        log(`  [${coinId}] OHLC date range: ${firstDate} to ${lastDate} (${daysSpan} days span)`, LOG);
    }
    
    // Index total volumes by timestamp for fast lookup
    // Store as array of [timestamp, volume] pairs sorted by timestamp for range queries
    const volumeData: Array<[number, number]> = [];
    for (const [timestamp, volume] of marketChart.total_volumes) {
        // Round down to nearest day for consistency
        const roundedTimestamp = Math.floor(timestamp / 86400000) * 86400000;
        volumeData.push([roundedTimestamp, volume]);
    }
    // Sort by timestamp to enable efficient range queries
    volumeData.sort((a, b) => a[0] - b[0]);

    // 3. Merge OHLC and Volume Data
    // For 4-day interval candles, we need to aggregate volumes for the period each candle covers
    const mergedData: HistoricalOHLCVDataPoint[] = [];
    let mergedWithVolume = 0;
    let mergedWithoutVolume = 0;
    
    for (let i = 0; i < ohlc.length; i++) {
        const candle = ohlc[i];
        const [timestamp, open, high, low, close] = candle;
        
        // Determine the time range this candle covers
        // For the last candle, use a reasonable estimate (4 days forward)
        // For other candles, use the period until the next candle
        let periodEnd: number;
        if (i < ohlc.length - 1) {
            // Period ends at the start of the next candle
            periodEnd = ohlc[i + 1][0];
        } else {
            // Last candle: estimate 4 days forward (typical interval)
            const avgInterval = ohlc.length > 1 
                ? (ohlc[ohlc.length - 1][0] - ohlc[0][0]) / (ohlc.length - 1)
                : 4 * 24 * 60 * 60 * 1000; // Default to 4 days in ms
            periodEnd = timestamp + avgInterval;
        }
        
        // Round timestamps to day boundaries for matching
        const periodStart = Math.floor(timestamp / 86400000) * 86400000;
        const periodEndRounded = Math.floor(periodEnd / 86400000) * 86400000;
        
        // Aggregate all volumes within this period
        let aggregatedVolume = 0;
        let volumeDaysFound = 0;
        for (const [volTimestamp, volume] of volumeData) {
            // Include volumes that fall within the candle's period (inclusive start, exclusive end)
            if (volTimestamp >= periodStart && volTimestamp < periodEndRounded) {
                aggregatedVolume += volume;
                volumeDaysFound++;
            }
        }
        
        if (aggregatedVolume === 0 || volumeDaysFound === 0) {
            mergedWithoutVolume++;
            if (mergedWithoutVolume <= 5) { // Only log first 5 to avoid spam
                log(`  [${coinId}] Warning: No volume data found for candle at ${new Date(timestamp).toISOString()} (period: ${new Date(periodStart).toISOString()} to ${new Date(periodEndRounded).toISOString()}).`, WARN);
            }
        } else {
            mergedWithVolume++;
            if (i === 0) { // Log first successful merge as example
                log(`  [${coinId}] Volume aggregation example: Candle at ${new Date(timestamp).toISOString()} aggregated ${volumeDaysFound} daily volumes = ${aggregatedVolume.toFixed(2)}`, LOG);
            }
        }

        mergedData.push({
            time: timestamp,
            open,
            high,
            low,
            close,
            volume: aggregatedVolume, // Use aggregated volume for the period
        });
    }
    
    if (mergedWithoutVolume > 0) {
        log(`  [${coinId}] ⚠️ Merged ${mergedWithVolume} points with volume, ${mergedWithoutVolume} points without volume (set to 0)`, WARN);
    }

    log(`  [${coinId}] ✅ Successfully merged ${mergedData.length} OHLCV data points (expected ~${DAYS} days)`, LOG);
    
    // Final validation
    if (mergedData.length < DAYS * 0.5) {
        log(`  [${coinId}] ❌ ERROR: Final merged data (${mergedData.length} points) is less than 50% of requested days (${DAYS}). Data may be incomplete!`, ERR);
    }
    
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
    log(`[${index + 1}/${total}] Fetching ${coinSymbol} (${coinName}, id: ${coinId})...`, LOG);
    
    // fetchCoinData now returns the merged OHLCV array
    const data = await fetchCoinData(coinId);
    
    if (data.length > 0) {
      // Calculate actual date range from the data
      const firstDate = new Date(data[0].time).toISOString().split('T')[0];
      const lastDate = new Date(data[data.length - 1].time).toISOString().split('T')[0];
      const daysSpan = Math.round((data[data.length - 1].time - data[0].time) / (1000 * 60 * 60 * 24));
      
      await saveToFile(coinId, data, outputDir);
      log(`✓ ${coinSymbol}: ${data.length} OHLCV data points saved (${firstDate} to ${lastDate}, ${daysSpan} days span)`, LOG);
      
      // Validate against expected days
      if (data.length < DAYS * 0.5) {
        log(`  ⚠️ ${coinSymbol}: WARNING - Only ${data.length} data points saved, expected ~${DAYS} days!`, WARN);
      } else if (data.length < DAYS * 0.9) {
        log(`  ⚠️ ${coinSymbol}: WARNING - Only ${data.length} data points saved, expected ~${DAYS} days.`, WARN);
      }
      
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
  const results: { symbol: string; dataPoints: number; success: boolean }[] = [];
  
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    const success = await processCoin(coin, outputDir, i, coins.length);
    
    // Track results for summary
    if (success) {
      // Try to read the saved file to get actual data point count
      try {
        const { readFile } = await import('fs/promises');
        const { join } = await import('path');
        // We can't easily get the count without reading, so we'll track it differently
        // For now, just track success
        results.push({ symbol: coin.symbol, dataPoints: 0, success: true });
      } catch {
        results.push({ symbol: coin.symbol, dataPoints: 0, success: true });
      }
    } else {
      results.push({ symbol: coin.symbol, dataPoints: 0, success: false });
    }
    
    // Pause between requests (except after the last one)
    if (i < coins.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PAUSE_DURATION_MS));
    }
  }
  
  // Summary log
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  log(`\n📊 Processing Summary:`, LOG);
  log(`  ✅ Successfully processed: ${successful}/${coins.length} coins`, LOG);
  if (failed > 0) {
    log(`  ❌ Failed/Skipped: ${failed} coins`, WARN);
    const failedSymbols = results.filter(r => !r.success).map(r => r.symbol).join(', ');
    log(`  Failed coins: ${failedSymbols}`, WARN);
  }
  log(`  Expected data points per coin: ~${DAYS} days (${DAYS} data points)`, LOG);
  log(`  If any coin has significantly fewer data points, check the logs above for warnings.`, LOG);
}