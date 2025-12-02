// Filename: api/volatility.ts
/**
 * Unified Volatility API Endpoint
 *
 * This Vercel Serverless function serves as the central endpoint for calculating
 * various volatility metrics (like VWATR) based on historical data stored in Vercel Blob.
 *
 * FIX APPLIED: Uses list() for robust latest-blob lookup by filtering on filename
 * prefix and sorting by 'uploadedAt' timestamp (most recent first) to handle hash suffixes.
 *
 * Query Parameters:
 * - type (string, optional): The type of volatility metric to calculate.
 * - Default: 'vwatr'
 * - Supported: ['vwatr'] (Designed for future expansion, e.g., 'current_atr')
 * - bag (string, optional): Specifies the set of coins to process.
 * - Default: 'top20_bag' (Updated to reflect broader market volatility)
 * - Uses symbols from the 'bag_manifest.json' file.
 * - periods (string, optional, relevant only for type=vwatr): Comma-separated list of lookback days.
 * - Example: '7,30,90'
 * - Default: [7, 14, 30, 60, 90]
 *
 * Output:
 * - JSON response containing the calculated metrics (VWATR, ATR%) for each coin
 * in the specified bag, broken down by the requested lookback periods.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';
import {
  calculateVWATR,
  precalculateTRData,
  TRData // <-- Imported for type checking from utility
} from '../utils/vwatrCalculator.js';
import { log, ERR, LOG, WARN } from '../utils/log.js';

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
const SUPPORTED_TYPES = [VOLATILITY_TYPE_VWATR];
// Default specific periods if none are passed in the query
const DEFAULT_VWATR_PERIODS = [7, 14, 30, 60, 90];
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
    log(`Found latest blob for ${prefix}: ${latestBlob.pathname} (URL: ${latestBlob.url.substring(0, 50)}...)`, LOG);
    return latestBlob;

  } catch (e) {
    log(`Error listing blobs for prefix ${prefix}: ${e instanceof Error ? e.message : String(e)}`, ERR);
    return null;
  }
}


/**
 * Parses the 'periods' query parameter (e.g., "7,30,90") into an array of positive integers.
 * Defaults to DEFAULT_VWATR_PERIODS if the query parameter is missing or invalid.
 * @param queryPeriods The value of req.query.periods
 * @returns Array of integer periods
 */
function parsePeriods(queryPeriods: string | string[] | undefined): number[] {
  if (!queryPeriods) {
    return DEFAULT_VWATR_PERIODS;
  }

  const periodsStr = Array.isArray(queryPeriods) ? queryPeriods[0] : queryPeriods;

  const parsedPeriods = periodsStr.split(',')
    .map(p => parseInt(p.trim(), 10))
    .filter(p => !isNaN(p) && p > 0)
    .sort((a, b) => a - b); // Sort to ensure consistent processing

  return parsedPeriods.length > 0 ? parsedPeriods : DEFAULT_VWATR_PERIODS;
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

    // --- VWATR Calculation Logic ---
    if (volatilityType === VOLATILITY_TYPE_VWATR) {

      // 3. Determine which periods to calculate based on query parameter
      const periodsToCalculate = parsePeriods(req.query.periods);

      // Check if we got any valid periods (should default if not)
      if (periodsToCalculate.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty period list provided for VWATR calculation.' });
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

      log(`Found ${targetSymbols.length} coins in ${bagName}. Starting VWATR calculation for periods: ${periodsToCalculate.join(', ')}`, LOG);

      // We determine the longest lookback period needed to properly check data length
      const maxPeriodRequired = Math.max(...periodsToCalculate);
      // TR data calculation requires P days + 1 day for the prior close, so P days of TR data.

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

          // Check for insufficient data early to avoid unnecessary processing
          // For period P, we need P days of TR data, which requires (P + 1) days of OHLCV history
          // (because TR calculation starts at index 1, so history.length - 1 = TR entries)
          if (history.length < maxPeriodRequired + 1) {
            log(`Skipping all calculations for ${symbol}: History has only ${history.length} days. Need at least ${maxPeriodRequired + 1} days for period ${maxPeriodRequired}.`, WARN);
            return { symbol, results: [] };
          }


          // 6. OPTIMIZATION: Pre-calculate TR/TRV data ONCE per coin history.
          // trData will have (history.length - 1) entries
          const trData: TRData[] = precalculateTRData(history);


          // 7. Run the VWATR Calculation for each requested period, reusing trData.
          const results = periodsToCalculate
            .map(period => {
              // Ensure trData has enough points (TR data array length must be >= period)
              if (trData.length < period) {
                // This is a safety check. The maxPeriodRequired check above should catch this for the largest period.
                log(`  [${symbol}] Skipping period ${period} - Insufficient TR data (${trData.length} < ${period}).`, WARN);
                return null;
              }
              // Call the external utility function
              return calculateVWATR(symbol, trData, period);
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
        periods: periodsToCalculate, // Include periods in the response
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