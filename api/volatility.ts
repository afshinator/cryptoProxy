// Filename: api/volatility.ts
/**
 * Unified Volatility API Endpoint
 *
 * This Vercel Serverless function serves as the central endpoint for calculating
 * various volatility metrics (like VWATR) based on historical data stored in Vercel Blob.
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
  precalculateTRData, // <-- Imported for efficiency optimization
  TRData // <-- Imported for type checking
} from '../utils/vwatrCalculator.js';
import { log, ERR, LOG } from '../utils/log.js';

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

      // 4. Fetch the Bag Manifest from Vercel Blob
      const manifestFileName = 'bag_manifest.json';
      log(`Fetching manifest: ${manifestFileName}`, LOG);
      // Use list to find the blob by name, then fetch the content
      const { blobs } = await list({ prefix: manifestFileName, token: process.env.BLOB_READ_WRITE_TOKEN });
      const manifestBlob = blobs.find(b => b.pathname === manifestFileName);
      if (!manifestBlob) {
        log(`Manifest blob not found: ${manifestFileName}`, ERR);
        return res.status(404).json({ error: `Manifest file '${manifestFileName}' not found in blob storage.` });
      }
      const manifestResponse = await fetch(manifestBlob.url);
      const manifest = await manifestResponse.json() as BagManifest;

      const targetSymbols = manifest[bagName as keyof BagManifest];
      if (!targetSymbols || targetSymbols.length === 0) {
        log(`No symbols found for bag: ${bagName}`, ERR);
        return res.status(404).json({ error: `Bag '${bagName}' not found or is empty in manifest.` });
      }

      log(`Found ${targetSymbols.length} coins in ${bagName}. Starting VWATR calculation for periods: ${periodsToCalculate.join(', ')}`, LOG);

      const calculationPromises = targetSymbols.map(async (symbol) => {
        const historyFileName = `${symbol}_history.json`;
        
        try {
          // 5. Fetch the historical OHLCV data for the coin
          const { blobs: historyBlobs } = await list({ prefix: historyFileName, token: process.env.BLOB_READ_WRITE_TOKEN });
          const historyBlob = historyBlobs.find(b => b.pathname === historyFileName);
          if (!historyBlob) {
            throw new Error(`History file '${historyFileName}' not found in blob storage.`);
          }
          const historyResponse = await fetch(historyBlob.url);
          const history = await historyResponse.json() as HistoricalOHLCVDataPoint[];

          // 6. OPTIMIZATION: Pre-calculate TR/TRV data ONCE per coin history.
          const trData: TRData[] = precalculateTRData(history);


          // 7. Run the VWATR Calculation for each requested period, reusing trData.
          const results = periodsToCalculate
            // Calculate VWATR now requires the pre-calculated trData
            .map(period => calculateVWATR(symbol, trData, period)) 
            .filter((result): result is NonNullable<typeof result> => result !== null);

          return { symbol, results };

        } catch (error) {
          // Log errors but don't fail the entire request for one coin
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          log(`Failed to process ${symbol}: ${errorMessage}`, ERR);
          // Return a structure indicating an error for this coin
          return { symbol, results: [], error: `Data fetch/parse failed: ${errorMessage}` }; 
        }
      });

      const results = (await Promise.all(calculationPromises))
        // Filter out results that have errors or no valid results
        .filter(result => result && result.results && result.results.length > 0 && !('error' in result)); 

      log(`Successfully calculated VWATR for ${results.length} coins.`, LOG);

      return res.status(200).json({
        type: VOLATILITY_TYPE_VWATR, 
        bag: bagName,
        periods: periodsToCalculate, // Include periods in the response
        timestamp: Date.now(),
        data: results,
      });
    }

    // Placeholder for future volatility types (e.g., if (volatilityType === 'current_volatility'))
    // If we reach here, and the type was supported but not implemented, we would return a 501
    return res.status(501).json({ error: `Volatility type ${volatilityType} is supported but not yet implemented.` });


  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during API execution';
    log(`Global API Error: ${errorMessage}`, ERR);
    return res.status(500).json({ error: 'Internal server error during volatility calculation.', details: errorMessage });
  }
}