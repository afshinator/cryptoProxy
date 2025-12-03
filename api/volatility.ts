// Filename: api/volatility.ts
/**
 * Unified Volatility API Endpoint
 *
 * This Vercel Serverless function serves as the central endpoint for calculating
 * various volatility metrics (like VWATR and Price Change Velocity) based on historical
 * data stored in Vercel Blob or real-time data from CoinGecko.
 *
 * IMPORTANT: Maximum period is 30 days. Historical data is fetched with daily granularity
 * (30 days of daily OHLCV data). Periods > 30 days will be rejected.
 *
 * Query Parameters:
 * - type (string, optional): The type of volatility metric to calculate. 
 *   Options: 'vwatr' (default) or 'current_velocity'.
 * - bag (string, optional, for type=vwatr): Specifies the set of coins to process. Default: 'top20_bag'.
 * - periods (string, optional, for type=vwatr): Comma-separated list of lookback days.
 *   Maximum: 30 days. Example: '7,14,30'. Default: [7, 14, 30].
 * - per_page (number, optional, for type=current_velocity): Number of top coins to analyze.
 *   Default: 50. Maximum: 250.
 *
 * Output:
 * - For type=vwatr: JSON response containing the calculated metrics (daily VWATR, ATR%) 
 *   for each coin in the specified bag, broken down by the requested lookback periods.
 * - For type=current_velocity: JSON response with market-wide price change velocity metrics
 *   including 1h and 24h volatility levels, top mover information, and market cap coverage.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import {
  calculateVWATR, // Requires 4 arguments: (symbol, trData, periodCandles, candleIntervalDays)
  precalculateTRData,
  TRData // <-- Imported for type checking from utility
} from '../utils/vwatrCalculator.js';
import { log, ERR, LOG, WARN, INFO } from '../utils/log.js';
import { fetchFromCoinGecko, handleApiError } from '../utils/coingeckoClient.js';
import { calculateMarketVolatility } from '../features/PriceChangeVelocity/index.js';
import { TOP_COINS_COUNT } from '../features/PriceChangeVelocity/constants.js';
import type { CoinGeckoMarketData } from '../features/PriceChangeVelocity/types.js';

// Startup log - runs once per cold start
let startupLogged = false;
if (!startupLogged) {
  const now = new Date();
  const timeStr = now.toISOString();
  log(`🚀 Crypto Proxy API initialized! 🌟 Hello from the serverless function! ⚡ Time: ${timeStr} 🕐`, INFO);
  startupLogged = true;
}

// Define the local interface for the blob object returned by Vercel's `list` function
interface VercelBlob {
  pathname: string;
  url: string;
  uploadedAt: string | Date; // Vercel Blob SDK returns ISO date strings
}

// Define the data structures for Blob data
interface HistoricalOHLCVDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BagManifest {
  superstar_bag: string[];
  top20_bag: string[];
  all_coins: string[];
}

// --- CONFIGURATION ---
const DEFAULT_BAG = 'top20_bag';
// Define supported volatility types
const VOLATILITY_TYPE_VWATR = 'vwatr';
const VOLATILITY_TYPE_CURRENT_VELOCITY = 'current_velocity';
const SUPPORTED_TYPES = [VOLATILITY_TYPE_VWATR, VOLATILITY_TYPE_CURRENT_VELOCITY];
// Default specific periods if none are passed in the query
// Maximum period: 30 days (matches available historical data)
const DEFAULT_VWATR_PERIODS = [7, 14, 30];
const MAX_PERIOD_DAYS = 30;
// ---------------------

/**
 * Robust Blob Lookup: Finds the most recently uploaded blob object (including hash-suffixed files).
 * It uses the file's original name as a prefix, filters by .json extension, and sorts by timestamp.
 *
 * @param prefix The starting name of the file (e.g., 'bag_manifest.json' or 'btc_history.json').
 * @param token The BLOB_READ_WRITE_TOKEN environment variable.
 * @returns The most recent VercelBlob object, or null if not found.
 */
