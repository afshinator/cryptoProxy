/**
 * Compute VWATR Volatility
 * 
 * Extracted computation logic for volatility_vwatr feature.
 * This can be used by both API handlers and cache managers.
 */

import { list } from '@vercel/blob';
import { fetchJson } from '../../utils/httpClient.js';
import { log, ERR, LOG, WARN } from '../../utils/log.js';
import {
  calculateVWATR,
  precalculateTRData,
  type TRData,
} from '../../utils/vwatrCalculator.js';

export interface ComputeVwatrOptions {
  bag?: string;
  periods?: number[] | string; // Can be array or comma-separated string
}

export interface VwatrResult {
  type: string;
  bag: string;
  periods: number[];
  maxPeriod: number;
  timestamp: number;
  data: Array<{
    symbol: string;
    results: Array<{
      symbol: string;
      period: number;
      vwatr: number;
      atrPercent: number;
    }>;
  }>;
  warning?: string;
}

// Constants
const DEFAULT_BAG = 'top20_bag';
const DEFAULT_VWATR_PERIODS = [7, 14, 30];
const MAX_PERIOD_DAYS = 30;

// Interfaces for blob data
interface VercelBlob {
  pathname: string;
  url: string;
  uploadedAt: string | Date;
}

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

/**
 * Parses periods parameter into an array of positive integers
 */
function parsePeriods(periods: number[] | string | undefined): { periods: number[]; invalidPeriods: number[] } {
  if (!periods) {
    return { periods: DEFAULT_VWATR_PERIODS, invalidPeriods: [] };
  }

  let parsedPeriods: number[];
  if (typeof periods === 'string') {
    parsedPeriods = periods.split(',')
      .map(p => parseInt(p.trim(), 10))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);
  } else {
    parsedPeriods = [...periods].sort((a, b) => a - b);
  }

  if (parsedPeriods.length === 0) {
    return { periods: DEFAULT_VWATR_PERIODS, invalidPeriods: [] };
  }

  const validPeriods = parsedPeriods.filter(p => p <= MAX_PERIOD_DAYS);
  const invalidPeriods = parsedPeriods.filter(p => p > MAX_PERIOD_DAYS);

  return {
    periods: validPeriods.length > 0 ? validPeriods : DEFAULT_VWATR_PERIODS,
    invalidPeriods
  };
}

/**
 * Finds the most recently uploaded blob object
 */
async function findLatestBlob(prefix: string, token: string): Promise<VercelBlob | null> {
  const listPrefix = prefix.replace(/\.json$/i, '');

  try {
    const { blobs } = await list({ prefix: listPrefix, token });

    const matchingBlobs = (blobs as VercelBlob[])
      .filter(b => b.pathname.startsWith(listPrefix) && b.pathname.endsWith('.json'));

    if (matchingBlobs.length === 0) {
      log(`No blobs found matching prefix: ${prefix}`, ERR);
      return null;
    }

    matchingBlobs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    return matchingBlobs[0];
  } catch (e) {
    log(`Error listing blobs for prefix ${prefix}: ${e instanceof Error ? e.message : String(e)}`, ERR);
    return null;
  }
}

/**
 * Computes VWATR volatility metrics
 * 
 * @param options - Options including bag name and periods
 * @returns VWATR calculation results
 */
export async function computeVwatr(
  options: ComputeVwatrOptions = {}
): Promise<VwatrResult> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new Error('BLOB_READ_WRITE_TOKEN not available');
  }

  const bagName = options.bag || DEFAULT_BAG;
  const { periods: periodsToCalculateDays, invalidPeriods } = parsePeriods(options.periods);

  if (periodsToCalculateDays.length === 0) {
    throw new Error('Invalid or empty period list provided for VWATR calculation.');
  }

  if (invalidPeriods.length > 0) {
    log(`⚠️ Requested periods ${invalidPeriods.join(', ')} exceed maximum of ${MAX_PERIOD_DAYS} days. Only periods <= ${MAX_PERIOD_DAYS} will be calculated.`, WARN);
  }

  // Fetch the Bag Manifest
  const manifestPrefix = 'bag_manifest.json';
  const manifestBlob = await findLatestBlob(manifestPrefix, blobToken);

  if (!manifestBlob) {
    throw new Error(`Manifest file with prefix '${manifestPrefix}' not found in blob storage.`);
  }

  const manifest = await fetchJson<BagManifest>(manifestBlob.url, {
    context: 'Vercel Blob',
  });

  const targetSymbols = manifest[bagName as keyof BagManifest];
  if (!targetSymbols || targetSymbols.length === 0) {
    throw new Error(`Bag '${bagName}' not found or is empty in manifest.`);
  }

  const maxPeriodDays = Math.max(...periodsToCalculateDays);

  const calculationPromises = targetSymbols.map(async (symbol) => {
    const historyFileName = `${symbol}_history.json`;

    try {
      const historyBlob = await findLatestBlob(historyFileName, blobToken);

      if (!historyBlob) {
        log(`Skipping ${symbol}: History file not found or lookup failed.`, WARN);
        return null;
      }

      const history = await fetchJson<HistoricalOHLCVDataPoint[]>(historyBlob.url, {
        context: 'Vercel Blob',
      });

      const trData: TRData[] = precalculateTRData(history);
      const trDataLength = trData.length;

      if (trDataLength < 1) {
        log(`Skipping ${symbol}: Only ${history.length} OHLCV entries found, insufficient for any TR calculation.`, WARN);
        return { symbol, results: [] };
      }

      // Calculate the actual average candle interval in days from timestamps
      const firstTimestamp = history[0].time;
      const lastTimestamp = history[history.length - 1].time;
      const actualSpanMs = lastTimestamp - firstTimestamp;
      const actualSpanDays = actualSpanMs / (1000 * 60 * 60 * 24);

      const candleIntervalDays = trDataLength > 1
        ? actualSpanDays / (trDataLength - 1)
        : actualSpanDays;

      // Run the VWATR Calculation
      const results = periodsToCalculateDays
        .map(periodDays => {
          const periodCandles = Math.round(periodDays / candleIntervalDays);

          if (periodCandles > trDataLength || periodCandles < 1) {
            log(`  [${symbol}] Skipping ${periodDays} days. Needs ${periodCandles} candles, but only ${trDataLength} available.`, WARN);
            return null;
          }

          const result = calculateVWATR(symbol, trData, periodCandles, candleIntervalDays);

          if (result) {
            return {
              ...result,
              period: periodDays,
            };
          }
          return null;
        })
        .filter((result): result is NonNullable<typeof result> => result !== null);

      return { symbol, results };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Failed to process ${symbol}: ${errorMessage}`, ERR);
      return null;
    }
  });

  const results = (await Promise.all(calculationPromises))
    .filter(result => result !== null && result.results && result.results.length > 0);

  log(`Successfully calculated VWATR for ${results.length} coins.`, LOG);

  const response: VwatrResult = {
    type: 'vwatr',
    bag: bagName,
    periods: periodsToCalculateDays,
    maxPeriod: MAX_PERIOD_DAYS,
    timestamp: Date.now(),
    data: results,
  };

  if (invalidPeriods.length > 0) {
    response.warning = `Periods ${invalidPeriods.join(', ')} exceed maximum of ${MAX_PERIOD_DAYS} days and were ignored.`;
  }

  return response;
}

