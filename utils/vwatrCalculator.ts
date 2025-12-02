// Filename: utils/vwatrCalculator.ts
/**
 * VWATR (Volume-Weighted Average True Range) Calculation Utility
 *
 * Purpose: This module provides the core mathematical functions to calculate the
 * Volume-Weighted Average True Range (VWATR) and the Average True Range Percentage (ATR%)
 * for a cryptocurrency based on its historical OHLCV (Open, High, Low, Close, Volume) data.
 *
 * VWATR Formula:
 * VWATR = Sum(True Range * Volume) / Sum(Volume) over N periods
 *
 * Key Steps:
 * 1. Calculate True Range (TR) for each period:
 * TR = Max(High - Low, |High - Previous Close|, |Low - Previous Close|)
 * 2. Pre-calculate TR * Volume (TRV).
 * 3. Use the latest N periods (specified by the 'period' parameter) to sum TRV and Volume.
 * 4. Divide Sum(TRV) by Sum(Volume) to get the VWATR.
 * 5. Calculate ATR% as (Average TR / Latest Close) * 100 for context.
 *
 * NOTE: This function calculates the metric for a single, specified lookback period.
 * The iteration over multiple periods (7, 14, 30, etc.) is handled by the calling
 * API route (api/volatility.ts), and the expensive TR data pre-calculation is now
 * handled by the calling function for efficiency.
 */

import { log, INFO } from './log.js';

// Defines the data structure expected from Vercel Blob
interface HistoricalOHLCVDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// The result structure for a single lookback period.
interface PeriodResult {
  period: number;
  vwatr: number; // The final calculated VWATR value
  atrp: number; // The Average True Range Percentage (ATR/Close * 100)
}

// Data structure holding pre-calculated True Range data
export interface TRData {
  tr: number;
  trv: number; // True Range * Volume
  volume: number;
  close: number;
}

/**
 * Calculates the True Range (TR) for a single period.
 * TR = Max(High - Low, |High - Previous Close|, |Low - Previous Close|)
 * @param current The current OHLCV data point
 * @param previousClose The previous period's closing price
 * @returns The True Range value
 */
function calculateTrueRange(
  current: HistoricalOHLCVDataPoint,
  previousClose: number
): number {
  const highLow = current.high - current.low;
  const highPrevClose = Math.abs(current.high - previousClose);
  const lowPrevClose = Math.abs(current.low - previousClose);

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

/**
 * NEW EXPORTED FUNCTION
 * Pre-calculates True Range (TR) and True Range * Volume (TRV) for the entire history.
 * This function should be called ONLY ONCE per coin history.
 * @param history Array of OHLCV data points (must be sorted oldest to newest)
 * @returns Array of TRData objects
 */
export function precalculateTRData(history: HistoricalOHLCVDataPoint[]): TRData[] {
  const trData: TRData[] = [];
  
  // We start at index 1 because we need history[i-1] for the previous close
  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const previousClose = history[i - 1].close;
    
    const trueRange = calculateTrueRange(current, previousClose);
    const volume = current.volume;
    
    trData.push({
      tr: trueRange,
      trv: trueRange * volume,
      volume: volume,
      close: current.close
    });
  }
  return trData;
} 


/**
 * Calculates the Volume-Weighted Average True Range (VWATR) for a single period.
 *
 * VWATR = Sum(TR * Volume) / Sum(Volume) over N periods.
 *
 * @param symbol The coin symbol
 * @param trData Pre-calculated True Range data array (TR, TRV, Volume, Close).
 * @param period The single number of days for the lookback calculation
 * @returns PeriodResult containing the VWATR for the requested period, or null if data is insufficient.
 */
export function calculateVWATR(
  symbol: string,
  trData: TRData[], // Now accepts pre-calculated TRData
  period: number
): PeriodResult | null {
  
  // Check if we have enough TR data points for this specific period
  if (trData.length < period) {
    log(`Skipping ${symbol} for period ${period}: insufficient TR data (${trData.length} < ${period}).`, INFO);
    return null;
  }

  // Use the last 'period' days of TR data
  const lookbackData = trData.slice(-period);
  
  // Calculate the Sum of (TR * Volume) and the Sum of (Volume)
  const sumTRV = lookbackData.reduce((sum, item) => sum + item.trv, 0);
  const sumVolume = lookbackData.reduce((sum, item) => sum + item.volume, 0);

  // Calculate VWATR: Sum(TRV) / Sum(Volume)
  const vwatr = sumVolume > 0 ? sumTRV / sumVolume : 0;
  
  // Calculate ATR%
  const averageTR = lookbackData.reduce((sum, item) => sum + item.tr, 0) / lookbackData.length;
  const latestClose = lookbackData[lookbackData.length - 1].close;
  
  const atrp = latestClose > 0 ? (averageTR / latestClose) * 100 : 0;
  
  log(`Calculated VWATR (P=${period}) for ${symbol}: ${vwatr.toFixed(4)}`, INFO);

  return {
    period,
    vwatr,
    atrp,
  };
}