async function findLatestBlob(prefix: string, token: string | undefined): Promise<VercelBlob | null> {
  if (!token) {
    log('BLOB_READ_WRITE_TOKEN is missing for list operation.', ERR);
    return null;
  }

  // Remove the file extension for the list prefix, as hashes come after the base name
  const listPrefix = prefix.replace(/\.json$/i, '');

  try {
    // The list function returns objects that match the VercelBlob structure
    const { blobs } = await list({ prefix: listPrefix, token });

    const matchingBlobs = (blobs as VercelBlob[])
      // Ensure we are filtering to JSON files that start with the correct name (e.g., 'bag_manifest.json')
      .filter(b => b.pathname.startsWith(listPrefix) && b.pathname.endsWith('.json'));

    if (matchingBlobs.length === 0) {
      log(`No blobs found matching prefix: ${prefix}`, ERR);
      return null;
    }

    // Sort by uploadedAt timestamp, descending (newest first)
    matchingBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    // Select the newest one
    const latestBlob = matchingBlobs[0];
    // log(`Found latest blob for ${prefix}: ${latestBlob.pathname} (URL: ${latestBlob.url.substring(0, 50)}...)`, LOG);
    return latestBlob;

  } catch (e) {
    log(`Error listing blobs for prefix ${prefix}: ${e instanceof Error ? e.message : String(e)}`, ERR);
    return null;
  }
}


/**
 * Parses the 'periods' query parameter (e.g., "7,14,30") into an array of positive integers.
 * Validates that all periods are <= MAX_PERIOD_DAYS (30 days).
 * Defaults to DEFAULT_VWATR_PERIODS if the query parameter is missing or invalid.
 * @param queryPeriods The value of req.query.periods
 * @returns Array of integer periods in DAYS (max 30 days)
 */
function parsePeriods(queryPeriods: string | string[] | undefined): { periods: number[]; invalidPeriods: number[] } {
  if (!queryPeriods) {
    return { periods: DEFAULT_VWATR_PERIODS, invalidPeriods: [] };
  }

  const periodsStr = Array.isArray(queryPeriods) ? queryPeriods[0] : queryPeriods;

  const parsedPeriods = periodsStr.split(',')
    .map(p => parseInt(p.trim(), 10))
    .filter(p => !isNaN(p) && p > 0)
    .sort((a, b) => a - b); // Sort to ensure consistent processing

  if (parsedPeriods.length === 0) {
    return { periods: DEFAULT_VWATR_PERIODS, invalidPeriods: [] };
  }

  // Filter out periods > MAX_PERIOD_DAYS
  const validPeriods = parsedPeriods.filter(p => p <= MAX_PERIOD_DAYS);
  const invalidPeriods = parsedPeriods.filter(p => p > MAX_PERIOD_DAYS);

  return {
    periods: validPeriods.length > 0 ? validPeriods : DEFAULT_VWATR_PERIODS,
    invalidPeriods
  };
}

