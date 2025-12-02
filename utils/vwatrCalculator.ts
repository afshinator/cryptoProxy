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
 * Data Normalization:
 * When using coarse data (e.g., 4-day candles), the resulting VWATR and ATR values must be
 * normalized to a daily equivalent using the "square root of time" rule:
 * VWATR_Daily = VWATR_Interval / sqrt(Interval in Days)
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
  period: number; // This is the period expressed in candles
  vwatr: number; // The final calculated (and normalized) daily VWATR value
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
 * Pre-calculates True Range (TR) and True Range * Volume (TRV) for the entire history.
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
 * Calculates the Volume-Weighted Average True Range (VWATR) and normalizes it to a daily rate.
 *
 * VWATR_Interval = Sum(TR * Volume) / Sum(Volume) over N candles.
 * VWATR_Daily = VWATR_Interval / sqrt(Interval in Days).
 *
 * @param symbol The coin symbol
 * @param trData Pre-calculated True Range data array (TR, TRV, Volume, Close).
 * @param periodCandles The number of coarse candles used for the lookback calculation (N).
 * @param candleIntervalDays The interval of each candle in days (e.g., 4.09 days).
 * @returns PeriodResult containing the normalized daily VWATR for the requested period, or null.
 */
export function calculateVWATR(
  symbol: string,
  trData: TRData[],
  periodCandles: number,
  candleIntervalDays: number
): PeriodResult | null {

  // Check if we have enough TR data points for this specific period in candles
  if (trData.length < periodCandles) {
    log(`Skipping ${symbol} for period (candles) ${periodCandles}: insufficient TR data (${trData.length} < ${periodCandles}).`, INFO);
    return null;
  }

  // Use the last 'periodCandles' of TR data
  const lookbackData = trData.slice(-periodCandles);

  // Calculate the Sum of (TR * Volume) and the Sum of (Volume)
  const sumTRV = lookbackData.reduce((sum, item) => sum + item.trv, 0);
  const sumVolume = lookbackData.reduce((sum, item) => sum + item.volume, 0);

  // 1. Calculate the raw VWATR for the coarse interval
  const rawIntervalVWATR = sumVolume > 0 ? sumTRV / sumVolume : 0;

  // 2. Normalize the VWATR to a daily equivalent using the square root of time rule.
  const normalizationFactor = Math.sqrt(candleIntervalDays);
  const finalVWATR = rawIntervalVWATR / normalizationFactor;


  // Calculate ATR% (This needs normalization too)
  const averageTR_Interval = lookbackData.reduce((sum, item) => sum + item.tr, 0) / lookbackData.length;
  // Normalize ATR to a daily rate
  const averageTR_Daily = averageTR_Interval / normalizationFactor;

  const latestClose = lookbackData[lookbackData.length - 1].close;

  // ATR% is (Normalized Daily ATR / Latest Close) * 100
  const atrp = latestClose > 0 ? (averageTR_Daily / latestClose) * 100 : 0;

  // log(`Calculated Normalized Daily VWATR (P=${periodCandles} candles, I=${candleIntervalDays.toFixed(2)} days) for ${symbol}: ${finalVWATR.toFixed(4)}`, INFO);

  return {
    // We return the period in candles here, but the calling API translates it back to days for the final response metadata.
    period: periodCandles,
    vwatr: finalVWATR,
    atrp,
  };
}