// Suppress DEP0169 deprecation warning from dependencies (url.parse() usage in @vercel/blob or its deps)
// This warning is from a transitive dependency and cannot be fixed in our code.
// We intercept stderr to filter out this specific deprecation warning message.
let stderrIntercepted = false;
if (!stderrIntercepted && process.stderr && typeof process.stderr.write === 'function') {
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
    const message = typeof chunk === 'string' ? chunk : chunk.toString();
    // Filter out DEP0169 deprecation warnings
    if (message.includes('DEP0169') || message.includes('url.parse()')) {
      // Suppress this specific deprecation warning
      if (typeof callback === 'function') {
        callback();
      }
      return true;
    }
    // Pass through all other output
    return originalStderrWrite(chunk, encoding, callback);
  };
  stderrIntercepted = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow cross-origin requests for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      return res.status(500).json({ error: 'Configuration Error: BLOB_READ_WRITE_TOKEN not available at runtime.' });
    }

    // 1. Determine the volatility type (defaults to vwatr)
    const volatilityType = (req.query.type as string)?.toLowerCase() || VOLATILITY_TYPE_VWATR;

    if (!SUPPORTED_TYPES.includes(volatilityType)) {
      return res.status(400).json({
        error: `Unsupported volatility type: ${volatilityType}. Supported types are: ${SUPPORTED_TYPES.join(', ')}`
      });
    }

    // 2. Determine which coin bag to calculate
    const bagName = (req.query.bag as string) || DEFAULT_BAG;

    // --- Current Velocity (Price Change Velocity) Calculation Logic ---
    if (volatilityType === VOLATILITY_TYPE_CURRENT_VELOCITY) {
      // Parse per_page query param (defaults to TOP_COINS_COUNT)
      const perPage = req.query.per_page 
        ? parseInt(String(req.query.per_page), 10) 
        : TOP_COINS_COUNT;
      
      // Validate per_page
      if (isNaN(perPage) || perPage <= 0 || perPage > 250) {
        return res.status(400).json({
          error: 'Invalid per_page parameter. Must be a positive number between 1 and 250.'
        });
      }

      try {
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
          return res.status(404).json({ error: 'No market data returned from CoinGecko API' });
        }

        log(`Received ${marketData.length} coins from CoinGecko. Calculating market volatility...`, LOG);

        // Calculate market volatility
        const analysis = calculateMarketVolatility(marketData);

        // Transform to simplified response format
        const response = {
          volatility1h: analysis.volatility1h,
          volatility24h: analysis.volatility24h,
          level1h: analysis.level1h,
          level24h: analysis.level24h,
          topMoverPercentage: analysis.topMover1h?.changePercentage ?? null,
          topMoverCoin: analysis.topMover1h?.symbol ?? null,
          marketCapCoverage: analysis.marketCapCoverage,
        };

        log(`Price change velocity calculated: 1h=${response.volatility1h}% (${response.level1h}), 24h=${response.volatility24h}% (${response.level24h})`, LOG);

        return res.status(200).json(response);

      } catch (error) {
        // Use the existing error handler from coingeckoClient
        return handleApiError(error, res, 'price change velocity data');
      }
    }

    // --- VWATR Calculation Logic ---
    if (volatilityType === VOLATILITY_TYPE_VWATR) {

      // 3. Determine which periods to calculate (in days)
      const { periods: periodsToCalculateDays, invalidPeriods } = parsePeriods(req.query.periods);

      // Check if we got any valid periods (should default if not)
      if (periodsToCalculateDays.length === 0) {
        return res.status(400).json({ 
          error: 'Invalid or empty period list provided for VWATR calculation.',
          message: `All requested periods exceed the maximum of ${MAX_PERIOD_DAYS} days.`
        });
      }

      // Warn about invalid periods > 30 days
      if (invalidPeriods.length > 0) {
        log(`⚠️ Requested periods ${invalidPeriods.join(', ')} exceed maximum of ${MAX_PERIOD_DAYS} days. Only periods <= ${MAX_PERIOD_DAYS} will be calculated.`, WARN);
      }

      // 4. Fetch the Bag Manifest using the robust finder
      const manifestPrefix = 'bag_manifest.json';
      const manifestBlob = await findLatestBlob(manifestPrefix, blobToken);

      if (!manifestBlob) {
        log(`Manifest blob not found with prefix: ${manifestPrefix}`, ERR);
        return res.status(404).json({ error: `Manifest file with prefix '${manifestPrefix}' not found in blob storage.` });
      }

      const manifestResponse = await fetch(manifestBlob.url);
      const manifest = await manifestResponse.json() as BagManifest;

      const targetSymbols = manifest[bagName as keyof BagManifest];
      if (!targetSymbols || targetSymbols.length === 0) {
        log(`No symbols found for bag: ${bagName}`, ERR);
        return res.status(404).json({ error: `Bag '${bagName}' not found or is empty in manifest.` });
      }

      // log(`Found ${targetSymbols.length} coins in ${bagName}. Starting VWATR calculation for periods: ${periodsToCalculateDays.join(', ')}`, LOG);

      // Determine the longest requested period (in days) to estimate the candle interval
      // This assumes the historical data was fetched for this max period.
      const maxPeriodDays = Math.max(...periodsToCalculateDays);

      const calculationPromises = targetSymbols.map(async (symbol) => {
        const historyFileName = `${symbol}_history.json`;

        try {
          // 5. Fetch the historical OHLCV data for the coin using the robust finder
          const historyBlob = await findLatestBlob(historyFileName, blobToken);

          if (!historyBlob) {
            log(`Skipping ${symbol}: History file not found or lookup failed.`, WARN);
            return null;
          }

          const historyResponse = await fetch(historyBlob.url);
          const history = await historyResponse.json() as HistoricalOHLCVDataPoint[];

          // 6. Pre-calculate TR/TRV data and determine the actual candle interval
          // trData will have (history.length - 1) entries (candles)
          const trData: TRData[] = precalculateTRData(history);
          const trDataLength = trData.length;

          // If there's no data, or only 1 point, skip.
          if (trDataLength < 1) {
            log(`Skipping ${symbol}: Only ${history.length} OHLCV entries found, insufficient for any TR calculation.`, WARN);
            return { symbol, results: [] };
          }

          // CRITICAL STEP: Calculate the actual average candle interval in days from timestamps.
          // This is more accurate than assuming the data spans exactly maxPeriodDays
          const firstTimestamp = history[0].time;
          const lastTimestamp = history[history.length - 1].time;
          const actualSpanMs = lastTimestamp - firstTimestamp;
          const actualSpanDays = actualSpanMs / (1000 * 60 * 60 * 24);
          
          // Calculate interval: span divided by number of intervals (candles - 1)
          // For n candles, there are (n-1) intervals between them
          const candleIntervalDays = trDataLength > 1 
            ? actualSpanDays / (trDataLength - 1)
            : actualSpanDays; // Fallback if only 1 candle

          // log(`Processing ${symbol}: History has ${trDataLength} TR candles spanning ${actualSpanDays.toFixed(1)} days at ~${candleIntervalDays.toFixed(2)} days/candle interval.`, LOG);

          // 7. Run the VWATR Calculation, converting requested days into candles.
          const results = periodsToCalculateDays
            .map(periodDays => {
              // Convert the requested lookback period (in days) to a period in candles.
              // We use Math.round as the interval is usually not a clean integer (e.g., 1.03 for daily).
              const periodCandles = Math.round(periodDays / candleIntervalDays);

              // Check if the required number of candles exceeds available data or is too small.
              if (periodCandles > trDataLength || periodCandles < 1) {
                log(`  [${symbol}] Skipping ${periodDays} days. Needs ${periodCandles} candles, but only ${trDataLength} available.`, WARN);
                return null;
              }

              // The utility function requires 4 arguments for the normalization calculation.
              const result = calculateVWATR(symbol, trData, periodCandles, candleIntervalDays);
              
              // Map the result to use the original requested period in days, not candles
              if (result) {
                return {
                  ...result,
                  period: periodDays, // Return the requested period in days, not candles
                };
              }
              return null;
            })
            .filter((result): result is NonNullable<typeof result> => result !== null);

          return { symbol, results };

        } catch (error) {
          // Log errors but don't fail the entire request for one coin
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          log(`Failed to process ${symbol}: ${errorMessage}`, ERR);
          // Return null to be filtered out
          return null;
        }
      });

      const results = (await Promise.all(calculationPromises))
        // Filter out null results (failed or skipped coins)
        .filter(result => result !== null && result.results && result.results.length > 0);

      log(`Successfully calculated VWATR for ${results.length} coins.`, LOG);

      return res.status(200).json({
        type: VOLATILITY_TYPE_VWATR,
        bag: bagName,
        periods: periodsToCalculateDays, // Include valid periods in the response
        maxPeriod: MAX_PERIOD_DAYS, // Include max supported period
        ...(invalidPeriods.length > 0 && { 
          warning: `Periods ${invalidPeriods.join(', ')} exceed maximum of ${MAX_PERIOD_DAYS} days and were ignored.` 
        }),
        timestamp: Date.now(),
        data: results,
      });
    }

    // If we reach here, and the type was supported but not implemented, we would return a 501
    return res.status(501).json({ error: `Volatility type ${volatilityType} is supported but not yet implemented.` });


  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during API execution';
    log(`Global API Error: ${errorMessage}`, ERR);
    return res.status(500).json({ error: 'Internal server error during volatility calculation.', details: errorMessage });
  }
}